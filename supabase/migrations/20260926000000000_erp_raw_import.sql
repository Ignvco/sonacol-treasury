-- Raw ERP is an input contract. It never requires BASE, MANUAL or forecasts.
begin;
alter table public.daily_base_rows add column source_sheet text generated always as (coalesce(normalized_json->>'sourceSheet','BASE')) stored;
alter table public.daily_base_rows drop constraint daily_base_rows_batch_id_source_row_key;
alter table public.daily_base_rows add unique(batch_id,source_sheet,source_row);

create function public.erp_business_key(n jsonb) returns text language sql immutable set search_path=public,pg_temp as $$
 select 'erp:'||md5(case when n->>'recordRole'='invoice' then
 jsonb_build_array(n->>'company','invoice',n->>'customerCode',n->>'documentType',n->>'series',n->>'erpDocument',n->>'installment')::text
 when n->>'recordRole' in ('bank_opening','investment_opening') then
 jsonb_build_array(n->>'company',n->>'recordRole',n->>'ledgerCode',n->>'currency')::text
 else jsonb_build_array(n->>'company',n->>'recordRole',n->>'ledgerCode',n->>'currency',n->>'transaction',n->>'erpDocument',n->>'date',n->>'counterpartLedger',n->>'signedAmount',n->>'description')::text end);
$$;
create function public.erp_position_key(n jsonb) returns text language sql immutable set search_path=public,pg_temp as $$
 select 'position:'||md5(jsonb_build_array(n->>'company',n->>'ledgerCode',n->>'currency')::text);
$$;
create function public.erp_prepare(p_records jsonb)
returns table(source_row int,source_key text,entity_id uuid,entity_type text,n jsonb,raw jsonb,status text,warnings text)
language sql immutable set search_path=public,pg_temp as $$
 with items as (
 select (r->>'row')::int row_num,r->>'entityType' kind,r->'normalized' n,coalesce(r->'raw','{}') raw,r->>'status' status,coalesce(r->>'warnings','') warnings,public.erp_business_key(r->'normalized') k
 from jsonb_array_elements(p_records) r
 ), numbered as (select *,k||':'||row_number() over(partition by k order by n::text,row_num) sk from items)
 select row_num,sk,md5(sk)::uuid,kind,n,raw,status,warnings from numbered;
$$;

create function public.erp_validate(p_records jsonb) returns date language plpgsql immutable set search_path=public,pg_temp as $$
declare item jsonb; n jsonb; role_name text; expected_sheet text; expected_type text; cutoff date; d date; first_day date; signed numeric; prev numeric; entry record; context_key jsonb;
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
 or not exists(select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'recordRole'='investment_opening') then raise exception 'El perfil requiere aperturas bancarias y de inversión; una hoja ausente no equivale a saldo cero.'; end if;
 if exists(select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'recordRole' like '%_opening' group by public.erp_business_key(r->'normalized') having count(*)<>1) then raise exception 'Aperturas ERP repetidas.'; end if;
 if exists(select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'recordRole'='invoice' group by public.erp_business_key(r->'normalized') having count(*)>1) then raise exception 'Documento y cuota ERP duplicados.'; end if;
 for entry in select r->'normalized' n, (r->>'row')::int source_row from jsonb_array_elements(p_records) r where r->'normalized'->>'sourceOrigin'='COLOCACIONES' order by r->'normalized'->>'ledgerCode',(r->>'row')::int loop
  n:=entry.n;
  if n->>'recordRole'='investment_opening' then prev:=(n->>'signedAmount')::numeric;
  else
   select sum((r->'normalized'->>'signedAmount')::numeric) into prev from jsonb_array_elements(p_records) r
    where r->'normalized'->>'sourceOrigin'='COLOCACIONES' and r->'normalized'->>'ledgerCode'=n->>'ledgerCode' and (r->>'row')::int<=entry.source_row;
  end if;
  if coalesce(n->>'balance','') !~ '^-?[0-9]+([.][0-9]+)?$' or prev<>(n->>'balance')::numeric then raise exception 'Saldo acumulado de inversión inconsistente en fila %.',entry.source_row; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'recordRole' like '%_movement'
  and not exists(select 1 from jsonb_array_elements(p_records) o where o->'normalized'->>'recordRole'=replace(r->'normalized'->>'recordRole','movement','opening') and o->'normalized'->>'ledgerCode'=r->'normalized'->>'ledgerCode' and (o->>'row')::int<(r->>'row')::int and o->'normalized'->>'periodStart'=r->'normalized'->>'periodStart')) then raise exception 'Movimiento sin apertura anterior o con período distinto.'; end if;
 return cutoff;
end; $$;

create function public.erp_revision(p_records jsonb) returns text language sql stable set search_path=public,pg_temp as $$
 select md5(public.daily_revision(p_records)||coalesce((select string_agg(source_sheet||':'||source_row||':'||source_key,',' order by source_sheet,source_row) from public.daily_base_rows where batch_id=public.daily_latest()),'')||coalesce((select string_agg((r-'raw')::text,',' order by r->>'sheet',(r->>'row')::int) from jsonb_array_elements(p_records) r),''));
$$;

