-- Additive repair for ERP reports without an explicit investment opening row.
-- Apply after the first two ERP migrations. Original rows and decisions stay intact.
begin;
create or replace function public.erp_validate(p_records jsonb) returns date language plpgsql immutable set search_path=public,pg_temp as $$
declare item jsonb; n jsonb; role_name text; expected_sheet text; expected_type text; cutoff date; d date; first_day date; signed numeric; prev numeric; entry record; context_key jsonb; first_n jsonb; first_row int; inferred numeric;
begin
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records) not between 1 and 20000 or octet_length(p_records::text)>25000000 then raise exception 'ERP debe contener entre 1 y 20.000 registros y hasta 25 MB.'; end if;
 if exists(select 1 from jsonb_array_elements(p_records) x group by x->>'sheet',x->>'row' having count(*)>1) then raise exception 'ERP contiene coordenadas hoja/fila repetidas.'; end if;
 for item in select value from jsonb_array_elements(p_records) loop
  n:=item->'normalized'; role_name:=n->>'recordRole';
  expected_sheet:=case when role_name in ('bank_opening','bank_movement') then 'BANCOS' when role_name='invoice' then 'CLIENTES' when role_name in ('investment_opening','investment_movement') then 'COLOCACIONES' end;
  expected_type:=case expected_sheet when 'BANCOS' then 'cash_flow' when 'CLIENTES' then 'invoice' when 'COLOCACIONES' then 'investment' end;
  if jsonb_typeof(n) is distinct from 'object' or expected_sheet is null or upper(trim(item->>'sheet')) is distinct from expected_sheet
   or n->>'sourceSheet' is distinct from item->>'sheet' or n->>'sourceProfile' is distinct from 'ERP-RAW-v1'
   or item->>'entityType' is distinct from expected_type or coalesce(item->>'status','') not in ('VALID','WARNING')
   or coalesce(item->>'row','') !~ '^[1-9][0-9]{0,6}$' or (item->>'row')::int>1048576 then raise exception 'Fila ERP inválida: %!%.',item->>'sheet',item->>'row'; end if;
  if n->>'sourceOrigin' is distinct from (case expected_sheet when 'BANCOS' then 'BANCO' else expected_sheet end)
   or coalesce(n->>'company','')='' or length(n->>'company')>100 or coalesce(n->>'currency','') not in ('CLP','USD','UF','UTM')
   or n->>'currency' is distinct from n->>'localCurrency' or coalesce(n->>'type','') not in ('income','expense')
   or coalesce(n->>'amount','') !~ '^[0-9]+([.][0-9]+)?$' or coalesce(n->>'signedAmount','') !~ '^-?[0-9]+([.][0-9]+)?$' then raise exception 'Importe, empresa o moneda ERP inválidos.'; end if;
  signed:=(n->>'signedAmount')::numeric;
  if abs(signed)>90071992547409 then raise exception 'Importe fuera del rango monetario seguro.'; end if;
  if abs(signed)<>(n->>'amount')::numeric or (case when signed<0 then 'expense' else 'income' end)<>n->>'type' then raise exception 'Signo ERP inconsistente.'; end if;
  if coalesce(n->>'cutoffDate','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(n->>'periodStart','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Declara corte y período ERP.'; end if;
  d:=(n->>'cutoffDate')::date; first_day:=(n->>'periodStart')::date;
  if d not between '2000-01-01'::date and '2100-12-31'::date or first_day>d or first_day<'2000-01-01' then raise exception 'Período ERP inválido.'; end if;
  if cutoff is not null and cutoff<>d then raise exception 'ERP contiene cortes distintos.'; end if; cutoff:=d;
  if context_key is not null and context_key<>jsonb_build_array(n->>'company',n->>'localCurrency',n->'coverageSheets') then raise exception 'ERP contiene contextos de cobertura distintos.'; end if;
  context_key:=jsonb_build_array(n->>'company',n->>'localCurrency',n->'coverageSheets');
  if n->'coverageSheets' is distinct from '["BANCOS","CLIENTES","COLOCACIONES"]'::jsonb then raise exception 'Declara la cobertura completa de las tres hojas ERP.'; end if;
  if coalesce(n->>'reportDate','')<>'' or coalesce(n->>'adjustedDate','')<>'' then raise exception 'La planificación debe guardarse separada de los datos ERP.'; end if;
  if role_name='invoice' then
   if coalesce(n->>'erpDocument','')='' or coalesce(n->>'customerCode','')='' or coalesce(n->>'installment','')='' or coalesce(n->>'documentType','')='' then raise exception 'Identidad de documento ERP incompleta.'; end if;
   perform (n->>'dueDate')::date;
   if nullif(n->>'dueDate','') is null then raise exception 'Falta vencimiento contractual.'; end if;
   d:=(n->>'issueDate')::date;
  else
   if coalesce(n->>'ledgerCode','')='' then raise exception 'Falta cuenta contable ERP.'; end if;
   d:=(n->>'date')::date;
   if role_name like '%_opening' and d<>first_day-1 then raise exception 'Fecha de apertura incompatible con el período.'; end if;
   if role_name like '%_movement' then
    if coalesce(n->>'transaction','')='' or d<first_day then raise exception 'Movimiento fuera de período o sin transacción.'; end if;
    if coalesce(n->>'debe','') !~ '^[0-9]+([.][0-9]+)?$' or coalesce(n->>'haber','') !~ '^[0-9]+([.][0-9]+)?$'
      or (n->>'debe')::numeric-(n->>'haber')::numeric<>signed then raise exception 'Cargo menos Abono no coincide con el movimiento ERP.'; end if;
   end if;
  end if;
  if d is null or d>cutoff or d<'2000-01-01'::date then raise exception 'Fecha de origen ERP inválida o posterior al corte.'; end if;
 end loop;
 if not exists(select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'recordRole'='bank_opening')
 or not exists(select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'recordRole' in ('investment_opening','investment_movement')) then raise exception 'El perfil requiere aperturas bancarias y datos de inversión; una hoja ausente no equivale a saldo cero.'; end if;
 if exists(select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'recordRole' like '%_opening' group by public.erp_business_key(r->'normalized') having count(*)<>1) then raise exception 'Aperturas ERP repetidas.'; end if;
 if exists(select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'recordRole'='invoice' group by public.erp_business_key(r->'normalized') having count(*)>1) then raise exception 'Documento y cuota ERP duplicados.'; end if;
 -- An absent OB is a report shape, not a zero opening. Reconstruct it from
 -- the first cumulative balance and validate every following ledger balance.
 for entry in select r->'normalized' n, (r->>'row')::int source_row from jsonb_array_elements(p_records) r where r->'normalized'->>'sourceOrigin'='COLOCACIONES' order by r->'normalized'->>'ledgerCode',(r->>'row')::int loop
  n:=entry.n;
  select r->'normalized',(r->>'row')::int into first_n,first_row from jsonb_array_elements(p_records) r
   where r->'normalized'->>'sourceOrigin'='COLOCACIONES' and r->'normalized'->>'ledgerCode'=n->>'ledgerCode' order by (r->>'row')::int limit 1;
  if coalesce(n->>'balance','') !~ '^-?[0-9]+([.][0-9]+)?$' or coalesce(first_n->>'balance','') !~ '^-?[0-9]+([.][0-9]+)?$' then
   raise exception 'Saldo acumulado de inversión inválido en fila %.',entry.source_row;
  end if;
  if n->>'recordRole'='investment_opening' and entry.source_row<>first_row then raise exception 'La apertura OB debe preceder los movimientos de su cuenta.'; end if;
  inferred:=case when first_n->>'recordRole'='investment_movement' then (first_n->>'balance')::numeric-(first_n->>'signedAmount')::numeric else 0 end;
  if abs(inferred)>90071992547409 then raise exception 'Apertura calculada fuera del rango monetario seguro.'; end if;
  if n ? 'inferredOpeningBalance' then
   if entry.source_row<>first_row or n->>'recordRole'<>'investment_movement' or coalesce(n->>'inferredOpeningBalance','') !~ '^-?[0-9]+([.][0-9]+)?$' then
    raise exception 'Apertura calculada inválida en fila %.',entry.source_row;
   end if;
   if (n->>'inferredOpeningBalance')::numeric<>inferred then raise exception 'Apertura calculada no coincide con saldo menos movimiento en fila %.',entry.source_row; end if;
  end if;
  select inferred+sum((r->'normalized'->>'signedAmount')::numeric) into prev from jsonb_array_elements(p_records) r
   where r->'normalized'->>'sourceOrigin'='COLOCACIONES' and r->'normalized'->>'ledgerCode'=n->>'ledgerCode' and (r->>'row')::int<=entry.source_row;
  if prev<>(n->>'balance')::numeric then raise exception 'Saldo acumulado de inversión inconsistente en fila %.',entry.source_row; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'recordRole'='bank_movement'
  and not exists(select 1 from jsonb_array_elements(p_records) o where o->'normalized'->>'recordRole'='bank_opening' and o->'normalized'->>'ledgerCode'=r->'normalized'->>'ledgerCode' and (o->>'row')::int<(r->>'row')::int and o->'normalized'->>'periodStart'=r->'normalized'->>'periodStart')) then raise exception 'Movimiento bancario sin apertura anterior o con período distinto.'; end if;
 if exists(select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'sourceOrigin'='COLOCACIONES'
  group by r->'normalized'->>'ledgerCode' having count(distinct r->'normalized'->>'periodStart')<>1) then raise exception 'La cuenta de inversión contiene períodos distintos.'; end if;
 return cutoff;
