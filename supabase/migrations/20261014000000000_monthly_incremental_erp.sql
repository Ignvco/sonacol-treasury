-- Monthly openings and an append-only bank register. Existing snapshots and
-- operational decisions are not rewritten. Apply after 20261013010000000.
begin;

create or replace function public.erp_validate(p_records jsonb) returns date
language plpgsql immutable set search_path=public,pg_temp as $$
declare r jsonb; n jsonb; maturity date; month_start date; cut date;
begin
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records) not between 1 and 20000 or octet_length(p_records::text)>25000000 then
  raise exception 'ERP debe contener entre 1 y 20.000 registros y hasta 25 MB.';
 end if;
 for r in select value from jsonb_array_elements(p_records) loop
  n:=r->'normalized';
  if n->>'sourceOrigin'='BANCO' and n->'coverageSheets' @> '["SALDOS BANCOS"]'::jsonb then
   cut:=(n->>'cutoffDate')::date; month_start:=date_trunc('month',cut)::date;
   if n->>'periodStart' is distinct from month_start::text then
    raise exception 'SALDOS BANCOS es apertura mensual: el inicio bancario debe ser el primer día del mes del corte.';
   end if;
   if n->>'recordRole'='bank_opening' then
    if n->>'openingBasis' is distinct from 'monthly_opening' or n->>'openingMonth' is distinct from to_char(month_start,'YYYY-MM')
      or n->>'date' is distinct from (month_start-1)::text then
     raise exception 'Actualiza el importador: falta identificar la apertura mensual de SALDOS BANCOS.';
    end if;
    if nullif(n->>'openingDate','') is not null and n->>'openingDate' not in (month_start::text,(month_start-1)::text) then
     raise exception 'Cuenta %: fecha de apertura incompatible con el mes del corte.',n->>'ledgerCode';
    end if;
   end if;
   if n->>'recordRole'='bank_movement' and nullif(trim(n->>'erpDocument'),'') is null then
    raise exception 'Movimiento bancario sin documento ERP estable.';
   end if;
  end if;
  if n->>'sourceOrigin'='COLOCACIONES' and nullif(n->>'endDate','') is not null then
   if n->>'endDate' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Vencimiento ERP inválido.'; end if;
   maturity:=(n->>'endDate')::date;
   if maturity<'2000-01-01'::date or maturity>'2100-12-31'::date then raise exception 'Vencimiento ERP fuera de rango.'; end if;
  end if;
 end loop;
 -- All independent checks (accounts, signs, dates, closing, investment ledger)
 -- remain in force. No adapter changing source movement dates is needed.
 return public.erp_validate_before_daily_openings(p_records);
end; $$;
revoke all on function public.erp_validate(jsonb) from public,anon,authenticated;

-- The bank register stores each posting once. daily_base_rows remains immutable
-- snapshot evidence: its copies do not create additional operational postings.
create table public.erp_bank_postings (
 source_key text primary key, entity_id uuid not null unique,
 company text not null, ledger text not null, currency text not null,
 posted_on date not null, journal_key text not null, facts jsonb not null,
 record jsonb not null, source_version uuid not null, source_batch uuid not null,
 file_name text not null, registered_at timestamptz not null default clock_timestamp()
);
create index erp_bank_period on public.erp_bank_postings(company,posted_on);
create index erp_bank_journal_index on public.erp_bank_postings(journal_key);
create table public.erp_monthly_openings (
 company text not null, ledger text not null, currency text not null,
 period_start date not null, opening numeric not null, bank text not null,
 source_batch uuid not null, record jsonb not null,
 primary key(company,ledger,currency,period_start),
 check(extract(day from period_start)=1)
);
create table public.erp_import_runs (
 id uuid primary key default gen_random_uuid(),
 batch_id uuid references public.daily_base_batches(id) on delete set null,
 file_name text not null, file_hash text not null, summary jsonb not null,
 actor uuid references auth.users(id), created_at timestamptz not null default clock_timestamp()
);
alter table public.erp_bank_postings enable row level security;
alter table public.erp_monthly_openings enable row level security;
alter table public.erp_import_runs enable row level security;
revoke all on public.erp_bank_postings,public.erp_monthly_openings,public.erp_import_runs from public,anon,authenticated;
create policy erp_runs_read on public.erp_import_runs for select to authenticated using(public.treasury_approved());
grant select on public.erp_import_runs to authenticated;

