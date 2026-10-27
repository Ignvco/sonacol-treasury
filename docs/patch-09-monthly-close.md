# Sonacol Treasury — PATCH 09: continuidad bancaria mensual

Rama: feat/patch-09-monthly-close. Base: feat/erp-native-operations.

Estado: implementación INCREMENTAL, sin despliegue ni certificación final.

## Evidencias ya confirmadas
- Plataforma en desarrollo privado, no producción operativa.
- PATCH 05 aplicado y verificado en Supabase remoto de desarrollo (motor v4 para nuevas importaciones ERP).
- PATCH 07 SQL pendiente en remoto (tabla y RPC ausentes); presente en staging local.
- 15 migraciones históricas sin entradas en el registro remoto: no ejecutar ni reparar a ciegas.
- Respaldo verificado/restaurado en segunda base aislada: 11/11 conjuntos de datos coincidentes. Permisos de funciones no equivalentes en esa restauración; su recuperación completa queda pendiente.
- ERP remoto: 63 movimientos, 8 aperturas y 7 importaciones después de PATCH 05.

## Implementación de esta rama
- src/financial-engine/monthly-close.ts: propuesta de cierre mensual sin efectos secundarios, dinero exacto en centavos bigint; separación empresa/cuenta/moneda/mes, cierre aprobado anterior obligatorio para la apertura oficial, diferencia de referencia ERP, bloqueo de fuentes incompletas, deduplicación de claves idénticas, revisión por hechos nuevos y apertura propuesta de M+1.
- tests/monthly-close.test.ts: 10 pruebas sintéticas de reglas financieras.

Comprobar localmente con:
  node --import tsx --test tests/monthly-close.test.ts
  pnpm lint && pnpm typecheck && pnpm test && pnpm build

Estas pruebas NO han sido ejecutadas en el entorno de este asistente. No declarar que pasan sin ejecución local.

## Pendiente para terminar PATCH 09
1. Script SQL aditivo y pruebas PGlite: cierres por versión inmutable, eventos auditados y relación con aperturas y movimientos ERP.
2. RPC de vista previa y aprobación en transacción, con autentificación, roles, MFA, fuente inequívoca, concurrencia, cobertura y revisión de versiones.
3. Ancla inicial aprobada y respaldada por evidencia de bancos/contabilidad cuando no exista un cierre previo. No inventar un saldo.
4. Reaperturas, correcciones y movimientos tardíos mediante nuevas versiones; no reescribir cierres anteriores.
5. Pantalla Bancos -> Cierre mensual y desglose, manteniendo identidad visual.
6. Pruebas obligatorias: septiembre->octubre->noviembre, moneda, centavos, intradía, reimportación, ausencia de cobertura, cierre previo, ajustes, cambio de hechos, roles, rollback y proyección N+1.
7. Reconciliación con fuentes CAJA/ERP reales y validación local de SQL antes de cualquier escritura remota.

No ejecutar DDL remoto ni GitHub Actions. No ejecutar las 15 migraciones anteriores. No inventar cuentas bancarias físicas: solo usar catálogo verificado cuando esté instalado. Conservar snapshots y decisiones MANUAL.

Siguiente entrega: persistencia/RPC SQL versionados y pruebas PostgreSQL aisladas, sin presentar este primer incremento como PATCH 09 completo.
