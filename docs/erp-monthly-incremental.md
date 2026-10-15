# Informe — ERP mensual e incremental

Fecha: 14 de octubre de 2026. Repositorio: Ignvco/sonacol-treasury. Rama de destino: feat/erp-native-operations.

Base del patch: commit `25e5207e15238cdce87da9571c1908b605ce6cfd` más `sonacol-refinamiento-visual.patch` aplicado. Árbol de referencia del diff: `f2830f7bad0febf52d6310af7935e325653a7605`. El refinamiento visual puede seguir sin commit; esta entrega contiene únicamente los cambios posteriores.

La aclaración más reciente define **apertura mensual**, y sustituye el supuesto diario de la entrega anterior. ERP aporta datos de origen; las decisiones, compromisos, rescates y proyecciones siguen viviendo en la plataforma.

## 1. Causas raíz y auditoría de los archivos reales

Se analizaron los archivos originales antes de corregir el código:

| Archivo | SHA-256 |
|---|---|
| ERP 09-10.xls | `2472fc3d9b671730feb3eef61715d46afc41fbc4d4cd9bd14b718b3c0eaf2c76` |
| ERP 13-10.xls | `b06f9f97d5486c0cecef4ccb82d1a5ba4ff4b416eec2b63d6b1e753afbccb60a` |

Ambos son XLS/BIFF con fechas Excel de sistema 1900. No se modificaron los archivos ni se incluyeron en el repositorio.

| Hallazgo | Causa y corrección |
|---|---|
| Falso rechazo del corte del día 13 | El lector y la última validación SQL exigían apertura diaria. Ahora distinguen mes de apertura, corte del archivo y fecha real de cada movimiento. |
| Reimportaciones tratadas como reemplazo completo | La fotografía entrante no conservaba por sí sola los movimientos bancarios omitidos. Se agrega un registro bancario independiente y se construye la fotografía con la unión validada del mes hasta el corte. |
| Aperturas duplicadas aceptadas en una prueba antigua | La prueba permitía dos fuentes de apertura con importe. Se corrige la expectativa: se rechazan aunque coincidan; las cabeceras de agrupación sin importe siguen permitidas. |
| Rescate marcado ejecutado sin evidencia | Una prueba cambiaba solo el estado. Ahora verifica el rechazo y registra la ejecución contra un movimiento bancario real, sin duplicar su efecto futuro. |
| Vencimiento ausente en el ERP nuevo | La columna P cambió de “Fecha de Vencimiento” a “Fecha Vencimiento”. Se reconocen ambas cabeceras. La fecha explícita se conserva; una inválida bloquea y una vacía permanece desconocida. |
| Apertura OB sin cuenta en colocaciones | En el archivo del 13, N2 está vacía. Se usa la única cuenta explícita del mismo mayor solamente cuando es inequívoca, con advertencia y evidencia original intacta. Varias cuentas impiden esa inferencia. |
| Importación de JSON desde public | `import.meta.glob` trataba archivos públicos como módulos del código. Un módulo virtual de Vite incorpora los mismos JSON sin cambiar su fuente ni sustituir i18next. |
| Desglose de Flujo incorrecto al cambiar banco | La prueba de producción encontró dos tarjetas de egresos, una con importes antiguos: BankActivity y CashPosition tenían la misma clave React. Se distinguen sus claves para que se actualicen y desmonten correctamente. No se alteró la fórmula financiera. |

Estructura comprobada:

