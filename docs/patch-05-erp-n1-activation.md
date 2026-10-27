# SONACOL TREASURY — PATCH 05 / activación N+1 por nueva importación ERP

**Base revisada:** `feat/erp-native-operations` @ `2eec2053ef79d27b8be83250e7635bdf72faff1a` (27 oct 2026). Esta entrega es un **script SQL de instalación pendiente** y pruebas PGlite. `git apply` por sí solo **no activa** N+1 en Supabase.

## Contexto, trazabilidad y alcance

El usuario confirmó que ejecutó manualmente en SQL Editor las migraciones posteriores a septiembre. Esto explica que existan las tablas ERP y triggers del 25/oct sin versiones registradas en `supabase_migrations.schema_migrations`. El PATCH 05 **no reejecuta scripts históricos**, no repara ni falsifica sus versiones y no realiza `db push` ni `db reset`.

El motor TypeScript `erp-cash-position-v4` fue incorporado en PATCH 04. Este script habilita únicamente **nuevos lotes ERP RAW**:

1. Amplía el CHECK de `daily_base_batches.projection_engine_version` de `legacy-next-day|v3` a `legacy-next-day|v3|v4`, sin modificar el valor de ningún registro.
2. Mantiene `default='erp-cash-position-v3'` para rutas no ERP. Añade un trigger `BEFORE INSERT` que asigna v4 únicamente cuando el RPC de importación ERP marcó el contexto transaccional.
3. Envuelve `import_erp_daily` sin cambiar sus validaciones, identidades, deduplicación, avisos, auditoría ni atomicidad existentes. Si reutiliza un batch viejo, no hay INSERT y permanece v3.
4. **Envuelve sin sustituir las implementaciones actuales** de `get_daily_base_snapshot` y `treasury_validate_scenario`: la primera comunica v4 solo para los lotes nuevos; los lotes existentes conservan la versión que devolvían antes (incluso si estaba ausente). La segunda exige contexto v4 exacto y conserva las validaciones previas. Ninguna previsión congelada recibe UPDATE.
5. Se conservan `treasury_require`, RLS, privilegios de la RPC pública y el candado transaccional de importación.

**Limitación:** SQL modifica funciones del esquema, aunque sea de forma no destructiva. Requiere ventana y rollback gestionados, no debe ejecutarse aún en producción.

## Prueba local aislada

```sh
node --import tsx --test tests/erp-n1-activation.test.ts
pnpm check
pnpm build
```

El test usa PostgreSQL PGlite en memoria, carga las migraciones que ya tiene el repositorio y **ejecuta el SQL solo dentro de esa base aislada**. Comprueba motor/contrato histórico sin reinterpretarlo, retry/idempotencia, nueva carga v4, corte N+1, rechazo de versiones erróneas, forecast congelado y BASE-only con default v3.

## Puertas obligatorias antes de usar SQL sobre cualquier entorno externo

- Guardar respaldo consistente, demostrar restauración, comparar el esquema instalado contra el estado final esperado de las migraciones manuales (no basta constatar que las tablas existen).
- Confirmar que `daily_base_batches_projection_engine_version_check` permite solo `legacy-next-day` y `erp-cash-position-v3`. Verificar además los cuerpos reales de `get_daily_base_snapshot` y `treasury_validate_scenario`: sus capas pueden diferir de las definiciones anteriores del repo por migraciones ejecutadas manualmente. Se preservan mediante wrappers, no se reescriben. El script aborta ante una instalación no reconocida en su preflight.
- Ejecutar el mismo SQL y todas las pruebas PGlite en un proyecto **clonado de staging**, inspeccionando importaciones y snapshots **por empresa + cuenta + moneda + corte** (sin mezclar monedas ni inventar cobertura).
- Validar con ERP real 14-10 y CAJA SONACOL los oráculos de caja (nunca usar como fuente el saldo erróneo de 832 millones), conciliaciones y correcciones auditadas. Evitar cargar datos de clientes en repositorios/logs.
- Verificar el plan de reversión y la autorización expresa antes de ejecutar el SQL en producción. No convertir manualmente las quince versiones anteriores en “aplicadas” sin evidencia verificable.

### Generación formal de una migración

La fuente del SQL está en `scripts/treasury-activate-n1.sql`. Si luego se incorpora como migración formal, generar el nombre con **Supabase CLI** (`supabase migration new ...` consultando `supabase migration new --help`), copiar ese contenido en el archivo generado y registrar su ejecución mediante el procedimiento formal, una vez reconciliado el historial. No duplicar su ejecución desde SQL Editor y un futuro `db push`.

## Verificar en staging después de ejecutar, solo con consultas de lectura

```sql
select projection_engine_version, count(*) from public.daily_base_batches group by 1 order by 1;
select tgname from pg_trigger where tgrelid='public.daily_base_batches'::regclass and not tgisinternal;
select pg_get_constraintdef(oid) from pg_constraint where conrelid='public.daily_base_batches'::regclass and conname='daily_base_batches_projection_engine_version_check';
```

No se ejecutaron GitHub Actions, deploys ni SQL remoto como parte de este patch.
