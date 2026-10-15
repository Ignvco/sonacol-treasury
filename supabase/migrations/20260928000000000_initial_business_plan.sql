-- Initial business data is private to authenticated SONACOL planning operations.
-- Installing this migration does not activate commitments or change historical snapshots.
-- Source workbook SHA-256: 1d3db6e2ce6d9e701624af0e94495f8d45e890d0e25b7852008b1995bae3a3e4.
begin;

create function public.sonacol_initial_plan() returns jsonb
language sql immutable set search_path=public,pg_temp as $$
 select '[
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:15",
  "row": 15,
  "baseRow": 6039,
  "date": "2026-09-25",
  "description": "LIQUIDOS AGO2026",
  "amount": 350000000.0,
  "originalAmount": "-350000000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "payroll",
  "bankLedger": "511010014"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:17",
  "row": 17,
  "baseRow": 6041,
  "date": "2026-09-28",
  "description": "DIVIDENDOS 1-2026",
  "amount": 14184548072.0,
  "originalAmount": "-14184548072",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "dividends",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:18",
  "row": 18,
  "baseRow": 6042,
  "date": "2026-09-30",
  "description": "PAGO INTERES BONO BANCO BICE",
  "amount": 981717187.0,
  "originalAmount": "-981717187",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "credit",
  "bankLedger": "511010018"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:19",
  "row": 19,
  "baseRow": 6043,
  "date": "2026-10-01",
  "description": "PROVEEDORES/FACTOR/RENDICIONES/ADICIONALES",
  "amount": 420000000.0,
  "originalAmount": "-420000000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:21",
  "row": 21,
  "baseRow": 6045,
  "date": "2026-10-02",
  "description": "PROYECCION INGRESOS OCTBRE 2026",
  "amount": 1036819347.0,
  "originalAmount": "1036819347",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:22",
  "row": 22,
  "baseRow": 6046,
  "date": "2026-10-09",
  "description": "PROYECCION INGRESOS OCTBRE 2026",
  "amount": 1743112000.0,
  "originalAmount": "1743112000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:23",
  "row": 23,
  "baseRow": 6047,
  "date": "2026-10-15",
  "description": "PROYECCION INGRESOS OCTBRE 2026",
  "amount": 1743112000.0,
  "originalAmount": "1743112000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:24",
  "row": 24,
  "baseRow": 6048,
  "date": "2026-10-23",
  "description": "PROYECCION INGRESOS OCTBRE 2026",
  "amount": 1793568000.0,
  "originalAmount": "1793568000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:25",
  "row": 25,
  "baseRow": 6049,
  "date": "2026-10-30",
  "description": "PROYECCION INGRESOS OCTBRE 2026",
  "amount": 1793568000.0,
  "originalAmount": "1793568000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:26",
  "row": 26,
  "baseRow": 6050,
  "date": "2026-10-09",
  "description": "PROYECCION EGRESOS OCTBRE 2026",
  "amount": 761502069.38,
  "originalAmount": "-761502069.3759999",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:27",
  "row": 27,
  "baseRow": 6051,
  "date": "2026-10-15",
  "description": "PROYECCION EGRESOS OCTBRE 2026",
  "amount": 676002069.38,
  "originalAmount": "-676002069.3759999",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:28",
  "row": 28,
  "baseRow": 6052,
  "date": "2026-10-19",
  "description": "PROYECCION EGRESOS OCTBRE 2026",
  "amount": 1990000000.0,
  "originalAmount": "-1990000000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:29",
  "row": 29,
  "baseRow": 6053,
  "date": "2026-10-22",
  "description": "PROYECCION EGRESOS OCTBRE 2026",
  "amount": 659502069.38,
  "originalAmount": "-659502069.3759999",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:30",
  "row": 30,
  "baseRow": 6054,
  "date": "2026-10-26",
  "description": "PROYECCION EGRESOS OCTBRE 2026",
  "amount": 360000000.0,
  "originalAmount": "-360000000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:31",
  "row": 31,
  "baseRow": 6055,
  "date": "2026-10-29",
  "description": "PROYECCION EGRESOS OCTBRE 2026",
  "amount": 659502069.38,
  "originalAmount": "-659502069.3759999",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:33",
  "row": 33,
  "baseRow": 6057,
  "date": "2026-11-05",
  "description": "PROYECCION INGRESOS NOVIEMBRE 2026",
  "amount": 3071600.0,
  "originalAmount": "3071600",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:34",
  "row": 34,
  "baseRow": 6058,
  "date": "2026-11-06",
  "description": "PROYECCION INGRESOS NOVIEMBRE 2026",
  "amount": 1793563000.0,
  "originalAmount": "1793563000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:35",
  "row": 35,
  "baseRow": 6059,
  "date": "2026-11-13",
  "description": "PROYECCION INGRESOS NOVIEMBRE 2026",
  "amount": 1793568000.0,
  "originalAmount": "1793568000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:36",
  "row": 36,
  "baseRow": 6060,
  "date": "2026-11-16",
  "description": "PROYECCION INGRESOS NOVIEMBRE 2026",
  "amount": 1793568000.0,
  "originalAmount": "1793568000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:37",
  "row": 37,
  "baseRow": 6061,
  "date": "2026-11-20",
  "description": "PROYECCION INGRESOS NOVIEMBRE 2026",
  "amount": 1719550000.0,
  "originalAmount": "1719550000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:38",
  "row": 38,
  "baseRow": 6062,
  "date": "2026-11-27",
  "description": "PROYECCION INGRESOS NOVIEMBRE 2026",
  "amount": 1719550000.0,
  "originalAmount": "1719550000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:39",
  "row": 39,
  "baseRow": 6063,
  "date": "2026-11-05",
  "description": "PROYECCION EGRESOS NOVIEMBRE 2026",
  "amount": 1105604235.0,
  "originalAmount": "-1105604235",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:40",
  "row": 40,
  "baseRow": 6064,
  "date": "2026-11-09",
  "description": "PROYECCION EGRESOS NOVIEMBRE 2026",
  "amount": 102000000.0,
  "originalAmount": "-102000000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "social_levies",
  "bankLedger": "511010014"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:41",
  "row": 41,
  "baseRow": 6065,
  "date": "2026-11-12",
  "description": "PROYECCION EGRESOS NOVIEMBRE 2026",
  "amount": 1065604235.25,
  "originalAmount": "-1065604235.2473885",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:42",
  "row": 42,
  "baseRow": 6066,
  "date": "2026-11-19",
  "description": "PROYECCION EGRESOS NOVIEMBRE 2026",
  "amount": 2630067520.3,
  "originalAmount": "-2630067520.2994766",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:43",
  "row": 43,
  "baseRow": 6067,
  "date": "2026-11-25",
  "description": "PROYECCION EGRESOS NOVIEMBRE 2026",
  "amount": 360000000.0,
  "originalAmount": "-360000000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "payroll",
  "bankLedger": "511010014"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:44",
  "row": 44,
  "baseRow": 6068,
  "date": "2026-11-26",
  "description": "PROYECCION EGRESOS NOVIEMBRE 2026",
  "amount": 1065604235.25,
  "originalAmount": "-1065604235.2473885",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:45",
  "row": 45,
  "baseRow": 6069,
  "date": "2026-11-27",
  "description": "PROYECCION EGRESOS NOVIEMBRE 2026",
  "amount": 354380000.0,
  "originalAmount": "-354380000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "payroll",
  "bankLedger": "511010014"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:46",
  "row": 46,
  "baseRow": 6070,
  "date": "2026-11-30",
  "description": "PROYECCION EGRESOS NOVIEMBRE 2026",
  "amount": 692000000.0,
  "originalAmount": "-692000000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "credit",
  "bankLedger": "511010018"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:48",
  "row": 48,
  "baseRow": 6072,
  "date": "2026-12-03",
  "description": "PROYECCION INGRESOS DICIEMBRE 2026",
  "amount": 3071600.0,
  "originalAmount": "3071600",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:49",
  "row": 49,
  "baseRow": 6073,
  "date": "2026-12-04",
  "description": "PROYECCION INGRESOS DICIEMBRE 2026",
  "amount": 1719550000.0,
  "originalAmount": "1719550000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:50",
  "row": 50,
  "baseRow": 6074,
  "date": "2026-12-11",
  "description": "PROYECCION INGRESOS DICIEMBRE 2026",
  "amount": 1719550000.0,
  "originalAmount": "1719550000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:51",
  "row": 51,
  "baseRow": 6075,
  "date": "2026-12-15",
  "description": "PROYECCION INGRESOS DICIEMBRE 2026",
  "amount": 1719550000.0,
  "originalAmount": "1719550000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:52",
  "row": 52,
  "baseRow": 6076,
  "date": "2026-12-18",
  "description": "PROYECCION INGRESOS DICIEMBRE 2026",
  "amount": 1755726000.0,
  "originalAmount": "1755725999.9999998",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:53",
  "row": 53,
  "baseRow": 6077,
  "date": "2026-12-25",
  "description": "PROYECCION INGRESOS DICIEMBRE 2026",
  "amount": 1755726000.0,
  "originalAmount": "1755725999.9999998",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "income",
  "category": "collection",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:54",
  "row": 54,
  "baseRow": 6078,
  "date": "2026-12-03",
  "description": "PROYECCION EGRESOS DICIEMBRE 2026",
  "amount": 976006097.31,
  "originalAmount": "-976006097.30974",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:55",
  "row": 55,
  "baseRow": 6079,
  "date": "2026-12-09",
  "description": "PROYECCION EGRESOS DICIEMBRE 2026",
  "amount": 102000000.0,
  "originalAmount": "-102000000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "social_levies",
  "bankLedger": "511010014"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:56",
  "row": 56,
  "baseRow": 6080,
  "date": "2026-12-10",
  "description": "PROYECCION EGRESOS DICIEMBRE 2026",
  "amount": 936006097.31,
  "originalAmount": "-936006097.30974",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:57",
  "row": 57,
  "baseRow": 6081,
  "date": "2026-12-17",
  "description": "PROYECCION EGRESOS DICIEMBRE 2026",
  "amount": 2344862658.28,
  "originalAmount": "-2344862658.280956",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:58",
  "row": 58,
  "baseRow": 6082,
  "date": "2026-12-24",
  "description": "PROYECCION EGRESOS DICIEMBRE 2026",
  "amount": 7092274036.0,
  "originalAmount": "-7092274036",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "dividends",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:59",
  "row": 59,
  "baseRow": 6083,
  "date": "2026-12-24",
  "description": "PROYECCION EGRESOS DICIEMBRE 2026",
  "amount": 968006097.0,
  "originalAmount": "-968006097",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:60",
  "row": 60,
  "baseRow": 6084,
  "date": "2026-12-24",
  "description": "PROYECCION EGRESOS DICIEMBRE 2026",
  "amount": 360000000.0,
  "originalAmount": "-360000000",
  "amountBasis": "literal",
  "currency": "CLP",
  "type": "expense",
  "category": "payroll",
  "bankLedger": "511010014"
 },
 {
  "key": "sonacol:plan:2026-09-24:PROYEC:61",
  "row": 61,
  "baseRow": 6085,
  "date": "2026-12-29",
  "description": "PROYECCION EGRESOS DICIEMBRE 2026",
  "amount": 936386097.0,
  "originalAmount": "-936386097",
  "amountBasis": "932086097+4300000",
  "currency": "CLP",
  "type": "expense",
  "category": "supplier",
  "bankLedger": "511010016"
 }
]'::jsonb;
$$;