-- Retained evidence can refer to the same Excel coordinate in DIFFERENT source
-- versions. Preserve actual coordinates; never assign invented Excel row numbers.
alter table public.daily_base_rows add column source_version uuid;
alter table public.daily_base_batches add column incremental_summary jsonb;
alter table public.daily_base_rows drop constraint daily_base_rows_batch_id_source_sheet_source_row_key;
create unique index daily_source_coordinate on public.daily_base_rows(batch_id,coalesce(source_version,batch_id),source_sheet,source_row);

create function public.erp_bank_journal(n jsonb) returns text language sql immutable set search_path=public,pg_temp as $$
 select md5(jsonb_build_array(n->>'company',n->>'transaction',n->>'erpDocument')::text);
$$;
create function public.erp_bank_facts(n jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select jsonb_build_object('company',n->>'company','ledger',n->>'ledgerCode','currency',n->>'currency',
  'date',n->>'date','dueDate',n->>'dueDate','transaction',n->>'transaction','document',n->>'erpDocument',
  'series',coalesce(n->>'series',''),'folio',coalesce(n->>'folio',''),'reference',coalesce(n->>'reference',''),
  'description',n->>'description','bank',n->>'bank','cargo',n->'debe','abono',n->'haber','signed',n->'signedAmount');
$$;
create function public.erp_source_facts(n jsonb) returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select n-array['sourceId','sourceSheet','sourceFileName','sourceCutoffDate','sourceImportBatch','incrementalFingerprint',
  'cutoffDate','cutoffSource','workbookCutoff','cutoffFormula'];
$$;

-- A journal has no stable line number in this ERP. Exact lines are recognized by
-- the established ERP key plus verified facts. Any new/changed line in a known
-- journal is ambiguous and must be reviewed, including changes of account/date.
create function public.erp_incremental_plan(p_records jsonb) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare co text:=p_records->0->'normalized'->>'company'; cut date:=(p_records->0->'normalized'->>'cutoffDate')::date;
 first_day date:=date_trunc('month',cut)::date; previous uuid:=public.daily_latest();
 known jsonb; incoming jsonb; retained jsonb; effective jsonb; issues jsonb; controls jsonb; summary jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('key',p.source_key,'entityId',p.entity_id,'record',
   jsonb_build_object('sheet',p.n->>'sourceSheet','row',p.source_row,'entityType',p.entity_type,'normalized',p.n,
    'raw',p.raw,'status',p.status,'warnings',p.warnings)) order by p.source_key),'[]')
 into incoming from public.erp_prepare(p_records) p where p.n->>'recordRole'='bank_movement';
 with candidates as (
  select p.source_key k,p.entity_id,p.record,p.source_version,p.source_batch,p.file_name,0 priority
   from public.erp_bank_postings p where p.company=co and p.posted_on between first_day and cut
  union all
  select r.source_key,r.entity_id,jsonb_build_object('sheet',r.source_sheet,'row',r.source_row,'entityType',r.entity_type,
    'normalized',r.normalized_json,'raw',r.raw_json,'status',r.status,'warnings',r.warnings),
   coalesce(r.source_version,r.batch_id),r.batch_id,b.file_name,1
  from public.daily_base_rows r join public.daily_base_batches b on b.id=r.batch_id
  where r.batch_id=previous and r.normalized_json->>'sourceProfile'='ERP-RAW-v1'
   and r.normalized_json->>'recordRole'='bank_movement' and r.normalized_json->>'company'=co
   and (r.normalized_json->>'date')::date between first_day and cut
 ), picked as (select distinct on(k) * from candidates order by k,priority)
 select coalesce(jsonb_agg(jsonb_build_object('key',k,'entityId',entity_id,'record',record,
  'sourceVersion',source_version,'sourceBatch',source_batch,'fileName',file_name) order by k),'[]') into known from picked;
 select coalesce(jsonb_agg(k order by k->>'key'),'[]') into retained from jsonb_array_elements(known) k
 where not exists(select 1 from jsonb_array_elements(incoming) i where i->>'key'=k->>'key');

 -- The raw workbook is validated before this function. This list adds the
 -- independently retained, previously validated postings for cash/review checks.
 select coalesce(jsonb_agg(jsonb_build_object('sourceKey',p.source_key,'normalized',p.n)),'[]') into effective
 from public.erp_prepare(p_records) p;
 select effective||coalesce(jsonb_agg(jsonb_build_object('sourceKey',k->>'key','normalized',
  (k->'record'->'normalized')||jsonb_build_object('periodStart',first_day,'cutoffDate',cut))),'[]') into effective
 from jsonb_array_elements(retained) k;
 if jsonb_array_length(effective)>20000 then raise exception 'La cobertura acumulada supera 20.000 registros. No se guardó una actualización parcial.'; end if;

 with ins as (select i->>'key' k,i->'record'->'normalized' n from jsonb_array_elements(incoming) i),
 prior as (select k->>'key' k,k->'record'->'normalized' n from jsonb_array_elements(known) k),
 problems as (
  select i.k,i.n,'ambiguous_duplicate' state,'Líneas indistinguibles sin identificador ERP de línea; no se fusionarán.' message
  from ins i where (select count(*) from ins x where public.erp_business_key(x.n)=public.erp_business_key(i.n))>1
   or (select count(*) from prior x where public.erp_business_key(x.n)=public.erp_business_key(i.n))>1
  union all
  select i.k,i.n,'changed_movement','Un asiento ERP ya registrado contiene una línea nueva o datos corregidos. Revisa el asiento completo antes de incorporarlo.'
  from ins i where exists(select 1 from prior k where k.k=i.k and public.erp_bank_facts(k.n)<>public.erp_bank_facts(i.n))
   or exists(select 1 from public.erp_bank_postings k where k.source_key=i.k and k.facts<>public.erp_bank_facts(i.n))
   or (not exists(select 1 from prior k where k.k=i.k) and not exists(select 1 from public.erp_bank_postings k where k.source_key=i.k)
    and (exists(select 1 from public.erp_bank_postings k where k.journal_key=public.erp_bank_journal(i.n))
     or exists(select 1 from prior k where public.erp_bank_journal(k.n)=public.erp_bank_journal(i.n))))
  union all
  select k.k,k.n,'uncovered_account','Una cuenta con movimientos registrados no tiene apertura mensual en esta exportación.'
  from prior k where not exists(select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'recordRole'='bank_opening'
   and r->'normalized'->>'ledgerCode'=k.n->>'ledgerCode' and r->'normalized'->>'currency'=k.n->>'currency')
  union all
  select o.ledger,jsonb_build_object('ledgerCode',o.ledger),'uncovered_account','Falta una cuenta cuya apertura ya fue reconocida para este mes, aunque no tenga movimientos.'
  from public.erp_monthly_openings o where o.company=co and o.period_start=first_day and not exists(
   select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'recordRole'='bank_opening'
    and r->'normalized'->>'ledgerCode'=o.ledger and r->'normalized'->>'currency'=o.currency)
  union all
  select public.erp_business_key(r->'normalized'),r->'normalized','changed_opening','El saldo inicial mensual o el banco difiere del ya reconocido para esta cuenta y mes.'
  from jsonb_array_elements(p_records) r join public.erp_monthly_openings o
   on o.company=co and o.ledger=r->'normalized'->>'ledgerCode' and o.currency=r->'normalized'->>'currency' and o.period_start=first_day
  where r->'normalized'->>'recordRole'='bank_opening'
   and (o.opening<>(r->'normalized'->>'signedAmount')::numeric or o.bank is distinct from r->'normalized'->>'bank')
 ) select coalesce(jsonb_agg(jsonb_build_object('sourceKey',k,'ledger',n->>'ledgerCode','document',n->>'erpDocument',
  'date',n->>'date','state',state,'message',message) order by k,state),'[]') into issues from problems;

 select coalesce(jsonb_agg(jsonb_build_object('ledger',o.n->>'ledgerCode','bank',o.n->>'bank','currency',o.n->>'currency',
  'periodStart',first_day,'cutoff',cut,'opening',o.n->'signedAmount','income',v.cargo,'expense',v.abono,
  'calculated',(o.n->>'signedAmount')::numeric+v.cargo-v.abono,'reported',o.n->'bankReportedClosing',
  'difference',case when o.n->>'bankReportedClosing' is not null then (o.n->>'signedAmount')::numeric+v.cargo-v.abono-(o.n->>'bankReportedClosing')::numeric end
 ) order by o.n->>'ledgerCode'),'[]') into controls
 from (select r->'normalized' n from jsonb_array_elements(p_records) r where r->'normalized'->>'recordRole'='bank_opening') o
 cross join lateral(select coalesce(sum((e->'normalized'->>'debe')::numeric),0) cargo,coalesce(sum((e->'normalized'->>'haber')::numeric),0) abono
  from jsonb_array_elements(effective) e where e->'normalized'->>'recordRole'='bank_movement'
  and e->'normalized'->>'ledgerCode'=o.n->>'ledgerCode' and e->'normalized'->>'currency'=o.n->>'currency') v;
 select issues||coalesce(jsonb_agg(jsonb_build_object('ledger',c->>'ledger','state','closing_difference',
  'message','El cierre informado no coincide con apertura + cargos − abonos, incluyendo movimientos conservados.','control',c)),'[]') into issues
 from jsonb_array_elements(controls) c where (c->>'difference')::numeric<>0 or abs((c->>'calculated')::numeric)>90071992547409.91;

 summary:=jsonb_build_object('mode','monthly_incremental','state','preview','cutoff',cut,'periodStart',first_day,
  'movementsRead',jsonb_array_length(incoming),'newMovements',(select count(*) from jsonb_array_elements(incoming) i where not exists(select 1 from jsonb_array_elements(known) k where k->>'key'=i->>'key')),
  'existingMovements',(select count(*) from jsonb_array_elements(incoming) i where exists(select 1 from jsonb_array_elements(known) k where k->>'key'=i->>'key')),
  'retainedMovements',jsonb_array_length(retained),'retainedNet',(select coalesce(sum((k->'record'->'normalized'->>'signedAmount')::numeric),0) from jsonb_array_elements(retained) k),
  'retainedDetails',(select coalesce(jsonb_agg(jsonb_build_object('sourceKey',k->>'key','ledger',k->'record'->'normalized'->>'ledgerCode',
   'date',k->'record'->'normalized'->>'date','document',k->'record'->'normalized'->>'erpDocument','signedAmount',k->'record'->'normalized'->'signedAmount',
   'currency',k->'record'->'normalized'->>'currency','fileName',k->>'fileName','sheet',k->'record'->>'sheet','row',k->'record'->'row')),'[]') from jsonb_array_elements(retained) k),
  'rejected',(select count(*) from jsonb_array_elements(issues) i where i->>'state' not in ('ambiguous_duplicate','changed_movement')),
  'ambiguous',(select count(distinct i->>'sourceKey') from jsonb_array_elements(issues) i where i->>'state' in ('ambiguous_duplicate','changed_movement')),
  'blocking',jsonb_array_length(issues)>0,'issues',issues,'openings',controls);
 return jsonb_build_object('known',known,'retained',retained,'effective',effective,'summary',summary);
