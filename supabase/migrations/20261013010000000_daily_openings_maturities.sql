-- New imports only: daily bank openings and explicit source maturity dates.
-- No updates to stored batches or manual/business decisions.
begin;
alter function public.erp_validate(jsonb) rename to erp_validate_before_daily_openings;
revoke all on function public.erp_validate_before_daily_openings(jsonb) from public,anon,authenticated;
create function public.erp_validate(p_records jsonb) returns date
language plpgsql immutable set search_path=public,pg_temp as $$
declare r jsonb; n jsonb; checked jsonb:='[]'; maturity date; day date;
begin
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records) not between 1 and 20000 or octet_length(p_records::text)>25000000 then
  raise exception 'ERP debe contener entre 1 y 20.000 registros y hasta 25 MB.';
 end if;
 for r in select value from jsonb_array_elements(p_records) loop
  n:=r->'normalized';
  if n->>'sourceOrigin'='BANCO' and n->'coverageSheets' @> '["SALDOS BANCOS"]'::jsonb then
   if n->>'periodStart' is distinct from n->>'cutoffDate' then
    raise exception 'SALDOS BANCOS es apertura diaria. Inicio bancario y corte deben coincidir.';
   end if;
   if n->>'date' is distinct from n->>'cutoffDate' then
    raise exception 'Cuenta %: apertura o movimiento fuera del día declarado. No se acumulan jornadas.',n->>'ledgerCode';
   end if;
   if n->>'recordRole'='bank_opening' then
    if n->>'openingBasis' is distinct from 'daily_opening' or n->>'openingDate' is distinct from n->>'cutoffDate' then
     raise exception 'Actualiza el importador: falta identificar la apertura diaria de SALDOS BANCOS.';
    end if;
    -- Compatibility adapter for the existing period validator only.
    -- The persisted opening date remains the beginning of the declared day.
    n:=n||jsonb_build_object('date',((n->>'periodStart')::date-1)::text);
   end if;
  end if;
  if n->>'sourceOrigin'='COLOCACIONES' and nullif(n->>'endDate','') is not null then
   if n->>'endDate' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Vencimiento ERP inválido.'; end if;
   maturity:=(n->>'endDate')::date;
   if maturity<'2000-01-01'::date or maturity>'2100-12-31'::date then raise exception 'Vencimiento ERP fuera de rango.'; end if;
  end if;
  checked:=checked||jsonb_build_array(r||jsonb_build_object('normalized',n));
 end loop;
 day:=public.erp_validate_before_daily_openings(checked);
 return day;
end; $$;
revoke all on function public.erp_validate(jsonb) from public,anon,authenticated;

-- Retain the position identity used by existing rescue decisions. The source
-- contains withdrawals but no unique fund/lot link: do not invent a remaining
-- principal by maturity, or turn the gross entries into automatic cash income.
alter function public.erp_business_entities(uuid) rename to erp_business_entities_before_maturities;
revoke all on function public.erp_business_entities_before_maturities(uuid) from public,anon,authenticated;
create function public.erp_business_entities(p_batch uuid) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare entities jsonb; item jsonb; n jsonb; entries jsonb; result jsonb:='[]'; cut date;
begin
 entities:=public.erp_business_entities_before_maturities(p_batch);
 select cutoff into cut from public.daily_base_batches where id=p_batch;
 for item in select value from jsonb_array_elements(entities) loop
  n:=item->'normalized';
  if n->>'recordRole'='investment_position' then
   select coalesce(jsonb_agg(jsonb_build_object(
    'sourceKey',r.source_key,'sourceRow',r.source_row,'sourceSheet',r.source_sheet,
    'operationDate',case when r.normalized_json->>'recordRole'='investment_movement' then r.normalized_json->>'date' else null end,
    'endDate',r.normalized_json->>'endDate','signedAmount',r.normalized_json->'signedAmount',
    'currency',r.normalized_json->>'currency','ledger',r.normalized_json->>'ledgerCode',
    'counterpartLedger',r.normalized_json->>'counterpartLedger','description',r.normalized_json->>'description',
    'role',r.normalized_json->>'recordRole','transaction',r.normalized_json->>'transaction'
   ) order by r.source_row),'[]') into entries
   from public.daily_base_rows r where r.batch_id=p_batch and r.entity_type='investment'
    and public.erp_position_key(r.normalized_json)=n->>'businessKey';
   -- Older snapshots lack the newly imported field: preserve their previous representation.
   if exists(select 1 from public.daily_base_rows r where r.batch_id=p_batch and r.entity_type='investment'
     and public.erp_position_key(r.normalized_json)=n->>'businessKey' and r.normalized_json?'maturitySource') then
    n:=n||jsonb_build_object('maturityEntries',entries,'maturityCutoff',cut,
     'maturityRequiresReview',true);
    item:=item||jsonb_build_object('normalized',n);
   end if;
  end if;
  result:=result||jsonb_build_array(item);
 end loop;
 return result;
end; $$;
revoke all on function public.erp_business_entities(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
