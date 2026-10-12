-- Date policy belongs to the batch/saved snapshot, never to the browser clock.
begin;
select pg_advisory_xact_lock(728394107);

-- Existing batches keep their previous policy; only the current ERP workspace
-- opts in. Future batches carry the new version even after becoming historical.
alter table public.daily_base_batches add column projection_engine_version text
 not null default 'legacy-next-day'
 check(projection_engine_version in ('legacy-next-day','erp-cash-position-v3'));
alter table public.daily_base_batches alter column projection_engine_version set default 'erp-cash-position-v3';
update public.daily_base_batches b set projection_engine_version='erp-cash-position-v3'
 where b.id=public.daily_latest() and exists(
  select 1 from public.daily_base_rows r where r.batch_id=b.id and r.normalized_json->>'sourceProfile'='ERP-RAW-v1'
 );

alter function public.get_daily_base_snapshot(uuid) rename to get_daily_base_snapshot_before_cash_position;
revoke all on function public.get_daily_base_snapshot_before_cash_position(uuid) from public,anon,authenticated;
create function public.get_daily_base_snapshot(p_batch_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare snap jsonb; version text;
begin
 perform public.treasury_require();
 snap:=public.get_daily_base_snapshot_before_cash_position(p_batch_id);
 if snap->'coverage'->>'profile' is distinct from 'ERP-RAW-v1' then return snap; end if;
 select projection_engine_version into version from public.daily_base_batches where id=(snap->'batch'->>'id')::uuid;
 if version='erp-cash-position-v3' then
  return snap||jsonb_build_object('engineVersion',version);
 end if;
 return snap;
end; $$;
revoke all on function public.get_daily_base_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.get_daily_base_snapshot(uuid) to authenticated;

-- Refuse to save a scenario calculated with a stale policy after deployment.
-- The snapshot, not a caller-supplied version, is authoritative.
alter function public.treasury_validate_scenario(uuid,text,jsonb,jsonb) rename to treasury_validate_scenario_before_cash_position;
revoke all on function public.treasury_validate_scenario_before_cash_position(uuid,text,jsonb,jsonb) from public,anon,authenticated;
create function public.treasury_validate_scenario(p_batch uuid,p_source_revision text,p_context jsonb,p_adjustments jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare snap jsonb;
begin
 snap:=public.treasury_validate_scenario_before_cash_position(p_batch,p_source_revision,p_context,p_adjustments);
 if (snap->>'engineVersion'='erp-cash-position-v3' or p_context ? 'engineVersion')
  and (p_context->>'engineVersion') is distinct from (snap->>'engineVersion') then
  raise exception 'Cambió el criterio de cálculo. Actualiza la aplicación y rebasa el escenario antes de guardar.';
 end if;
 return snap;
end; $$;
revoke all on function public.treasury_validate_scenario(uuid,text,jsonb,jsonb) from public,anon,authenticated;

-- Only new saves receive this metadata. No UPDATE of frozen forecasts or
-- existing scenarios, and no rewrite of raw amounts, dates or manual decisions.
create function public.treasury_saved_engine_version() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 new.engine_version:=coalesce(new.snapshot->>'engineVersion','decision-v1');
 return new;
end; $$;
revoke all on function public.treasury_saved_engine_version() from public,anon,authenticated;
create trigger treasury_scenario_engine_version before insert or update of snapshot
 on public.treasury_scenarios for each row execute function public.treasury_saved_engine_version();
create trigger treasury_forecast_engine_version before insert
 on public.treasury_forecasts for each row execute function public.treasury_saved_engine_version();

notify pgrst,'reload schema';
commit;
