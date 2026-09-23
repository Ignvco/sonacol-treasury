-- Decisión de negocio (23/09/2026): Contabilidad es un rol de SOLO LECTURA.
-- La aplicación y el README ya lo describen así, pero la base conservaba un
-- permiso heredado que permitía a Contabilidad modificar la tabla de conciliación
-- antigua (`reconciliations`), que la plataforma ya no usa: la conciliación
-- vigente vive en `treasury_matches` y exige rol de escritura.
-- Este cambio alinea la base con lo que la app realmente hace.
-- No elimina tablas ni datos: solo retira permisos de escritura heredados.
begin;
drop policy if exists reconciliations_update on public.reconciliations;
create policy reconciliations_update on public.reconciliations for update to authenticated
  using (public.current_role() in ('administrador','tesoreria'))
  with check (public.current_role() in ('administrador','tesoreria'));

-- Misma regla que el resto de las tablas financieras: escritura solo por RPC
-- auditados, no por API directa.
revoke insert, update, delete on public.reconciliations from authenticated, anon;
grant select on public.reconciliations to authenticated;
notify pgrst, 'reload schema';
commit;
