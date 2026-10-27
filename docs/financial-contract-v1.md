# Contrato financiero v1 — SONACOL TREASURY

**Estado:** primera implementación aditiva de FASE 1. **No activado como motor oficial.** Especificación superior: PROMPT MAESTRO completo (FASES 0–7, requisitos A–N).

**Punto de partida:** `feat/erp-native-operations` @ `48479a1d153930396a5d0bb504993f3dd2808ee0`. Rama aislada: `feat/financial-contract-phase1`.

## Invariantes que ya implementa

1. **Dinero exacto:** las operaciones nuevas usan `bigint` en centavos. Las entradas de más de dos decimales se rechazan (no se redondean). `minorUnitsToDecimal` representa el importe sin pérdida; la conversión a `number` es exclusivamente un adaptador de presentación con límite explícito. PostgreSQL mantiene `numeric`; JSON/RPC debe transmitir importes como cadenas decimales, nunca serializar `bigint` directamente.
2. **Cuenta:** la identidad contable es `empresa + cuenta contable SAP + moneda`, separada de número bancario real y nombre del banco. El catálogo de correspondencias versionadas aún requiere persistencia SQL.
3. **Fechas distintas:** `effectiveOn`, `postedOn`, `extractedAt`, `importedAt`, `cutoffOn`, `dueOn` y `plannedOn`. Una fecha no informada es `null`; la extracción no sustituye contabilización. Los instantes exigen zona horaria ISO explícita; la operación local utiliza `America/Santiago`.
4. **Bancos:** `apertura mensual + Cargo − Abono`, sin duplicar apertura como ingreso. Apertura ausente = sin cobertura, no cero.
5. **Corrección:** una línea omitida sigue vigente. Cambiar su efecto requiere estado explícito, responsable, fecha, motivo y referencia de evidencia; la fecha efectiva no sustituye el instante en que esa corrección fue conocida. Los snapshots históricos previos deben permanecer congelados.
6. **Cierre mensual:** la apertura siguiente solo deriva de cierre reconciliado, aprobado, con saldo reportado consistente y evidencia. Las diferencias no se ajustan automáticamente.
7. **Proyección:** la fecha inicial oficial es `corte N + 1`, independiente de fecha/hora de carga. La eventual vista de cierre previsto de N es una métrica separada.

## Código y pruebas

- `src/financial-engine/financial-contract-core.ts`: tipos, validadores y funciones puras.
- `tests/financial-contract-core.test.ts`: seis casos sintéticos sobre precisión, cuentas, fechas, apertura/cargos/abonos, corrección documentada y cierre mensual.

Se ejecutaron las seis pruebas en el entorno aislado de trabajo usando Node 22 con `--experimental-strip-types`: seis aprobadas. El código del contrato pasó `tsc --noEmit --strict` aislado. **No se ejecutaron** el test suite integral, PGlite completo, Playwright ni el build de la aplicación; no hay clon npm instalado en este entorno. No declarar equivalencia financiera hasta completar A–N.

## Límites deliberados

- Esta entrega **no sustituye** `base-treasury.ts`, `calculations.ts`, `projection.ts`, `snapshot.ts` ni `dataService.ts`. Su comportamiento actual permanece sin cambios y puede seguir presentando las diferencias descritas en FASE 0.
- No se creó ni aplicó migración SQL. Antes de hacerlo, reconciliar el historial de migraciones con el esquema del proyecto Supabase; las tablas ERP avanzadas existen pese a que el historial registrado termina antes.
- El helper de vigencia responde al **corte contable efectivo**. La dimensión bitemporal "conocido al instante" debe resolverse al conectar snapshots versionados, para no alterar consultas históricas.
- No se ha autorizado ni realizado resolución alguna sobre el movimiento de 832 millones: el test usa una cifra representativa, **no una acción contra registros reales**.
- No se cargan archivos CAJA ni ERP en el repositorio. Solo fixtures sintéticos.

## Integración siguiente (misma plataforma)

1. Reconciliar schema/migration-history y preservar `git status` local del usuario antes de integrar.
2. Definir persistencia exacta de cuentas, correcciones bitemporales y cierres autorizados en migraciones **no destructivas**; ejecutar primero sobre PostgreSQL aislado.
3. Adoptar el contrato exacto en el registro ERP y motor oficial, con adaptadores para históricos congelados; no mantener dos fórmulas de caja.
4. Separar cierre previsto N de proyección oficial N+1; verificar cobranzas, ejecuciones parciales, monedas y escenarios sin duplicación.
5. Repetir `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e` localmente y evaluar oráculos por cuenta/moneda/corte con cero centavos de tolerancia.

**No se ejecutaron GitHub Actions, despliegues ni escrituras Supabase.**