- **SALDOS BANCOS:** A cuenta contable, B banco, C saldo inicial; ocho cuentas CLP, filas 2–9. Ambas versiones contienen los mismos saldos, sin fecha ni cierre informado.
- **BANCOS:** la versión del 09 tiene una columna inicial vacía; la del 13 la elimina. El lector localiza las columnas por cabecera, no por posición. Se usan cuenta, fecha de contabilización, fecha de vencimiento, serie, documento, folio, transacción, comentario, Cargo, Abono y referencia.
- **Movimientos bancarios:** 27 en el archivo del 09; 24 en el del 13, con fechas 09 y 13 de octubre. Las fechas observadas no contienen hora fraccionaria. No hay una columna formal de estado pendiente/anulado que permita descartar movimientos. Un comentario de anulación no reemplaza sus cargos/abonos originales.
- **COLOCACIONES:** A contabilización, I saldo acumulado, N cuenta y P vencimiento. El 13 trae apertura de 2 CLP y 11 movimientos, con vencimientos explícitos del 01, 07, 08 y 30 de octubre. P3 contiene el serial 46325, convertido a 2026-10-30. OB no tiene vencimiento.
- **CLIENTES:** conserva el contrato anterior y sus ajustes de negocio. No se convierte en movimientos bancarios por esta modificación.
- La cabecera de la cuenta USD 511010015 no tiene apertura ni movimientos en estos archivos. Sigue fuera de cobertura; no acredita saldo cero.

## 2. Archivos modificados y motivo

Las rutas siguientes corresponden al diff incremental sobre el refinamiento visual aplicado.

| Archivos | Motivo |
|---|---|
| `src/import-engine/erp-bank-balances.ts` | Identificar apertura mensual y conservar la ausencia de fecha fuente. |
| `src/import-engine/pipeline.ts` | Validar mes, corte, fecha fuente y contexto mensual sin cambiar fechas de movimientos. |
| `src/import-engine/erp.ts` | Alias de vencimiento, OB con cuenta inequívoca y documento/folio bancarios. |
| `src/import-engine/types.ts` | Contrato del resumen incremental y detalle de diferencias. |
| `supabase/migrations/20261014000000000_monthly_incremental_erp.sql` | Registro bancario, aperturas mensuales, auditoría, comparación/importación atómicas y aviso de conservación al eliminar fotografías. |
| `src/services/importService.ts`, `src/financial-engine/types.ts` | Transportar resultados del servidor y controles de eliminación. |
| `src/financial-engine/snapshot.ts` | Mostrar el archivo original de un movimiento conservado. |
| `src/pages/Importations.tsx`, `src/pages/importations/ImportPreview.tsx` | Resumen real, confirmación y bloqueo ante diferencias. |
| `src/pages/importations/ErpIncrementalSummary.tsx` | Contadores, movimientos conservados, origen y ecuación por cuenta. |
| `src/pages/importations/ErpImportContext.tsx` | Explicar y declarar el período mensual, separado del período de inversiones. |
| `src/pages/importations/DeleteImportsDialog.tsx` | Aclarar que eliminar fotografías no elimina el registro bancario independiente. |
| `src/pages/CashFlow.tsx` | Claves React distintas para actualizar correctamente el filtro de banco. |
| `config/locales-plugin.ts`, `src/types/virtual-locales.d.ts`, `src/i18n/config.ts`, `vite.config.ts` | Carga tipada y síncrona de traducciones desde su fuente pública mediante Vite. |
| `tests/erp-monthly-incremental.test.ts` | Nueve casos de apertura, identidad, conservación, errores, migración y fechas BIFF. |
| `tests/erp-bank-balances.test.ts`, `tests/erp-native-operations.test.ts`, `tests/cashflow-activity.test.ts` | Reglas actuales de duplicidad, ejecución respaldada y actualización por nuevos asientos. |
| `tests/locales.test.ts`, `tests/browser/erp-incremental.spec.ts` | Traducciones en dev/build y actualización incremental por interfaz. |
| `tests/browser/decisions.spec.ts`, `tests/browser/projection.spec.ts` | Actualizar el nombre Agenda y el separador visual de fecha; conservar las expectativas financieras. |
| `README.md`, `CodeGuideline.md`, `src/pages/help/chapters.ts` | Instrucciones vigentes, módulos nuevos y guía mensual. |
| `docs/erp-09-10-aperturas-vencimientos.md`, `docs/erp-monthly-incremental.md` | Señalar el contrato diario como histórico y documentar el contrato vigente y esta auditoría. |

