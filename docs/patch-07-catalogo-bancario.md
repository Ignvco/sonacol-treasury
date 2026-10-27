# SONACOL TREASURY — FASE 1 · PATCH 07 · Catálogo bancario persistente

**Rama de referencia:** `feat/erp-native-operations` @ `ce3d391806a3cb9cb46c70a3d62e12e4b9a64f24` (27-10-2026). No editar producción al aplicar el `.patch`.

## Propósito

El ERP identifica cuenta contable, nombre de banco y moneda, pero **no necesariamente el número de cuenta bancaria**. El PATCH 06 introdujo el contrato de identidad, sin persistencia. Este patch instala los artefactos para crear un catálogo bancario *verificado por administrador* con evidencia, control de concurrencia y lectura con número enmascarado.

- SQL separado **`scripts/treasury-bank-account-catalog.sql`**, intencionalmente fuera de `supabase/migrations` mientras existan versiones ejecutadas manualmente que no figuran en el historial de Supabase.
- `treasury_bank_account_catalog`: empresa + cuenta contable + moneda (identidad), banco y número físico **como texto**. Rechaza duplicidades con otro mayor en la misma empresa/banco/moneda. No inventa saldos ni modifica ERP.
- `treasury_bank_account_catalog_events`: evidencia de creación/reverificación, identificador del actor, revisión y **solo cuatro últimos dígitos** del número, sin versión completa del dato secreto.
- Ambas tablas: RLS habilitado, **sin políticas para clientes** y permisos revocados. No se exponen números completos a consultas autenticadas.
- RPC `treasury_bank_catalog()`: requiere acceso aprobado, devuelve solo `maskedNumber`, cuenta contable, empresa, banco, moneda, fecha y revisión. Nunca el número completo.
- RPC `treasury_save_bank_binding(...)`: requiere rol `administrador`, acceso aprobado y MFA AAL2 mediante `treasury_require(true)`; exige referencia documental y la versión previa para evitar sobrescrituras. El único número completo viaja al servidor en la operación de alta/reverificación y nunca se devuelve.
- La pantalla **Saldos bancarios** incorpora botón de vinculación únicamente cuando el catálogo está instalado y el usuario es administrador con segundo factor. Las pantallas muestran números enmascarados, nunca confunden el código de mayor con el número bancario.
- Si SQL aún no se instaló, la pantalla sigue funcionando con el control ERP previo y explica que el catálogo no está activo. Si falla por otro motivo, muestra error explícito.
- Una discrepancia de banco o una cuenta sin vincular no reubica movimientos, no altera la apertura + cargos − abonos, ni autoriza conciliar automáticamente.

## Instalación local del patch

```sh
git branch --show-current
git status --short
git apply --check ~/Downloads/SONACOL_FASE1_PATCH_07_CATALOGO_BANCARIO.patch
git apply ~/Downloads/SONACOL_FASE1_PATCH_07_CATALOGO_BANCARIO.patch
node --test tests/bank-catalog-security.test.mjs
node --import tsx --test tests/bank-catalog-public.test.ts
node --import tsx --test tests/bank-account-catalog-sql.test.ts
pnpm check
pnpm build
```

El test SQL ejecuta PostgreSQL **PGlite aislado**, no toca Supabase remoto, y verifica RLS, autorizaciones, restricciones únicas, revisión y conservación de saldos. Si faltan dependencias, instala las versiones del lockfile antes de correrlo en el Mac.

## Antes de instalar el SQL en Supabase

1. Verificar respaldo consistente y **restauración ensayada**. Revisar la discrepancia de 15 versiones de migraciones ejecutadas en SQL Editor. El catálogo es **SQL nuevo e independiente**, pero su aplicación real requiere aprobación.
2. Ejecutar el SQL primero en PostgreSQL aislado usando `tests/bank-account-catalog-sql.test.ts` y revisar resultados. Corroborar que `treasury_require`, `current_role`, `profiles` y `treasury_audit` coincidan con los del proyecto remoto.
3. Confirmar que tablas y RPC nuevos no existen. El script es transaccional y rechaza una segunda ejecución; **no** usa `CREATE OR REPLACE`, `DROP` ni borra trabajo anterior.
4. Tras aprobación explícita, aplicar solo **ese archivo SQL nuevo** desde la consola SQL con control de cambio, no `supabase db push` ni migraciones antiguas. Verificar grants, RLS, perfil de administrador, MFA y lectura enmascarada.
5. Capturar una evidencia de ejecución sin compartir números bancarios completos, tokens, cartolas ni datos de personas en screenshots o logs.

**No se ha ejecutado SQL de escritura en producción con este patch.** Aplicar y commitear el `.patch` solo coloca archivos de aplicación y una propuesta SQL dentro del repositorio.

## Alcance pendiente

Este catálogo no convierte por sí mismo las conciliaciones anteriores a identidad física: los registros de cartolas históricos siguen usando claves heredadas `[nombre_banco,cuenta_contable]` y no deben migrarse implícitamente. La adopción de una identidad física en conciliación requiere la siguiente etapa, con control de duplicados, reversa y respaldo.

Tampoco activa automáticamente el motor `erp-cash-position-v4` del PATCH 05, cuyo SQL está pendiente de despliegue controlado.
