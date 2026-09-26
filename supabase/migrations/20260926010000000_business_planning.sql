-- Business decisions have stable identities and independent versions per snapshot.
begin;
create table public.treasury_business_decisions (
 batch_id uuid not null references public.daily_base_batches(id) on delete cascade,
 id uuid not null default gen_random_uuid(), kind text not null check(kind in ('adjustment','redemption','rule')),
 target_key text not null, values_json jsonb not null, revision int not null default 1,
 deleted boolean not null default false, updated_by uuid references public.profiles(id), updated_at timestamptz not null default clock_timestamp(),
 primary key(batch_id,id)
);
create unique index treasury_business_adjustment_target on public.treasury_business_decisions(batch_id,target_key) where kind='adjustment' and not deleted;
alter table public.treasury_business_decisions enable row level security;
revoke all on public.treasury_business_decisions from anon,authenticated;
grant select on public.treasury_business_decisions to authenticated;
create policy business_approved_read on public.treasury_business_decisions for select to authenticated using(public.treasury_approved());

create or replace function public.erp_revision(p_records jsonb) returns text language sql stable set search_path=public,pg_temp as $$
 select md5(public.daily_revision(p_records)||coalesce((select string_agg(id::text||':'||revision||':'||deleted,',' order by id) from public.treasury_business_decisions where batch_id=public.daily_latest()),'')||coalesce((select string_agg((r-'raw')::text,',' order by r->>'sheet',(r->>'row')::int) from jsonb_array_elements(p_records) r),''));
$$;

create function public.erp_business_entities(p_batch uuid) returns jsonb language sql stable set search_path=public,pg_temp as $$
 with raw as (select r.*,b.file_name from public.daily_base_rows r join public.daily_base_batches b on b.id=r.batch_id where r.batch_id=p_batch and r.normalized_json->>'sourceProfile'='ERP-RAW-v1'),
 ordinary as (select jsonb_build_object('id',entity_id,'recordId',id,'kind',entity_type,'normalized',normalized_json||jsonb_build_object('businessKey',source_key),'row',source_row,'sheet',source_sheet,'fileName',file_name) item from raw where entity_type<>'investment'),
 positions as (select public.erp_position_key(normalized_json) k,min(file_name) file_name,min(normalized_json->>'company') company,min(normalized_json->>'ledgerCode') ledger,
 min(normalized_json->>'currency') currency,min(normalized_json->>'date') started,sum((normalized_json->>'signedAmount')::numeric) amount,jsonb_agg(id order by source_row) trace
 from raw where entity_type='investment' group by public.erp_position_key(normalized_json)),
 assembled as (select item from ordinary union all select jsonb_build_object('id',md5(k)::uuid,'recordId',null,'kind','investment','row',null,'sheet','COLOCACIONES','fileName',file_name,
 'normalized',jsonb_build_object('sourceProfile','ERP-RAW-v1','sourceOrigin','COLOCACIONES','sourceSheet','COLOCACIONES','recordRole','investment_position','businessKey',k,'company',company,'ledgerCode',ledger,'currency',currency,'amount',amount,'type','income','startDate',started,'endDate',null,'status','vigente','rateKnown',false,'investmentType','fondo_mutuo','description','Posición de inversión · '||ledger,'traceRecords',trace,'isPosition',true)) from positions)
 select coalesce(jsonb_agg(item order by item->>'kind',item->>'id'),'[]') from assembled;
$$;