end; $$;

alter function public.compare_erp_import(jsonb) rename to compare_erp_import_before_incremental;
create function public.compare_erp_import(p_records jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; plan jsonb; previous uuid:=public.daily_latest(); review jsonb; rev text;
begin
 perform public.treasury_require();
 if not coalesce(p_records->0->'normalized'->'coverageSheets' @> '["SALDOS BANCOS"]'::jsonb,false) then
  if exists(select 1 from public.erp_monthly_openings o where o.company=p_records->0->'normalized'->>'company'
   and o.period_start=date_trunc('month',(p_records->0->'normalized'->>'cutoffDate')::date)::date) then
   raise exception 'Este mes ya utiliza aperturas mensuales. Incluye SALDOS BANCOS para conservar el control incremental.';
  end if;
  return public.compare_erp_import_before_incremental(p_records);
 end if;
 result:=public.compare_erp_import_before_refresh(p_records); plan:=public.erp_incremental_plan(p_records);
 if not coalesce((result->>'historical')::boolean,false) then
  review:=public.treasury_refresh_review(previous,plan->'effective',(result->>'cutoff')::date);
 end if;
 rev:=md5(public.erp_revision(p_records)||(plan->'known')::text||(plan->'summary')::text||coalesce(review::text,''));
 return result||jsonb_build_object('revision',rev,'incremental',plan->'summary','refreshReview',review,
  'removed',(select count(*) from public.daily_base_rows r where r.batch_id=previous and r.normalized_json->>'sourceOrigin'<>'BANCO'
   and not exists(select 1 from public.erp_prepare(p_records) i where i.source_key=r.source_key)));
end; $$;

alter function public.import_erp_daily(text,text,jsonb,text) rename to import_erp_daily_before_incremental;
create function public.import_erp_daily(p_file_name text,p_file_hash text,p_records jsonb,p_revision text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp set statement_timeout='55s' as $$
declare comparison jsonb; plan jsonb; summary jsonb; b public.daily_base_batches%rowtype; previous uuid;
 enriched jsonb; fingerprint text; new_count int; recognized int; run_id uuid; saved_id uuid; retained_item jsonb; retained_normalized jsonb; can_reuse boolean;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 if not coalesce(p_records->0->'normalized'->'coverageSheets' @> '["SALDOS BANCOS"]'::jsonb,false) then
  return public.import_erp_daily_before_incremental(p_file_name,p_file_hash,p_records,p_revision);
 end if;
 if p_file_name is null or length(trim(p_file_name)) not between 1 and 255 or coalesce(p_file_hash,'') !~ '^[a-f0-9]{64}$' then raise exception 'Archivo o huella inválidos.'; end if;
 comparison:=public.compare_erp_import(p_records);
 if comparison->>'revision' is distinct from p_revision then raise exception 'Los datos o las decisiones cambiaron. Vuelve a analizar ERP.'; end if;
 if coalesce((comparison->'incremental'->>'blocking')::boolean,false) or coalesce((comparison->'refreshReview'->>'blocking')::boolean,false) then
  raise exception 'Actualización ERP bloqueada: revisa registros ambiguos, aperturas y ejecuciones en la vista previa. No se guardó ningún movimiento.';
 end if;
 plan:=public.erp_incremental_plan(p_records); summary:=plan->'summary'; previous:=public.daily_latest();
 select * into b from public.daily_base_batches where id=previous;
 can_reuse:=b.cutoff=(comparison->>'cutoff')::date and (summary->>'newMovements')::int=0
  and exists(select 1 from public.erp_import_runs where batch_id=previous)
  and not exists(select 1 from jsonb_array_elements(plan->'effective') e where e->'normalized'->>'recordRole'='bank_movement'
   and not exists(select 1 from public.daily_base_rows r where r.batch_id=previous and r.source_key=e->>'sourceKey'))
  and not exists(select 1 from public.erp_prepare(p_records) i where i.n->>'recordRole'<>'bank_movement' and not exists(
   select 1 from public.daily_base_rows r where r.batch_id=previous and r.source_key=i.source_key
    and public.erp_source_facts(r.normalized_json)=public.erp_source_facts(i.n)))
  and not exists(select 1 from public.daily_base_rows r where r.batch_id=previous and r.normalized_json->>'sourceOrigin'<>'BANCO'
   and not exists(select 1 from public.erp_prepare(p_records) i where i.source_key=r.source_key));
 if not coalesce(can_reuse,false) then
  -- The fingerprint includes retained facts so a previously processed workbook
  -- cannot select an older, incomplete snapshot after additional postings exist.
  select md5(coalesce(string_agg((e->>'sourceKey')||public.erp_source_facts(e->'normalized')::text,',' order by e->>'sourceKey'),''))
   into fingerprint from jsonb_array_elements(plan->'effective') e;
  -- A return to an earlier ERP state must create a fresh forward snapshot and
  -- carry CURRENT decisions, not reactivate an old batch with an outdated plan.
  if (comparison->>'cutoff')::date>=b.cutoff then fingerprint:=md5(fingerprint||previous::text); end if;
  select jsonb_agg(r||jsonb_build_object('normalized',(r->'normalized')||jsonb_build_object('incrementalFingerprint',fingerprint))) into enriched
   from jsonb_array_elements(p_records) r;
  saved_id:=(public.import_erp_daily_before_refresh(p_file_name,p_file_hash,enriched,public.erp_revision(enriched))->>'id')::uuid;
  select * into b from public.daily_base_batches where id=saved_id;
  for retained_item in select value from jsonb_array_elements(plan->'retained') loop
   retained_normalized:=(retained_item->'record'->'normalized')||jsonb_build_object('cutoffDate',summary->>'cutoff','periodStart',summary->>'periodStart',
    'sourceFileName',retained_item->>'fileName','sourceImportBatch',retained_item->>'sourceBatch','sourceCutoffDate',retained_item->'record'->'normalized'->>'cutoffDate');
   insert into public.daily_base_rows(batch_id,source_version,source_row,source_key,entity_id,entity_type,normalized_json,raw_json,status,warnings)
   values(b.id,(retained_item->>'sourceVersion')::uuid,(retained_item->'record'->>'row')::int,retained_item->>'key',(retained_item->>'entityId')::uuid,'cash_flow',retained_normalized,retained_item->'record'->'raw','WARNING',
    'Conservado de una importación anterior: ausente en esta exportación. Revisa su origen; no se eliminó ni se volvió a contabilizar.')
   on conflict(batch_id,source_key) do nothing;
  end loop;
 end if;

 -- Bootstrap existing identities only during an authorized import; migration
 -- itself never modifies or backfills financial records.
 insert into public.erp_bank_postings(source_key,entity_id,company,ledger,currency,posted_on,journal_key,facts,record,source_version,source_batch,file_name)
 select k->>'key',(k->>'entityId')::uuid,n->>'company',n->>'ledgerCode',n->>'currency',(n->>'date')::date,
  public.erp_bank_journal(n),public.erp_bank_facts(n),k->'record',(k->>'sourceVersion')::uuid,(k->>'sourceBatch')::uuid,k->>'fileName'
 from jsonb_array_elements(plan->'known') k cross join lateral(select k->'record'->'normalized' n) v
 on conflict(source_key) do nothing;
 get diagnostics recognized=row_count;
 insert into public.erp_bank_postings(source_key,entity_id,company,ledger,currency,posted_on,journal_key,facts,record,source_version,source_batch,file_name)
 select i.source_key,i.entity_id,i.n->>'company',i.n->>'ledgerCode',i.n->>'currency',(i.n->>'date')::date,
  public.erp_bank_journal(i.n),public.erp_bank_facts(i.n),jsonb_build_object('sheet',i.n->>'sourceSheet','row',i.source_row,
   'entityType',i.entity_type,'normalized',i.n,'raw',i.raw,'status',i.status,'warnings',i.warnings),b.id,b.id,p_file_name
 from public.erp_prepare(p_records) i where i.n->>'recordRole'='bank_movement' on conflict(source_key) do nothing;
 get diagnostics new_count=row_count;
 if new_count<>(summary->>'newMovements')::int then raise exception 'La identidad bancaria cambió durante la actualización. Vuelve a analizar ERP.'; end if;
 insert into public.erp_monthly_openings(company,ledger,currency,period_start,opening,bank,source_batch,record)
 select n->>'company',n->>'ledgerCode',n->>'currency',(n->>'periodStart')::date,(n->>'signedAmount')::numeric,n->>'bank',b.id,r
 from jsonb_array_elements(p_records) r cross join lateral(select r->'normalized' n) v where n->>'recordRole'='bank_opening'
 on conflict(company,ledger,currency,period_start) do nothing;
 summary:=summary||jsonb_build_object('state','completed','newMovements',new_count,'recognizedPrevious',recognized,'reusedSnapshot',coalesce(can_reuse,false));
 update public.daily_base_batches set incremental_summary=summary where id=b.id and incremental_summary is null;
 insert into public.erp_import_runs(batch_id,file_name,file_hash,summary,actor) values(b.id,p_file_name,p_file_hash,summary,auth.uid()) returning id into run_id;
 perform public.treasury_audit('Actualizó ERP incremental','Importaciones',null,jsonb_build_object('batch',b.id,'run',run_id,'summary',summary));
 return to_jsonb(b)||jsonb_build_object('incremental',summary,'import_run_id',run_id);
end; $$;

-- Deleting an imported snapshot is an existing explicit operation. Its preview
-- must disclose that the independent register and monthly identities survive;
-- deletion must never be used as an implicit correction of bank postings.
alter function public.excel_deletion_plan(uuid) rename to excel_deletion_plan_before_bank_register;
revoke all on function public.excel_deletion_plan_before_bank_register(uuid) from public,anon,authenticated;
create function public.excel_deletion_plan(p_batch_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare plan jsonb;
begin
 plan:=public.excel_deletion_plan_before_bank_register(p_batch_id);
 return plan||jsonb_build_object('preservedBankRegister',jsonb_build_object(
  'movements',(select count(*) from public.erp_bank_postings p where p_batch_id is null or p.source_batch=p_batch_id),
  'openings',(select count(*) from public.erp_monthly_openings p where p_batch_id is null or p.source_batch=p_batch_id)));
end; $$;
revoke all on function public.excel_deletion_plan(uuid) from public,anon,authenticated;
grant execute on function public.excel_deletion_plan(uuid) to authenticated;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('erp_bank_journal','erp_bank_facts','erp_source_facts','erp_incremental_plan',
   'compare_erp_import_before_incremental','import_erp_daily_before_incremental','compare_erp_import','import_erp_daily') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in ('compare_erp_import','import_erp_daily') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end; $$;
notify pgrst,'reload schema';
commit;
