-- ============================================================
-- SONACOL TREASURY — Respaldo de configuración (2026-09-13)
-- Contiene los únicos datos que existen hoy en la base:
--  - sync_sources (registro de integraciones ERP / Excel / Bancos)
--  - fx_rates (tasas de conversión CLP / USD / UF / UTM)
-- Se ejecuta en el SQL Editor del proyecto nuevo o con la CLI.
-- Las cuentas de usuario (profiles) no se copian: están ligadas
-- a la autenticación; basta volver a registrarse en el proyecto nuevo.
-- ============================================================

-- Integraciones
insert into public.sync_sources (source, name, status, enabled, records_synced, errors, last_sync_at)
values
  ('erp',   'ERP Corporativo',        'disconnected', false, 0, 0, null),
  ('excel', 'Excel histórico',        'connected',    true,  0, 0, null),
  ('banks', 'Integración bancaria',   'disconnected', false, 0, 0, null)
on conflict (source) do nothing;

-- Tasas de conversión (base CLP)
insert into public.fx_rates (currency, rate_to_clp)
values
  ('CLP', 1),
  ('USD', 950),
  ('UF',  38200),
  ('UTM', 105000)
on conflict (currency) do nothing;
