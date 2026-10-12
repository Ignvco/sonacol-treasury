-- SALDOS BANCOS supplies opening accounts; BANCOS supplies period Cargo/Abono.
-- Historical snapshots remain untouched. Existing ERP exports retain compatibility.
begin;
do $$
declare definition text;
 origin_anchor text := 'group by r->''normalized''->>''sourceOrigin'' having count(distinct r->>''sheet'')>1';
 coverage_anchor text := 'n->''coverageSheets'' is distinct from ''["BANCOS","CLIENTES","COLOCACIONES"]''::jsonb';
 row_anchor text := '(o->>''row'')::int<(r->>''row'')::int';
begin
 select pg_get_functiondef('public.erp_validate(jsonb)'::regprocedure) into definition;
 if position(origin_anchor in definition)=0 or position(coverage_anchor in definition)=0 or position(row_anchor in definition)=0 or position('return cutoff;' in definition)=0 then
  raise exception 'Aplica primero las migraciones ERP hasta 20260926050000000.';
 end if;
 definition:=replace(definition,origin_anchor,
  'group by case when r->''normalized''->>''recordRole'' in (''bank_opening'',''bank_movement'') then r->''normalized''->>''recordRole'' else r->''normalized''->>''sourceOrigin'' end having count(distinct r->>''sheet'')>1');
 definition:=replace(definition,coverage_anchor,
  '(n->''coverageSheets'' is null or n->''coverageSheets'' not in (''["BANCOS","CLIENTES","COLOCACIONES"]''::jsonb,''["BANCOS","CLIENTES","COLOCACIONES","SALDOS BANCOS"]''::jsonb))');
 -- Row order only has meaning inside the same legacy ledger. Independent
 -- opening sheets are matched by account and declared period, not row number.
 definition:=replace(definition,row_anchor,
  '(case when coalesce(o->''normalized''->>''bankBalanceSource'','''')=''SALDOS BANCOS'' then o->>''sheet''<>r->>''sheet'' else o->>''sheet''=r->>''sheet'' and (o->>''row'')::int<(r->>''row'')::int end)');
 definition:=replace(definition,'return cutoff;', $checks$
 -- Never trust client totals or a category to determine the direction of cash.
 for item in select value from jsonb_array_elements(p_records) where value->'normalized'->>'sourceOrigin'='BANCO' loop
  n:=item->'normalized';
  if nullif(trim(n->>'bank'),'') is null then raise exception 'Cuenta % sin banco identificado.',n->>'ledgerCode'; end if;
  if n->>'recordRole'='bank_movement' and ((n->>'debe')::numeric>0 and (n->>'haber')::numeric>0) then raise exception 'Cuenta %: Cargo y Abono no pueden tener importe simultáneamente.',n->>'ledgerCode'; end if;
  if n->'bankReportedClosing' is not null and n->'bankReportedClosing'<>'null'::jsonb then
   if n->>'recordRole'<>'bank_opening' or jsonb_typeof(n->'bankReportedClosing')<>'number' or coalesce(n->>'bankReportedClosing','') !~ '^-?[0-9]+([.][0-9]+)?$' then raise exception 'Saldo final informado inválido para %.',n->>'ledgerCode'; end if;
   if abs((n->>'bankReportedClosing')::numeric)>90071992547409 then raise exception 'Saldo final fuera del rango monetario seguro.'; end if;
  end if;
  if n->>'recordRole'='bank_opening' and ((n->'coverageSheets' @> '["SALDOS BANCOS"]'::jsonb) is distinct from (coalesce(n->>'bankBalanceSource','')='SALDOS BANCOS')) then
   raise exception 'La fuente del saldo inicial no coincide con la cobertura declarada.';
  end if;
 end loop;
 for entry in
  select bank_rows.n->>'ledgerCode' ledger,bank_rows.n->>'currency' currency,min(bank_rows.n->>'periodStart') first_period,max(bank_rows.n->>'periodStart') last_period,
   count(distinct bank_rows.n->>'bank') bank_names,count(*) filter(where bank_rows.n->>'recordRole'='bank_opening') openings,
   coalesce(sum((bank_rows.n->>'signedAmount')::numeric) filter(where bank_rows.n->>'recordRole'='bank_opening'),0) opening,
   coalesce(sum((bank_rows.n->>'debe')::numeric) filter(where bank_rows.n->>'recordRole'='bank_movement'),0) charges,
   coalesce(sum((bank_rows.n->>'haber')::numeric) filter(where bank_rows.n->>'recordRole'='bank_movement'),0) credits,
   max((bank_rows.n->>'bankReportedClosing')::numeric) filter(where bank_rows.n->>'recordRole'='bank_opening') reported
  from (select r->'normalized' n from jsonb_array_elements(p_records) r where r->'normalized'->>'sourceOrigin'='BANCO') bank_rows
  group by bank_rows.n->>'company',bank_rows.n->>'ledgerCode',bank_rows.n->>'currency'
 loop
  if entry.openings<>1 then raise exception 'Cuenta % (%): se requiere un único saldo inicial; se encontraron %.',entry.ledger,entry.currency,entry.openings; end if;
  if entry.first_period<>entry.last_period or entry.bank_names<>1 then raise exception 'Cuenta %: períodos o bancos inconsistentes.',entry.ledger; end if;
  if greatest(abs(entry.opening),abs(entry.charges),abs(entry.credits),abs(entry.opening+entry.charges-entry.credits))>90071992547409 then raise exception 'Acumulado bancario fuera del rango seguro para %.',entry.ledger; end if;
  if entry.reported is not null and round(entry.opening+entry.charges-entry.credits-entry.reported,2)<>0 then
   raise exception 'Cuenta % (%) período % a %: inicial %, cargos %, abonos %, calculado %, informado %, diferencia %.',entry.ledger,entry.currency,entry.first_period,cutoff,entry.opening,entry.charges,entry.credits,entry.opening+entry.charges-entry.credits,entry.reported,entry.opening+entry.charges-entry.credits-entry.reported;
  end if;
 end loop;
 return cutoff;
 $checks$);
 execute definition;
end; $$;
notify pgrst,'reload schema';
commit;