## 3. Apertura mensual, corte y cálculo bancario

Para cada empresa, cuenta, moneda y mes:

**Saldo al corte = apertura mensual + cargos del mes hasta el corte − abonos del mes hasta el corte.**

El inicio bancario debe ser el primer día del mes del corte. Una fecha explícita de apertura puede representar ese primer día o el cierre del día anterior. Una fecha de otro período, vacía en una columna de fecha existente o inválida sigue siendo un error.

Cuando el archivo no contiene columna de fecha, se conserva `openingDate=null` y se registra el mes declarado por el usuario. El motor representa la apertura al cierre del día anterior al inicio, como referencia contable separada; no afirma que esa fecha estuviera en Excel. Ningún movimiento cambia su fecha de origen.

La apertura no es ingreso ni egreso. Existe una identidad mensual por empresa/cuenta/moneda; un cambio posterior de importe o banco en ese mismo mes bloquea la carga. Noviembre tiene su propia apertura y no suma la de octubre. Una cuenta ya reconocida no puede desaparecer del control mensual, aunque no tenga movimientos.

Se mantienen las validaciones de cuentas, moneda, signos, fechas, acumulados de colocaciones y cierre informado. No se exige un cierre inexistente ni se inventa una diferencia contra él. Resumen, Bancos, Flujo y proyecciones consumen el mismo saldo del snapshot seleccionado.

## 4. Actualización incremental y resultados de los ERP

La comparación lee y valida el archivo completo. Consulta las identidades registradas del mismo mes hasta el corte, reconoce coincidencias y propone solo las nuevas. Los movimientos conocidos ausentes se conservan en la cobertura efectiva con cuenta, fecha, documento y archivo originales.

La confirmación vuelve a comparar bajo el bloqueo transaccional existente y exige la revisión vigente. Solo después de completar la transacción devuelve el estado confirmado y los contadores reales. Una carga bloqueada no inserta parcialmente sus filas.

El registro `erp_bank_postings` contiene cada identidad una vez. Se mantienen fotografías inmutables en `daily_base_rows` para la arquitectura histórica: estas pueden repetir evidencia de movimientos ya conocidos, pero no son nuevas operaciones y **no se suman entre versiones**. Una carga idéntica al mismo corte reutiliza la fotografía si los demás datos financieros tampoco cambiaron; el intento exitoso queda auditado.

La primera actualización reconoce también las identidades de la última fotografía ERP compatible del mes. La migración, por sí sola, no copia ni modifica datos financieros históricos.

Resultados en PostgreSQL aislado, con el lector y el motor de la aplicación:

| Escenario | Filas ERP normalizadas | Bancarios nuevos | Ya registrados | Conservados ausentes | Caja calculada CLP |
|---|---:|---:|---:|---:|---:|
| Primera carga ERP 09-10 | 91 | 27 | 0 | 0 | 153.986.686 |
| Actualización 09-10 → 13-10 | 84 entrantes | 8 | 16 | 11 | 1.368.585.141 |
| ERP 13-10 en otra base vacía | 84 | 24 | 0 | 0 | 2.200.585.141 |

Ambos archivos se procesaron con **cero errores**; se mantuvieron las advertencias de datos fuente. Repetir cada carga incorporó cero movimientos y devolvió la misma fotografía. En la secuencia 09 → 13 quedan 35 identidades bancarias, no 51.

Control de la secuencia 09 → 13, período 01–13 de octubre, CLP:

