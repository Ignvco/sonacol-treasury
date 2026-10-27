-- Additive work protection. No source rows, balances or existing decisions are rewritten.
begin;
alter function public.excel_deletion_plan(uuid) rename to excel_deletion_plan_before_work_guard;
revoke all on function public.excel_deletion_plan_before_work_guard(uuid) from public,anon,authenticated;
create function public.excel_deletion_plan(p_batch_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare plan jsonb; ids uuid[]; protected jsonb; blocked boolean;
begin
 plan:=public.excel_deletion_plan_before_work_guard(p_batch_id);
 select coalesce(array_agg(value::uuid),'{}') into ids from jsonb_array_elements_text(plan->'batchIds');
 protected:=(coalesce(plan->'dependentWork','{}')-'businessDecisions')||jsonb_build_object(
  'manual',(select count(*) from public.daily_manual m where m.batch_id=any(ids)
   and (m.edited or m.deleted or m.source_record_id is null)
   and not exists(select 1 from public.daily_manual keep where not(keep.batch_id=any(ids))
    and keep.id=m.id and keep.normalized_json=m.normalized_json and keep.deleted=m.deleted and keep.revision>=m.revision)),
  'manualDetails',(select count(*) from public.treasury_manual_details d where d.batch_id=any(ids)
   and not exists(select 1 from public.treasury_manual_details keep where not(keep.batch_id=any(ids))
    and keep.manual_id=d.manual_id and to_jsonb(keep)-'batch_id'=to_jsonb(d)-'batch_id')),
  'businessDecisions',(select count(*) from public.treasury_business_decisions d where d.batch_id=any(ids)
   -- Only untouched automatic defaults are reproducible from an ERP import.
   and not coalesce((d.kind='rule' and d.target_key='*' and d.revision=1 and not d.deleted
    and d.values_json->>'baseline'='SONACOL-OPERATING-v1'
    and (d.id=md5('SONACOL-OPERATING-v1:collection')::uuid
     or d.id=md5('SONACOL-OPERATING-v1:classification:'||(d.values_json->>'priority'))::uuid)),false)
   and not exists(select 1 from public.treasury_business_decisions keep where not(keep.batch_id=any(ids))
    and keep.id=d.id and keep.revision>=d.revision
    and to_jsonb(keep)-array['batch_id','revision','updated_at','updated_by']=to_jsonb(d)-array['batch_id','revision','updated_at','updated_by'])),
  'links',(select count(*) from public.daily_forecast_links l join public.daily_base_batches b on b.id=l.batch_id where l.batch_id=any(ids)
   and not exists(select 1 from public.daily_forecast_links keep join public.daily_base_batches kb on kb.id=keep.batch_id
    where not(keep.batch_id=any(ids)) and keep.projection_id=l.projection_id and keep.target_kind=l.target_kind
     -- A reviewed CAJA→ERP binding may replace the old target in a later snapshot.
     and (keep.target_id=l.target_id or (kb.cutoff,kb.created_at,kb.id)>(b.cutoff,b.created_at,b.id))))) ;
 select coalesce(bool_or(value::int>0),false) into blocked from jsonb_each_text(protected);
 return plan||jsonb_build_object('workProtectionVersion',1,'protectedWork',protected,'blocked',blocked,
  'blockingReason',case when blocked then 'Esta eliminación dejaría sin respaldo trabajo de tesorería o un histórico. Conserva la importación y revisa los registros protegidos.' else null end,
  'revision',md5((plan->>'revision')||protected::text));
end; $$;
revoke all on function public.excel_deletion_plan(uuid) from public,anon,authenticated;
grant execute on function public.excel_deletion_plan(uuid) to authenticated;

alter function public.delete_excel_imports(uuid,text,text) rename to delete_excel_imports_before_work_guard;
revoke all on function public.delete_excel_imports_before_work_guard(uuid,text,text) from public,anon,authenticated;
create function public.delete_excel_imports(p_batch_id uuid,p_revision text,p_confirmation text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp set statement_timeout='55s' as $$
declare plan jsonb;
begin
 perform public.treasury_require(true,'delete');
 perform pg_advisory_xact_lock(728394107);
 plan:=public.excel_deletion_plan(p_batch_id);
 if plan->>'revision' is distinct from p_revision then raise exception 'Los datos cambiaron. Revisa nuevamente el alcance antes de eliminar.'; end if;
 if (plan->>'blocked')::boolean then raise exception '%',plan->>'blockingReason'; end if;
 return public.delete_excel_imports_before_work_guard(p_batch_id,p_revision,p_confirmation);
end; $$;
revoke all on function public.delete_excel_imports(uuid,text,text) from public,anon,authenticated;
grant execute on function public.delete_excel_imports(uuid,text,text) to authenticated;

-- Retain future before/after values, including amount, dates and manual metadata.
-- This cannot reconstruct content deleted before this migration.
create function public.treasury_audit_plan_row() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.treasury_audit('Conservó versión de planificación',tg_table_name,
  case when tg_op='INSERT' then null else to_jsonb(old) end,
  case when tg_op='DELETE' then null else to_jsonb(new) end);
 return coalesce(new,old);
end; $$;
revoke all on function public.treasury_audit_plan_row() from public,anon,authenticated;
create trigger treasury_manual_version after insert or update or delete on public.daily_manual
 for each row execute function public.treasury_audit_plan_row();
create trigger treasury_manual_details_version after insert or update or delete on public.treasury_manual_details
 for each row execute function public.treasury_audit_plan_row();
create trigger treasury_forecast_link_version after insert or update or delete on public.daily_forecast_links
 for each row execute function public.treasury_audit_plan_row();
notify pgrst,'reload schema';
commit;
