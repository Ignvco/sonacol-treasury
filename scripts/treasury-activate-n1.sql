-- SONACOL TREASURY · PATCH 05 · SQL PARA ENTORNO AISLADO, NO APLICAR A PRODUCCIÓN SIN GATE.
-- Contrato: nuevas importaciones ERP => v4; snapshots preexistentes/BASE => su versión original.
-- Se requiere haber aplicado manualmente todas las migraciones hasta 20261025034359.
-- No marca ni repara automáticamente el historial supabase_migrations.
begin;
select pg_advisory_xact_lock(728394107);

-- Fail closed on an unexpected installation: never reconstruct missing tables/functions here.
do $$
declare current_rule text;
begin
 if to_regclass('public.erp_bank_postings') is null or to_regclass('public.erp_monthly_openings') is null
    or to_regclass('public.erp_import_runs') is null then
   raise exception 'PATCH 05: falta el registro bancario ERP; no continuar.';
 end if;
 if to_regprocedure('public.import_erp_daily(text,text,jsonb,text)') is null
    or to_regprocedure('public.get_daily_base_snapshot(uuid)') is null
    or to_regprocedure('public.get_daily_base_snapshot_before_cash_position(uuid)') is null
    or to_regprocedure('public.treasury_validate_scenario(uuid,text,jsonb,jsonb)') is null
    or to_regprocedure('public.treasury_validate_scenario_before_cash_position(uuid,text,jsonb,jsonb)') is null then
   raise exception 'PATCH 05: funciones financieras previas incompatibles.';
 end if;
 select pg_get_constraintdef(oid) into current_rule
 from pg_constraint
 where conrelid='public.daily_base_batches'::regclass
   and conname='daily_base_batches_projection_engine_version_check';
 if current_rule is null or position('erp-cash-position-v3' in current_rule)=0
    or position('legacy-next-day' in current_rule)=0
    or position('erp-cash-position-v4' in current_rule)>0 then
   raise exception 'PATCH 05: constraint de versión no coincide con la instalación auditada; revisión manual.';
 end if;
 if to_regprocedure('public.import_erp_daily_before_n1(text,text,jsonb,text)') is not null
    or to_regprocedure('public.get_daily_base_snapshot_before_n1(uuid)') is not null
    or to_regprocedure('public.treasury_validate_scenario_before_n1(uuid,text,jsonb,jsonb)') is not null then
   raise exception 'PATCH 05: activación N+1 ya instalada o parcialmente personalizada.';
 end if;
 if exists (select 1 from public.daily_base_batches where projection_engine_version not in
   ('legacy-next-day','erp-cash-position-v3')) then
   raise exception 'PATCH 05: versiones previas no reconocidas; revisión manual.';
 end if;
end; $$;

-- Únicamente se amplía el conjunto permitido. Se conserva el default v3 para los otros flujos.
alter table public.daily_base_batches
 drop constraint daily_base_batches_projection_engine_version_check;
alter table public.daily_base_batches
 add constraint daily_base_batches_projection_engine_version_check
 check (projection_engine_version in ('legacy-next-day','erp-cash-position-v3','erp-cash-position-v4'));

-- El RPC marca el contexto solo durante una importación ERP autenticada.
-- El trigger NO actualiza registros existentes: se activa solo al INSERT de un lote nuevo.
create function public.treasury_set_erp_n1_on_new_batch() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
 if current_setting('sonacol.erp_new_batch_engine', true)='erp-cash-position-v4' then
   if new.projection_engine_version is distinct from 'erp-cash-position-v3' then
     raise exception 'PATCH 05: valor inicial de motor inesperado para nuevo lote ERP.';
   end if;
   new.projection_engine_version:='erp-cash-position-v4';
 end if;
 return new;
end; $$;
revoke all on function public.treasury_set_erp_n1_on_new_batch() from public,anon,authenticated;
create trigger treasury_assign_erp_n1_before_insert
before insert on public.daily_base_batches
for each row execute function public.treasury_set_erp_n1_on_new_batch();

