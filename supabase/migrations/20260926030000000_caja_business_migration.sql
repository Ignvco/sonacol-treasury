-- Stage 2: retained CAJA evidence, reviewed bindings and explicit adoption of computed dates.
begin;
alter table public.treasury_business_decisions add column source_json jsonb;

create function public.treasury_business_source(p_record text) returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('recordId',r.id,'entityId',r.entity_id,'kind',r.entity_type,
  'sourceKey',r.source_key,'row',r.source_row,'fileName',b.file_name,'cutoff',b.cutoff,
  'normalized',r.normalized_json)
 from public.daily_base_rows r join public.daily_base_batches b on b.id=r.batch_id where r.id::text=p_record;
$$;
update public.treasury_business_decisions set source_json=public.treasury_business_source(values_json->>'sourceRecord')
 where values_json ? 'sourceRecord';

create function public.treasury_capture_business_source() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if TG_OP='UPDATE' then
  if new.values_json->>'sourceRecord' is distinct from old.values_json->>'sourceRecord' then raise exception 'El origen de la decisión es inmutable.'; end if;
  new.source_json:=old.source_json;
 elsif new.source_json is null then new.source_json:=public.treasury_business_source(new.values_json->>'sourceRecord'); end if;
 return new;
end; $$;
create trigger capture_business_source before insert or update on public.treasury_business_decisions
 for each row execute function public.treasury_capture_business_source();

