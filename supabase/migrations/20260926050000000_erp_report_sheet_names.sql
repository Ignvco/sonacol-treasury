-- The ERP report type is validated independently of its original Excel tab name.
-- Keep physical sheet/row evidence and every existing financial/authentication check.
begin;

do $$
declare
 definition text;
 name_check text := 'upper(trim(item->>''sheet'')) is distinct from expected_sheet';
 loop_anchor text := 'for item in select value from jsonb_array_elements(p_records) loop';
begin
 select pg_get_functiondef('public.erp_validate(jsonb)'::regprocedure) into definition;
 if position(name_check in definition)=0 or position(loop_anchor in definition)=0 then
  raise exception 'No se encontró el validador ERP esperado. Aplica primero las migraciones ERP anteriores.';
 end if;
 definition:=replace(definition,name_check,
  'jsonb_typeof(item->''sheet'') is distinct from ''string'' or nullif(trim(item->>''sheet''),'''') is null or length(item->>''sheet'')>31 or jsonb_typeof(n->''sourceSheet'') is distinct from ''string''');
 definition:=replace(definition,loop_anchor,
  'if exists(select 1 from jsonb_array_elements(p_records) r group by r->>''sheet'' having count(distinct r->''normalized''->>''sourceOrigin'')>1)
   or exists(select 1 from jsonb_array_elements(p_records) r group by r->''normalized''->>''sourceOrigin'' having count(distinct r->>''sheet'')>1) then
    raise exception ''ERP requiere un único reporte por hoja y una única hoja por tipo de reporte.'';
   end if;
   '||loop_anchor);
 execute definition;
end; $$;

notify pgrst,'reload schema';
commit;