-- Wrapper de la RPC pública existente. No se cambia su firma ni el algoritmo de importación.
-- El identificador de versión se fija ANTES del INSERT, evitando reversiones posteriores.
alter function public.import_erp_daily(text,text,jsonb,text)
 rename to import_erp_daily_before_n1;
revoke all on function public.import_erp_daily_before_n1(text,text,jsonb,text) from public,anon,authenticated;
create function public.import_erp_daily(p_file_name text,p_file_hash text,p_records jsonb,p_revision text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp set statement_timeout='55s' as $$
declare old_context text; result jsonb;
begin
 perform public.treasury_require(true);
 perform pg_advisory_xact_lock(728394107);
 old_context:=coalesce(current_setting('sonacol.erp_new_batch_engine',true),'');
 if p_records->0->'normalized'->>'sourceProfile'='ERP-RAW-v1' then
   perform set_config('sonacol.erp_new_batch_engine','erp-cash-position-v4',true);
 end if;
 result:=public.import_erp_daily_before_n1(p_file_name,p_file_hash,p_records,p_revision);
 perform set_config('sonacol.erp_new_batch_engine',old_context,true);
 return result;
end; $$;
revoke all on function public.import_erp_daily(text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.import_erp_daily(text,text,jsonb,text) to authenticated;

-- Las funciones actuales tienen capas adicionales de rescates y operaciones.
-- NO reescribir su cuerpo: renombrar y envolver la definición que realmente está
-- instalada conserva íntegramente ese comportamiento, incluidas capas manuales.
alter function public.get_daily_base_snapshot(uuid)
 rename to get_daily_base_snapshot_before_n1;
revoke all on function public.get_daily_base_snapshot_before_n1(uuid) from public,anon,authenticated;
create function public.get_daily_base_snapshot(p_batch_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare snap jsonb; version text;
begin
 perform public.treasury_require();
 snap:=public.get_daily_base_snapshot_before_n1(p_batch_id);
 if snap->'coverage'->>'profile' is distinct from 'ERP-RAW-v1' then return snap; end if;
 select projection_engine_version into version from public.daily_base_batches
 where id=(snap->'batch'->>'id')::uuid;
 -- Introduce v4 only for new batches. Existing snapshots preserve EXACTLY
 -- their old engineVersion (including NULL/missing) and their saved behavior.
 if version='erp-cash-position-v4' then
   return snap||jsonb_build_object('engineVersion',version);
 end if;
 return snap;
end; $$;
revoke all on function public.get_daily_base_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.get_daily_base_snapshot(uuid) to authenticated;

-- El validador anterior sigue aplicando todas sus reglas. Se añade el rechazo
-- explícito a contextos v4 ausentes/incorrectos sin cambiar validaciones previas.
alter function public.treasury_validate_scenario(uuid,text,jsonb,jsonb)
 rename to treasury_validate_scenario_before_n1;
revoke all on function public.treasury_validate_scenario_before_n1(uuid,text,jsonb,jsonb) from public,anon,authenticated;
create function public.treasury_validate_scenario(
 p_batch uuid,p_source_revision text,p_context jsonb,p_adjustments jsonb
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare snap jsonb;
begin
 snap:=public.treasury_validate_scenario_before_n1(
   p_batch,p_source_revision,p_context,p_adjustments);
 if (snap->>'engineVersion'='erp-cash-position-v4'
     or p_context ? 'engineVersion')
    and (p_context->>'engineVersion') is distinct from (snap->>'engineVersion') then
   raise exception 'Cambió el criterio de cálculo. Actualiza la aplicación y rebasa el escenario antes de guardar.';
 end if;
 return snap;
end; $$;
revoke all on function public.treasury_validate_scenario(uuid,text,jsonb,jsonb) from public,anon,authenticated;
-- Los clientes guardan escenarios a través de sus RPC, no mediante esta función interna.

notify pgrst,'reload schema';
commit;
