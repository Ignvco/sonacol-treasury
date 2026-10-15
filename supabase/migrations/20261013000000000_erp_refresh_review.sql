-- Incremental on planning_operations + october_plan_review. No business data rewrite.
begin;

-- Compare evidence by exact identity, never by an amount/date heuristic.
-- p_rows contains {sourceKey, normalized}; callers validate/authorize first.
create function public.treasury_refresh_review(p_batch uuid,p_rows jsonb,p_cutoff date)
returns jsonb language sql stable set search_path=public,pg_temp as $$
 with incoming as (
  select x->>'sourceKey' k,x->'normalized' n from jsonb_array_elements(p_rows) x
 ), evidence as (
  select 'manual' kind,m.id,m.normalized_json->>'description' description,
   m.normalized_json->>'type' movement_type,e.value entry
  from public.daily_manual m cross join lateral jsonb_array_elements(coalesce(m.normalized_json->'executions','[]')) e
  where m.batch_id=p_batch and not m.deleted
  union all
  select 'redemption',d.id,d.values_json->>'description','income',e.value
  from public.treasury_business_decisions d cross join lateral jsonb_array_elements(d.execution_json) e
  where d.batch_id=p_batch and not d.deleted and d.kind='redemption'
 ), amounts as (
  select entry->>'sourceKey' k,sum((entry->>'amount')::numeric) allocated from evidence group by entry->>'sourceKey'
 ), checked as (
  select e.*,i.n,a.allocated,
   (select min((o.n->>'periodStart')::date) from incoming o
    where o.n->>'recordRole'='bank_opening' and o.n->>'ledgerCode'=e.entry->>'ledger'
     and o.n->>'currency'=e.entry->>'currency') period_start,
   (select count(*) from incoming o where regexp_replace(o.k,':[0-9]+$','')=regexp_replace(e.entry->>'sourceKey',':[0-9]+$','')) incoming_copies,
   (select count(*) from public.daily_base_rows o where o.batch_id=p_batch
    and regexp_replace(o.source_key,':[0-9]+$','')=regexp_replace(e.entry->>'sourceKey',':[0-9]+$','')) previous_copies
  from evidence e left join incoming i on i.k=e.entry->>'sourceKey'
  left join amounts a on a.k=e.entry->>'sourceKey'
 ), classified as (
  select *,case
   when period_start is null then 'uncovered_account'
   when n is null and (entry->>'date')::date<period_start then 'before_period'
   when n is null then 'missing_movement'
   when greatest(incoming_copies,previous_copies)>1 and incoming_copies<>previous_copies then 'ambiguous_duplicate'
   when n->>'recordRole' is distinct from 'bank_movement'
    or n->>'ledgerCode' is distinct from entry->>'ledger'
    or n->>'currency' is distinct from entry->>'currency'
    or n->>'date' is distinct from entry->>'date'
    or n->>'type' is distinct from movement_type
    or (n->>'amount')::numeric is distinct from (entry->>'bankAmount')::numeric
    or (n->>'date')::date>p_cutoff then 'changed_movement'
   when allocated>round((n->>'amount')::numeric,2) then 'overallocated'
   else 'verified' end state
  from checked
 )
 select jsonb_build_object(
  'blocking',exists(select 1 from classified where state in ('missing_movement','changed_movement','overallocated','ambiguous_duplicate')),
  'verified', (select count(*) from classified where state='verified'),
  'executions',coalesce((select jsonb_agg(jsonb_build_object(
   'kind',kind,'id',id,'description',description,'sourceKey',entry->>'sourceKey',
   'ledger',entry->>'ledger','currency',entry->>'currency','date',entry->>'date',
   'amount',entry->'amount','bankAmount',entry->'bankAmount','incomingAmount',n->'amount',
   'allocated',allocated,'periodStart',period_start,'state',state
  ) order by kind,id,entry->>'sourceKey') from classified where state<>'verified'),'[]'::jsonb),
  'uncoveredAccounts',coalesce((select jsonb_agg(x.account order by x.account::text) from (
   select distinct jsonb_build_object('ledger',old.normalized_json->>'ledgerCode','currency',old.normalized_json->>'currency') account
   from public.daily_base_rows old where old.batch_id=p_batch and old.normalized_json->>'recordRole'='bank_opening'
   and not exists(select 1 from incoming i where i.n->>'recordRole'='bank_opening'
    and i.n->>'ledgerCode'=old.normalized_json->>'ledgerCode' and i.n->>'currency'=old.normalized_json->>'currency')
  ) x),'[]'::jsonb)
 );
$$;
revoke all on function public.treasury_refresh_review(uuid,jsonb,date) from public,anon,authenticated;

alter function public.compare_erp_import(jsonb) rename to compare_erp_import_before_refresh;
revoke all on function public.compare_erp_import_before_refresh(jsonb) from public,anon,authenticated;
create function public.compare_erp_import(p_records jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb; incoming jsonb;
begin
 perform public.treasury_require(); result:=public.compare_erp_import_before_refresh(p_records);
 -- Historical imports do not inherit the active plan or its execution evidence.
 if coalesce((result->>'historical')::boolean,false) then return result; end if;
 select coalesce(jsonb_agg(jsonb_build_object('sourceKey',source_key,'normalized',n)),'[]') into incoming from public.erp_prepare(p_records);
 return result||jsonb_build_object('refreshReview',public.treasury_refresh_review(public.daily_latest(),incoming,(result->>'cutoff')::date));
end; $$;

alter function public.import_erp_daily(text,text,jsonb,text) rename to import_erp_daily_before_refresh;
revoke all on function public.import_erp_daily_before_refresh(text,text,jsonb,text) from public,anon,authenticated;
create function public.import_erp_daily(p_file_name text,p_file_hash text,p_records jsonb,p_revision text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp set statement_timeout='55s' as $$
declare comparison jsonb;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 comparison:=public.compare_erp_import(p_records);
 if comparison->>'revision' is distinct from p_revision then
  raise exception 'Los datos o las decisiones cambiaron. Vuelve a analizar ERP.';
 end if;
 if coalesce((comparison->'refreshReview'->>'blocking')::boolean,false) then
  raise exception 'ERP contradice ejecuciones registradas. Revisa los movimientos indicados; no se importó ni reasignó ningún movimiento.';
 end if;
 return public.import_erp_daily_before_refresh(p_file_name,p_file_hash,p_records,p_revision);
end; $$;

revoke all on function public.compare_erp_import(jsonb),public.import_erp_daily(text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.compare_erp_import(jsonb),public.import_erp_daily(text,text,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