create function public.treasury_save_business(p_batch uuid,p_id uuid,p_revision int,p_kind text,p_target text,p_values jsonb,p_delete boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare old public.treasury_business_decisions%rowtype; saved public.treasury_business_decisions%rowtype; entities jsonb; target jsonb; reserved numeric; pair record;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 if not exists(select 1 from public.daily_base_batches where id=p_batch) then raise exception 'La carga seleccionada ya no existe.'; end if;
 if p_id is not null then
  select * into old from public.treasury_business_decisions where batch_id=p_batch and id=p_id for update;
  if not found or old.revision is distinct from p_revision then raise exception 'La decisión cambió. Actualiza antes de guardar.'; end if;
 end if;
 if p_kind not in ('adjustment','redemption','rule') or nullif(trim(p_target),'') is null or jsonb_typeof(p_values) is distinct from 'object' or octet_length(p_values::text)>10000 then raise exception 'Decisión de negocio inválida.'; end if;
 if p_id is not null and old.kind<>p_kind then raise exception 'El tipo de una decisión no se puede cambiar.'; end if;
 for pair in select * from jsonb_each(p_values) loop
  if pair.key not in ('date','bankLedger','bank','category','note','description','amount','currency','status','days','ruleType','contains','priority','sourceRecord','baseline') then raise exception 'Campo no permitido: %.',pair.key; end if;
 end loop;
 if length(coalesce(p_values->>'note',''))>2000 or length(coalesce(p_values->>'description',''))>300 then raise exception 'Descripción u observación demasiado larga.'; end if;
 if nullif(p_values->>'date','') is not null then
  if p_values->>'date' !~ '^\d{4}-\d{2}-\d{2}$' or (p_values->>'date')::date not between '2000-01-01'::date and '2100-12-31'::date then raise exception 'Fecha prevista inválida.'; end if;
 end if;
 if nullif(p_values->>'category','') is not null and p_values->>'category' not in ('collection','investment_redemption','other_income','supplier','payroll','tax','bank_credit','dividends','credit','social_levies') then raise exception 'Categoría inválida.'; end if;
 entities:=public.erp_business_entities(p_batch);
 select e into target from jsonb_array_elements(entities) e where e->'normalized'->>'businessKey'=p_target;
 if not p_delete then
  if p_kind<>'rule' and target is null then raise exception 'El registro ya no está en esta cobertura. Conservamos la decisión; selecciona un destino vigente para reasignarla.'; end if;
  if nullif(p_values->>'bankLedger','') is not null and not exists(select 1 from jsonb_array_elements(entities) e where e->'normalized'->>'recordRole'='bank_opening' and e->'normalized'->>'ledgerCode'=p_values->>'bankLedger') then raise exception 'Cuenta receptora fuera de la cobertura.'; end if;
  if p_kind='adjustment' then
   if target->>'kind'='investment' then raise exception 'Las posiciones se planifican mediante rescates.'; end if;
   if p_values ?| array['amount','currency','status','days','ruleType','contains','priority'] then raise exception 'Un ajuste no puede alterar importe, moneda ni estado contable.'; end if;
   if target->>'kind'='cash_flow' and (nullif(p_values->>'date','') is not null or nullif(p_values->>'bankLedger','') is not null or nullif(p_values->>'bank','') is not null) then raise exception 'Un movimiento bancario conserva su fecha y cuenta ERP.'; end if;
  elsif p_kind='redemption' then
   if target->>'kind'<>'investment' or coalesce(p_values->>'amount','') !~ '^[0-9]+([.][0-9]{1,2})?$' or (p_values->>'amount')::numeric<=0
    or p_values->>'currency' is distinct from target->'normalized'->>'currency' or nullif(p_values->>'date','') is null or nullif(p_values->>'bankLedger','') is null
    or coalesce(p_values->>'status','') not in ('planned','executed','cancelled') then raise exception 'Rescate inválido: revisa posición, monto, moneda, fecha, cuenta y estado.'; end if;
   if not exists(select 1 from jsonb_array_elements(entities) e where e->'normalized'->>'recordRole'='bank_opening' and e->'normalized'->>'ledgerCode'=p_values->>'bankLedger' and e->'normalized'->>'currency'=p_values->>'currency') then raise exception 'El rescate y la cuenta receptora deben tener la misma moneda.'; end if;
   select coalesce(sum((values_json->>'amount')::numeric),0) into reserved from public.treasury_business_decisions where batch_id=p_batch and kind='redemption' and target_key=p_target and not deleted and values_json->>'status'='planned' and id is distinct from p_id;
   if p_values->>'status'='planned' and reserved+(p_values->>'amount')::numeric>(target->'normalized'->>'amount')::numeric then raise exception 'Los rescates programados exceden el capital disponible de la posición.'; end if;
  else
   if coalesce(p_values->>'ruleType','') not in ('collection','classification') or coalesce(p_values->>'priority','') !~ '^[0-9]{1,4}$' then raise exception 'Tipo o prioridad de regla inválidos.'; end if;
   if p_values->>'ruleType'='collection' and (coalesce(p_values->>'days','') !~ '^-?[0-9]{1,3}$' or abs((p_values->>'days')::int)>365) then raise exception 'Plazo de cobro inválido.'; end if;
   if p_values->>'ruleType'='classification' and (nullif(trim(p_values->>'contains'),'') is null or nullif(p_values->>'category','') is null) then raise exception 'La clasificación requiere texto y categoría.'; end if;
   if p_values ?| array['date','amount','currency','status'] then raise exception 'La regla no puede introducir hechos contables.'; end if;
  end if;
 end if;
 insert into public.treasury_business_decisions(batch_id,id,kind,target_key,values_json,deleted,updated_by)
 values(p_batch,coalesce(p_id,gen_random_uuid()),p_kind,p_target,p_values,p_delete,auth.uid())
 on conflict(batch_id,id) do update set target_key=excluded.target_key,values_json=excluded.values_json,deleted=excluded.deleted,revision=treasury_business_decisions.revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() returning * into saved;
 perform public.treasury_audit('Guardó decisión de tesorería','Planificación',case when old.id is null then null else to_jsonb(old) end,to_jsonb(saved));
 return to_jsonb(saved);
end; $$;

-- Carry decisions once rows exist; trigger runs only for the new ERP entry point.
create function public.erp_carry_business(p_batch uuid,p_previous uuid) returns void language plpgsql set search_path=public,pg_temp as $$
declare candidate record; matches int; old_n jsonb; item jsonb; old_id uuid;
begin
 if p_previous is null then return; end if;
 insert into public.treasury_business_decisions(batch_id,id,kind,target_key,values_json,revision,deleted,updated_by,updated_at)
 select p_batch,id,kind,target_key,values_json,revision,deleted,updated_by,updated_at from public.treasury_business_decisions where batch_id=p_previous;
 -- Bootstrap only proven one-to-one invoice correspondences. Ambiguous rows are not merged.
 if exists(select 1 from public.daily_base_rows where batch_id=p_previous and normalized_json->>'sourceProfile' like 'BASE-ONLY-%') then
  for candidate in select * from public.daily_base_rows where batch_id=p_batch and entity_type='invoice' loop
   select count(*),min(id::text)::uuid into matches,old_id from public.daily_base_rows old where old.batch_id=p_previous and old.entity_type='invoice'
    and old.normalized_json->>'document'=candidate.normalized_json->>'document'
    and old.normalized_json->>'currency'=candidate.normalized_json->>'currency'
    and (old.normalized_json->>'amount')::numeric=(candidate.normalized_json->>'amount')::numeric
    and old.normalized_json->>'issueDate'=candidate.normalized_json->>'issueDate'
    and old.normalized_json->>'dueDate'=candidate.normalized_json->>'dueDate'
    and regexp_replace(upper(old.normalized_json->>'customer'),'[^A-Z0-9]','','g')=regexp_replace(upper(candidate.normalized_json->>'customer'),'[^A-Z0-9]','','g');
   if matches=1 and (select count(*) from public.daily_base_rows current_row where batch_id=p_batch and entity_type='invoice' and normalized_json->>'document'=candidate.normalized_json->>'document' and normalized_json->>'customerCode'=candidate.normalized_json->>'customerCode')=1 then
    select normalized_json into old_n from public.daily_base_rows where id=old_id;
    item:=jsonb_strip_nulls(jsonb_build_object('date',coalesce(old_n->>'adjustedDate',old_n->>'reportDate'),'bank',old_n->>'settlementBank','note','Planificación inicial recuperada de CAJA por coincidencia verificada.','sourceRecord',old_id));
    insert into public.treasury_business_decisions(batch_id,kind,target_key,values_json,updated_by) values(p_batch,'adjustment',candidate.source_key,item,auth.uid()) on conflict do nothing;
    -- Verified targets keep their existing forecast links without creating a second collection.
    update public.daily_forecast_links set target_id=candidate.entity_id where batch_id=p_batch and target_kind='invoice' and target_id=(select entity_id from public.daily_base_rows where id=old_id);
   end if;
  end loop;
  -- Preserve unmatched legacy dates as pending decisions, never silently discard or guess their targets.
  insert into public.treasury_business_decisions(batch_id,kind,target_key,values_json,updated_by)
  select p_batch,'adjustment','legacy:'||old.source_key,jsonb_strip_nulls(jsonb_build_object('date',coalesce(old.normalized_json->>'adjustedDate',old.normalized_json->>'reportDate'),'bank',old.normalized_json->>'settlementBank','note','Revisar correspondencia CAJA: '||coalesce(old.normalized_json->>'customer','')||' · '||coalesce(old.normalized_json->>'document',''),'sourceRecord',old.id)),auth.uid()
  from public.daily_base_rows old where old.batch_id=p_previous and old.entity_type='invoice' and coalesce(old.normalized_json->>'adjustedDate',old.normalized_json->>'reportDate') is not null
   and not exists(select 1 from public.treasury_business_decisions d where d.batch_id=p_batch and d.values_json->>'sourceRecord'=old.id::text) on conflict do nothing;
  -- CAJA tranches are plans, not ERP positions. Retain them pending explicit allocation.
  insert into public.treasury_business_decisions(batch_id,kind,target_key,values_json,updated_by)
  select p_batch,'redemption','legacy:'||old.source_key,jsonb_strip_nulls(jsonb_build_object(
   'date',coalesce(old.normalized_json->>'adjustedDate',old.normalized_json->>'reportDate',old.normalized_json->>'endDate',old.normalized_json->>'dueDate'),
   'amount',old.normalized_json->'amount','currency',old.normalized_json->>'currency','bank',old.normalized_json->>'bank','status','planned',
   'description',old.normalized_json->>'description','note','Rescate previsto en CAJA: asignar posición y cuenta receptora antes de incluirlo en el flujo.','sourceRecord',old.id)),auth.uid()
  from public.daily_base_rows old where old.batch_id=p_previous and old.entity_type='investment'
   and (old.normalized_json->>'amount')::numeric>0
   and coalesce(old.normalized_json->>'adjustedDate',old.normalized_json->>'reportDate',old.normalized_json->>'endDate',old.normalized_json->>'dueDate') is not null
   and not exists(select 1 from public.daily_forecast_links l where l.batch_id=p_previous and l.target_kind='investment' and l.target_id=old.entity_id)
   and not exists(select 1 from public.treasury_business_decisions d where d.batch_id=p_batch and d.values_json->>'sourceRecord'=old.id::text);
 end if;
end; $$;

-- Deletion review includes these decisions and invalidates stale confirmations.
alter function public.excel_deletion_plan(uuid) rename to excel_deletion_plan_before_business;
revoke all on function public.excel_deletion_plan_before_business(uuid) from public,anon,authenticated;
create function public.excel_deletion_plan(p_batch_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare plan jsonb; extra jsonb; begin
 plan:=public.excel_deletion_plan_before_business(p_batch_id);
 select coalesce(jsonb_agg(jsonb_build_array(batch_id,id,revision,deleted) order by batch_id,id),'[]') into extra from public.treasury_business_decisions where batch_id in (select value::uuid from jsonb_array_elements_text(plan->'batchIds'));
 return plan||jsonb_build_object('revision',md5((plan->>'revision')||extra::text),'dependentWork',coalesce(plan->'dependentWork','{}')||jsonb_build_object('businessDecisions',jsonb_array_length(extra)));
end; $$;
revoke all on function public.excel_deletion_plan(uuid) from public,anon;
grant execute on function public.excel_deletion_plan(uuid) to authenticated;

-- Install the carry operation inside the guarded transaction, after raw rows and MANUAL are saved.
do $$ declare definition text; begin
 select pg_get_functiondef('public.import_erp_daily(text,text,jsonb,text)'::regprocedure) into definition;
 definition:=replace(definition,'perform public.treasury_audit(''Importó datos crudos ERP''','if forward then perform public.erp_carry_business(b.id,previous); end if; perform public.treasury_audit(''Importó datos crudos ERP''');
 execute definition;
end; $$;

alter function public.get_daily_base_snapshot(uuid) rename to get_daily_base_snapshot_raw;
revoke all on function public.get_daily_base_snapshot_raw(uuid) from public,anon,authenticated;
create function public.get_daily_base_snapshot(p_batch_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare bid uuid:=coalesce(p_batch_id,public.daily_latest()); snap jsonb; entities jsonb; output jsonb:='[]'; decisions jsonb; item jsonb; n jsonb; original jsonb; rule record; adjustment record; redemption record; target jsonb; bank_name text; reserved numeric; issues jsonb:='[]'; future jsonb:='[]'; conflict text;
begin
 perform public.treasury_require(); snap:=public.get_daily_base_snapshot_raw(bid);
 if not exists(select 1 from public.daily_base_rows where batch_id=bid and normalized_json->>'sourceProfile'='ERP-RAW-v1') then return snap; end if;
 entities:=public.erp_business_entities(bid);
 select coalesce(jsonb_agg(to_jsonb(d) order by kind,target_key,id),'[]') into decisions from public.treasury_business_decisions d where batch_id=bid and not deleted;
 for item in select value from jsonb_array_elements(entities) loop
  n:=item->'normalized'; original:=n;
  for rule in select * from public.treasury_business_decisions where batch_id=bid and kind='rule' and not deleted order by (values_json->>'priority')::int,id loop
   if rule.values_json->>'ruleType'='collection' and item->>'kind'='invoice' and rule.target_key in ('*',n->>'customerCode') then
    n:=n||jsonb_build_object('reportDate',((n->>'dueDate')::date+(rule.values_json->>'days')::int)::text,'appliedRule',rule.id,'ruleRevision',rule.revision);
    if nullif(rule.values_json->>'bankLedger','') is not null then n:=n||jsonb_build_object('settlementLedger',rule.values_json->>'bankLedger'); end if;
   elsif rule.values_json->>'ruleType'='classification' and item->>'kind'='cash_flow' and n->>'recordRole'='bank_movement' and position(lower(rule.values_json->>'contains') in lower(n->>'description'))>0 then
    n:=n||jsonb_build_object('category',rule.values_json->>'category','appliedRule',rule.id,'ruleRevision',rule.revision);
   end if;
  end loop;
  select * into adjustment from public.treasury_business_decisions where batch_id=bid and kind='adjustment' and target_key=n->>'businessKey' and not deleted;
  if found then
   if nullif(adjustment.values_json->>'date','') is not null then n:=n||jsonb_build_object('adjustedDate',adjustment.values_json->>'date'); end if;
   if nullif(adjustment.values_json->>'bankLedger','') is not null then n:=n||jsonb_build_object('settlementLedger',adjustment.values_json->>'bankLedger'); end if;
   if nullif(adjustment.values_json->>'bank','') is not null then n:=n||jsonb_build_object('settlementBank',adjustment.values_json->>'bank'); end if;
   if nullif(adjustment.values_json->>'category','') is not null then n:=n||jsonb_build_object('category',adjustment.values_json->>'category'); end if;
   if nullif(adjustment.values_json->>'description','') is not null then n:=n||jsonb_build_object('description',adjustment.values_json->>'description'); end if;
   n:=n||jsonb_build_object('businessNote',adjustment.values_json->>'note','decisionId',adjustment.id,'decisionRevision',adjustment.revision);
  end if;
  if nullif(n->>'settlementLedger','') is not null then
   select e->'normalized'->>'bank' into bank_name from jsonb_array_elements(entities) e where e->'normalized'->>'recordRole'='bank_opening' and e->'normalized'->>'ledgerCode'=n->>'settlementLedger';
   if bank_name is null then issues:=issues||jsonb_build_array('Cuenta receptora fuera de cobertura para '||coalesce(n->>'document',n->>'description')); end if;
   n:=n||jsonb_build_object('settlementBank',bank_name);
  end if;
  if item->>'kind'='investment' then
   select coalesce(sum((values_json->>'amount')::numeric),0) into reserved from public.treasury_business_decisions where batch_id=bid and kind='redemption' and target_key=n->>'businessKey' and values_json->>'status'='planned' and not deleted;
   n:=n||jsonb_build_object('reservedAmount',reserved,'remainingAmount',(n->>'amount')::numeric-reserved);
  end if;
  output:=output||jsonb_build_array(item||jsonb_build_object('normalized',n||jsonb_build_object('erpOriginal',original)));
 end loop;
 for adjustment in select * from public.treasury_business_decisions where batch_id=bid and kind='adjustment' and not deleted loop
  if not exists(select 1 from jsonb_array_elements(entities) e where e->'normalized'->>'businessKey'=adjustment.target_key) then issues:=issues||jsonb_build_array('Ajuste sin registro en la cobertura actual: '||coalesce(adjustment.values_json->>'note',adjustment.id::text)); end if;
 end loop;
 for redemption in select * from public.treasury_business_decisions where batch_id=bid and kind='redemption' and not deleted and values_json->>'status'='planned' order by id loop
  select e into target from jsonb_array_elements(output) e where e->'normalized'->>'businessKey'=redemption.target_key;
  conflict:=null;
  if target is null then conflict:='La posición ya no está en la cobertura.';
  elsif (target->'normalized'->>'remainingAmount')::numeric<0 then conflict:='Los rescates exceden la posición actual. Revisa los rescates ya ejecutados.'; end if;
  select e->'normalized'->>'bank' into bank_name from jsonb_array_elements(entities) e where e->'normalized'->>'recordRole'='bank_opening' and e->'normalized'->>'ledgerCode'=redemption.values_json->>'bankLedger' and e->'normalized'->>'currency'=redemption.values_json->>'currency';
  if bank_name is null then conflict:='La cuenta receptora ya no está en la cobertura o cambió de moneda.'; end if;
  if conflict is not null then issues:=issues||jsonb_build_array('Rescate '||coalesce(redemption.values_json->>'description',redemption.id::text)||': '||conflict); end if;
  future:=future||jsonb_build_array(jsonb_build_object('id',redemption.id,'kind','projection','recordId',null,'row',null,'fileName','Planificación en plataforma','revision',redemption.revision,'edited',true,
   'normalized',jsonb_build_object('sourceOrigin','MANUAL','recordRole','planned_redemption','businessKey',redemption.target_key,'date',redemption.values_json->>'date','reportDate',redemption.values_json->>'date','amount',(redemption.values_json->>'amount')::numeric,'currency',redemption.values_json->>'currency','type','income','category','investment_redemption','status',case when conflict is null then 'proyectado' else 'borrador' end,'businessConflict',conflict,'description',coalesce(nullif(redemption.values_json->>'description',''),'Rescate programado'),'bank',bank_name,'settlementBank',bank_name,'settlementLedger',redemption.values_json->>'bankLedger','businessNote',redemption.values_json->>'note')));
 end loop;
 return snap||jsonb_build_object('rows',output,'manual',(snap->'manual')||future,'business',decisions,'businessIssues',issues,'engineVersion','erp-business-v1','coverage',jsonb_build_object('currency',(entities->0->'normalized'->>'currency'),'profile','ERP-RAW-v1'));
end; $$;

do $$ declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('erp_business_entities','treasury_save_business','erp_carry_business','get_daily_base_snapshot') loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if f.proname in ('treasury_save_business','get_daily_base_snapshot') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end; $$;
notify pgrst,'reload schema'; commit;
