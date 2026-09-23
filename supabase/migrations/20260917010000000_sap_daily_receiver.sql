-- Server-only ingestion. A trusted SAP export delivers all three ERP sources in
-- one request. No browser permission can invoke this function or overwrite MANUAL.
create function public.import_sap_daily(p_actor uuid,p_file_hash text,p_records jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set statement_timeout='55s' as $$
declare previous uuid; b jsonb; day date; old_sub text:=current_setting('request.jwt.claim.sub',true); old_claims text:=current_setting('request.jwt.claims',true);
begin
 if not exists(select 1 from public.profiles where id=p_actor and role in ('administrador','tesoreria')) then raise exception 'Configura un usuario de servicio de Tesorería.'; end if;
 if exists(select 1 from jsonb_array_elements(p_records) r where coalesce(r->'normalized'->>'sourceOrigin','') not in ('BANCO','CLIENTES','COLOCACIONES')) then raise exception 'SAP no puede enviar ni modificar MANUAL.'; end if;
 if not exists(select 1 from jsonb_array_elements(p_records) r where r->'normalized'->>'sourceOrigin'='BANCO') then raise exception 'La entrega SAP debe incluir los movimientos BANCO completos.'; end if;
 perform pg_advisory_xact_lock(728394107);
 day:=public.daily_validate(p_records);previous:=public.daily_latest();
 perform set_config('request.jwt.claim.sub',p_actor::text,true);
 perform set_config('request.jwt.claims',(coalesce(nullif(old_claims,''),'{}')::jsonb||jsonb_build_object('sub',p_actor))::text,true);
 select to_jsonb(x) into b from public.daily_base_batches x where file_hash=p_file_hash;
 if b is null then
  b:=public.import_daily_base('SAP-'||day::text||'.json',p_file_hash,p_records,public.daily_revision(p_records),'{}');
  update public.daily_base_batches set source='sap' where id=(b->>'id')::uuid;
  -- All MANUAL work persists across SAP updates, including unedited Excel rows.
  if previous is not null and day >= (select cutoff from public.daily_base_batches where id=previous) then
   insert into public.daily_manual(batch_id,id,source_key,normalized_json,source_record_id,edited,deleted,revision,updated_by)
   select (b->>'id')::uuid,id,source_key,normalized_json,source_record_id,edited,deleted,revision,updated_by
   from public.daily_manual where batch_id=previous on conflict do nothing;
   insert into public.daily_forecast_links(batch_id,projection_id,target_kind,target_id)
   select (b->>'id')::uuid,projection_id,target_kind,target_id from public.daily_forecast_links where batch_id=previous on conflict do nothing;
  end if;
  b:=b||'{"source":"sap"}'::jsonb;
 elsif b->>'source'<>'sap' then raise exception 'La huella de la entrega no corresponde a SAP.';
 end if;
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 return b;
end; $$;
revoke all on function public.import_sap_daily(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.import_sap_daily(uuid,text,jsonb) to service_role;

create function public.get_daily_import_status() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 with counted as (
  select b.*,count(r.id)::int actual from public.daily_base_batches b left join public.daily_base_rows r on r.batch_id=b.id group by b.id
 ), latest as(select * from counted order by cutoff desc,created_at desc,id desc limit 1), recent as(select * from counted order by created_at desc,id desc limit 30)
 select jsonb_build_object('records',coalesce((select actual from latest),0),'last_sync_at',(select created_at from latest),'errors',coalesce((select error_records from latest),0),
  'history',coalesce((select jsonb_agg(jsonb_build_object('id',id,'source',source,'records',actual,'duration_seconds',0,
   'status',case when actual<total_records or error_records>0 then 'Warning' else 'Success' end,
   'error_message',case when actual<total_records or error_records>0 then 'Carga anterior incompleta; vuelve a importar BASE.' else null end,
   'synced_at',created_at,'verified',true) order by created_at desc,id desc) from recent),'[]'));
$$;
revoke all on function public.get_daily_import_status() from public,anon;
grant execute on function public.get_daily_import_status() to authenticated;
