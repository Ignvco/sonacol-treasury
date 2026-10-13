# Auditoría ERP 09-10: aperturas y vencimientos

Fuente: `ERP 09-10.xls`, entregado por Ignacio el 13/10/2026. SHA-256 `2472fc3d9b671730feb3eef61715d46afc41fbc4d4cd9bd14b718b3c0eaf2c76`.
Base de código: rama `feat/erp-native-operations`, commit `8bf0872` (patch 4).

## Estructura y causas

| Hoja | Datos y coordenadas | Diagnóstico |
|---|---|---|
| SALDOS BANCOS | A cuenta, B banco, C saldo inicial; filas 2–9 | Ocho aperturas CLP. No trae columna de fecha ni saldo final. La jornada debe declararse; no puede inferirse de la fecha de modificación del archivo. |
| BANCOS | B contabilización, C vencimiento, G transacción, H cuenta, I comentario, J cargo, K abono | 27 movimientos, todos contabilizados el 09/10/2026. Incluye encabezados de agrupación con código en C, con o sin la palabra Activos en B, sin importes. No son movimientos ni aperturas cero. |
| CLIENTES | I vencimiento, K documento | Contrato independiente. No se cambia la política de cobranza ni los ajustes de clientes. |
| COLOCACIONES | A contabilización, B transacción, F contrapartida, H importe con signo, I saldo acumulado, L/M cargo/abono, N cuenta, P vencimiento | 16 registros: apertura OB y 15 movimientos. El lector anterior omitía P, asignaba endDate=null y la agregación perdía las fechas de cada asiento. |

La comparación previa de cabeceras Activos contra SALDOS BANCOS convertía celdas vacías J/K en cero y rechazaba una apertura válida. Las cabeceras sin Activos entraban como movimientos inválidos. El contrato anterior permitía usar aperturas de un período genérico donde esta fuente representa el comienzo de una jornada.

## Fechas

Las celdas B/C de movimientos BANCOS y A/P de COLOCACIONES son numéricas con formato `m/d/yy`, sistema Excel 1900 (`date1904=false`). No son texto ISO. BANCOS!B5 vale 46304 (09/10/2026), COLOCACIONES!P3 vale 46325 (30/10/2026). Las 27 fechas B, 27 C, 15 A y 16 P observadas son enteras, sin hora fraccionaria.

El importador ya lee `cellDates:false` y convierte el número de serie por aritmética UTC, manteniendo YYYY-MM-DD. No se encontró un desfase de zona horaria en esa ruta. El error demostrado es de mapeo y pérdida posterior de la fecha, no de cambio de huso horario. Se conserva esa conversión y la compatibilidad de fechas textuales admitidas; no se añaden heurísticas sobre comentarios.

No hay columna separada de fecha de inicio contractual. A es contabilización; no se inventa una fecha contractual. OB carece de fecha de operación. P se conserva separadamente, incluso para salidas históricas.

## Control bancario independiente de los datos fuente

Se sumaron los valores originales de SALDOS BANCOS y BANCOS, por código de cuenta, conservando cargos y abonos. No se ejecutó el importador ni una prueba de aplicación.

| Cuenta | Apertura | Cargos | Abonos | Cierre calculado CLP |
|---|---:|---:|---:|---:|
| 511010005 | 111.629 | 0 | 0 | 111.629 |
| 511010007 | 1.474.331 | 3.506.571.218 | 3.502.000.000 | 6.045.549 |
| 511010009 | 393.647 | 2.228.912 | 2.600.000 | 22.559 |
| 511010010 | 3.211.320 | 151.515.743 | 154.600.000 | 127.063 |
| 511010014 | 114.634.507 | 23.200.000 | 133.399.725 | 4.434.782 |
| 511010016 | 3.170.054 | 1.684.295.153 | 1.687.200.000 | 265.207 |
| 511010017 | 2.059.788 | 0 | 0 | 2.059.788 |
| 511010018 | 41.811 | 573.378.298 | 432.500.000 | 140.920.109 |
| Total CLP | 125.097.087 | 5.941.189.324 | 5.912.299.725 | 153.986.686 |