create function public.treasury_initial_plan_preview(p_batch uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare b public.daily_base_batches%rowtype; item jsonb; bank_name text; matches jsonb; known boolean; state text; output jsonb:='[]'; rev text;
begin
 perform public.treasury_require();
 select * into b from public.daily_base_batches where id=p_batch;
 if not found or not exists(select 1 from public.daily_base_rows where batch_id=p_batch and normalized_json->>'sourceProfile'='ERP-RAW-v1' and normalized_json->>'company'='SONACOL') then
  raise exception 'Selecciona una carga ERP de SONACOL.';
 end if;
 for item in select value from jsonb_array_elements(public.sonacol_initial_plan()) loop
  select normalized_json->>'bank' into bank_name from public.daily_base_rows
   where batch_id=p_batch and normalized_json->>'recordRole'='bank_opening'
   and normalized_json->>'ledgerCode'=item->>'bankLedger' and normalized_json->>'currency'='CLP' limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'description',m.normalized_json->>'description','date',coalesce(m.normalized_json->>'adjustedDate',m.normalized_json->>'reportDate',m.normalized_json->>'date'),'amount',m.normalized_json->'amount','deleted',m.deleted) order by m.id),'[]'),
   coalesce(bool_or(m.normalized_json->>'initialPlanKey'=item->>'key' or
    (r.source_row=(item->>'baseRow')::int and rb.file_name like '%24-09-2026%' and r.normalized_json->>'legacySheet'='PROYEC') or
    (m.normalized_json->>'removedSourceRow'=item->>'baseRow' and m.normalized_json->>'removedSourceFile' like '%24-09-2026%' and m.normalized_json->>'legacySheet'='PROYEC')),false)
   into matches,known
   from public.daily_manual m left join public.daily_base_rows r on r.id=m.source_record_id left join public.daily_base_batches rb on rb.id=r.batch_id
   where m.batch_id=p_batch and (
    m.normalized_json->>'initialPlanKey'=item->>'key' or
    (r.source_row=(item->>'baseRow')::int and rb.file_name like '%24-09-2026%' and r.normalized_json->>'legacySheet'='PROYEC') or
    (m.normalized_json->>'removedSourceRow'=item->>'baseRow' and m.normalized_json->>'removedSourceFile' like '%24-09-2026%' and m.normalized_json->>'legacySheet'='PROYEC') or
    (m.normalized_json->>'currency'='CLP' and m.normalized_json->>'type'=item->>'type'
     and round((m.normalized_json->>'amount')::numeric,2)=(item->>'amount')::numeric
     and coalesce(m.normalized_json->>'adjustedDate',m.normalized_json->>'reportDate',m.normalized_json->>'date')=item->>'date'
     and (lower(trim(m.normalized_json->>'description'))=lower(trim(item->>'description'))
      or coalesce(m.normalized_json->>'settlementLedger',m.normalized_json->>'ledgerCode')=item->>'bankLedger'
      or m.normalized_json->>'bank'=bank_name)));
  state:=case when known then 'existing' when jsonb_array_length(matches)>0 then 'review' when bank_name is null then 'uncovered' else 'missing' end;
  output:=output||jsonb_build_array(item||jsonb_build_object('state',state,'matches',matches,'bank',bank_name,'overdue',(item->>'date')::date<=b.cutoff));
 end loop;
 select md5(output::text||p_batch::text||coalesce(public.daily_latest()::text,'')||coalesce(string_agg(m.id::text||':'||m.revision||':'||m.deleted||':'||m.normalized_json::text,',' order by m.id),'')) into rev from public.daily_manual m where m.batch_id=p_batch;
 return jsonb_build_object('revision',rev,'cutoff',b.cutoff,'canApply',p_batch=public.daily_latest(),'referenceDate','2026-09-24','rows',output);
