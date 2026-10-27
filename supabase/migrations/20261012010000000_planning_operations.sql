-- Patch 2: planned placements and evidence-backed partial redemptions.
-- No ERP facts, historical forecasts or existing decisions are rewritten.
begin;
alter table public.treasury_business_decisions
 add column execution_json jsonb not null default '[]'::jsonb check(jsonb_typeof(execution_json)='array'),
 add column plan_references jsonb not null default '[]'::jsonb check(jsonb_typeof(plan_references)='array');

create function public.treasury_execution_total(p_entries jsonb) returns numeric
language sql immutable set search_path=public,pg_temp as $$
 select coalesce(sum((e->>'amount')::numeric),0) from jsonb_array_elements(coalesce(p_entries,'[]')) e;
$$;

alter function public.erp_carry_business(uuid,uuid) rename to erp_carry_business_before_operations;
revoke all on function public.erp_carry_business_before_operations(uuid,uuid) from public,anon,authenticated;
create function public.erp_carry_business(p_batch uuid,p_previous uuid) returns void
language plpgsql set search_path=public,pg_temp as $$
begin
 perform public.erp_carry_business_before_operations(p_batch,p_previous);
 update public.treasury_business_decisions d set execution_json=o.execution_json,plan_references=o.plan_references
 from public.treasury_business_decisions o where d.batch_id=p_batch and o.batch_id=p_previous and d.id=o.id;
end; $$;

create or replace function public.treasury_save_business_v1(p_batch uuid,p_id uuid,p_revision int,p_kind text,p_target text,p_values jsonb,p_delete boolean default false) returns jsonb
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
 if nullif(p_values->>'category','') is not null and p_values->>'category' not in ('collection','investment_redemption','other_income','supplier','payroll','tax','bank_credit','dividends','credit','social_levies','investment_placement','bank_charges','direct_debit','unclassified') then raise exception 'Categoría inválida.'; end if;
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
   select coalesce(sum(greatest(0,(values_json->>'amount')::numeric-public.treasury_execution_total(execution_json))),0) into reserved from public.treasury_business_decisions where batch_id=p_batch and kind='redemption' and target_key=p_target and not deleted and values_json->>'status'='planned' and id is distinct from p_id;
   if p_values->>'status'='planned' and reserved+greatest(0,(p_values->>'amount')::numeric-public.treasury_execution_total(old.execution_json))>(target->'normalized'->>'amount')::numeric then raise exception 'Los rescates programados exceden el capital disponible de la posición.'; end if;
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

create or replace function public.get_daily_base_snapshot_before_plan(p_batch_id uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
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
   select e->'normalized'->>'bank' into bank_name from jsonb_array_elements(entities) e where e->'normalized'->>'recordRole'='bank_opening' and e->'normalized'->>'ledgerCode'=n->>'settlementLedger' and e->'normalized'->>'currency'=n->>'currency';
   if bank_name is null then issues:=issues||jsonb_build_array('Cuenta receptora fuera de cobertura para '||coalesce(n->>'document',n->>'description')); end if;
   n:=n||jsonb_build_object('settlementBank',bank_name);
  end if;
  if item->>'kind'='investment' then
   select coalesce(sum(greatest(0,(values_json->>'amount')::numeric-public.treasury_execution_total(execution_json))),0) into reserved from public.treasury_business_decisions where batch_id=bid and kind='redemption' and target_key=n->>'businessKey' and values_json->>'status'='planned' and not deleted;
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
   'normalized',jsonb_build_object('sourceOrigin','MANUAL','recordRole','planned_redemption','businessKey',redemption.target_key,'date',redemption.values_json->>'date','reportDate',redemption.values_json->>'date','amount',(redemption.values_json->>'amount')::numeric,'currency',redemption.values_json->>'currency','type','income','category','investment_redemption','status',case when conflict is null then 'proyectado' else 'borrador' end,'businessConflict',conflict,'description',coalesce(nullif(redemption.values_json->>'description',''),'Rescate programado'),'bank',bank_name,'settlementBank',bank_name,'settlementLedger',redemption.values_json->>'bankLedger','businessNote',redemption.values_json->>'note','ledgerCode',redemption.values_json->>'bankLedger','executions',redemption.execution_json,'executedAmount',public.treasury_execution_total(redemption.execution_json),'planReferences',redemption.plan_references)));
 end loop;
 return snap||jsonb_build_object('rows',output,'manual',(snap->'manual')||future,'business',decisions,'businessIssues',issues,'engineVersion','erp-business-v1','coverage',jsonb_build_object('currency',(entities->0->'normalized'->>'currency'),'profile','ERP-RAW-v1'));