El saldo final informado está ausente: no existe una diferencia contra cierre informado que pueda certificarse. La ecuación de las filas fuente es apertura + cargos − abonos. No se fuerza el resultado a las cifras de un Excel CAJA previo.

BANCOS!C28 identifica 511010015 (BCI USD), pero SALDOS BANCOS no incluye su apertura y no hay movimientos de esa cuenta en esta exportación. Queda fuera de cobertura; no es saldo cero y no se suma a CLP.

Los comentarios contienen anulaciones (por ejemplo BANCOS!I9, I15, I21, I36, I45), con transacciones 191391 que compensan registros anteriores. No hay columna formal de estado pendiente/reversado. Se conservan las filas con sus cargos y abonos. El número de transacción no es único por línea: un asiento puede contener varias cuentas e importes. No se deduplica por transacción, importe o comentario.

## Vencimientos y capital

P2:P4 y P6:P8 contienen 30/10/2026. P5, P9:P12 contienen las fechas históricas de salidas. P13:P17 contienen 13/10/2026. Son fechas explícitas, distintas de la contabilización A13:A17=09/10/2026.

El saldo acumulado final I17 es **10.729.366.002 CLP**. No corresponde sumar todos los cargos como capital vigente por vencimiento: hay rescates históricos y el mayor no aporta un identificador inequívoco de lote/fondo para repartirlos. La cuenta de posición 511030001 y su identidad se conservan para no romper rescates ya programados.

Hay diferencias de fuente a investigar: BANCOS!K42 y J45 contienen 216.300.000, mientras K44 y COLOCACIONES!L17 contienen 216.200.000. Se conserva la diferencia de 100.000; no se modifica por similitud. La contrapartida F13:F17 es 511010009 para todas esas filas, por lo que no se toma automáticamente como cuenta receptora de un rescate.

## Corrección implementada

- Reconocer encabezados BANCOS vacíos de importes sin convertirlos en aperturas. Relacionar cada movimiento por cuenta con SALDOS BANCOS, nunca por fila.
- SALDOS BANCOS define apertura diaria; inicio bancario=corte y cada movimiento debe pertenecer a esa jornada. Si hay fecha explícita de apertura, se respeta y valida. Si falta, se registra que procede de la declaración del usuario.
- Las aperturas importadas se guardan con fecha de inicio del día. Un adaptador privado permite reutilizar el validador de períodos anterior sin cambiar la fecha persistida ni los históricos.
- Si aparecen varias aperturas por cuenta o varios días, bloquear con explicación y solicitar cargas separadas por jornada. No se elige la última apertura ni se acumulan días. No se implementa importación automática multijornada no presente en el archivo auditado.
- Leer P por encabezado. Fecha explícita inválida bloquea; vacía advierte y permanece vacía. Conservar las fechas por asiento en la posición agregada, con origen, importe, moneda y fecha de contabilización.
- Mostrar vencimientos por asiento en Inversiones y al programar rescates, con alertas relativas al corte y exportación en moneda original. La fecha explícita puede seleccionarse en el formulario; importe y cuenta receptora requieren decisión revisada.
- Mantener la regla existente: la posición invertida no es efectivo; solo el rescate programado entra al flujo futuro, descontando ejecución registrada. No crear automáticamente un segundo rescate por cada fila de origen ni modificar los ya guardados.
- Incluir evidencia de vencimientos en el informe ejecutivo. Identificar aperturas como saldo, sin mostrarlas como flujo de ingreso en su trazabilidad.

## Preservación y límites

No se modifica el archivo fuente. No se actualizan filas históricas, decisiones manuales, reglas, ejecuciones ni proyecciones guardadas. Las funciones de arrastre y de revisión de actualizaciones del patch 3 permanecen vigentes. Reimportar el archivo con el nuevo lector es necesario para almacenar las fechas antes omitidas; la migración no las inventa para cargas anteriores.

No se ejecutaron pruebas, compilación, lint, TypeScript, migraciones ni macros, conforme a la instrucción del usuario. Se efectuaron lectura de datos, aritmética independiente y revisión estática del código. La instalación y su comportamiento completo siguen pendientes de validación en ejecución. La distribución exacta del capital remanente por vencimiento requiere identidad de lote/fondo o una asignación explícita; esta entrega no la presume.