end; $$;

create function public.treasury_apply_initial_plan(p_batch uuid,p_expected text,p_keys jsonb,p_bindings jsonb default '[]') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare preview jsonb; item jsonb; binding jsonb; n jsonb; manual_id uuid; inserted int:=0; bound int:=0;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 preview:=public.treasury_initial_plan_preview(p_batch);
 if not (preview->>'canApply')::boolean then raise exception 'Solo se incorpora planificación en la última carga ERP.'; end if;
 if p_expected is distinct from preview->>'revision' then raise exception 'Cambió la planificación o la carga ERP. Revisa nuevamente el plan.'; end if;
 if jsonb_typeof(p_keys) is distinct from 'array' or jsonb_typeof(p_bindings) is distinct from 'array' or jsonb_array_length(p_keys)+jsonb_array_length(p_bindings) not between 1 and 43 then raise exception 'Selecciona entre 1 y 43 compromisos.'; end if;
 if exists(select 1 from jsonb_array_elements_text(p_keys) k group by k having count(*)>1) then raise exception 'Selección repetida.'; end if;
 for binding in select value from jsonb_array_elements(p_bindings) loop
  select value into item from jsonb_array_elements(preview->'rows') where value->>'key'=binding->>'key' and value->>'state'='review';
  if item is null or not exists(select 1 from jsonb_array_elements(item->'matches') m where m->>'id'=binding->>'manualId')
   or exists(select 1 from jsonb_array_elements_text(p_keys) k where k=binding->>'key') then raise exception 'Correspondencia inválida. Revisa el compromiso existente.'; end if;
  update public.daily_manual set normalized_json=normalized_json||jsonb_build_object('initialPlanKey',item->>'key','initialPlanReference','2026-09-24','initialPlanSource',item),
   edited=true,revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid()
   where batch_id=p_batch and id=(binding->>'manualId')::uuid and not(normalized_json?'initialPlanKey');
  if not found then raise exception 'El registro ya tiene una correspondencia. Revisa nuevamente.'; end if;
  bound:=bound+1;
 end loop;
 for manual_id in select m.id from public.daily_manual m join public.daily_base_rows r on r.id=m.source_record_id join public.daily_base_batches rb on rb.id=r.batch_id
  where m.batch_id=p_batch and rb.file_name like '%24-09-2026%' and r.normalized_json->>'legacySheet'='PROYEC' and not(m.normalized_json?'initialPlanKey') loop
  -- Stamp only an exact source identity; values, status, deletions and execution remain intact.
  select value into item from jsonb_array_elements(preview->'rows') i where i->>'state'='existing' and exists(select 1 from jsonb_array_elements(i->'matches') v where v->>'id'=manual_id::text) limit 1;
  if item is not null then update public.daily_manual set normalized_json=normalized_json||jsonb_build_object('initialPlanKey',item->>'key','initialPlanReference','2026-09-24'),edited=true,revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where batch_id=p_batch and id=manual_id; end if;
 end loop;
 for n in select value from jsonb_array_elements(p_keys) loop
  select value into item from jsonb_array_elements(preview->'rows') where value->>'key'=(n#>>'{}');
  if item is null or item->>'state'<>'missing' then raise exception 'Un compromiso ya existe, tiene coincidencias o no tiene cuenta cubierta. Revisa nuevamente.'; end if;
  manual_id:=md5(item->>'key')::uuid;
  n:=jsonb_build_object('sourceOrigin','MANUAL','entityType','projection','company','SONACOL','date',item->>'date','reportDate',item->>'date','amount',item->'amount',
   'type',item->>'type','currency','CLP','description',item->>'description','category',item->>'category','status','proyectado','bank',item->>'bank',
   'ledgerCode',item->>'bankLedger','initialPlanKey',item->>'key','initialPlanReference','2026-09-24',
   'initialPlanSource',jsonb_build_object('file','CAJA SONACOL v4 24-09-2026.xlsm','sheet','PROYEC','row',item->'row','baseRow',item->'baseRow','originalAmount',item->'originalAmount','amountBasis',item->>'amountBasis'));
  insert into public.daily_manual(batch_id,id,source_key,normalized_json,edited,updated_by)
   values(p_batch,manual_id,item->>'key',n,true,auth.uid());
  inserted:=inserted+1;
 end loop;
 perform public.treasury_audit('Incorporó planificación inicial','Planificación',null,jsonb_build_object('batch',p_batch,'reference','SONACOL-20260924','inserted',inserted,'bound',bound,'keys',p_keys,'bindings',p_bindings));
 return jsonb_build_object('inserted',inserted,'bound',bound);
end; $$;

-- An execution allocates a real ERP posting; it never creates a second cash movement.
-- Evidence lives with MANUAL, so the existing forward carry preserves it across periods.
create function public.treasury_record_manual_execution(p_batch uuid,p_manual uuid,p_revision int,p_record uuid,p_amount numeric,p_remove_key text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare m public.daily_manual%rowtype; r public.daily_base_rows%rowtype; entries jsonb; entry jsonb; allocated numeric; executed numeric; b public.daily_base_batches%rowtype;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 select * into b from public.daily_base_batches where id=p_batch;
 select * into m from public.daily_manual where batch_id=p_batch and id=p_manual and not deleted for update;
 if not found or m.revision is distinct from p_revision then raise exception 'El compromiso cambió. Vuelve a abrir su ejecución.'; end if;
 entries:=coalesce(m.normalized_json->'executions','[]');
 if p_remove_key is not null then
  if not exists(select 1 from jsonb_array_elements(entries) e where e->>'sourceKey'=p_remove_key) then raise exception 'La ejecución seleccionada ya no existe.'; end if;
  select coalesce(jsonb_agg(e),'[]') into entries from jsonb_array_elements(entries) e where e->>'sourceKey'<>p_remove_key;
 else
  if m.normalized_json->>'status' in ('borrador','cancelado') then raise exception 'Activa el compromiso antes de registrar su ejecución.'; end if;
  select * into r from public.daily_base_rows where batch_id=p_batch and id=p_record and entity_type='cash_flow' and normalized_json->>'recordRole'='bank_movement';
  if not found or r.normalized_json->>'currency' is distinct from m.normalized_json->>'currency' or r.normalized_json->>'type' is distinct from m.normalized_json->>'type'
   or (r.normalized_json->>'date')::date>b.cutoff then raise exception 'Selecciona un movimiento bancario del mismo tipo y moneda dentro del corte.'; end if;
  if (nullif(m.normalized_json->>'ledgerCode','') is not null and r.normalized_json->>'ledgerCode' is distinct from m.normalized_json->>'ledgerCode')
   or (nullif(m.normalized_json->>'ledgerCode','') is null and (coalesce(m.normalized_json->>'bank','Sin banco')='Sin banco' or r.normalized_json->>'bank' is distinct from m.normalized_json->>'bank')) then raise exception 'Asigna al compromiso la misma cuenta bancaria que su ejecución.'; end if;
  if exists(select 1 from jsonb_array_elements(entries) e where e->>'sourceKey'=r.source_key) then raise exception 'Este movimiento ya está vinculado al compromiso. Retira la asignación para modificarla.'; end if;
  if p_amount is null or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'Indica un importe positivo con hasta dos decimales.'; end if;
  select coalesce(sum((e->>'amount')::numeric),0) into executed from jsonb_array_elements(entries) e;
  select coalesce(sum((e->>'amount')::numeric),0) into allocated from public.daily_manual x cross join lateral jsonb_array_elements(coalesce(x.normalized_json->'executions','[]')) e
   where x.batch_id=p_batch and not x.deleted and e->>'sourceKey'=r.source_key;
  if executed+p_amount>round((m.normalized_json->>'amount')::numeric,2) or allocated+p_amount>round((r.normalized_json->>'amount')::numeric,2) then raise exception 'La asignación supera el pendiente del compromiso o el importe bancario disponible.'; end if;
  entry:=jsonb_build_object('sourceKey',r.source_key,'recordId',r.id,'date',r.normalized_json->>'date','amount',p_amount,'bankAmount',r.normalized_json->'amount','currency',r.normalized_json->>'currency','ledger',r.normalized_json->>'ledgerCode','description',r.normalized_json->>'description','sourceFile',b.file_name,'sourceRow',r.source_row,'sourceSheet',r.source_sheet,'registeredAt',clock_timestamp(),'registeredBy',auth.uid());
  entries:=entries||jsonb_build_array(entry);
 end if;
 select coalesce(sum((e->>'amount')::numeric),0) into executed from jsonb_array_elements(entries) e;
 update public.daily_manual set normalized_json=normalized_json||jsonb_build_object('executions',entries,'executedAmount',executed),
  edited=true,revision=revision+1,updated_at=clock_timestamp(),updated_by=auth.uid() where batch_id=p_batch and id=p_manual returning * into m;
 perform public.treasury_audit(case when p_remove_key is null then 'Vinculó ejecución bancaria' else 'Retiró ejecución bancaria' end,'Proyecciones',null,jsonb_build_object('batch',p_batch,'manual',p_manual,'entry',entry,'removedKey',p_remove_key,'executedAmount',executed));
 return to_jsonb(m);
end; $$;

-- Protect execution evidence from edits via the existing form/RPC.
alter function public.save_daily_manual(uuid,uuid,int,jsonb,boolean) rename to save_daily_manual_before_execution;
revoke all on function public.save_daily_manual_before_execution(uuid,uuid,int,jsonb,boolean) from public,anon,authenticated;
create function public.save_daily_manual(p_batch_id uuid,p_id uuid,p_revision int,p_values jsonb,p_delete boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare n jsonb; bid uuid:=coalesce(p_batch_id,public.daily_latest()); result jsonb; ledger text; same_bank boolean;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 select normalized_json into n from public.daily_manual where batch_id=bid and id=p_id;
 select normalized_json->>'ledgerCode' into ledger from public.daily_base_rows where batch_id=bid and normalized_json->>'recordRole'='bank_opening' and normalized_json->>'bank'=p_values->>'bank' and normalized_json->>'currency'=p_values->>'currency' limit 1;
 same_bank:=(p_values->>'bank' is not distinct from n->>'bank') or (ledger is not null and ledger=n->>'ledgerCode');
 if coalesce((n->>'executedAmount')::numeric,0)>0 and (p_delete or p_values->>'type' is distinct from n->>'type'
  or p_values->>'currency' is distinct from n->>'currency' or not coalesce(same_bank,false)
  or coalesce((p_values->>'amount')::numeric,0)<(n->>'executedAmount')::numeric) then
  raise exception 'El compromiso tiene ejecución registrada. Conserva tipo, moneda, banco e importe suficiente, o retira antes sus asignaciones.';
 end if;
 result:=public.save_daily_manual_before_execution(bid,p_id,p_revision,p_values,p_delete);
 if not p_delete and exists(select 1 from public.daily_base_rows where batch_id=bid and normalized_json->>'sourceProfile'='ERP-RAW-v1') then
  select normalized_json->>'ledgerCode' into ledger from public.daily_base_rows where batch_id=bid and normalized_json->>'recordRole'='bank_opening' and normalized_json->>'bank'=p_values->>'bank' and normalized_json->>'currency'=p_values->>'currency' limit 1;
  update public.daily_manual set normalized_json=normalized_json||jsonb_build_object('ledgerCode',ledger) where batch_id=bid and id=(result->>'id')::uuid returning to_jsonb(daily_manual) into result;
 end if;
 return result;
end; $$;

-- Missing payment planning is a coverage issue, not a certified zero-expense forecast.
alter function public.get_daily_base_snapshot(uuid) rename to get_daily_base_snapshot_before_plan;
revoke all on function public.get_daily_base_snapshot_before_plan(uuid) from public,anon,authenticated;
create function public.get_daily_base_snapshot(p_batch_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare snap jsonb; issues jsonb; item jsonb; n jsonb; e jsonb; latest_posting jsonb; coverage_start date; manual_rows jsonb:='[]'; bank_name text;
begin
 perform public.treasury_require(); snap:=public.get_daily_base_snapshot_before_plan(p_batch_id);
 if snap->'coverage'->>'profile' is distinct from 'ERP-RAW-v1' then return snap; end if;
 issues:=coalesce(snap->'businessIssues','[]');
 if not exists(select 1 from jsonb_array_elements(snap->'manual') x where x->'normalized'->>'type'='expense') then
  issues:=issues||jsonb_build_array('No hay compromisos de egreso incorporados en esta versión. Revisa el plan inicial en Planificación; los abonos históricos no generan pagos futuros.');
 end if;
 if (snap->'batch'->>'cutoff')::date>='2026-12-29'::date and exists(select 1 from jsonb_array_elements(snap->'manual') x where x->'normalized'?'initialPlanKey') then
  issues:=issues||jsonb_build_array('El plan inicial de referencia llega al 29/12/2026. Revisa los compromisos y sus recurrencias para los siguientes períodos; actualizar ERP no extiende esos supuestos automáticamente.');
 end if;
 for item in select value from jsonb_array_elements(snap->'manual') loop
  n:=item->'normalized';
  if nullif(n->>'ledgerCode','') is not null then
   select r.normalized_json->>'bank' into bank_name from public.daily_base_rows r where r.batch_id=(snap->'batch'->>'id')::uuid and r.normalized_json->>'recordRole'='bank_opening' and r.normalized_json->>'ledgerCode'=n->>'ledgerCode' and r.normalized_json->>'currency'=n->>'currency' limit 1;
   if bank_name is not null then n:=n||jsonb_build_object('bank',bank_name,'settlementBank',bank_name);
   elsif n?'initialPlanKey' then issues:=issues||jsonb_build_array('Cuenta del compromiso fuera de cobertura: '||coalesce(n->>'description','')||'. Se conserva el importe planificado.'); end if;
  end if;
  for e in select value from jsonb_array_elements(coalesce(n->'executions','[]')) loop
   select r.normalized_json into latest_posting from public.daily_base_rows r where r.batch_id=(snap->'batch'->>'id')::uuid and r.source_key=e->>'sourceKey';
   select (normalized_json->>'periodStart')::date into coverage_start from public.daily_base_rows where batch_id=(snap->'batch'->>'id')::uuid and normalized_json->>'recordRole'='bank_opening' and normalized_json->>'ledgerCode'=e->>'ledger' limit 1;
   if latest_posting is null and coverage_start is not null and (e->>'date')::date>=coverage_start then
    issues:=issues||jsonb_build_array('Revisar ejecución de '||coalesce(n->>'description','compromiso')||': el movimiento vinculado no aparece en el período ERP actualizado. Se conserva su ejecución registrada hasta revisarla.');
   end if;
  end loop;
  manual_rows:=manual_rows||jsonb_build_array(item||jsonb_build_object('normalized',n));
 end loop;
 return snap||jsonb_build_object('manual',manual_rows,'businessIssues',issues,'engineVersion','erp-business-plan-v2');
end; $$;

revoke all on function public.sonacol_initial_plan() from public,anon,authenticated;
revoke all on function public.treasury_initial_plan_preview(uuid),public.treasury_apply_initial_plan(uuid,text,jsonb,jsonb),public.treasury_record_manual_execution(uuid,uuid,int,uuid,numeric,text),public.save_daily_manual(uuid,uuid,int,jsonb,boolean),public.get_daily_base_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.treasury_initial_plan_preview(uuid),public.treasury_apply_initial_plan(uuid,text,jsonb,jsonb),public.treasury_record_manual_execution(uuid,uuid,int,uuid,numeric,text),public.save_daily_manual(uuid,uuid,int,jsonb,boolean),public.get_daily_base_snapshot(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