create function public.compare_erp_import(p_records jsonb) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare day date; rows jsonb; previous uuid:=public.daily_latest(); removed int; coverage jsonb;
begin
 perform public.treasury_require(); day:=public.erp_validate(p_records);
 with incoming as (select * from public.erp_prepare(p_records))
 select coalesce(jsonb_agg(jsonb_build_object('sheet',i.n->>'sourceSheet','row',i.source_row,'entityId',i.entity_id,
 'change',case when old.id is null then 'new' when (i.n-'cutoffDate'-'periodStart'-'sourceId')=(old.normalized_json-'cutoffDate'-'periodStart'-'sourceId') then 'unchanged' else 'modified' end,
 'before',old.normalized_json,'after',i.n,'manualEdited',false,'reason','Dato ERP. Las decisiones y ajustes de la plataforma se conservan.') order by i.n->>'sourceSheet',i.source_row),'[]') into rows
 from incoming i left join public.daily_base_rows old on old.batch_id=previous and old.source_key=i.source_key;
 select count(*) into removed from public.daily_base_rows old where old.batch_id=previous and old.entity_type<>'projection' and not exists(select 1 from public.erp_prepare(p_records) i where i.source_key=old.source_key);
 select coalesce(jsonb_agg(distinct normalized_json->>'currency'),'[]') into coverage from public.daily_base_rows where batch_id=previous and normalized_json->>'currency' is distinct from p_records->0->'normalized'->>'currency';
 return jsonb_build_object('revision',public.erp_revision(p_records),'rows',rows,'cutoff',day,'historical',day<(select cutoff from public.daily_base_batches where id=previous),'removed',removed,'uncoveredCurrencies',coverage);
end; $$;

create function public.import_erp_daily(p_file_name text,p_file_hash text,p_records jsonb,p_revision text) returns jsonb language plpgsql security definer set search_path=public,pg_temp set statement_timeout='55s' as $$
declare b public.daily_base_batches%rowtype; previous uuid; day date; forward boolean; actor text; content_hash text;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 if p_file_name is null or length(trim(p_file_name)) not between 1 and 255 or coalesce(p_file_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'Archivo o huella inválidos.'; end if;
 day:=public.erp_validate(p_records);
 -- Content identity includes multiplicity and declared coverage, but not workbook bytes or row order.
 select md5(string_agg((n-'sourceId'-'sourceSheet')::text,',' order by (n-'sourceId'-'sourceSheet')::text)) into content_hash from public.erp_prepare(p_records);
 select * into b from public.daily_base_batches where file_hash=p_file_hash or (file_hash='erp:'||content_hash);
 if found then return to_jsonb(b); end if;
 if public.erp_revision(p_records) is distinct from p_revision then raise exception 'Los datos cambiaron. Vuelve a analizar el archivo.'; end if;
 previous:=public.daily_latest(); forward:=previous is null or day>=(select cutoff from public.daily_base_batches where id=previous);
 if forward and exists(select 1 from public.daily_base_rows where batch_id=previous and normalized_json->>'sourceProfile'='ERP-RAW-v1' and normalized_json->>'company' is distinct from p_records->0->'normalized'->>'company') then raise exception 'La empresa declarada no coincide con la última importación ERP. Revisa el contexto antes de reemplazar sus datos.'; end if;
 select coalesce(name,email,'Usuario') into actor from public.profiles where id=auth.uid();
 insert into public.daily_base_batches(file_name,file_hash,cutoff,uploaded_by,uploaded_by_id,total_records,valid_records,warning_records,imported_records)
 select p_file_name,'erp:'||content_hash,day,actor,auth.uid(),count(*),count(*) filter(where r->>'status'='VALID'),count(*) filter(where r->>'status'='WARNING'),count(*) from jsonb_array_elements(p_records) r returning * into b;
 insert into public.daily_base_rows(batch_id,source_row,source_key,entity_id,entity_type,normalized_json,raw_json,status,warnings)
 select b.id,source_row,source_key,entity_id,entity_type,n,raw,status,warnings from public.erp_prepare(p_records);
 -- All business decisions survive the move from a worked CAJA to a raw ERP export.
 if forward and previous is not null then
  insert into public.daily_manual(batch_id,id,source_key,normalized_json,source_record_id,edited,deleted,revision,updated_by)
  select b.id,id,source_key,normalized_json,source_record_id,true,deleted,revision,updated_by from public.daily_manual where batch_id=previous;
  insert into public.daily_forecast_links(batch_id,projection_id,target_kind,target_id)
  select b.id,projection_id,target_kind,target_id from public.daily_forecast_links where batch_id=previous;
 end if;
 perform public.treasury_audit('Importó datos crudos ERP','Importaciones',null,jsonb_build_object('batch',b.id,'cutoff',day,'rows',b.total_records,'fileHash',p_file_hash,'profile','ERP-RAW-v1'));
 return to_jsonb(b);
end; $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('erp_business_key','erp_position_key','erp_prepare','erp_validate','erp_revision','compare_erp_import','import_erp_daily') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in ('compare_erp_import','import_erp_daily') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end; $$;
notify pgrst,'reload schema';
commit;
