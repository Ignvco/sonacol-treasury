-- ERP is the only recurring file input. Business rules are owned by the platform.
-- These versioned defaults reconstruct the verified SONACOL collection/classification logic.
begin;

do $$ declare definition text; anchor text:='''credit'',''social_levies'')'; begin
 select pg_get_functiondef('public.treasury_save_business_v1(uuid,uuid,int,text,text,jsonb,boolean)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'No se encontró la validación de categorías.'; end if;
 definition:=replace(definition,anchor,'''credit'',''social_levies'',''investment_placement'',''bank_charges'',''direct_debit'',''unclassified'')');
 execute definition;
end; $$;

create function public.erp_seed_operating_rules(p_batch uuid) returns int
language plpgsql set search_path=public,pg_temp as $$
declare rule record; count_rules int:=0;
begin
 -- Existing configuration (including retired rules) is authoritative. Never reset it.
 if not exists(select 1 from public.daily_base_rows where batch_id=p_batch and normalized_json->>'sourceProfile'='ERP-RAW-v1' and normalized_json->>'company'='SONACOL') then return 0; end if;
 if not exists(select 1 from public.treasury_business_decisions where batch_id=p_batch and kind='rule' and values_json->>'ruleType'='collection') then
 insert into public.treasury_business_decisions(batch_id,id,kind,target_key,values_json,updated_by)
 values(p_batch,md5('SONACOL-OPERATING-v1:collection')::uuid,'rule','*',
  jsonb_build_object('ruleType','collection','days',5,'priority',0,'baseline','SONACOL-OPERATING-v1','note','Cobranza: vencimiento contractual + 5 días naturales. Los ajustes explícitos prevalecen.'),auth.uid());
 count_rules:=1;
 end if;
 -- Last matching description wins, following the verified business order.
 if not exists(select 1 from public.treasury_business_decisions where batch_id=p_batch and kind='rule' and values_json->>'ruleType'='classification') then
 for rule in select * from (values
  (20,'ABASTIBLE','collection','Recaudación clientes'),
  (21,'ENEX','collection','Recaudación clientes'),
  (22,'ENAP','collection','Recaudación clientes'),
  (23,'ESMAX','collection','Recaudación clientes'),
  (24,'GASCO','collection','Recaudación clientes'),
  (25,'TRADING','collection','Recaudación clientes'),
  (26,'COPEC','collection','Recaudación clientes'),
  (27,'RSCTE','investment_redemption','Rescate de inversiones'),
  (28,'ABONO','bank_credit','Abono bancario'),
  (29,'SUBSIDIO','bank_credit','Abono bancario'),
  (30,'BCO.ITAU2','bank_credit','Abono bancario'),
  (31,'COLOCACIONES','investment_placement','Colocaciones'),
  (32,'PAGO','bank_charges','Cargos bancarios'),
  (33,'CARGO','bank_charges','Cargos bancarios'),
  (34,'PAGO PAC','direct_debit','Pagos PAC')
 ) as r(priority,pattern,category,label) loop
  insert into public.treasury_business_decisions(batch_id,id,kind,target_key,values_json,updated_by)
  values(p_batch,md5('SONACOL-OPERATING-v1:classification:'||rule.priority)::uuid,'rule','*',
   jsonb_build_object('ruleType','classification','contains',rule.pattern,'category',rule.category,'priority',rule.priority,'baseline','SONACOL-OPERATING-v1','note',rule.label||' · última coincidencia por prioridad.'),auth.uid());
  count_rules:=count_rules+1;
 end loop;
 end if;
 if count_rules>0 then perform public.treasury_audit('Inicializó reglas propias de tesorería','Planificación',null,jsonb_build_object('batch',p_batch,'profile','SONACOL-OPERATING-v1','rules',count_rules)); end if;
 return count_rules;
end; $$;

-- Install on a newly accepted current ERP snapshot, after carrying the user's own work.
-- No reads of CAJA, legacy source rows, forecasts or external workbooks are involved.
do $$ declare definition text; anchor text:='if forward then perform public.erp_carry_business(b.id,previous); end if;'; begin
 select pg_get_functiondef('public.import_erp_daily(text,text,jsonb,text)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'No se encontró el arrastre de decisiones ERP.'; end if;
 definition:=replace(definition,anchor,'if forward then perform public.erp_carry_business(b.id,previous); perform public.erp_seed_operating_rules(b.id); end if;');
 execute definition;
end; $$;

-- Existing installations can initialize the same native rules without reimporting a file.
-- This is an explicit write, never a read-time mutation of historical calculations.
create function public.treasury_initialize_operating_rules(p_batch uuid) returns int
language plpgsql security definer set search_path=public,pg_temp as $$
declare installed int;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 if p_batch is distinct from public.daily_latest() then raise exception 'Activa las reglas en la última carga ERP. Los cortes históricos se conservan.'; end if;
 installed:=public.erp_seed_operating_rules(p_batch);
 if installed=0 then raise exception 'Ya existe una configuración de reglas, o la carga no corresponde al perfil ERP SONACOL. Utiliza Configurar cobranzas y el editor de reglas.'; end if;
 return installed;
end; $$;

-- Unmatched bank descriptions remain explicitly unclassified, preserving amounts/signs.
do $$ declare definition text; anchor text:='n:=item->''normalized''; original:=n;'; begin
 select pg_get_functiondef('public.get_daily_base_snapshot(uuid)'::regprocedure) into definition;
 if position(anchor in definition)=0 then raise exception 'No se encontró la composición de datos ERP.'; end if;
 definition:=replace(definition,anchor,anchor||'
  if n->>''recordRole''=''bank_movement'' and exists(select 1 from public.treasury_business_decisions where batch_id=bid and kind=''rule'' and values_json->>''baseline''=''SONACOL-OPERATING-v1'') then
   n:=n||jsonb_build_object(''category'',''unclassified'');
  end if;');
 execute definition;
end; $$;

revoke all on function public.erp_seed_operating_rules(uuid) from public,anon,authenticated;
revoke all on function public.treasury_initialize_operating_rules(uuid) from public,anon;
grant execute on function public.treasury_initialize_operating_rules(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
