# SONACOL TREASURY · FASE 1 · PATCH 02

**Objetivo:** proteger las migraciones y conservar la continuidad operativa, sin ejecutar una sola instrucción de escritura contra Supabase.

**Base auditada en GitHub:** `feat/erp-native-operations` @ `53725ab59a22a3f42a6d57b9e2a897e214c1de5e`, 26-10-2026. Ya incluye el PATCH 01 y los cambios de inversión/protección de trabajo del usuario. Este patch añade exclusivamente archivos nuevos.

## Diagnóstico real (consulta de solo lectura, 26-10-2026)

- `supabase_migrations.schema_migrations` contiene **20 migraciones** registradas; la última es `20260921000000_contabilidad_solo_lectura`.
- El repositorio incluye **35 archivos `.sql` de migración** con versión reconocida, hasta `20261025034359_protect_treasury_work.sql`: **15 no figuran en el historial** remoto.
- Aun así, el catálogo remoto contiene `erp_bank_postings`, `erp_monthly_openings`, `erp_import_runs`, `treasury_business_decisions`, funciones `erp_prepare`, `erp_incremental_plan`, `treasury_refresh_review`, y funciones/triggers añadidos por la migración de protección del 25 de octubre.
- Los tres registros ERP tienen RLS habilitado y `erp_monthly_openings.opening` es PostgreSQL `numeric`.
- Se comprobaron **16 puntos de presencia** de tablas, funciones, columnas y triggers relevantes: todos presentes. **Esto no certifica equivalencia completa de definiciones o ejecución histórica de todos los archivos.** Dos migraciones antiguas ejecutan modificaciones dinámicas del cuerpo de funciones, cuyo estado final no demuestra por sí solo cada paso intermedio.

**Diagnóstico:** desacople de historial y esquema. Es peligroso asumir tanto “faltan todas las migraciones” como “todas están completamente aplicadas”.

## Instalación y pruebas

Desde la raíz del repositorio, después de `git apply --check ...` y `git apply ...`:

```bash
node --test tests/migration-preflight.test.mjs
pnpm check
pnpm build
```

Estas pruebas son sintéticas y no se conectan a la base de datos. No editan `package.json`, `src/`, migraciones previas, código UI ni acciones GitHub.

## Captura de esquema remoto (solo lectura)

La consulta `scripts/treasury-schema-snapshot.sql` **solo usa SELECT de catálogos** y obtiene: historial/versiones, tablas y RLS, tipos de columnas, firmas y huellas de funciones, triggers. No extrae movimientos, clientes, cartolas ni datos personales.

**Opción A: SQL Editor de Supabase.** Pega el contenido del archivo `.sql`, ejecuta y guarda el JSON de la columna `snapshot` en un archivo local temporal (`/tmp/sonacol-schema-snapshot.json`). La consulta requiere permisos para ver `supabase_migrations` y catálogos.

**Opción B: psql desde el Mac**, si ya tienes una conexión de administración configurada; no incluyas una contraseña en comandos compartidos, repositorio, capturas o logs:

```bash
psql "$SONACOL_DB_READONLY_URL" -X -q -t -A -f scripts/treasury-schema-snapshot.sql > /tmp/sonacol-schema-snapshot.json
```

`SONACOL_DB_READONLY_URL` debe pertenecer al proyecto correcto y tener únicamente los permisos de lectura necesarios. Si no hay acceso, usa el SQL Editor. No se necesita `service_role` en el navegador.

Ejecuta el auditor (sin red ni escrituras):

```bash
node scripts/treasury-migration-preflight.mjs --snapshot /tmp/sonacol-schema-snapshot.json
```

**Código de salida 2** significa bloqueo detectado: es el resultado **esperado** mientras falten versiones del historial. Para obtener un informe JSON:

```bash
node scripts/treasury-migration-preflight.mjs --snapshot /tmp/sonacol-schema-snapshot.json --json > /tmp/sonacol-migration-preflight.json
```

El auditor distingue versiones ausentes, objetos que sí existen, objetos faltantes, RLS y tipo monetario. La presencia de un objeto es un **indicio**, no prueba de que cada sentencia de la migración original se ejecutó.

## Puerta de seguridad antes de regularizar

1. Crear y **verificar restauración** de un respaldo consistente; verificar también activos de esquema, funciones, grants, RLS, triggers y datos. No cambiar producción antes de respaldar.
2. Comparar SQL de las 15 migraciones ausentes con definiciones SQL y dependencias efectivamente instaladas. Priorizar las que contienen `ALTER FUNCTION ... RENAME`, triggers y lógica de conservación financiera, ya que repetirlas puede fallar o crear duplicados.
3. Investigar cómo se desplegaron estos objetos sin registrar sus versiones y por qué el histórico de Supabase quedó incompleto. Consultar historial de despliegues y migraciones.
4. Reproducir el estado anterior y el nuevo en un entorno PostgreSQL **aislado**, usando una copia sanitizada o copia de prueba: asegurar que importaciones, decisiones manuales, snapshots y saldos no cambien.
5. Recién después decidir si conviene regularizar el registro de versiones con el procedimiento oficial de Supabase, o preparar una migración de reconciliación **específica y no destructiva**. Requiere aprobación explícita y evidencia de que cada versión está aplicada. Nunca registrar migraciones por simple semejanza de nombres.
6. Aplicar migraciones nuevas solamente después de superar la puerta de seguridad, con plan de reversión, pruebas y validación de saldo **por cuenta, moneda y corte**.

**No ejecutar ahora:** `supabase db push`, `supabase migration repair`, `supabase db reset`, scripts de migraciones históricos ni `apply_migration` sobre el proyecto remoto. El PATCH 02 por sí mismo no autoriza ninguna escritura ni despliegue.

## Observaciones de alcance

- La instalación de `financial-contract-core.ts` ya está en `feat/erp-native-operations`; no aplicar de nuevo el PATCH 01.
- Los cambios del usuario en inversiones, importaciones, screenshots y protección de tesorería permanecen intactos.
- La inspección remota es puntual, no asegura que el estado de la base siga idéntico cuando se ejecute el preflight posteriormente.
- El PATCH 03 conectará el contrato financiero con ERP **una vez definida la reconciliación verificable**, sin alterar la historia ni suponer que una omisión en un Excel equivale a una anulación.

Documentación de referencia: https://supabase.com/docs/guides/deployment/database-migrations