end; $$;

create or replace function public.erp_business_entities(p_batch uuid) returns jsonb language sql stable set search_path=public,pg_temp as $$
 with raw as (
  select r.*,b.file_name from public.daily_base_rows r join public.daily_base_batches b on b.id=r.batch_id
  where r.batch_id=p_batch and r.normalized_json->>'sourceProfile'='ERP-RAW-v1'
 ), ordinary as (
  select jsonb_build_object('id',entity_id,'recordId',id,'kind',entity_type,'normalized',normalized_json||jsonb_build_object('businessKey',source_key),'row',source_row,'sheet',source_sheet,'fileName',file_name) item
  from raw where entity_type<>'investment'
 ), first_investment as (
  select distinct on (public.erp_position_key(normalized_json)) public.erp_position_key(normalized_json) k,source_row opening_row,
   normalized_json->>'recordRole'='investment_movement' is_inferred,
   case when normalized_json->>'recordRole'='investment_movement' then (normalized_json->>'balance')::numeric-(normalized_json->>'signedAmount')::numeric else 0 end inferred
  from raw where entity_type='investment' order by public.erp_position_key(normalized_json),source_row
 ), positions as (
  select o.k,min(file_name) file_name,min(normalized_json->>'company') company,min(normalized_json->>'ledgerCode') ledger,
   min(normalized_json->>'currency') currency,min(normalized_json->>'date') started,
   sum((normalized_json->>'signedAmount')::numeric)+max(o.inferred) amount,jsonb_agg(id order by source_row) trace,
   max(o.inferred) inferred,min(o.opening_row) opening_row,bool_or(o.is_inferred) is_inferred
  from raw join first_investment o on o.k=public.erp_position_key(normalized_json) where entity_type='investment' group by o.k
 ), assembled as (
  select item from ordinary union all select jsonb_build_object('id',md5(k)::uuid,'recordId',null,'kind','investment','row',null,'sheet','COLOCACIONES','fileName',file_name,
   'normalized',jsonb_build_object('sourceProfile','ERP-RAW-v1','sourceOrigin','COLOCACIONES','sourceSheet','COLOCACIONES','recordRole','investment_position','businessKey',k,'company',company,'ledgerCode',ledger,'currency',currency,'amount',amount,'type','income','startDate',started,'endDate',null,'status','vigente','rateKnown',false,'investmentType','fondo_mutuo','description','Posición de inversión · '||ledger,'traceRecords',trace,'isPosition',true)
   ||case when is_inferred then jsonb_build_object('inferredOpeningBalance',inferred,'openingSourceRow',opening_row,'openingBasis','first_balance_minus_movement') else '{}'::jsonb end)
  from positions
 ) select coalesce(jsonb_agg(item order by item->>'kind',item->>'id'),'[]') from assembled;
$$;

revoke all on function public.erp_validate(jsonb),public.erp_business_entities(uuid) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