| Cuenta | Apertura mensual | Cargos acumulados | Abonos acumulados | Saldo calculado |
|---|---:|---:|---:|---:|
| 511010005 | 111.629 | 0 | 0 | 111.629 |
| 511010007 | 1.474.331 | 3.506.571.218 | 3.502.086.300 | 5.959.249 |
| 511010009 | 393.647 | 2.228.912 | 2.600.000 | 22.559 |
| 511010010 | 3.211.320 | 151.515.743 | 154.600.000 | 127.063 |
| 511010014 | 114.634.507 | 23.200.000 | 133.399.725 | 4.434.782 |
| 511010016 | 3.170.054 | 3.730.972.158 | 2.519.192.250 | 1.214.949.962 |
| 511010017 | 2.059.788 | 0 | 0 | 2.059.788 |
| 511010018 | 41.811 | 573.378.298 | 432.500.000 | 140.920.109 |
| **Total** | **125.097.087** | **7.987.866.329** | **6.744.378.275** | **1.368.585.141** |

Todas las ecuaciones apertura + cargos − abonos coinciden con el saldo del motor. **Saldo informado y diferencia contra cierre informado: no disponibles en las ocho cuentas.** Esto valida el cálculo sobre las filas recibidas y conservadas, no certifica la integridad de la cartola del mes.

### Diferencia de origen que requiere investigación

Los once movimientos del 09 ausentes en el 13 tienen efecto neto **−832.000.000 CLP**. Diez corresponden a los asientos JE 186170 y JE 186177, cuyos importes se compensan. El restante es:

| Archivo / hoja / fila | Cuenta | Fecha | Documento | Transacción | Abono |
|---|---|---|---|---|---:|
| ERP 09-10.xls · BANCOS!35 | 511010016 | 2026-10-09 | JE 186176 | 191390 | 832.000.000 CLP |

El archivo nuevo no permite concluir que ese egreso se anuló. Por eso se conserva y se muestra su origen. Para la cuenta 511010016, el archivo del 13 por sí solo calcula 2.046.949.962 CLP; la cobertura conservada calcula 1.214.949.962 CLP. Diferencia de escenarios: **−832.000.000 CLP**, no diferencia contra un cierre informado.

El saldo de colocaciones del mayor del 13 es **8.683.066.002 CLP**. Se mantiene separado de la caja bancaria y no se transforma automáticamente en dinero disponible por tener vencimiento.

## 5. Identidad bancaria y duplicados

Se conservan las claves y UUID existentes para no romper sus relaciones. La clave bancaria anterior combina empresa, rol, cuenta, moneda, transacción, documento, fecha, contrapartida, monto firmado y descripción. No depende del número físico de fila o del nombre del archivo.

Además se comparan los hechos originales: cuenta, banco, moneda, fechas, transacción, documento, serie, folio, referencia, descripción, Cargo, Abono y signo. El asiento se identifica con empresa, transacción y documento para detectar una línea cambiada o nueva dentro de un asiento conocido, incluso si cambió de cuenta.

No hay un identificador estable de línea en este ERP. Por ello:

- Dos líneas indistinguibles se bloquean; no se fusionan ni se descarta una silenciosamente.
- Una línea nueva o corregida de un asiento ya registrado se presenta para revisión y bloquea la actualización.
- Documentos distintos con igual fecha e importe mantienen identidades distintas.
- Un movimiento retroactivo válido se incorpora con su fecha real dentro del período; no se traslada al día de carga.
- Los movimientos omitidos no se interpretan como anulados.

Esta entrega no incluye un asistente de remapeo o corrección de asientos. La alternativa segura es detener esa carga, revisar el asiento completo y preparar una corrección explícita con su evidencia.

## 6. Conservación de conciliaciones, estados y datos manuales

Se reutilizan los mecanismos de arrastre de decisiones y ejecución del proyecto, con las mismas identidades bancarias. La revisión de ejecuciones usa la unión efectiva, incluidos movimientos conservados; no obliga a retirar una asignación válida porque su fila falte en el nuevo archivo.

Las pruebas comprueban conciliación, compromiso manual, rescate con evidencia, montos ejecutados y coordenadas fuente después de actualizar. No se valida un rescate ejecutado cambiando únicamente su estado.