-- Copy evidence even after the original CAJA batch is removed. Assert the upgrade anchor.
do $$ declare definition text; anchor text:='batch_id,id,kind,target_key,values_json,revision,deleted,updated_by,updated_at)'; begin
 select pg_get_functiondef('public.erp_carry_business(uuid,uuid)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'No se encontró el contrato de arrastre de la etapa 1.'; end if;
 definition:=replace(definition,anchor,'batch_id,id,kind,target_key,values_json,revision,deleted,updated_by,updated_at,source_json)');
 definition:=replace(definition,'select p_batch,id,kind,target_key,values_json,revision,deleted,updated_by,updated_at from',
  'select p_batch,id,kind,target_key,values_json,revision,deleted,updated_by,updated_at,source_json from');
 execute definition;
end; $$;

-- All writes, including the existing editor, share binding and provenance checks.
alter function public.treasury_save_business(uuid,uuid,int,text,text,jsonb,boolean) rename to treasury_save_business_v1;
revoke all on function public.treasury_save_business_v1(uuid,uuid,int,text,text,jsonb,boolean) from public,anon,authenticated;
create function public.treasury_save_business(p_batch uuid,p_id uuid,p_revision int,p_kind text,p_target text,p_values jsonb,p_delete boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.treasury_business_decisions%rowtype; target jsonb; previous_target uuid; saved jsonb;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 select * into old from public.treasury_business_decisions where batch_id=p_batch and id=p_id for update;
 if p_id is null and p_values ? 'sourceRecord' then raise exception 'El origen CAJA solo puede establecerlo la importación.'; end if;
 if old.id is not null and p_values->>'sourceRecord' is distinct from old.values_json->>'sourceRecord' then raise exception 'El origen de la decisión es inmutable.'; end if;
 if not p_delete and old.id is not null and old.target_key<>p_target and p_kind='adjustment' then
  select e into target from jsonb_array_elements(public.erp_business_entities(p_batch)) e where e->'normalized'->>'businessKey'=p_target;
  if old.source_json->>'kind'='invoice' and (target->>'kind' is distinct from 'invoice' or target->'normalized'->>'currency' is distinct from old.source_json->'normalized'->>'currency') then raise exception 'La correspondencia requiere una factura de la misma moneda.'; end if;
  select r.entity_id into previous_target from public.daily_base_rows r where r.batch_id=p_batch and r.source_key=old.target_key;
  -- ERP entity IDs are md5(source_key): recover the previous binding even when
  -- that invoice disappeared from the latest coverage or its source batch was deleted.
  previous_target:=coalesce(previous_target,case when old.target_key like 'erp:%' then md5(old.target_key)::uuid else (old.source_json->>'entityId')::uuid end);
  if previous_target is not null and previous_target is distinct from (target->>'id')::uuid and exists(select 1 from public.daily_forecast_links where batch_id=p_batch and target_kind='invoice' and target_id=previous_target)
   and exists(select 1 from public.daily_forecast_links where batch_id=p_batch and target_kind='invoice' and target_id=(target->>'id')::uuid) then raise exception 'El destino ya tiene un vínculo MANUAL. Resuelve ese vínculo antes de reasignar.'; end if;
 end if;
 saved:=public.treasury_save_business_v1(p_batch,p_id,p_revision,p_kind,p_target,p_values,p_delete);
 if not p_delete and previous_target is not null and target->>'kind'='invoice' then
  update public.daily_forecast_links set target_id=(target->>'id')::uuid where batch_id=p_batch and target_kind='invoice' and target_id=previous_target;
 end if;
 return saved;
end; $$;

-- Preview is read-only. Release only untouched dates proved to be the CAJA +5 formula.
-- Explicit dates (column O), edited decisions, exceptions and pending matches remain untouched.
create function public.treasury_preview_collection_policy(p_batch uuid,p_target text,p_values jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare entities jsonb; affected jsonb; release_ids jsonb; preserved int; revision text;
begin
 perform public.treasury_require(); entities:=public.erp_business_entities(p_batch);
 if jsonb_typeof(p_values) is distinct from 'object' or p_values->>'ruleType' is distinct from 'collection'
  or coalesce(p_values->>'days','') !~ '^-?[0-9]+$' or (p_values->>'days')::int not between -365 and 365
  or coalesce(p_values->>'priority','') !~ '^[0-9]+$' or (p_values->>'priority')::int not between 0 and 9999
  or nullif(trim(p_target),'') is null then raise exception 'Regla de cobro inválida.'; end if;
 if nullif(p_values->>'bankLedger','') is not null and not exists(select 1 from jsonb_array_elements(entities) e where e->'normalized'->>'recordRole'='bank_opening' and e->'normalized'->>'ledgerCode'=p_values->>'bankLedger') then raise exception 'Cuenta receptora fuera de cobertura.'; end if;
 select coalesce(jsonb_agg(e->'normalized'->>'businessKey'),'[]') into affected from jsonb_array_elements(entities) e where e->>'kind'='invoice' and p_target in ('*',e->'normalized'->>'customerCode');
 if jsonb_array_length(affected)=0 then raise exception 'No hay facturas para este código de cliente en la cobertura.'; end if;
 if exists(select 1 from public.treasury_business_decisions d where d.batch_id=p_batch and d.kind='rule' and not d.deleted and d.values_json->>'ruleType'='collection'
  and (d.values_json->>'priority')::int >= (p_values->>'priority')::int
  and exists(select 1 from jsonb_array_elements(entities) e where affected ? (e->'normalized'->>'businessKey') and d.target_key in ('*',e->'normalized'->>'customerCode'))) then raise exception 'Otra regla de cobro de este alcance tiene prioridad igual o mayor. Edítala o elige una prioridad mayor.'; end if;
 select coalesce(jsonb_agg(d.id order by d.id),'[]') into release_ids from public.treasury_business_decisions d
 where d.batch_id=p_batch and d.kind='adjustment' and not d.deleted and affected ? d.target_key and d.revision=1
  and d.source_json->'normalized'->>'sourceProfile' like 'BASE-ONLY-%'
  and nullif(d.source_json->'normalized'->>'adjustedDate','') is null
  and d.values_json->>'date'=d.source_json->'normalized'->>'reportDate'
  and d.source_json->'normalized'->>'reportDate'=((d.source_json->'normalized'->>'dueDate')::date+5)::text;
 select count(*) into preserved from public.treasury_business_decisions d where d.batch_id=p_batch and d.kind='adjustment' and not d.deleted and affected ? d.target_key and nullif(d.values_json->>'date','') is not null and not release_ids ? d.id::text;
 revision:=md5(public.treasury_revision(p_batch)||p_target||p_values::text||release_ids::text);
 return jsonb_build_object('revision',revision,'invoiceCount',jsonb_array_length(affected),'releaseIds',release_ids,'preservedDates',preserved);
end; $$;

create function public.treasury_apply_collection_policy(p_batch uuid,p_target text,p_values jsonb,p_expected text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare plan jsonb; decision record; saved jsonb;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 plan:=public.treasury_preview_collection_policy(p_batch,p_target,p_values);
 if p_expected is distinct from plan->>'revision' then raise exception 'La planificación cambió. Revisa nuevamente el impacto antes de aplicar.'; end if;
 saved:=public.treasury_save_business(p_batch,null,null,'rule',p_target,p_values,false);
 for decision in select * from public.treasury_business_decisions where batch_id=p_batch and plan->'releaseIds' ? id::text loop
  perform public.treasury_save_business(p_batch,decision.id,decision.revision,'adjustment',decision.target_key,decision.values_json-'date',false);
 end loop;
 perform public.treasury_audit('Adoptó regla de cobranza CAJA','Planificación',plan,jsonb_build_object('rule',saved));
 return saved;
end; $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('treasury_business_source','treasury_capture_business_source','treasury_save_business','treasury_preview_collection_policy','treasury_apply_collection_policy') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in ('treasury_save_business','treasury_preview_collection_policy','treasury_apply_collection_policy') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end; $$;
notify pgrst,'reload schema';
commit;