end; $$;

-- Business execution evidence is writable only through the allocation RPC.
alter function public.treasury_save_business(uuid,uuid,int,text,text,jsonb,boolean) rename to treasury_save_business_before_operations;
revoke all on function public.treasury_save_business_before_operations(uuid,uuid,int,text,text,jsonb,boolean) from public,anon,authenticated;
create function public.treasury_save_business(p_batch uuid,p_id uuid,p_revision int,p_kind text,p_target text,p_values jsonb,p_delete boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.treasury_business_decisions%rowtype; executed numeric; target jsonb;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 select * into d from public.treasury_business_decisions where batch_id=p_batch and id=p_id;
 executed:=public.treasury_execution_total(d.execution_json);
 if p_kind='redemption' then
  if executed>0 and (p_delete or d.target_key is distinct from p_target
   or p_values->>'currency' is distinct from d.values_json->>'currency'
   or p_values->>'bankLedger' is distinct from d.values_json->>'bankLedger'
   or coalesce((p_values->>'amount')::numeric,0)<executed) then
   raise exception 'El rescate tiene ejecución bancaria. Conserva posición, cuenta, moneda e importe suficiente, o retira sus asignaciones.';
  end if;
  if not p_delete and p_values->>'status'='executed' and executed<coalesce((p_values->>'amount')::numeric,0)
   and not (d.id is not null and d.values_json->>'status'='executed' and d.values_json=p_values and d.target_key=p_target) then
   raise exception 'Registra la ejecución contra movimientos ERP. Un cambio de estado no demuestra el cobro del rescate.';
  end if;
 end if;
 if not p_delete and p_kind='adjustment' and nullif(p_values->>'bankLedger','') is not null then
  select e into target from jsonb_array_elements(public.erp_business_entities(p_batch)) e where e->'normalized'->>'businessKey'=p_target;
  if target->>'kind'='invoice' and not exists(select 1 from public.daily_base_rows r where r.batch_id=p_batch
   and r.normalized_json->>'recordRole'='bank_opening' and r.normalized_json->>'ledgerCode'=p_values->>'bankLedger'
   and r.normalized_json->>'currency'=target->'normalized'->>'currency') then raise exception 'La factura y su cuenta receptora deben tener la misma moneda.'; end if;
 end if;
 return public.treasury_save_business_before_operations(p_batch,p_id,p_revision,p_kind,p_target,p_values,p_delete);
end; $$;

-- Account identity is ledger + currency, never an arbitrary first bank-name match.
create or replace function public.save_daily_manual(p_batch_id uuid,p_id uuid,p_revision int,p_values jsonb,p_delete boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare n jsonb; bid uuid:=coalesce(p_batch_id,public.daily_latest()); result jsonb; ledger text; bank_name text; matches int; is_erp boolean; executed numeric;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 select normalized_json into n from public.daily_manual where batch_id=bid and id=p_id;
 executed:=coalesce((n->>'executedAmount')::numeric,0);
 is_erp:=exists(select 1 from public.daily_base_rows where batch_id=bid and normalized_json->>'sourceProfile'='ERP-RAW-v1');
 if not p_delete and is_erp then
  ledger:=nullif(p_values->>'bankLedger','');
  if ledger is null and p_values->>'bank' is not distinct from n->>'bank' and p_values->>'currency' is not distinct from n->>'currency' then ledger:=nullif(n->>'ledgerCode',''); end if;
  select count(*),min(normalized_json->>'ledgerCode'),min(normalized_json->>'bank') into matches,ledger,bank_name
  from public.daily_base_rows where batch_id=bid and normalized_json->>'recordRole'='bank_opening'
   and normalized_json->>'currency'=p_values->>'currency'
   and (case when ledger is not null then normalized_json->>'ledgerCode'=ledger else normalized_json->>'bank'=p_values->>'bank' end);
  if matches>1 then raise exception 'Hay varias cuentas para ese banco y moneda. Selecciona una cuenta bancaria.'; end if;
  if matches=0 and nullif(p_values->>'bankLedger','') is not null then
   if p_id is not null and p_values->>'bankLedger'=n->>'ledgerCode' and p_values->>'currency'=n->>'currency' then
    ledger:=n->>'ledgerCode'; bank_name:=n->>'bank'; -- Preserve an existing uncovered assignment; never invent an opening.
   else raise exception 'La cuenta seleccionada está fuera de cobertura o tiene otra moneda.'; end if;
  end if;
  if bank_name is not null then p_values:=p_values||jsonb_build_object('bank',bank_name); end if;
  if p_values->>'category'='investment_placement' and (p_values->>'type' is distinct from 'expense' or ledger is null) then raise exception 'Una colocación requiere un egreso y una cuenta de origen cubierta en su moneda.'; end if;
 end if;
 if executed>0 and (p_delete or p_values->>'type' is distinct from n->>'type' or p_values->>'currency' is distinct from n->>'currency'
  or (is_erp and ledger is distinct from n->>'ledgerCode') or (not is_erp and p_values->>'bank' is distinct from n->>'bank')
  or coalesce((p_values->>'amount')::numeric,0)<executed) then
  raise exception 'El compromiso tiene ejecución bancaria. Conserva tipo, moneda, cuenta e importe suficiente, o retira sus asignaciones.';
 end if;
 result:=public.save_daily_manual_before_execution(bid,p_id,p_revision,p_values,p_delete);
 if not p_delete and is_erp then
  update public.daily_manual set normalized_json=(normalized_json-'recordRole')||jsonb_build_object('ledgerCode',ledger,'settlementLedger',ledger)
   ||case when p_values->>'category'='investment_placement' then jsonb_build_object('recordRole','planned_placement') else '{}'::jsonb end
   where batch_id=bid and id=(result->>'id')::uuid returning to_jsonb(daily_manual) into result;
 end if;
 return result;
end; $$;

-- All commitments compete for the same available posting, including redemptions.
create function public.treasury_bank_allocated(p_batch uuid,p_key text) returns numeric
language sql stable set search_path=public,pg_temp as $$
 select coalesce(sum((e->>'amount')::numeric),0) from (
  select x.normalized_json->'executions' entries from public.daily_manual x where x.batch_id=p_batch and not x.deleted
  union all select x.execution_json from public.treasury_business_decisions x where x.batch_id=p_batch and not x.deleted
 ) x cross join lateral jsonb_array_elements(coalesce(x.entries,'[]')) e where e->>'sourceKey'=p_key;
$$;
alter function public.treasury_record_manual_execution(uuid,uuid,int,uuid,numeric,text) rename to treasury_record_manual_execution_before_operations;
revoke all on function public.treasury_record_manual_execution_before_operations(uuid,uuid,int,uuid,numeric,text) from public,anon,authenticated;
create function public.treasury_record_manual_execution(p_batch uuid,p_manual uuid,p_revision int,p_record uuid,p_amount numeric,p_remove_key text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.daily_base_rows%rowtype;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 if p_remove_key is null then
  select * into r from public.daily_base_rows where batch_id=p_batch and id=p_record;
  if public.treasury_bank_allocated(p_batch,r.source_key)+p_amount>round((r.normalized_json->>'amount')::numeric,2) then raise exception 'El movimiento ya está asignado a otros compromisos o rescates.'; end if;
 end if;
 return public.treasury_record_manual_execution_before_operations(p_batch,p_manual,p_revision,p_record,p_amount,p_remove_key);
end; $$;

create function public.treasury_record_redemption_execution(p_batch uuid,p_manual uuid,p_revision int,p_record uuid,p_amount numeric,p_remove_key text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.treasury_business_decisions%rowtype; r public.daily_base_rows%rowtype; b public.daily_base_batches%rowtype; entries jsonb; entry jsonb; executed numeric;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 select * into b from public.daily_base_batches where id=p_batch;
 select * into d from public.treasury_business_decisions where batch_id=p_batch and id=p_manual and kind='redemption' and not deleted for update;
 if not found or d.revision is distinct from p_revision then raise exception 'El rescate cambió. Vuelve a abrir su ejecución.'; end if;
 entries:=d.execution_json;
 if p_remove_key is not null then
  if not exists(select 1 from jsonb_array_elements(entries) e where e->>'sourceKey'=p_remove_key) then raise exception 'La asignación ya no existe.'; end if;
  select coalesce(jsonb_agg(e),'[]') into entries from jsonb_array_elements(entries) e where e->>'sourceKey'<>p_remove_key;
 else
  if d.values_json->>'status' is distinct from 'planned' then raise exception 'Activa el rescate antes de vincular su ejecución.'; end if;
  select * into r from public.daily_base_rows where batch_id=p_batch and id=p_record and entity_type='cash_flow' and normalized_json->>'recordRole'='bank_movement';
  if not found or r.normalized_json->>'type' is distinct from 'income' or r.normalized_json->>'currency' is distinct from d.values_json->>'currency'
   or r.normalized_json->>'ledgerCode' is distinct from d.values_json->>'bankLedger' or (r.normalized_json->>'date')::date>b.cutoff then
   raise exception 'Selecciona un cargo ERP en la misma cuenta y moneda, dentro del corte.';
  end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Indica un importe positivo con hasta dos decimales.'; end if;
  if exists(select 1 from jsonb_array_elements(entries) e where e->>'sourceKey'=r.source_key) then raise exception 'El movimiento ya está vinculado. Retira la asignación para modificarla.'; end if;
  if public.treasury_execution_total(entries)+p_amount>(d.values_json->>'amount')::numeric
   or public.treasury_bank_allocated(p_batch,r.source_key)+p_amount>round((r.normalized_json->>'amount')::numeric,2) then raise exception 'La asignación supera el pendiente o el importe bancario disponible.'; end if;
  entry:=jsonb_build_object('sourceKey',r.source_key,'recordId',r.id,'date',r.normalized_json->>'date','amount',p_amount,'bankAmount',r.normalized_json->'amount','currency',r.normalized_json->>'currency','ledger',r.normalized_json->>'ledgerCode','description',r.normalized_json->>'description','sourceFile',b.file_name,'sourceSheet',r.source_sheet,'sourceRow',r.source_row,'registeredAt',clock_timestamp(),'registeredBy',auth.uid());
  entries:=entries||jsonb_build_array(entry);
 end if;
 executed:=public.treasury_execution_total(entries);
 update public.treasury_business_decisions set execution_json=entries,
  values_json=case when values_json->>'status'='executed' and executed<(values_json->>'amount')::numeric then values_json||'{"status":"planned"}'::jsonb else values_json end,
  revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where batch_id=p_batch and id=p_manual;
 perform public.treasury_audit('Asignó ejecución de rescate','Planificación',to_jsonb(d),jsonb_build_object('batch',p_batch,'id',p_manual,'executions',entries));
 return jsonb_build_object('executedAmount',executed);
end; $$;

-- Preserve the snapshot policy, expose executed/cancelled rescues for reversal,
-- and surface legacy states without claiming they have bank evidence.
alter function public.get_daily_base_snapshot(uuid) rename to get_daily_base_snapshot_before_operations;
revoke all on function public.get_daily_base_snapshot_before_operations(uuid) from public,anon,authenticated;
create function public.get_daily_base_snapshot(p_batch_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare snap jsonb; d jsonb; n jsonb; item jsonb; rows_out jsonb:='[]'; issues jsonb; bank_name text; bid uuid;
begin
 perform public.treasury_require(); snap:=public.get_daily_base_snapshot_before_operations(p_batch_id);
 if snap->'coverage'->>'profile' is distinct from 'ERP-RAW-v1' then return snap; end if;
 bid:=(snap->'batch'->>'id')::uuid; issues:=coalesce(snap->'businessIssues','[]');
 for d in select value from jsonb_array_elements(coalesce(snap->'business','[]')) where value->>'kind'='redemption' loop
  n:=d->'values_json';
  if n->>'status'='executed' and public.treasury_execution_total(d->'execution_json')=0 then
   issues:=issues||jsonb_build_array('Rescate con estado ejecutado anterior, sin asignación bancaria: '||coalesce(n->>'description',d->>'id')||'. Revisa la evidencia.');
  end if;
  if n->>'status'<>'planned' then
   select normalized_json->>'bank' into bank_name from public.daily_base_rows where batch_id=bid and normalized_json->>'recordRole'='bank_opening' and normalized_json->>'ledgerCode'=n->>'bankLedger' and normalized_json->>'currency'=n->>'currency';
   snap:=jsonb_set(snap,'{manual}',(snap->'manual')||jsonb_build_array(jsonb_build_object('id',d->>'id','kind','projection','recordId',null,'row',null,'fileName','Planificación en plataforma','revision',d->'revision','edited',true,
    'normalized',jsonb_build_object('sourceOrigin','MANUAL','recordRole','planned_redemption','businessKey',d->>'target_key','date',n->>'date','reportDate',n->>'date','amount',n->'amount','currency',n->>'currency','type','income','category','investment_redemption','status','cancelado','description',coalesce(n->>'description','Rescate programado'),'bank',bank_name,'ledgerCode',n->>'bankLedger','settlementLedger',n->>'bankLedger','executions',d->'execution_json','executedAmount',public.treasury_execution_total(d->'execution_json')))));
  end if;
 end loop;
 for item in select value from jsonb_array_elements(snap->'manual') loop
  n:=item->'normalized';
  if jsonb_array_length(coalesce(n->'planReferences','[]'))>0 and (snap->'batch'->>'cutoff')::date>='2026-12-29' then
   issues:=issues||jsonb_build_array('La referencia de planificación de octubre termina en diciembre de 2026. Mantén los compromisos y recurrencias de períodos siguientes dentro de la plataforma.');
  end if;
  if jsonb_array_length(coalesce(n->'planReferences','[]'))>0 and not exists(select 1 from public.daily_base_rows r where r.batch_id=bid and r.normalized_json->>'recordRole'='bank_opening' and r.normalized_json->>'ledgerCode'=n->>'ledgerCode' and r.normalized_json->>'currency'=n->>'currency') then
   issues:=issues||jsonb_build_array('Cuenta planificada fuera de cobertura: '||coalesce(n->>'description','compromiso')||'. No se sustituye por otra cuenta.');
  end if;
  rows_out:=rows_out||jsonb_build_array(item);
 end loop;
 select coalesce(jsonb_agg(distinct value order by value),'[]') into issues from jsonb_array_elements(issues);
 return snap||jsonb_build_object('manual',rows_out,'businessIssues',issues);
end; $$;

revoke all on function public.treasury_execution_total(jsonb),public.erp_carry_business(uuid,uuid),public.treasury_bank_allocated(uuid,text) from public,anon,authenticated;
revoke all on function public.treasury_save_business(uuid,uuid,int,text,text,jsonb,boolean),public.save_daily_manual(uuid,uuid,int,jsonb,boolean),public.treasury_record_manual_execution(uuid,uuid,int,uuid,numeric,text),public.treasury_record_redemption_execution(uuid,uuid,int,uuid,numeric,text),public.get_daily_base_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.treasury_save_business(uuid,uuid,int,text,text,jsonb,boolean),public.save_daily_manual(uuid,uuid,int,jsonb,boolean),public.treasury_record_manual_execution(uuid,uuid,int,uuid,numeric,text),public.treasury_record_redemption_execution(uuid,uuid,int,uuid,numeric,text),public.get_daily_base_snapshot(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
