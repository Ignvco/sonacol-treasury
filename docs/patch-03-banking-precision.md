# SONACOL Treasury — FASE 1 · PATCH 03

**Base exacta:** `feat/erp-native-operations` @ `c9a8df70114588cc4908724cbbcaa31aac3f5783`.

## Aclaración del responsable del proyecto

Las migraciones posteriores al 21 de septiembre fueron ejecutadas **manualmente** desde Supabase. Eso explica que haya objetos instalados sin entradas correspondientes en `supabase_migrations.schema_migrations`. No es prueba de que hayan fallado, tampoco prueba de que cada instrucción terminó. Mantener el procedimiento del PATCH 02, sin recrear ni marcar como aplicadas automáticamente las 15 versiones. Cualquier `migration repair` requiere respaldo restaurado, comparación de funciones y aprobación explícita.

## Alcance de esta entrega

- `src/financial-engine/bank-control.ts` adopta `toMinorUnits` y `toSafeDisplayNumber` del contrato financiero ya incluido por el PATCH 01.
- Firma contable inmutable: `saldo bancario = apertura mensual + Cargo - Abono`. Se validan tipos, centavos exactos y signos antes de agregar un movimiento.
- Los subtotales internos pasan a `bigint` (unidades de centavo); la interfaz existente `BankControl` conserva el contrato `number`, con conversión final controlada y rechazo si el entero en centavos excede el rango seguro.
- Un `bankReportedClosing` no genera movimientos. `null` sigue siendo desconocido y no se convierte en cero.
- Se conservan bancos, reportes y vistas existentes, sin aplicar SQL ni modificar flujos históricos.
- Casos sintéticos nuevos: suma de decimales, separación de monedas, tercer decimal, signo, rango máximo y cierre informado.

## Validación local en Mac

```bash
# Debe ser feat/erp-native-operations. No usar producción.
git branch --show-current
git status --short
git apply --check ~/Downloads/SONACOL_FASE1_PATCH_03_CONTROL_BANCARIO_EXACTO.patch
git apply ~/Downloads/SONACOL_FASE1_PATCH_03_CONTROL_BANCARIO_EXACTO.patch
node --import tsx --test tests/bank-control-exact.test.ts
pnpm check
pnpm build
```

La suite completa de PostgreSQL/Playwright y las pruebas sobre exportaciones ERP deben ejecutarse en el entorno local antes de integrar a producción; la validación aislada del parche **no** sustituye esa evidencia. Nunca ejecutar GitHub Actions, `supabase db push`, `supabase migration repair`, `supabase db reset` o cambios de escritura sobre datos reales como parte de este patch.

## Puerta hacia el siguiente patch

Conservamos el cálculo ERP y extendemos la exactitud progresivamente a `base-treasury.ts`, `projection.ts` y `dataService.ts`. La separación de N frente a N+1 para versiones nuevas debe respetar snapshots/escenarios antiguos; se realizará con pruebas de regresión explícitas y sin reescribir datos históricos.
