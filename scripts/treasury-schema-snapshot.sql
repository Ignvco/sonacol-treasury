-- SONACOL TREASURY PATCH 02 — READ ONLY.
-- Safe in Supabase SQL Editor or psql. NO changes to schema, migration ledger or data.
-- Only catalog metadata; no bank records, customer rows, passwords or function source.
select jsonb_build_object(
  'schema', 'sonacol-schema-snapshot-v1',
  'capturedAt', statement_timestamp(),
  'history', (
    select coalesce(jsonb_agg(jsonb_build_object('version', m.version, 'name', m.name) order by m.version), '[]'::jsonb)
    from supabase_migrations.schema_migrations m
  ),
  'tables', (
    select coalesce(jsonb_agg(jsonb_build_object('name', c.relname, 'rls', c.relrowsecurity) order by c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  ),
  'columns', (
    select coalesce(jsonb_agg(jsonb_build_object('table', c.relname, 'name', a.attname,
        'type', format_type(a.atttypid, a.atttypmod)) order by c.relname, a.attnum), '[]'::jsonb)
    from pg_attribute a join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and a.attnum > 0 and not a.attisdropped
  ),
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object('name', p.proname,
        'args', pg_get_function_identity_arguments(p.oid),
        'definer', p.prosecdef, 'fingerprint', md5(pg_get_functiondef(p.oid)))
        order by p.proname, p.oid), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object('table', c.relname, 'name', t.tgname)
        order by c.relname, t.tgname), '[]'::jsonb)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal
  )
) as snapshot;