Los datos manuales, fechas ajustadas, reglas, proyecciones y previsiones guardadas no se sustituyen por el Excel. Los históricos existentes no se recalculan ni se reescriben al instalar la migración. Un archivo histórico no traslada la planificación activa hacia atrás; volver a un contenido ERP anterior hacia adelante no reactiva decisiones de una fotografía antigua.

Las escrituras ocurren en una transacción con bloqueo de importación, revisión optimista y restricciones únicas. El registro bancario y las aperturas no admiten acceso directo del cliente; las RPC conservan controles de usuario y escritura. Se registra archivo, hash, actor, fotografía y resumen confirmado en `erp_import_runs` y auditoría.

La eliminación explícita de fotografías Excel sigue siendo una operación separada. Su diálogo informa que el registro bancario y las aperturas mensuales se conservan: borrar una fotografía no constituye una anulación bancaria. Las coordenadas repetidas de distintos archivos se distinguen mediante `source_version`, sin inventar filas de Excel.

## 7. Traducciones

Los JSON de `public/locales` siguen siendo la única fuente del contenido y continúan disponibles por HTTP. El plugin `sonacol-locales` lee los idiomas del manifiesto, valida sus recursos y los entrega como `virtual:sonacol-locales`. Vigila los cambios para desarrollo; producción incluye los recursos necesarios desde el arranque.

Se conservan i18next, su backend HTTP, el detector, la normalización regional y la actualización de lang/dir. No se cambian dependencias ni el catálogo. El manifiesto actual soporta español, con alias regionales como es-CL; no se afirma haber validado idiomas inexistentes.

La prueba compara todas las claves canónicas contra el resultado real de Vite en desarrollo y compilación, y verifica i18next al cambiar de idioma soportado. El navegador comprueba es-CL → es, traducción de la página no encontrada, recarga y navegación a Hoy.

## 8. Pruebas ejecutadas

Validación local en entorno aislado, sin conexión de escritura a producción:

| Verificación | Resultado |
|---|---|
| Suite completa, script `test` | **233 aprobadas, 0 fallidas, 0 omitidas**. |
| Selección financiera durante desarrollo | **19/19** aprobadas; incluidas en la suite completa, no adicionales. |
| ERP reales 09-10 y 13-10 | Lectura, comparación, confirmación, repetición y escenario base vacía correctos; cifras en sección 4. |
| Migración desde esquema diario anterior | Instalada en base aislada; filas históricas y MANUAL permanecen iguales; la siguiente carga reconoce las identidades existentes. |
| Navegador en desarrollo | **2/2** casos nuevos aprobados. |
| Navegador sobre compilación de producción | **18 casos distintos verificados**: 17 pasaron en la selección inicial; el caso de filtro bancario falló, se corrigió su causa y se repitió el archivo completo de Flujo con **2/2 aprobados** sobre la compilación final. |

Los nueve casos nuevos de lógica/SQL cubren: fechas mensuales y fuente vacía; superposición/reordenamiento/repetición; conciliación y ejecución preservadas; duplicados y correcciones ambiguas; retroactividad y cambio de mes; apertura/cuenta/cierre inconsistentes; revisión obsoleta, error tardío con rollback y reintento, permisos; vencimientos BIFF e inferencia inequívoca; actualización de una instalación anterior.

Las pruebas de navegador cubren importación, contadores, omisiones, bloqueo, móvil, egresos en Resumen/Flujo, saldo por cuenta, navegación, planificación, ejecución, conciliación, exportaciones y selección histórica. La falla de filtro bancario detectada durante esta revisión se corrigió en el código, sin relajar la aserción original.

## 9. TypeScript, lint y compilación

Se ejecutaron los scripts del package.json mediante npm, equivalentes a `pnpm test`, `pnpm typecheck`, `pnpm lint` y `pnpm build`.

