# SONACOL TREASURY — FASE 1 · PATCH 08 · Conciliación + identidad bancaria verificada

Base: `feat/erp-native-operations` @ `70d8a0d2754c02269ecca6494f79e72be5da0f4d`.

## Objetivo y alcance

El historial de cartolas (`treasury_statements`) y conciliaciones (`treasury_matches`) usa `p_account` codificado como JSON `[nombre_banco, cuenta_contable]` más moneda. **El número físico de cuenta bancaria NO forma parte de esa clave histórica**, y reemplazarlo perdería la conexión con registros anteriores. Este patch **no cambia esa clave**, ni las consultas SQL, ni las escrituras remotas, ni filas históricas.

Se agrega una capa de evidencia **solo de lectura** usando el catálogo público enmascarado del PATCH 07:

- Resolución por empresa ERP + cuenta contable + moneda, comprobando banco y revisión del vínculo.
- Estado visible `verified`, `unmapped`, `bank_mismatch`, `ambiguous_company`, `catalog_not_installed` o `legacy_base`.
- Con catálogo instalado, una cuenta ERP sin vinculación o con conflicto queda bloqueada para **nuevas operaciones desde esta interfaz**. El historial sigue siendo visible y las reversas explícitas existentes se mantienen disponibles para los usuarios autorizados.
- Si el catálogo no está instalado, la operación heredada continúa con advertencia explícita; se evita interrumpir el sistema anterior mientras el script SQL del PATCH 07 esté pendiente.
- Para las cargas nuevas de cartolas y confirmaciones de conciliación se vuelve a consultar el catálogo justo antes de solicitar el RPC. Si cambió la revisión / identidad desde que se abrió el formulario, se exige recargar y revisar.
- Una cuenta BASE histórica sin metadatos ERP conserva su flujo heredado; nunca obtiene un número real supuesto.

## Alcance de seguridad

Este es un **control de interfaz y verificación de identidad antes del envío**, no una política PostgreSQL ni garantía contra llamadas directas a los RPC anteriores. Una activación definitiva de conciliación por cuenta física necesitará una revisión específica de `treasury_import_statement`, `treasury_confirm_match`, políticas y efectos sobre el historial. No se debe presentar esta protección cliente como autorización del servidor ni cambiar `p_account` silenciosamente.

El número físico completo solo se administra mediante `treasury_save_bank_binding` del PATCH 07. El RPC público `treasury_bank_catalog` devuelve una máscara y versión, que son los únicos valores usados aquí.

## Instalación local

```sh
git branch --show-current
git status --short
git apply --check ~/Downloads/SONACOL_FASE1_PATCH_08_CONCILIACION_IDENTIDAD.patch
git apply ~/Downloads/SONACOL_FASE1_PATCH_08_CONCILIACION_IDENTIDAD.patch
node --import tsx --test tests/reconciliation-identity.test.ts
pnpm check
pnpm build
```

## Escenarios de validación funcional

1. Con SQL catálogo aún **no activado**, abrir Conciliación: cuentas y cartolas anteriores se siguen viendo; aparece advertencia de clave histórica y la importación funciona como antes.
2. Con catálogo verificado, ver la cuenta enmascarada y su revisión. Confirmar que el identificador de consulta de cartolas continúa exactamente `[banco, cuenta contable]`.
3. Con catálogo instalado y cuenta sin vincular, nuevas importaciones y confirmaciones quedan deshabilitadas; los históricos permanecen visibles.
4. Con discrepancia de banco o empresa ambigua en ERP, no permitir asignar nuevos movimientos.
5. Cambiar revisión de una vinculación mientras un CSV está abierto: rechazar la operación y solicitar recarga.
6. Confirmar que las reversas de conciliación requieren el permiso anterior, y no dependen de que la vinculación actual siga vigente.
7. Probar con CLP y USD y varios códigos contables, sin mezclar monedas ni transformar números bancarios en códigos de mayor.

## Pendiente de despliegue

Ni PATCH 07 ni PATCH 05 pasan a producción por hacer commit. Sus scripts SQL quedan sujetos a pruebas aisladas, respaldo/restauración y autorización explícita. PATCH 08 **no incluye SQL** y puede instalarse antes de dichos despliegues. La activación de un backend de conciliación con identidad física queda para una fase posterior, revisando las claves preexistentes.
