# SONACOL TREASURY — FASE 1 · PATCH 06 · Identidad de cuentas

## Qué implementa

El ERP puede entregar la **cuenta contable** (p. ej. `511010016`) y el nombre del banco, pero esos datos **no son** el número de cuenta bancaria. No se puede derivar el número real a partir del banco, el monto ni el código contable.

Se introduce `bank-account-identity.ts`:

- Mapeo exacto por **empresa + código contable + moneda**, vinculado explícitamente a banco y número bancario real.
- Número bancario almacenado como **texto** (conserva ceros iniciales) y presentado **enmascarado**.
- Una vinculación exige referencia documental, responsable de verificación y momento con zona horaria.
- Rechaza vinculaciones contradictorias: una cuenta contable con varios números o el mismo número/banco/moneda/empresa ligado a cuentas contables diferentes.
- Mapeo incompleto no crea coberturas ficticias: `catalog_absent` o `unmapped`.
- Una discrepancia de banco en origen se informa, sin reasignar movimientos o cambiar su suma.
- `BankControlTable` muestra si un número bancario está verificado. Actualmente el catálogo es **opcional** y vacío; hasta conectar un registro autorizado, indica explícitamente que falta la vinculación.

El control de caja mantiene **apertura + Cargo − Abono** en la moneda original. Se añade validación para detectar filas de una misma empresa/cuenta/moneda que declaren bancos distintos.

## Qué no hace

**No inventa números reales**, no extrae cuentas que no figuren en el ERP, no consulta bancos, no modifica ERP SQL ni Supabase. No ejecuta acciones de conciliación bancaria real, no crea tabla de mapeos ni considera un vínculo verificado por el mero hecho de que un usuario escriba datos en el frontend. En esta etapa, la función de verificación de vinculaciones es pura y debe alimentarse en etapas siguientes desde un catálogo persistente, autorizado, auditado y protegido por RLS.

Las vistas heredadas que transportan `BankAccount.accountNumber = ledger` requieren una migración de contrato UI separada para no romper consumidores: los flujos nuevos no deben tratar esa etiqueta histórica como número bancario verificado.

## Instalación

1. `git apply --check ~/Downloads/SONACOL_FASE1_PATCH_06_IDENTIDAD_BANCARIA.patch`
2. `git apply ~/Downloads/SONACOL_FASE1_PATCH_06_IDENTIDAD_BANCARIA.patch`
3. `node --import tsx --test tests/bank-account-identity.test.ts`
4. `pnpm check && pnpm build`

### Próximas etapas

- Catálogo bancario persistente con acceso administrado, aprobación y trazabilidad, sin ejecutar migraciones de producción hasta regularizar controles.
- Asignación de cuenta de cobro/pago y conciliación según número bancario **verificado** en vez de banco de texto o cuenta contable confundida con número físico.
- Control de apertura mensual (octubre desde cierre bancario aprobado de septiembre; noviembre desde cierre aprobado de octubre) por cada vínculo y moneda.

El patch es aditivo salvo el control por cuentas y la indicación visual en la tabla. No actualiza ni elimina registros históricos.