| Gate | Resultado |
|---|---|
| TypeScript | Correcto, sin errores. |
| ESLint | 0 errores; 5 advertencias preexistentes de react-refresh en SourceBreakdown y contextos de autenticación/moneda. |
| Build de producción | Correcto; ya no importa JSON de public como módulos JavaScript. Persisten avisos de dependencias y Browserslist ajenos a esta corrección. |
| Pruebas y navegador | Detallados en sección 8; ejecutados con base PostgreSQL/PGlite aislada. |

Los cambios finales de las claves React se volvieron a compilar y pasaron TypeScript/lint. La migración se ejecutó únicamente en bases de prueba. No se ejecutaron GitHub Actions, migraciones productivas, commits, push ni despliegues.

## 10. Instalación, riesgos y validaciones pendientes

### Aplicación

Conserva el refinamiento visual ya aplicado, incluso sin commit. Desde la carpeta de la rama de destino:

```bash
git status --short
git apply --check /ruta/sonacol-erp-mensual-incremental.patch
git apply /ruta/sonacol-erp-mensual-incremental.patch
```

Si el chequeo falla, compara la base y los cambios locales; no fuerces el patch ni uses reset. No se requiere cambiar dependencias.

Aplica mediante tu procedimiento de base de datos **solo** la migración nueva, después de las ya instaladas hasta `20261013010000000_daily_openings_maturities.sql`:

```text
supabase/migrations/20261014000000000_monthly_incremental_erp.sql
```

Instala la migración antes de publicar el frontend actualizado. No vuelvas a ejecutar SQL anterior ni borres datos para habilitar la carga.

Contexto de la prueba real del archivo del 13:

| Campo | Valor |
|---|---|
| Empresa | SONACOL |
| Moneda local | CLP |
| Corte ERP | 2026-10-13 |
| Inicio del mayor bancario | 2026-10-01 |
| Inicio del mayor de inversiones | 2026-09-30 |

Analiza, revisa los movimientos conservados y sus orígenes, y confirma cuando la comparación no tenga bloqueos. Repetir el mismo archivo debe informar cero movimientos bancarios adicionales.

### Límites explícitos

1. **Debe investigarse JE 186176 / transacción 191390 por 832.000.000 CLP.** No hay evidencia suficiente para borrarlo, anularlo o compensarlo automáticamente.
2. Ningún archivo trae cierre bancario informado ni acredita por sí solo que el período mensual esté completo. Los saldos comprobados son resultados de las filas disponibles, no una certificación contra cartolas o CAJA del mismo corte.
3. La cuenta OB de colocaciones se infiere únicamente de la cuenta única del reporte y queda advertida. Si el origen incluye varias cuentas, debe identificarse la apertura explícitamente.
4. El mayor de colocaciones no identifica lotes abiertos de forma inequívoca. Se preservan sus vencimientos explícitos sin inventar fecha, lote, tasa o interés ni duplicar fondos en caja/proyecciones.
5. Las correcciones de asientos conocidos y las líneas indistinguibles exigen revisión; no hay resolución automática ni asistente de remapeo en este patch.
6. El modo incremental se aplica a bancos con SALDOS BANCOS. Clientes y colocaciones conservan su contrato de fotografía y sus decisiones de negocio. Los ERP históricos sin esa hoja mantienen compatibilidad hasta adoptar el control mensual del período.
7. No hay recuperación masiva automática desde todas las fotografías antiguas. La primera carga reconoce la última compatible y después utiliza el registro permanente. Los históricos anteriores se conservan para investigación; no se interpreta que todo lo ocurrido antes de activar este modo ya quedó reconstruido.
8. La prueba de concurrencia verifica vistas previas intercaladas/obsoletas y el bloqueo transaccional en el código. PGlite no sustituye un ensayo de carga simultánea de varios clientes contra el servidor productivo.
9. Continúan los límites de tamaño y 20.000 registros de cobertura efectiva. Una actualización que los supere se rechaza completa, sin guardar una fracción.
10. No se eliminaron datos reales ni se modificó la base del usuario. La aplicación en su entorno y la conciliación de la diferencia de origen siguen siendo pasos posteriores a esta entrega.
