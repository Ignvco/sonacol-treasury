# SONACOL Treasury — manual del proyecto

Documento único de funcionamiento, arquitectura, instalación, base de datos, operación, pruebas y mantenimiento. Actualizado el **27 de septiembre de 2026** para **operación nativa desde ERP + reglas propias de tesorería**, manteniendo la compatibilidad con **SONACOL BASE v1**. Repositorio: [Ignvco/sonacol-treasury](https://github.com/Ignvco/sonacol-treasury). Describe el código revisado; no certifica por sí solo qué versión está desplegada en el servidor.

## Índice

1. [Objetivo y reglas del negocio](#1-objetivo-y-reglas-del-negocio)
2. [Arquitectura](#2-arquitectura)
3. [Instalación y comandos](#3-instalación-y-comandos)
4. [Configuración](#4-configuración)
5. [Pantallas](#5-pantallas)
6. [Importación de Excel](#6-importación-de-excel)
7. [Trabajo diario e historial](#7-trabajo-diario-e-historial)
8. [Cálculos y monedas](#8-cálculos-y-monedas)
9. [Base de datos](#9-base-de-datos)
10. [Usuarios y permisos](#10-usuarios-y-permisos)
11. [Integración SAP](#11-integración-sap)
12. [Publicación](#12-publicación)
13. [Pruebas y evidencia](#13-pruebas-y-evidencia)
14. [Solución de problemas](#14-solución-de-problemas)
15. [Mapa del código y mantenimiento](#15-mapa-del-código-y-mantenimiento)
16. [Limpieza y recuperación](#16-limpieza-y-recuperación)
17. [Estado y pendientes](#17-estado-y-pendientes)
18. [Actualizar desde fix/base-diaria](#18-actualizar-desde-fixbase-diaria)
19. [Decisiones, agenda y precisión](#19-decisiones-agenda-y-precisión)
20. [Conciliación bancaria](#20-conciliación-bancaria)
21. [Informes y asistente](#21-informes-y-asistente)
22. [Extracción y programación SAP](#22-extracción-y-programación-sap)
23. [Respaldos y prueba de restauración](#23-respaldos-y-prueba-de-restauración)
24. [Nuevos objetos y referencias técnicas](#24-nuevos-objetos-y-referencias-técnicas)
25. [Activar ERP y planificación](#25-activar-erp-y-planificación)
26. [Segunda etapa: decisiones CAJA](#26-segunda-etapa-decisiones-caja)
27. [Operación nativa sin Excel CAJA](#27-operación-nativa-sin-excel-caja)
28. [Patch: actualización ERP y formularios](#28-patch-actualización-erp-y-formularios)
29. [Patch: saldos bancarios desde ERP](#29-patch-saldos-bancarios-desde-erp)
30. [Patch: egresos en Resumen y Flujo](#30-patch-egresos-en-resumen-y-flujo)

## 1. Objetivo y reglas del negocio

Aplicación interna de tesorería para consultar caja, cuentas por cobrar, inversiones y proyecciones, con información diaria procedente de SAP Business One y ajustes manuales del equipo.

**ERP.xlsm es materia prima; CAJA es el sistema financiero manual que la plataforma reemplaza progresivamente.** ERP no tiene que contener BASE, MANUAL, proyecciones ni cálculos auxiliares. La aplicación separa datos importados, decisiones del usuario y resultados calculados.

**Criterio de aceptación obligatorio: una instalación vacía debe operar importando únicamente ERP.xlsm.** Las reglas, clasificaciones, movimientos manuales, compromisos, rescates y proyecciones pertenecen a la plataforma. El Excel CAJA es una referencia de desarrollo y, opcionalmente, un respaldo histórico; su carga, actualización o mantenimiento no forma parte del trabajo diario. La sección 27 corrige el enfoque de las entregas anteriores, demasiado centrado en trasladar decisiones desde un libro trabajado.

| Elemento identificado en CAJA | Destino en la plataforma | Alcance de esta etapa |
| --- | --- | --- |
| Datos directos ERP | Lotes y filas originales de BANCOS, CLIENTES y COLOCACIONES | Importación, validación y trazabilidad por hoja/fila |
| Datos calculados | Motor financiero y consulta compuesta | Saldos bancarios, posiciones y serie diaria |
| Datos ingresados manualmente | `daily_manual` / Proyecciones | Se mantienen al importar ERP |
| Datos modificados por el usuario | `treasury_business_decisions` / Planificación | Fecha prevista, clasificación, cuenta receptora y observaciones; original conservado |
| Proyecciones | Reglas, movimientos manuales y rescates programados | Fechas de cobro y rescates parciales; escenarios existentes |
| Reglas de negocio | Reglas versionadas en Planificación | Inicio desde ERP: +5 días naturales y clasificación ordenada; condiciones por cliente y excepciones editables |
| Cálculos auxiliares | Funciones del lector y del motor | Cargo menos abono, apertura, acumulados y capital reservado; no se copian hojas auxiliares |
| Información histórica | Lotes, decisiones por lote y previsiones congeladas | Consultable sin incorporar decisiones de fechas futuras |

Hay dos perfiles de entrada. **ERP-RAW-v1** lee las tres hojas crudas. El perfil heredado **SONACOL BASE v1** lee únicamente BASE del Excel CAJA trabajado: BANCO, CLIENTES, COLOCACIONES y MANUAL son valores de su columna de origen.

| Origen en BASE | Representa | Edición en la plataforma |
| --- | --- | --- |
| BANCO | Movimientos que producen los saldos contables | Solo lectura; se actualiza por importación |
| CLIENTES | Documentos y cobros futuros del ERP | Solo lectura; se actualiza por importación |
| COLOCACIONES | Inversiones y vencimientos del ERP | Solo lectura; se actualiza por importación |
| MANUAL | Ingresos y egresos proyectados por el usuario | Crear, editar y eliminar en Proyecciones |

El archivo Excel se conserva intacto. No se ejecutan macros ni se recalculan fórmulas. Para el perfil heredado CAJA, el lector utiliza los valores ya trabajados en BASE. Para ERP, las decisiones y proyecciones se construyen dentro de la plataforma; no se exige agregarlas al archivo de entrada.

El objetivo operativo es recibir el ERP de forma automática y trabajar MANUAL directamente en la app. La importación de Excel permanece disponible como alternativa y para consultar fechas anteriores. **Importar un Excel trabajado sin conexión no significa que la aplicación tenga un modo de trabajo offline:** guardar, autenticar y consultar datos del servidor requiere conexión.

## 2. Arquitectura

| Capa | Tecnología y responsabilidad |
| --- | --- |
| Interfaz | React 19, TypeScript, Vite, Tailwind CSS, componentes Radix/shadcn y gráficos Recharts |
| Lectura Excel | SheetJS 0.20.3 desde `vendor/xlsx-0.20.3.tgz`; se ejecuta en un Web Worker |
| Identificación de archivos | SHA-256 con `@noble/hashes` 2.0.1 dentro del worker; no requiere `crypto.subtle` del navegador |
| Backend | Supabase Auth, API de datos y funciones PostgreSQL invocadas por RPC |
| Persistencia | PostgreSQL: lotes, filas originales, MANUAL y decisiones de negocio versionadas por corte, auditoría |
| Composición financiera | Datos ERP inmutables + reglas + ajustes explícitos → proyección diaria, caja, dashboard e informes |
| Recepción SAP | Edge Function `sap-import`, ejecutada en el servidor, con autenticación propia |
| Calidad | ESLint, TypeScript, Node Test Runner, PGlite y Playwright |

El navegador analiza el libro y construye una vista previa. El servidor valida permisos y datos, compara la revisión y guarda la importación en una transacción. La vista previa no guarda información financiera. Las reglas de escritura también se aplican en la base de datos.

El repositorio contiene frontend y código de backend. El alojamiento del frontend, el proyecto Supabase y GitHub son servicios distintos: subir código a GitHub no acredita que el frontend esté publicado ni que las migraciones se hayan aplicado.

## 3. Instalación y comandos

Requisitos definidos por el proyecto: **Node.js 24 LTS recomendado (mínimo del frontend: 22.13.0)** y **pnpm 11.19.0**. Las verificaciones previas se ejecutaron con Node 24. Los comandos siguientes funcionan sin instalar pnpm globalmente.

Desde Terminal en tu Mac:

```bash
cd "$HOME/Documents/Developer/sonacol-treasury"
node -v
npx --yes pnpm@11.19.0 install --frozen-lockfile
```

En una instalación nueva, crea la configuración local sin reemplazar una existente:

```bash
test -f .env.local || cp .env.example .env.local
```

Completa las variables de la sección siguiente y arranca la app:

```bash
npx --yes pnpm@11.19.0 dev
```

Vite usa el puerto 8080; consulta la URL que imprime Terminal si ese puerto está ocupado. Para detenerlo, pulsa Ctrl+C.

| Comando, después de `npx --yes pnpm@11.19.0` | Función |
| --- | --- |
| `dev` | Servidor local de desarrollo |
| `lint` | Revisión estática del código |
| `typecheck` | Revisión TypeScript de aplicación y configuración |
| `test` | Pruebas de lógica, importación y PostgreSQL aislado |
| `check` | Ejecuta lint, typecheck y test |
| `build` | Genera `dist/` para publicar |
| `preview` | Sirve localmente la compilación existente |
| `test:e2e` | Pruebas locales de navegador Playwright |
| `test:security` | Control estático de archivos de secretos y variables frontend |
| `sap:sync` | Extracción SAP configurada por TI, ejecutada en su servidor |
| `db:backup` | Respaldo PostgreSQL configurado por TI |
| `db:verify-restore /ruta/copia.dump.json` | Verificación de restauración sobre una base aislada |

`build:prod` es un alias de `build`; `build:dev` compila con modo development. Los aliases heredados no añaden pasos de despliegue. `pnpm-lock.yaml` fija las versiones instaladas: conservarlo junto a `package.json`.

## 4. Configuración

| Variable | Uso |
| --- | --- |
| `VITE_SUPABASE_URL` | URL del proyecto Supabase conectado |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave pública/publicable de ese mismo proyecto |
| `VITE_ENTER_ANALYTICS_ENABLED` | Analítica externa; solo se activa con el texto `true` |
| `VITE_ENTER_ANALYTICS_TOKEN`, `VITE_ENTER_PROJECT_ID` | Configuración opcional de analítica |
| `VITE_ENTER_ANALYTICS_ENDPOINT`, `VITE_ENTER_ANALYTICS_DEFINITIONS_ENDPOINT` | Endpoints opcionales de analítica |
| `VITE_ENTER_ANALYTICS_DEBUG` | Diagnóstico opcional del SDK |

Estas variables quedan incorporadas en el frontend al compilar. Cambiarlas en el alojamiento requiere reconstruir y publicar. `.env.local` no se comparte en Git.

El cliente incluye la conexión pública original como alternativa cuando las variables Supabase están vacías. **Vacío no equivale a desconectado.** Revisa el proyecto de destino antes de cambiar datos. No copies claves privadas, `service_role` ni credenciales SAP en variables `VITE_*`.

`supabase/config.toml` conserva un identificador heredado. Antes de cualquier despliegue con CLI, verifica el proyecto real conectado al frontend y especifica su referencia. La limpieza documental no cambia ninguna conexión.

## 5. Pantallas

| Ruta | Función |
| --- | --- |
| `/login` | Autenticación; aprobación y MFA se comprueban antes de abrir la app |
| `/` | Hoy: caja, riesgo, antigüedad del ERP, cambio de caja y tareas con responsable |
| `/dashboard` | Resumen de caja y saldo previsto de la misma serie diaria que Flujo de caja |
| `/changes` | Comparación de fotografías: altas, bajas y explicación de caja; control histórico opcional de migración |
| `/planning` | Configuración nativa de cobranza y clasificación, decisiones operativas y rescates parciales |
| `/scenarios` | Laboratorio de fechas, importes y exclusiones; escenarios guardados |
| `/accuracy` | Previsiones congeladas frente a saldos BANCO observados posteriormente |
| `/assistant` | Consultas verificables sobre caja, riesgo, cobros, egresos y cambios |
| `/cashflow`, `/banks` | Flujo de caja y posiciones bancarias |
| `/receivables`, `/investments` | CLIENTES y COLOCACIONES de solo lectura |
| `/projections` | MANUAL: tabla, agenda, recurrencias, comentarios y adjuntos |
| `/payments` | Redirección de compatibilidad a Proyecciones |
| `/reconciliation` | Cruce de BASE con cartolas CSV independientes; parcial y agrupado |
| `/reports` | Informe ejecutivo PDF y Excel con contexto y fuentes |
| `/importations` | ERP crudo o CAJA/BASE, cobertura, comparación, confirmación, historial y eliminación |
| `/integrations` | Historial real de Excel, SAP, respaldos/restauraciones y errores de la app |
| `/security` | Autorización de usuarios, capacidades, umbrales y tasas históricas |
| `/settings` | Selector global de BASE, plantilla de lectura Excel, preferencias, catálogo informativo heredado y auditoría |

**Fecha de trabajo** selecciona un lote. También se puede cambiar en **Configuración → BASE de consulta**: ambos controles comparten la misma selección. Pertenece al usuario en ese navegador y no altera la consulta de otro usuario. **Última BASE disponible** sigue el lote más reciente; elegir una versión concreta conserva esa consulta al navegar y recargar. El encabezado muestra por separado el corte de los datos, el archivo y el momento de carga en horario de Chile. Cargar el 22 un Excel cuyo corte es el 18 no cambia el corte al 22.

Resumen y Flujo de caja comparten sus filtros de partidas, banco y horizonte. Hoy, Informes y Asistente comparten sus propios filtros de moneda original y horizonte; el laboratorio conserva su contexto. Para comparar módulos hay que igualar esos filtros, además de la BASE.

La búsqueda global (botón de lupa o Ctrl/⌘ K) recorre documentos, clientes, bancos y MANUAL de la BASE seleccionada. Cada resultado abre su origen. Las tablas permiten densidad compacta/cómoda y ocultar columnas; conservan esas preferencias en ese navegador. Los módulos nuevos son adaptables a móvil.

## 6. Importación de Excel

### ERP crudo: operación

1. Selecciona ERP.xlsm con las hojas **BANCOS, CLIENTES y COLOCACIONES**. El perfil valida los encabezados conocidos y acepta columnas reordenadas. Un libro con BASE utiliza el perfil CAJA; no se mezclan ambos contratos.
2. Declara empresa, moneda local, fecha de corte e inicio de **cada** mayor. Con SALDOS BANCOS, el inicio bancario es el primer día del mes del corte y la apertura es el cierre del mes anterior. El mayor de inversiones conserva su propio período. La última transacción no acredita la fecha de extracción. Véase el contrato mensual vigente en la sección 37.
3. Pulsa **Aplicar cobertura y comparar**. Revisa coordenadas hoja/fila, aperturas, movimientos, monedas ausentes y cambios. Modificar el contexto exige comparar otra vez.
4. Confirma el conjunto completo. Una inconsistencia de estructura, fecha, importe o saldo acumulado impide reemplazar los datos aceptados.
5. Abre **Planificación y reglas** para gestionar cobros, clasificaciones y rescates. Los movimientos adicionales siguen en **Proyecciones**.

El perfil actual corresponde a exportaciones en **una moneda local declarada**, con cabeceras Activos por cuenta bancaria. Para inversiones admite una apertura OB explícita o una apertura calculada a partir del saldo acumulado y el primer movimiento de cada cuenta. El cálculo se muestra separado de las filas originales y se valida también en SQL. No suma CLP y USD como si fueran una moneda; importes ME requieren un contrato adicional. Las cuentas o monedas ausentes quedan fuera de la fotografía, sin acreditar saldo cero. El aviso de cobertura acompaña las vistas financieras.

### CAJA / BASE: operación heredada

1. Ingresa con rol Tesorería o Administrador y abre Importaciones.
2. Selecciona o arrastra un solo `.xlsx`, `.xlsm` o `.xls`.
3. Define **Fecha de corte** en la vista previa y pulsa **Aplicar fecha de corte** si la cambias o AE7 contiene una fórmula/error. Revisa los importes por origen y moneda, las filas y los cambios. **Usar última fecha BANCO** rellena una propuesta que debes aplicar; no cambia fechas de movimientos.
4. Decide explícitamente los reemplazos de MANUAL que afecten trabajo ya editado en la plataforma.
5. Confirma y espera el resultado del servidor. Consulta el lote y su detalle.

Límites actuales: archivo de **20 MiB**, **20.000 registros financieros** y validación adicional del JSON en servidor de **25.000.000 bytes**. Las filas vacías de plantilla no cuentan como registros financieros. El análisis del worker tiene un límite de dos minutos; las operaciones SQL de importación declaran un límite de 55 segundos.

Ambos lectores ignoran dimensiones exageradas por formato vacío y preservan coordenadas reales. CAJA carga una sola hoja BASE; ERP requiere las tres hojas de su perfil. No se leen macros ni hojas auxiliares para completar automáticamente datos ausentes.

### Columnas del formato heredado SONACOL BASE

La **plantilla de lectura SONACOL BASE v1** se consulta en **Configuración → Plantilla de lectura Excel → Ver columnas y reglas de lectura**. El lector y esa pantalla comparten el contrato `src/import-engine/base-profile.ts`: hoja, columnas, encabezados, variantes admitidas y celda de corte. Es un perfil de lectura integrado en la aplicación; no hay que descargar, rellenar ni modificar una plantilla Excel.

Se esperan los encabezados en sus columnas originales, tolerando diferencias de acentos, espacios y puntuación. Se reconocen variantes explícitas, como TABLA DE ORIGEN y COMPROBANTE. La fila habitual de encabezados es la **8**, pero se detecta si cambia de posición; los movimientos se leen después. **No hay una última fila fija**, tampoco la 5765: se conservan movimientos después de espacios vacíos hasta el límite de registros financieros. No es un mapeador libre para cualquier estructura contable.

| Columna | Contenido usado |
| --- | --- |
| A | `TABLA ORIGEN`: clasificación BANCO, CLIENTES, COLOCACIONES o MANUAL |
| B | Empresa |
| D | FECHA del movimiento, emisión o inicio |
| E / F | Código y descripción de cuenta |
| G / H / I | Comprobante, RUT y razón social |
| J / K / L | Tipo de documento, número y glosa |
| M | VCTO REAL: vencimiento original |
| N / O | VCTO y AJ VCTO: planificación y ajuste |
| P / Q / R | DEBE, HABER y REAL |
| S / T / U | Estado, cuenta informe y operación |

Son obligatorios los encabezados A, D, E, P, Q y R para identificar la tabla. Los demás encabezados usados se validan cuando existen; su ausencia se muestra en la vista previa y sigue aplicándose la validación de datos de cada movimiento. Una columna desplazada, un encabezado incompatible, dos filas completas de encabezados o más de una columna MONEDA detienen la lectura con un mensaje concreto. El segundo ESTADO del libro original, situado en X, se permite: el estado usado por el lector sigue siendo S. Las columnas adicionales no mapeadas se conservan en la trazabilidad de las filas leídas.

**El corte se define y revisa al importar.** La vista previa permite editar **Fecha de corte**, muestra la referencia de BASE!AE7, la última FECHA de BANCO y el inicio de proyección (corte + 1 día). Una fecha literal válida en AE7 o, si no existe, la última FECHA de BANCO se propone inicialmente. Si AE7 contiene **cualquier fórmula** —incluido `HOY()`—, un error o una fecha inválida, las filas se pueden revisar pero es obligatorio aplicar una fecha explícita en la plataforma. No hace falta modificar el Excel. La fecha de carga y el nombre del archivo nunca deciden el corte.

Cambiar el campo desactiva la confirmación hasta volver a comparar. Un corte anterior al último movimiento BANCO se rechaza en la importación para evitar excluir movimientos reales silenciosamente; consultar un día anterior requiere seleccionar su versión de BASE. La fecha efectiva se guarda en el lote y en todas sus filas junto con la procedencia del corte y la referencia de AE7. Los importes, fechas originales y claves de los movimientos se conservan. La revisión SQL detecta una fecha cambiada después de comparar.

Repetir los mismos bytes y opciones de fecha reutiliza el lote. Aplicar otra fecha crea otra versión consultable, sin sumarla a la anterior. **No se corrigen cargas anteriores automáticamente:** si una versión quedó con un corte incorrecto, revisa sus cambios MANUAL y el impacto de eliminación antes de retirarla con **Eliminar Excel** y volver a cargar el archivo con el corte correcto. Una versión anterior sigue existiendo hasta que decidas eliminarla. Esta corrección no necesita SQL nuevo.

El control de importes agrupa las filas válidas por BANCO, CLIENTES, COLOCACIONES y MANUAL, separando cada moneda. No suma CLP y USD como si fueran pesos ni presenta los totales de todo el archivo como cobros confirmados del período. Las fechas inválidas o fórmulas sin resultado en N/O (planificación/ajuste), y en M cuando se utiliza para facturas/inversiones, bloquean el registro en vez de sustituirse silenciosamente por otra fecha.

Antes de confirmar se muestran la versión de plantilla, la fila de encabezados, la primera y última fila financiera, las filas sin operación omitidas, la procedencia de moneda y la fecha de corte detectada. Reconocer la estructura no equivale a validar todos los importes: las observaciones por fila y la comparación diaria continúan siendo obligatorias. Un error estructural no sustituye la BASE ya aceptada.

Se usa REAL y se verifica su coincidencia con DEBE menos HABER cuando están disponibles. Los valores originales, fórmulas guardadas, hoja y fila quedan en la trazabilidad. Las fórmulas se leen por su resultado guardado: una fórmula financiera sin resultado se informa; no se inventa su valor ni se consulta otra hoja.

Para MANUAL se prioriza AJ VCTO, luego VCTO y finalmente FECHA. CLIENTES y COLOCACIONES conservan el vencimiento original y las fechas de planificación. En el formato recibido, CTA CTE en AE corresponde a la línea del comprobante; no se interpreta como un número bancario.

### Repetición, errores y compatibilidad

ERP usa una identidad de contenido calculada en SQL: contempla registros repetidos y cobertura declarada, sin depender del nombre del archivo ni del orden de envío de sus registros. Volver a guardar el mismo contenido no duplica el lote. No elimina líneas bancarias iguales: sin identificador inequívoco de línea se conserva su multiplicidad. Las identidades de factura utilizan empresa, código de cliente, tipo, serie, documento ERP y cuota; el folio no se confunde con el documento ERP y el código de cliente no se interpreta como RUT.

Para el perfil CAJA, la identidad de un Excel es SHA-256 de `BASE-DAILY-v7:` + SHA-256 hexadecimal de sus bytes + las opciones serializadas. La corrección de `digest` conserva exactamente esa identidad y la calcula dentro del worker, sin Web Crypto del navegador.

La plantilla SONACOL BASE v1 no modifica esa huella, `BASE_READER_VERSION`, los identificadores de origen ni las reglas de actualización diaria. Su versión describe el contrato de lectura; no crea una nueva identidad de los datos existentes. No requiere SQL ni dependencias nuevas.

Reenviar los mismos bytes y opciones devuelve el lote existente. Si Excel vuelve a guardar el libro y cambia sus bytes internos, puede producir un lote distinto aunque la vista previa encuentre filas sin cambios. Cada lote es una fotografía: sus filas no se suman a las de días anteriores para calcular la caja activa.

La BASE diaria se acepta completa: una fila con error impide sustituir parcialmente la fecha activa. Las advertencias válidas permanecen visibles. Si otra operación modifica los datos después de la comparación, se exige analizar otra vez; no se sobrescriben cambios con una vista previa antigua.

## 7. Trabajo diario e historial

En una importación ERP del mismo corte o posterior, **todos** los movimientos MANUAL se conservan, junto con reglas, ajustes y rescates. Cada nuevo lote recibe una versión de esas decisiones. Editar una versión no modifica una fecha anterior ni una previsión congelada. Importar un archivo histórico no le incorpora decisiones futuras.

En la primera transición CAJA → ERP solo se trasladan fechas de factura de manera automática si folio, cliente, monto, moneda, emisión y vencimiento permiten una correspondencia inequívoca. Los casos inciertos quedan como ajustes pendientes de reasignación. Los tramos de inversión de CAJA se conservan como rescates pendientes de asignar a una posición y una cuenta receptora; no se convierten automáticamente en ingresos. Los vínculos MANUAL existentes requieren revisar su destino si dejó de estar presente.

Las etapas ERP no aplican decisiones de negocio a una nueva importación del formato CAJA. Si se vuelve a ese formato, las decisiones ERP siguen consultables en su lote histórico; continuar la operación migrada requiere mantener ERP como entrada y revisar las correspondencias al volver a cambiar de perfil.

Las reglas siguientes describen el comportamiento heredado de CAJA/BASE:

BANCO, CLIENTES y COLOCACIONES se reemplazan como conjunto del nuevo lote. Los registros ausentes de la nueva BASE dejan de participar en esa fotografía; se conserva su historial. No se deduce que un documento desaparecido esté pagado.

Al avanzar al mismo corte o a uno posterior, MANUAL sigue estas reglas:

- Las filas importadas que no editaste siguen el nuevo Excel.
- Las creaciones, ediciones y eliminaciones realizadas en la plataforma se conservan.
- Un reemplazo del Excel que afectaría una edición tuya requiere selección explícita en la vista previa.
- Si varias filas son indistinguibles y hay ediciones del usuario, se conserva ese grupo y se pide revisión; no se adivinan correspondencias.

La última BASE se ordena por fecha de corte, luego por fecha de aceptación. Para el mismo corte, una entrega nueva aceptada pasa a ser la última. Subir un archivo anterior permite revisarlo, pero no retrocede la fecha más reciente del sistema.

Cada lote tiene su propio MANUAL. Una edición en una fecha histórica afecta solo ese espacio; no modifica retroactivamente otro lote ya guardado. El selector permite volver a cualquier versión disponible, incluso si varias comparten el corte.

Para crear una proyección debe existir primero una BASE. El formulario pide fecha, descripción, monto positivo, moneda, tipo de ingreso/egreso, categoría, banco y estado. Estados permitidos: proyectado, confirmado, borrador y cancelado. El signo se deriva del tipo; no se ingresa un monto negativo para expresar un egreso.

### Eliminar un Excel o empezar sin importaciones

Abre **Importaciones → Eliminar Excel**. El acceso superior lleva a **Administrar archivos Excel**, donde eliges el archivo en **Excel a eliminar** y pulsas **Eliminar archivo**. **Vaciar Excel** revisa el borrado de todos. El selector incluye todos los Excel del historial disponible y muestra su momento de carga; no depende de la paginación, búsqueda o columnas ocultas de la tabla. También se conserva el botón de cada fila del historial como una acción que no se puede ocultar en «Vista de tabla».

Si puedes importar pero no eliminar, la pantalla indica cuando falta el permiso independiente **Eliminar Excel**. Administración lo revisa en **Seguridad y control → Usuarios y permisos → Revisar → Permitir eliminar Excel**. Después pulsa **Actualizar permisos** en Importaciones para volver a consultar tu autorización sin cerrar sesión. La consulta no concede permisos y un administrador sigue necesitando a otro administrador para cambiar los suyos. Las cuentas de solo lectura no reciben controles de eliminación. Esta mejora de acceso no requiere migraciones ni cambia la autorización SQL.

En **Importaciones**, Tesorería y Administrador con segundo factor y permiso de eliminación pueden usar **Eliminar** en la fila de un Excel o **Vaciar Excel** para retirar todas las cargas Excel, incluidas las antiguas. El historial permite consultar todos los lotes disponibles, no solo los 30 más recientes.

Antes de borrar, el diálogo consulta el servidor y muestra archivos, filas, MANUAL y decisiones de negocio afectados, y cuál será la última BASE restante. Debes escribir `ELIMINAR` para un archivo o `VACIAR EXCEL` para todos. Si alguien importa o edita después de esa revisión, la confirmación se rechaza y debes volver a revisar.

El borrado es definitivo y transaccional: elimina el lote, sus filas, sus vínculos y su espacio MANUAL, incluidas las ediciones realizadas en esa fecha. En las versiones antiguas también retira las trazas y entidades financieras atribuibles exclusivamente a esas cargas. Un movimiento antiguo marcado expresamente como Excel sin lote se incluye en el vaciado completo. No se adivina la procedencia de registros sin trazabilidad.

Se conservan usuarios, roles, tasas, catálogos de bancos/cuentas/clientes y auditoría. En cuentas heredadas, si un saldo todavía coincide con la importación retirada, se recupera el último saldo importado restante o se deja en cero; un saldo modificado ajeno a esa carga se conserva. Los envíos SAP no se eliminan con estas acciones.

Una copia MANUAL que ya pertenece a otro lote se conserva en ese lote, aunque proceda de un archivo eliminado. Se retira la referencia a la fila borrada y se identifica el origen como eliminado. El resto de las fotografías independientes mantiene sus propias cifras: eliminar un archivo no significa restar sus importes de todas las cargas posteriores.

Si eliminas la BASE más reciente, las vistas pasan a la anterior disponible. Si no queda ninguna, los indicadores muestran cero y las tablas quedan vacías. El selector descarta una fecha borrada; otras pestañas del mismo navegador se actualizan al recibir el aviso y una ventana que recupera el foco vuelve a consultar. No se promete actualización instantánea en otro dispositivo que permanezca abierto sin recargar.

Puedes reimportar el mismo Excel después de borrarlo: se libera su huella. El archivo original de tu computador no se elimina. Reimportarlo no recupera las ediciones MANUAL que solo existían en el espacio eliminado; para recuperarlas se necesita un respaldo de la base.

### Vaciar los datos actuales

Con las migraciones instaladas, entra en **Importaciones → Vaciar Excel**, revisa el alcance y confirma con `VACIAR EXCEL`. Se requiere acceso aprobado, rol Tesorería/Administrador, segundo factor y permiso explícito de eliminación. Instalar las migraciones de esta entrega no vacía datos.

El diálogo también cuenta escenarios, previsiones congeladas, tareas, comentarios, adjuntos y conciliaciones ligados a los lotes eliminados. Esas dependencias se eliminan con el lote; las cartolas bancarias independientes se conservan. Una nueva edición, tarea o comentario invalida una confirmación antigua. Este repositorio no ha ejecutado un borrado en tu base publicada.

## 8. Cálculos y monedas

### Contrato funcional y aceptación

La especificación visual original describía un MVP con datos ficticios. La operación actual utiliza datos autorizados de BASE; los datos ficticios se reservan para pruebas y demostraciones. La precisión de los cálculos tiene prioridad sobre ampliar el diseño o agregar indicadores. Los módulos son vistas del mismo modelo compuesto. Las hojas de cálculo de CAJA sirven para verificar su funcionalidad, no como requisito del ERP crudo.

| Concepto | Regla operativa |
| --- | --- |
| BASE seleccionada | Una versión completa de datos. La del 22 no se suma a la del 18; la del 18 sigue consultable |
| Corte | Fecha efectiva confirmada para la versión; independiente de la carga y del período de consulta |
| Caja disponible | REAL firmado de BANCO hasta el corte, por moneda. CLIENTES, COLOCACIONES y MANUAL no son efectivo inicial |
| Día sin movimientos | Flujo neto cero; saldo final igual al saldo inicial, no necesariamente cero |
| Saldo proyectado diario | Saldo final anterior + ingresos del día − egresos del día; primer saldo inicial = caja disponible |
| Vencimiento / planificación | M conserva el vencimiento contractual. O, N y luego M/fecha propia resuelven la fecha prevista; no se confunden emisión y cobro |
| CLIENTES / COLOCACIONES | Datos ERP de solo lectura. Cobros/rescates futuros se incorporan una vez y en su fecha prevista |
| MANUAL | Adiciones y ajustes operativos editables. Un reemplazo de cobro/rescate ERP requiere vínculo explícito para evitar doble conteo |
| Conciliación | Comparación con una fuente bancaria independiente. Sin cartola no se declara conciliación real por comparar dos vistas de BASE |
| Intereses / liquidez de inversiones | Un saldo invertido no prueba disponibilidad inmediata. No se inventan tasas, intereses o fecha de rescate |
| Calidad | Rechazar errores financieros, no borrar movimientos solo por tener textos/importes repetidos. Los números de fila sirven para trazabilidad |

**Regla pendiente de aceptación operativa:** el motor vigente mueve pendientes con fecha igual o anterior al corte al primer día proyectado. Es una hipótesis heredada, compartida por las vistas, y no evidencia de cobro/pago mañana. Debe acordarse su sustitución por pendientes sin fecha y reprogramación explícita antes de certificar casos de vencidos. El archivo original con corte 11-09-2026 no tiene pendientes planificados al corte que prueben esa política; no se cambió silenciosamente con esta corrección.

### Fórmulas y presentación

**En ERP, caja disponible = apertura bancaria + cargos − abonos hasta el corte, por moneda y cuenta.** Las aperturas participan en el saldo, pero no en los ingresos y egresos brutos del período. La inversión se obtiene de la apertura y sus movimientos firmados. Si falta OB, apertura = primer saldo acumulado − primer movimiento con signo; esa apertura se suma una vez a los movimientos. Se conserva la coordenada real de referencia y se valida la continuidad de todos los saldos acumulados. No se crea una fila ficticia en el Excel. Una posición de inversión **no es un vencimiento**: no se inventan fecha de rescate, tasa ni interés.

Los rescates programados reservan capital sin disminuir el saldo contable importado. Solo el monto programado participa en el flujo futuro. Ejecutar o cancelar un plan lo retira del flujo y libera su reserva; el movimiento real debe llegar por ERP. No hay conciliación automática de una ejecución. Si un nuevo ERP reduce el capital por debajo de lo reservado, los rescates quedan bloqueados como borradores y se muestra un aviso hasta revisarlos.

Las reglas de cobro desplazan el vencimiento por días naturales y pueden asignar cuenta receptora; las reglas de clasificación aplican categorías por texto de descripción. Se aplican por prioridad ascendente (el mayor número prevalece; empates por identificador estable). Un ajuste explícito tiene prioridad sobre las reglas. Se conserva el vencimiento contractual y cada decisión tiene revisión, autor y auditoría. No se configura automáticamente una política general de cinco días: requiere crear la regla.

La fórmula siguiente corresponde a CAJA/BASE:

**Caja disponible = suma con signo de REAL de las filas BANCO de la BASE seleccionada, hasta el corte.** La apertura ya contenida en esas filas no se añade otra vez. No hay un límite fijo en la fila 5765: se considera el origen y la fecha.

En el XLSM original comprobado se obtuvieron 1.781 registros: 1.720 BANCO, 45 CLIENTES, 6 COLOCACIONES y 10 MANUAL. Su suma literal BANCO es **14.457.712,22**, que sin decimales se muestra **14.457.712**. Es una referencia de ese archivo, no un saldo fijo de la aplicación.

| Presentación | Interpretación |
| --- | --- |
| Literal de BASE · todas las monedas | Suma literal de importes; no es una conversión de monedas |
| Partidas CLP, USD u otra moneda | Selección de partidas de esa moneda |
| Consolidación a CLP en módulos que la usan | Importe multiplicado por la tasa configurada; sin tasa válida se informa el problema |

Una columna MONEDA explícita tiene prioridad. Sin ella, el formato reconoce USD por la descripción de cuenta y trata las demás filas como CLP. No se debe interpretar «Como en BASE» como CLP si hay monedas mezcladas. En el libro original, el subconjunto CLP suma 14.456.115; la diferencia con la suma literal procede de una partida en USD.

**Resumen y Saldo Proyectado Diario comparten una sola serie:** `snapshotProjection` usa exclusivamente el corte de la BASE seleccionada. Los filtros antiguos de `dashboard-v6`, incluido su corte independiente, ya no intervienen. La nueva preferencia `projection-v1` inicia ambas vistas en **partidas CLP, todos los bancos y 30 días**; permite 7, 15 o 30 días. Cambiarla en una vista se conserva al pasar a la otra. El selector de moneda de visualización sigue convirtiendo las partidas CLP con la tasa al corte; seleccionar partidas USD/UF/UTM muestra sus valores originales. El modo literal sigue disponible de forma explícita y nunca se presenta como un saldo CLP.

**Caja prevista al [fecha] = saldo final de ese día en el detalle diario.** Nunca se suman saldos acumulados de distintos días. Al pulsar la tarjeta se muestran saldo inicial del día, ingresos, egresos y cierre, con acceso a los movimientos que componen ese saldo. La apertura de un día posterior incluye los flujos de los días precedentes. El gráfico, sus etiquetas y el detalle usan la misma presentación monetaria. Las agrupaciones semanal y mensual conservan la apertura del primer día y el cierre del último; no cambian el horizonte de la tarjeta. La exportación de Flujo incluye BASE, corte, moneda de cálculo, banco y horizonte, y conserva los importes en la moneda de cálculo.

La proyección comienza **al día siguiente del corte**, no al día siguiente de la carga. Si no existen movimientos futuros, el saldo previsto conserva la caja inicial. La consulta de una BASE del 22 no suma las filas de la del 18: cada lote representa una versión completa. Reimportar los mismos bytes/opciones reutiliza el lote; una corrección aceptada del mismo corte es otra versión consultable, sin acumular ambas en los totales.

La proyección parte de caja e incorpora CLIENTES, vencimientos de COLOCACIONES y MANUAL dentro del horizonte elegido; los módulos de decisión ofrecen 7, 30, 60, 90, 180 o 365 días (motor: 1 a 366). Excluye los estados liquidados, cancelados o borradores según el tipo de registro. Un pendiente con fecha anterior o igual al corte se traslada al primer día proyectado y queda marcado como vencido: es una hipótesis de planificación.

Los cobros ERP representados también en MANUAL se vinculan explícitamente por fecha de trabajo, tipo, importe y moneda para contarlos una sola vez. Dos importes iguales sin vínculo siguen siendo partidas distintas. Si el registro relacionado cambia y deja de ser compatible, se advierte y la proyección vinculada se excluye hasta revisar el vínculo.

Los intereses desconocidos no se inventan. BASE puede generar advertencias en COLOCACIONES si no informa tasa e interés. Las tasas de conversión se registran ahora con vigencia y fuente. La consulta usa la última tasa cuya fecha no supera el corte; una tasa ausente sigue siendo un error explícito. No se inventa una serie histórica al migrar las tasas anteriores: su fecha inicial procede de `updated_at`.

## 9. Base de datos

### Tablas y operaciones actuales

| Objeto | Responsabilidad |
| --- | --- |
| `daily_base_batches` | Archivo, huella única, corte, origen Excel/SAP, autor, estado y recuentos |
| `daily_base_rows` | Filas originales e información normalizada de cada lote; datos ERP inmutables |
| `daily_manual` | Trabajo MANUAL por lote, revisión de edición y marca de eliminación |
| `treasury_business_decisions` | Ajustes, reglas y rescates por lote, identidad estable, revisión y autor |
| `daily_forecast_links` | Relaciones para evitar doble proyección entre MANUAL y ERP |
| `profiles`, `audit_logs`, `fx_rates` | Usuarios/roles, trazabilidad de operaciones y tipos de cambio |
| Tablas anteriores de importación y entidades | Compatibilidad e historial conservado de las versiones previas |

No elimines tablas históricas por su nombre: las migraciones, compatibilidad y pruebas aún pueden depender de ellas.

| RPC | Uso |
| --- | --- |
| `compare_erp_import`, `import_erp_daily` | Comparación y guardado atómico del perfil ERP crudo |
| `treasury_save_business` | Guardar, reasignar o retirar decisiones con permisos, MFA, revisión y auditoría |
| `compare_daily_base` | Validar y comparar la BASE propuesta; devuelve revisión y cambios |
| `import_daily_base` | Guardar Excel completo, preservando MANUAL según selección |
| `get_daily_base_snapshot` | Componer ERP, MANUAL, ajustes, reglas y rescates; conserva originales y contexto de negocio |
| `save_daily_manual` | Crear, editar o eliminar MANUAL con revisión y auditoría |
| `link_daily_forecast` | Crear o retirar la relación MANUAL/ERP |
| `get_daily_import_status` | Métricas e historial de las entregas guardadas |
| `excel_deletion_plan` | Alcance y revisión previa para eliminar uno o todos los Excel |
| `delete_excel_imports` | Borrado transaccional de Excel y dependencias; registra auditoría |
| `import_sap_daily` | Guardado de una entrega ERP desde servidor; reservado a `service_role` |

Las importaciones y las modificaciones MANUAL usan transacciones y control de revisión. Las escrituras directas a las tablas protegidas y las rutas antiguas de importación se retiran para los usuarios autenticados.

### Migraciones conservadas

**Los SQL de `supabase/migrations/` son código del backend. Se conservan todos.** Los tres SQL auxiliares retirados de la raíz eran copias para pegar en el SQL Editor, no una fuente adicional de lógica.

| Archivo o grupo en `supabase/migrations/` | Propósito |
| --- | --- |
| `20260913024822000_schema_v1.sql` | Esquema original, roles, entidades y parámetros |
| `20260913062654000_data_platform_v2.sql` | Importaciones, fuentes e historial |
| `20260913064051000_cleanup_demo.sql` | Limpieza histórica de demostración |
| `20260913072239000_cleanup_test.sql` | Limpieza histórica de pruebas |
| `20260913072354000_cleanup_test.sql` | Limpieza histórica de pruebas |
| `20260913072423000_cleanup_test.sql` | Limpieza histórica de pruebas |
| `20260913074601000_cleanup_test.sql` | Limpieza histórica de pruebas |
| `20260914000000000_import_integrity.sql` | Integridad de importación y protección de roles |
| `20260914010000000_sonacol_workbook.sql` | Compatibilidad con el formato SONACOL |
| `20260914020000000_base_only_import.sql` | Importación exclusiva de BASE |
| `20260914030000000_base_treasury_v6.sql` | Comparación, identidad y trazabilidad v6 |
| `20260917000000000_daily_base_v7.sql` | Lotes diarios, MANUAL aislado, permisos y migración del historial |
| `20260917010000000_sap_daily_receiver.sql` | RPC SAP de servidor y estado de importaciones |
| `20260918000000000_delete_excel_imports.sql` | Eliminación de Excel, control de revisión y limpieza de dependencias |
| Cuatro migraciones `20260919...` | Admisión, decisiones, conciliación y operaciones; orden exacto en sección 18 |
| `20260926000000000_erp_raw_import.sql` | Coordenadas por hoja, contrato crudo, importación idempotente y conservación de MANUAL |
| `20260926010000000_business_planning.sql` | Decisiones versionadas, reglas, posiciones, rescates y composición de consultas |
| `20260926020000000_erp_investment_opening.sql` | Apertura de inversión calculada cuando falta OB; validación de acumulados por cuenta y trazabilidad |
| `20260926030000000_caja_business_migration.sql` | Evidencia CAJA conservada, correspondencias con vínculos MANUAL y adopción revisada de reglas de cobranza |
| `20260926040000000_erp_native_operations.sql` | Reglas propias SONACOL desde ERP, clasificación completa y activación para instalaciones existentes |
| `20260926050000000_erp_report_sheet_names.sql` | Identidad de reportes ERP independiente del nombre de pestaña; conserva nombres y coordenadas originales |
| `20260927000000000_erp_bank_balances.sql` | Aperturas desde SALDOS BANCOS, vínculo por cuenta/período y control independiente inicial + Cargo − Abono |

**La limpieza de archivos de documentación no requiere ejecutar SQL.** La opción Eliminar Excel sí requiere la migración del 18 de septiembre si todavía no está aplicada. No repitas migraciones ya instaladas. Algunas crean objetos una sola vez y los archivos `cleanup_*` contienen borrados: conservarlos no significa volver a ejecutarlos sobre datos reales.

Para comprobar v7 sin escribir datos, ejecuta en el SQL Editor del proyecto correcto:

```sql
select
  to_regclass('public.daily_base_batches') as lotes,
  to_regclass('public.daily_base_rows') as filas,
  to_regclass('public.daily_manual') as manual,
  to_regprocedure('public.compare_daily_base(jsonb)') as comparar,
  to_regprocedure('public.import_daily_base(text,text,jsonb,text,integer[])') as importar,
  to_regprocedure('public.get_daily_base_snapshot(uuid)') as consultar,
  to_regprocedure('public.save_daily_manual(uuid,uuid,integer,jsonb,boolean)') as editar_manual,
  to_regprocedure('public.get_daily_import_status()') as estado;
```

Un resultado NULL indica que falta ese objeto o no estás consultando el proyecto esperado. La existencia de objetos no sustituye una prueba de permisos y funcionamiento.

Si actualizas una instalación que sigue en v6, aplica **una sola vez**, en este orden, las dos migraciones `202609170...` después de sus dependencias. Con SQL Editor pueden copiarse juntas, dentro de `BEGIN;` y `COMMIT;`, como hacía el archivo auxiliar. Con Supabase CLI utiliza el registro de migraciones de ese entorno. No combines ambos mecanismos para repetir la misma actualización. Después publica el frontend compatible.

Si las funciones existen pero la API conserva un esquema antiguo, se puede solicitar su recarga:

```sql
notify pgrst, 'reload schema';
```

Para una base nueva, prepara primero un entorno aislado y revisa la secuencia completa: los SQL originales mezclan estructura, datos iniciales y limpiezas. Las pruebas con PGlite documentan dependencias, pero no aprovisionan Supabase Auth ni despliegan Edge Functions. No hay un comando de reset productivo incluido en este manual.

## 10. Usuarios y permisos

La autorización se comprueba en PostgreSQL, además de ocultar acciones en la interfaz. Las cuentas nuevas quedan **pendientes**; iniciar sesión no concede acceso financiero. La migración mantiene aprobados los administradores, tesoreros y contadores ya existentes; las cuentas Consulta necesitan aprobación.

| Rol aprobado | Lectura | Cambios financieros | Administración |
| --- | --- | --- | --- |
| Administrador | Sí | Con MFA `aal2` | Accesos, umbrales y tasas, con MFA |
| Tesorería | Sí | MANUAL, importaciones, escenarios, tareas y conciliación, con MFA | No cambia permisos ni tasas |
| Contabilidad | Sí | No | No |
| Consulta | Sí | No | No |

Exportar informes/adjuntos y eliminar Excel son **capacidades independientes**. Eliminar exige además un rol de escritura y MFA. La migración concede exportación a los roles previamente aprobados y eliminación solo a administradores; un administrador puede revisar cada autorización. No puedes cambiar tus propios permisos ni promoverte de rol.

Para ingresar con rol de escritura: abre la app, pulsa **Configurar segundo factor**, escanea el QR en tu autenticador e introduce sus seis dígitos. En sesiones posteriores se solicita un código válido. TI debe habilitar TOTP en Supabase Auth. No se intenta simular o desactivar MFA cuando el servicio no está configurado.

La auditoría toma el UUID real de la sesión; no acepta registros inventados por el navegador. Para acciones nuevas guarda contexto y revisiones. Los registros históricos sin UUID previo no se atribuyen retroactivamente a una persona.

El permiso de exportación controla las descargas ofrecidas por la aplicación y el acceso a adjuntos. Un usuario autorizado a leer datos podría copiarlos: no es un sistema DRM. La telemetría registra solo códigos permitidos y rutas sin parámetros, con límite por usuario; no envía importes, tokens ni mensajes completos a servicios externos.

### Primer administrador o recuperación

Si no existe un administrador aprobado, el responsable del proyecto Supabase debe verificar la identidad en **Authentication → Users**, tomar el UUID correcto y realizar el alta administrativa desde SQL Editor. No habilites autopromoción en el frontend.

```sql
-- Sustituir el UUID por el usuario verificado; ejecutar como propietario de la DB.
begin;
update public.profiles set role='administrador'
where id='UUID-VERIFICADO'::uuid;
update public.treasury_access
set status='approved',can_export=true,can_delete=true,updated_at=clock_timestamp()
where user_id='UUID-VERIFICADO'::uuid;
commit;
```

La pérdida del autenticador se resuelve verificando identidad y gestionando el factor en Supabase Auth. Una sesión sin segundo factor no puede quitar esta protección mediante las operaciones de la plataforma.

## 11. Integración SAP

### Estado

Se incluyen **receptor y extractor programable**. La conexión real no está activada: TI debe definir las vistas de SAP Business One (SQL Server/HANA), credenciales, permisos de solo lectura, conectividad y corte. No se presupone la estructura contable de la empresa.

### Contrato de entrega

Enviar por POST un JSON con:

| Campo superior | Regla |
| --- | --- |
| `cutoff` | Fecha calendario válida `AAAA-MM-DD` |
| `sources` | Exactamente las claves BANCO, CLIENTES y COLOCACIONES, cada una con un arreglo |
| `counts` | Recuento de las tres fuentes; debe coincidir con cada arreglo |

BANCO debe incluir el conjunto completo que produce el saldo al corte y no puede estar vacío. CLIENTES y COLOCACIONES pueden enviar `[]` con total 0 si realmente no tienen registros. Un fallo de extracción no se transforma en una fuente vacía. MANUAL no se admite en la entrega SAP. Límite de 20.000 filas y 25.000.000 bytes en el receptor.

| Campo de un registro | Uso |
| --- | --- |
| `sourceId` | Identificador estable, único dentro de su origen |
| `company`, `ledgerCode`, `voucher`, `document` | Empresa, cuenta, comprobante y documento |
| `amount`, `currency`, `type` | Importe positivo; CLP, USD, UF o UTM; income o expense |
| `description`, `bank`, `category`, `status` | Descripción, banco, categoría y estado compatibles con la operación |
| `date` | Fecha de BANCO |
| `customer`, `rut`, `issueDate`, `dueDate` | Identidad y fechas de CLIENTES |
| `startDate`, `endDate`, `investmentType` | Fechas y tipo de COLOCACIONES: colocacion o fondo_mutuo |
| `rateKnown`, `rate`, `interest` | Tasa/interés; si se desconocen, false y valores nulos |
| `reportDate`, `adjustedDate`, `settlementBank` | Planificación opcional y banco de recepción |

El contrato se implementa en `supabase/functions/_shared/sap-contract.ts`; la validación financiera final está en SQL. Las tres fuentes se aceptan juntas y SAP conserva MANUAL. La respuesta confirmada incluye ID de lote, estado, corte y cantidad. Reenviar exactamente el mismo contenido normalizado es idempotente; reordenar la entrega puede cambiar su huella.

### Activación con TI

1. Verificar las migraciones y el proyecto Supabase de destino.
2. Crear y aprobar explícitamente el usuario de servicio de auditoría con rol Tesorería; guardar su UUID como secreto `SAP_SYNC_USER_ID`. La entrega `service_role` omite únicamente MFA, nunca la autorización del actor.
3. Generar un token de al menos 32 caracteres y guardarlo como `SAP_IMPORT_TOKEN` en el servidor y en el exportador autorizado.
4. Desplegar `supabase/functions/sap-import` con la CLI ya configurada para ese entorno:

```bash
supabase functions deploy sap-import --project-ref TU_PROYECTO_REAL
```

5. Configurar POST HTTPS a `https://TU_PROYECTO_REAL.supabase.co/functions/v1/sap-import`, con `Content-Type: application/json` y cabecera secreta `x-sap-token`.
6. Comprobar totales, corte, monedas e integridad de MANUAL con una entrega controlada. Luego programar y monitorizar el envío diario.

`verify_jwt = false` corresponde exclusivamente a esta función porque valida `x-sap-token`. `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son variables de servidor; no se entregan al navegador ni al exportador. El exportador usa su token propio.

Si una petición agota el tiempo o pierde la conexión, revisa el historial antes de reenviar: no recibir respuesta no prueba que el servidor haya revertido. Excel permanece disponible; para un mismo corte, la última entrega Excel/SAP aceptada determina la versión más reciente.

## 12. Publicación

```bash
npx --yes pnpm@11.19.0 install --frozen-lockfile
npx --yes pnpm@11.19.0 check
npx --yes pnpm@11.19.0 build
```

Publica `dist/` mediante el proveedor actual, con HTTPS, las variables correctas al compilar y redirección de rutas de la SPA a `index.html`. Los archivos reales de `assets/`, incluido el worker, deben servirse como archivos y no reemplazarse por HTML. Comprueba directamente una ruta como `/importations`.

Si la actualización incluye nuevas migraciones, aplícalas en el entorno correcto antes de publicar el frontend dependiente. Desplegar frontend no despliega automáticamente SQL ni Edge Functions. Esta ampliación requiere instalar las dependencias del lockfile y las cuatro migraciones de la sección 18.

Después de publicar, recarga con Cmd+Shift+R, comprueba la importación y revisa la fecha seleccionada. `pnpm preview` es una comprobación local, no una publicación.

## 13. Pruebas y evidencia

Las comprobaciones se ejecutan **localmente**. Por solicitud del propietario, `.github/workflows/base-treasury-check.yml` tiene únicamente `workflow_dispatch`: no se ejecuta por push ni por PR. No se necesita contratar GitHub Actions ni ejecutar ese workflow para trabajar con esta versión.

```bash
npx --yes pnpm@11.19.0 install --frozen-lockfile
npx --yes pnpm@11.19.0 check
npx --yes pnpm@11.19.0 test:security
npx --yes pnpm@11.19.0 build
npx --yes pnpm@11.19.0 exec playwright install chromium
TEST_PREVIEW=1 npx --yes pnpm@11.19.0 test:e2e
```

Las pruebas SQL usan PostgreSQL aislado en PGlite. El navegador intercepta la API del host Supabase original y usa fixtures/PGlite: no importa ni borra datos de producción. No cambies sus destinos por credenciales reales sin adaptar el aislamiento.

**Entrega ERP y planificación (26/09/2026):** 180 pruebas de lógica/SQL aprobadas; TypeScript correcto; ESLint sin errores (cinco advertencias heredadas); control estático y build de producción correctos. Tres pruebas de navegador sobre ese build cubren importación ERP, ajuste de cobranza, rescate parcial, presentación móvil y regresión de corte/guardado CAJA. Las pruebas nuevas también cubren capital insuficiente después de reimportar, concurrencia, conservación de decisiones, previsiones congeladas e importaciones históricas.

Se verificaron localmente los archivos reales recibidos: los ocho saldos bancarios CLP coinciden entre ERP y CAJA al mismo corte analítico. Una prueba de transición con corte declarado exclusivamente para ese ensayo conservó los 43 movimientos MANUAL; recuperó 60 correspondencias de factura y dejó diez ajustes y ocho rescates pendientes de asignación. Este ensayo no certifica la fecha de extracción ERP ni equivalencia completa de las proyecciones. No se modificaron los archivos originales, no se aplicó SQL productivo y no se ejecutaron jobs de GitHub.

La evidencia siguiente corresponde a versiones anteriores:

- **Evidencia de la versión anterior (23/09/2026): 163 pruebas de lógica, SQL y operaciones aprobadas**: incluye fecha de corte explícita, bloqueo de fechas de planificación inválidas, importes separados por moneda, repetición sin duplicación e historia inmutable, además de BASE, día siguiente, MANUAL, borrados, MFA, admisión, previsiones, escenarios, recurrencias, conciliación, tasas históricas, identidad SAP, paginación incompleta y protección de respaldos.
- TypeScript y compilación de producción correctos; ESLint sin errores, con cinco advertencias heredadas de Fast Refresh.
- **15 pruebas de navegador aprobadas al incorporar el perfil de lectura** sobre el build de producción: plantilla en Configuración/vista previa, estructura rechazada sin sustituir BASE, dos Excel, MANUAL, historial, borrado, conciliación, coherencia de Resumen, móvil y rutas. Las pruebas específicas de decisiones/exportaciones se aprobaron en la entrega previa y no se repitieron para ese cambio del lector.
- **Corrección del acceso a eliminar Excel (23/09/2026):** se repitieron `check` (154 pruebas, TypeScript y ESLint sin errores) y `build`; pasaron seis pruebas de navegador sobre producción (`daily.spec.ts` y `excel-management.spec.ts`). Cubren el selector móvil, columnas ocultas, cancelar/confirmar, recuperación de la BASE anterior, recálculo de caja, vaciado y reimportación, bloqueo de cuentas sin permiso y actualización del permiso concedido por otro administrador. No requieren ejecutar jobs en GitHub ni modificar la base productiva.
- **Conciliación funcional del original (23/09/2026):** se leyó BASE sin modificar el XLSM y se aplicó corte explícito 11-09-2026. En CLP se compararon los once saldos guardados de `PROYECTADO DIARIO $!C29:M29` (del 11 al 30 de septiembre) con la serie del motor: once coincidencias exactas. La otra hoja se consultó solo para esta auditoría local; esa versión importaba exclusivamente BASE. AE7 contiene `TODAY()` con resultado guardado 12-09-2026, por lo que no certifica la fecha contable. Esta evidencia corresponde al archivo recibido y no certifica archivos posteriores ni conciliación bancaria independiente.
- **Fecha de corte editable (23/09/2026):** `check` pasó con 163 pruebas y `build` terminó correctamente. Pasaron once pruebas de navegador sobre el build de producción (`import-cutoff`, `daily`, `projection`, `reading-profile` y `excel-management`): fecha explícita, fórmulas/errores en AE7, cambio de fecha antes de confirmar, rechazo de N inválida, segunda carga, repetición, historial, MANUAL, recálculo, eliminación, roles y coherencia entre Resumen y Flujo. Toda la verificación fue local; no se ejecutaron jobs de GitHub ni SQL productivo.
- El **XLSM original recibido** se volvió a comprobar: 1.781 registros, cero errores de filas y siete advertencias ya existentes. El archivo no se modificó. Encabezados en fila 8 y movimientos entre filas 9 y 6078. La nueva importación exige confirmar el corte porque AE7 contiene una fórmula; las filas conservan ahora ese contexto de elección. No se ha recibido ni probado el archivo real del 22; los casos 17/18/22 son sintéticos.
- No se ejecutaron conexiones reales a SAP/OpenAI ni respaldos/restauraciones productivos. Las pruebas de sus contratos y controles no sustituyen la aceptación con TI.

Para revisar localmente el Excel de referencia, sin modificarlo:

```bash
node --import tsx tests/verify-original-base.mjs "/ruta/al/archivo.xlsm" 14457712.22
```

Ese esperado corresponde solo al libro original recibido. Para otro libro proporciona su esperado o elimina el segundo argumento. No subas libros financieros ni trazas con información privada a GitHub.

## 14. Solución de problemas

| Síntoma | Qué comprobar |
| --- | --- |
| `Cannot read properties of undefined (reading 'digest')` | Publicar la corrección SHA-256 y recargar; `file-hash.ts` debe estar incluido en el worker |
| Error antiguo «excede el área de lectura» por formato vacío | Revisar versión desplegada y lectura exclusiva BASE; no recortar el libro para corregir dimensiones de formato |
| Falta BASE o un encabezado ERP | Verificar el perfil: CAJA requiere BASE; ERP requiere BANCOS, CLIENTES y COLOCACIONES con los encabezados del contrato |
| ERP no permite confirmar | Declarar corte y ambos períodos, aplicar cobertura y corregir todas las filas con error |
| Rescate fuera de cobertura o superior al capital | Revisar la posición y la cuenta receptora; actualizar estado de planes ejecutados o reasignar sin alterar el original ERP |
| «La plantilla espera…» o «encabezados esperados» | Comparar la celda indicada con Configuración → Plantilla de lectura Excel; un cambio real de formato necesita revisar el perfil, no reasignar columnas por suposición |
| AE7 contiene una fórmula/error o falta definir el corte | En la vista previa, indicar Fecha de corte y pulsar Aplicar fecha de corte. No es necesario editar el libro |
| El corte es anterior al último movimiento BANCO | Usar el corte correspondiente a esos datos; para consultar un día anterior, seleccionar su BASE histórica |
| Fórmula sin resultado guardado | Revisar la celda indicada: el lector no ejecuta el cálculo de Excel ni macros |
| Faltan funciones, `PGRST202`, `42883` o `42P01` | Revisar la sección Base de datos, proyecto de conexión y migraciones pendientes |
| «Los datos cambiaron desde la vista previa» | Volver a analizar para obtener una revisión actual antes de confirmar |
| Segundo archivo no refleja cambios | Confirmar el lote, revisar el corte y seleccionar su fecha; mismos bytes/opciones reutilizan el lote existente |
| «Success» histórico pero sin cifras verificables | Revisar lotes y filas reales; los mensajes de integraciones antiguas no acreditan guardado |
| Conciliación sin diferencia bancaria | Falta la cartola independiente; revisar primero las posiciones BANCO del lote seleccionado |
| No aparecen botones de edición | Revisar rol; ERP es de solo lectura para todos y MANUAL exige Tesorería/Administrador |
| Puedo importar pero falta eliminar Excel | Ir a Importaciones → Eliminar Excel; revisar el permiso independiente en Seguridad y control y pulsar Actualizar permisos después de su habilitación. Ocultar columnas ya no oculta las acciones de borrado |
| Tasa de cambio ausente | Configurar una tasa válida; no reemplazarla silenciosamente por 1 |
| Worker no arranca o devuelve HTML | Revisar acceso y tipo de contenido de los assets publicados y reglas de rutas |
| Error de red o tiempo al guardar | Consultar historial antes de reenviar; conservar la vista previa cuando esté disponible |
| `git apply` indica que un parche no corresponde | No forzarlo: comparar la versión de partida y los cambios locales |

Para informar un error, incluye mensaje completo, ruta de pantalla, versión desplegada, corte seleccionado, tipo/tamaño del archivo y si ocurre al analizar o al confirmar. Comparte una muestra anonimizada cuando sea posible; no incluyas tokens, contraseñas ni claves privadas.

## 15. Mapa del código y mantenimiento

| Ubicación | Responsabilidad |
| --- | --- |
| `src/main.tsx`, `src/App.tsx`, `src/router.tsx` | Entrada, proveedores y rutas |
| `src/layouts/` | Navegación, cabecera y estructura adaptable |
| `src/components/treasury/` | Tablas, indicadores, desglose de origen y selector de fecha |
| `src/components/ui/` | Componentes compartidos Radix/shadcn |
| `src/pages/` | Pantallas; `importations/`, `projections/` y `dashboard/` agrupan lógica específica |
| `src/pages/importations/DeleteImportsDialog.tsx` | Revisión del alcance y confirmación del borrado de Excel |
| `src/import-engine/` | Lectores CAJA/BASE y ERP crudo, normalización, validación, contratos y huella |
| `src/pages/planning/`, `src/services/planningService.ts` | Gestión de reglas, ajustes y rescates sobre datos crudos |
| `src/import-engine/base-profile.ts` | Contrato único de columnas, encabezados, variantes y celda de corte; compartido con Configuración y vista previa |
| `src/workers/xlsx.worker.ts` | Análisis y SHA-256 fuera del hilo principal |
| `src/services/importService.ts` | Ciclo del worker, comparación, confirmación y errores |
| `src/services/baseTreasuryService.ts` | Lectura de lotes, trazas y vínculos |
| `src/pages/planning/`, `src/services/planningService.ts` | Decisiones operativas, evidencia de origen y adopción revisada de políticas |
| `src/financial-engine/migration-comparison.ts` | Comparación diaria al mismo corte y moneda, cobertura y diferencias por movimiento |
| `src/services/workingDate.ts` | Selección de lote por usuario en el navegador |
| `src/services/dataService.ts` | Acceso a datos de los módulos |
| `src/services/erp/erp-connector.ts` | Interfaz conceptual de capacidades ERP pendientes |
| `src/financial-engine/` | Caja, previsiones, fechas, monedas y formatos |
| `src/contexts/`, `src/hooks/` | Sesión, presentación monetaria, preferencias y carga de datos |
| `src/integrations/supabase/` | Cliente y tipos del backend |
| `src/lib/` | Utilidades y exportación |
| `src/i18n/`, `public/locales/`, `i18n.config.json` | Idiomas, recursos y manifiesto de traducción |
| `supabase/migrations/`, `supabase/functions/` | Evolución SQL y funciones de servidor |
| `tests/`, `tests/browser/` | Regresiones de importación, finanzas, roles, SQL y navegador |
| `tests/delete-excel.test.ts` | Eliminación, vaciado, dependencias históricas, permisos y reversión transaccional |
| `vendor/` | Distribución local de SheetJS requerida por la instalación |
| `docs/screenshots/` | Capturas de referencia; pueden regenerarse con pruebas |
| `.github/workflows/` | Comprobaciones de integración continua |

Conserva también los archivos de configuración de Vite, TypeScript, Tailwind, PostCSS, ESLint, Playwright, pnpm y componentes. No son residuos de entregas.

Reglas para cambios futuros:

- Actualizar **este README** al añadir o retirar módulos, modificar reglas financieras o cambiar la forma de desplegar. Sustituye la guía de código separada.
- Mantener las pantallas organizadas por función, componentes pequeños y lógica financiera fuera de JSX. Las rutas se registran en `src/router.tsx`.
- Mantener normalización y validación de Excel en el motor compartido. Evitar introducir lecturas de hojas adicionales.
- Los hooks deben tener una responsabilidad concreta; utilidades reutilizables van en `src/lib/` o en el motor correspondiente.
- Para idiomas, editar `i18n.config.json` y `public/locales/{codigo}.json`; acceder al manifiesto mediante `src/i18n/util.ts` y usar `useTranslation` de react-i18next.
- No editar migraciones ya aplicadas para introducir cambios nuevos: agregar una migración posterior y probar actualización desde la versión anterior.
- Conservar dependencias fijadas y su lockfile; ejecutar comprobaciones proporcionales al cambio antes de entregar.
- No adjuntar datos financieros reales, resultados con credenciales ni libros privados al repositorio.

## 16. Limpieza y recuperación

Este README es el documento mantenido. Las antiguas guías `ACTUALIZACION.md`, `AUDITORIA.md`, `PASOS.md`, `PATCH_*`, los SQL `ACTUALIZAR_*.sql` de la raíz y parches ya aplicados dejaron de ser instrucciones vigentes. No vuelvas a aplicar paquetes de limpieza o parches de entregas anteriores sobre esta rama.

Se conservan todas las migraciones reales, el lockfile, `vendor/` y configuraciones del proyecto. No elimines SQL de `supabase/migrations/`. Las carpetas `node_modules`, `dist`, `test-results` y `playwright-report` son regenerables y quedan fuera de Git; las capturas de referencia no contienen Excel privados.

Git permite recuperar código; no respalda los datos de Supabase. Consulta el procedimiento de respaldo/restauración más abajo. Eliminar un Excel desde la app requiere una revisión nueva y confirmación; recuperar sus ediciones MANUAL eliminadas requiere respaldo de datos.

## 17. Estado y pendientes

| Estado | Alcance |
| --- | --- |
| Implementado | ERP crudo de tres hojas y CAJA/BASE, historial, originales de solo lectura, MANUAL y decisiones versionadas |
| Implementado | Fechas previstas de cobro, clasificación, posiciones de inversión y reservas para rescates parciales |
| Pendiente de instalación | Aplicar las migraciones pendientes del 26/09 en el entorno destino y validar la operación desde ERP |
| Implementado, segunda etapa | Origen CAJA conservado, revisión de correspondencias, adopción de cobranza con excepciones y comparación diaria |
| Operación nativa | Importar ERP en una instalación vacía activa reglas iniciales propias; el usuario mantiene sus decisiones en la plataforma |
| Migración progresiva | Incorporar otras reglas de negocio verificadas como lógica/configuración de plataforma; no como nuevos requisitos del Excel de entrada |
| Implementado | Plantilla de lectura SONACOL BASE v1 visible en Configuración y vista previa; validación de estructura con filas variables |
| Implementado | Hoy, tareas, diferencias, escenarios aislados, previsiones congeladas y precisión observada |
| Implementado | Agenda semanal/mensual, recurrencias, excepciones, comentarios y adjuntos |
| Implementado | Cartola CSV, coincidencias revisadas, conciliación parcial/agrupada y reversa |
| Implementado | Informes PDF/Excel, búsqueda, preferencias de tabla y diseño adaptable |
| Implementado | Aprobación de cuentas, MFA para escritura, capacidades y auditoría confiable |
| Implementado | Asistente determinista con fuentes; interpretación externa opcional y limitada |
| Preparado para TI | Extracción/scheduler SAP, Edge Functions y monitoreo; falta conexión real |
| Preparado para TI | Scripts de respaldo y restauración; falta configurar y comprobar infraestructura |
| No incluido | Archivo binario original del Excel en Storage, modo offline completo, multiempresa, traducción completa, pagos bancarios ejecutables o aprendizaje automático predictivo |

La primera etapa está preparada en `feat/erp-business-layers`, sobre el repositorio `Ignvco/sonacol-treasury`, con la corrección posterior `fix/erp-investment-opening`. A diferencia del perfil BASE del 23/09, **requiere migraciones SQL**: las dos iniciales de ERP y la corrección adicional de aperturas. La sección 25 detalla su activación. GitHub Actions permanece exclusivamente manual: no se ejecutan jobs como parte de esta entrega.

Si vienes de `fix/base-diaria`, instala primero las dependencias de la plataforma de decisiones descritas en la sección siguiente. Las secciones históricas conservan el contexto de las entregas anteriores.

## 18. Actualizar desde fix/base-diaria

### 1. Obtener el código

Desde la carpeta de tu proyecto, revisa `git status`. Conserva tus cambios locales antes de cambiar de rama; no uses reset ni fuerces parches sobre una versión distinta.

```bash
cd "$HOME/Documents/Developer/sonacol-treasury"
git status
git fetch origin
git switch feat/treasury-decision-platform
git pull --ff-only origin feat/treasury-decision-platform
npx --yes pnpm@11.19.0 install --frozen-lockfile
```

### 2. Instalar el backend en el proyecto correcto

Necesitas la versión v7 con eliminación de Excel (migraciones hasta el 18 de septiembre). Respalda la base antes de actualizar. En una copia de pruebas, aplica **una vez y en este orden**:

| Orden | Archivo en `supabase/migrations/` | Incorpora |
| --- | --- | --- |
| 1 | `20260919000000000_treasury_access.sql` | Aprobación, MFA, capacidades, auditoría y permisos |
| 2 | `20260919010000000_treasury_decisions.sql` | Tareas, escenarios, previsiones, detalles MANUAL y adjuntos |
| 3 | `20260919020000000_bank_reconciliation.sql` | Cartolas, conciliaciones y dependencias de eliminación |
| 4 | `20260919030000000_treasury_operations.sql` | Tasas históricas, monitoreo, asistente e identidad SAP |

En Mac, copia cada archivo individualmente con `pbcopy`; luego pégalo en **Supabase → SQL Editor → New query → Run**. Completa el primero antes del siguiente:

```bash
pbcopy < supabase/migrations/20260919000000000_treasury_access.sql
```

```bash
pbcopy < supabase/migrations/20260919010000000_treasury_decisions.sql
```

```bash
pbcopy < supabase/migrations/20260919020000000_bank_reconciliation.sql
```

```bash
pbcopy < supabase/migrations/20260919030000000_treasury_operations.sql
```

Cada archivo contiene su transacción. Si falla, revisa el error y las dependencias; no ejecutes el siguiente. Si ya administras el historial mediante Supabase CLI, usa `supabase migration list` y `supabase db push` sobre la referencia verificada, en lugar de repetirlas en SQL Editor. No repitas las migraciones `cleanup_*` antiguas en una base con datos.

Comprobación de objetos sin escribir:

```sql
select to_regclass('public.treasury_access') as acceso,
       to_regclass('public.treasury_scenarios') as escenarios,
       to_regclass('public.treasury_bank_transactions') as cartolas,
       to_regprocedure('public.treasury_health()') as monitoreo;
```

### 3. Probar y publicar el frontend

```bash
npx --yes pnpm@11.19.0 check
npx --yes pnpm@11.19.0 test:security
npx --yes pnpm@11.19.0 build
npx --yes pnpm@11.19.0 dev
```

Entra con administración, configura MFA, revisa usuarios y capacidades en Seguridad. Prueba una BASE y otra del día siguiente; verifica las cifras de BANCO en su moneda original. Publica `dist/` con el alojamiento habitual cuando hayas aceptado esa copia. No se ha desplegado esta rama ni aplicado SQL en producción desde esta entrega.

## 19. Decisiones, agenda y precisión

**Hoy** resume caja, mínimo previsto, primer cruce del umbral y tareas. La antigüedad combina fecha de corte y recepción; un archivo recién subido con datos antiguos no aparece como ERP actualizado. Las consultas históricas se identifican como tales. Administración configura mínimos por moneda y antigüedad máxima.

**Cambios** compara las dos BASE seleccionadas, con altas/bajas/modificaciones y un puente de variación de caja. Una fila ausente no demuestra que se haya pagado. Se conserva descripción, origen y trazabilidad para revisar la explicación.

**Laboratorio de caja** modifica supuestos de movimientos futuros sin editar ERP. Permite cambiar fecha, monto y excluir partidas. Guardar conserva en servidor una copia de BASE/MANUAL, vínculos, contexto, supuestos, revisión y versión de motor. Las revisiones evitan sobrescribir trabajo concurrente; **Rebasar** copia los supuestos todavía compatibles sobre la BASE actual para revisar antes de guardar. BANCO no admite supuestos de modificación de caja histórica.

**Congelar previsión actual** guarda la previsión operativa sin supuestos del escenario, y deduplica el mismo lote/revisión/contexto. Precisión compara esa previsión con las últimas BASE aceptadas de fechas posteriores, una observación por fecha y moneda. Muestra error absoluto medio y sesgo; los días sin observación no se rellenan con cifras inventadas. Los saldos observados son BANCO de BASE, no una certificación bancaria. La medición es descriptiva, no ML.

**Proyecciones** permite repetir semanal o mensualmente hasta 60 ocurrencias. Si un mes no tiene el día solicitado se usa su último día, sin arrastrar ese ajuste a meses siguientes. Editar una ocurrencia crea una excepción; no modifica toda la serie. La fecha confirmada prevalece en el flujo, y vencimiento se guarda como referencia. Arrastrar en la agenda abre el editor y la vista previa de impacto; no guarda hasta confirmar. En móvil se toca la partida y se cambia su fecha.

Comentarios y adjuntos pertenecen al MANUAL del lote. Los adjuntos admiten PDF/PNG/JPG/TXT, hasta 2 MiB por archivo y diez por movimiento; se guardan como bytes privados en PostgreSQL y su descarga exige permiso. No se ejecutan ni se renderizan como HTML. Aumentar volumen requiere evaluar almacenamiento privado dedicado. Las copias MANUAL editadas arrastran sus detalles de planificación; comentarios/adjuntos permanecen asociados al lote donde fueron creados.

## 20. Conciliación bancaria

1. Selecciona una cuenta y moneda de BANCO.
2. Importa la cartola **CSV del banco**, independiente del libro de tesorería.
3. Asigna Fecha y Monto con signo, o Fecha con Cargo/Abono. Elige separador y formato numérico. Revisa la vista previa.
4. Si informas saldos inicial/final, ambos deben cumplir `inicial + movimientos = final`. Sin saldos no se muestra un total bancario inventado.
5. Revisa sugerencias por importe, referencia y proximidad de fecha. Si hay varias coincidencias no se elige una automáticamente.
6. Selecciona una o varias partidas de cada lado. Ajusta el importe asignado para una conciliación parcial, escribe motivo y confirma el resumen.
7. Para corregir, usa Revertir con motivo. La auditoría permanece y los importes vuelven a estar disponibles.

Límites de cartola: 10 MiB, 20.000 movimientos y 100 columnas. Se conservan partidas iguales mediante su multiplicidad; los archivos repetidos no duplican movimientos. Los emparejamientos validan cuenta, moneda, dirección, suma y disponibilidad bajo bloqueo transaccional. No se puede consumir de nuevo una partida desde otra fotografía del mismo asiento ERP. Si cambia su moneda/cuenta/dirección, primero se exige revisar y revertir la conciliación previa.

Una diferencia de saldos se presenta solo con cortes iguales. La cartola no modifica la caja BASE ni convierte documentos en pagados. No se conecta al banco ni ejecuta transferencias. El importador de tesorería admite ERP crudo o CAJA/BASE; el formato CSV de cartola corresponde únicamente a evidencia bancaria independiente.

## 21. Informes y asistente

Informes usa el mismo motor de Hoy y el contexto seleccionado: lote, revisión, corte, moneda original y horizonte. PDF ofrece encabezado corporativo, gráfico y tablas paginadas; Excel incluye Contexto, Resumen, Flujo diario y Trazabilidad. Capital, interés y flujo se diferencian en las fuentes. Los textos largos pueden abreviarse en PDF; Excel conserva el detalle. Las descargas necesitan autorización y quedan auditadas.

El asistente integrado responde seis familias de consulta con cálculos deterministas y botones para abrir los movimientos de respaldo. No escribe SQL, no ejecuta pagos y no modifica datos. Funciona sin una clave de IA externa.

### Interpretación opcional de preguntas

La Edge Function `treasury-assistant` puede usar OpenAI **solo para clasificar la pregunta** en una herramienta permitida. No envía BASE al modelo ni toma cifras generadas como resultados. Solo se invoca si el usuario marca la opción externa. El texto de la pregunta sí sale hacia ese proveedor: no incluir datos confidenciales.

TI debe configurar, solo en el servidor:

- `APP_ORIGIN`: origen HTTPS exacto de la app.
- `OPENAI_API_KEY`: secreto de una cuenta autorizada.
- `ASSISTANT_MODEL`: modelo compatible con Responses y JSON Schema estructurado.
- Variables Supabase del entorno de funciones, verificadas para el mismo proyecto.

```bash
supabase functions deploy treasury-assistant --project-ref TU_REFERENCIA
```

La configuración desactiva la comprobación JWT de la puerta de enlace porque la función valida el token del usuario mediante la RPC `treasury_assistant_authorize`. Se exige acceso aprobado y se limita a 20 consultas por minuto. La respuesta externa se restringe a un enum, con `store:false`, límite de salida y timeout; si falla siguen disponibles las consultas locales. La API externa puede tener facturación propia y no está activada por defecto.

## 22. Extracción y programación SAP

`scripts/sap-sync.mjs` requiere Node 24. Hace Login a Service Layer, pagina tres vistas, compara conteos antes/después, exige un SnapshotId consistente, valida el contrato y entrega el conjunto completo. Acepta enlaces de paginación solo del mismo origen/ruta, rechaza redirecciones y usa TLS. Conserva B1SESSION y ROUTEID cuando está presente, sin imprimir cookies ni contraseñas. Un fallo conserva la última BASE aceptada.

TI debe crear **vistas de un corte consistente e inmutable**. Los conteos iguales por sí solos no prueban coherencia; SnapshotId debe identificar el mismo cierre en las tres fuentes. Las vistas y filtros han de coincidir con SAP_CUTOFF; no reutilizar un identificador para datos que están cambiando. Los nombres de `scripts/sap-mapping.example.json` son marcadores, no nombres reales de SAP. Mapea claves ERP estables como `sourceId`; no uses número de fila como identidad.

1. Crea tres feeds de solo lectura y sus endpoints de conteo. BANCO completo; CLIENTES/COLOCACIONES vacíos solo si el conteo real es cero.
2. Copia `sap-mapping.example.json` fuera del repositorio, rellena rutas/campos y conserva `snapshotField`.
3. Protege un archivo de entorno basado en `scripts/sap.env.example` con permisos 600 y usuario dedicado. Configura también el receptor descrito en la sección 11.
4. En un servidor TI, prueba una entrega sobre Supabase de pruebas:

```bash
node --env-file=/etc/sonacol/sap.env scripts/sap-sync.mjs
```

5. Contrasta totales por moneda y origen con SAP; comprueba rechazo de una extracción incompleta. Después configura horario y monitoreo.

Se suministran `sonacol-sap.service` y `.timer`: ejemplo diario a las 07:00 de America/Santiago, usuario `sonacol-sync`, código en `/opt/sonacol-treasury` y configuración en `/etc/sonacol`. TI debe crear usuario/directorios, instalar Node 24, revisar permisos y habilitar el timer con systemd en Linux. En Mac puede ejecutar manualmente el comando anterior o configurar launchd con su política. Esto no usa GitHub Actions.

El proceso reintenta entregas transitoriamente hasta tres veces; el receptor confirma el lote realmente aceptado por PostgreSQL. Sin confirmación no se imprime éxito. Integraciones distingue ejecución iniciada, confirmada y fallida; una ejecución que queda abierta demasiado tiempo se señala para revisión. La identidad SAP se basa ahora en la clave ERP estable; al actualizar desde el receptor anterior se deben revisar vínculos previos que el motor señale como incompatibles.

## 23. Respaldos y prueba de restauración

El repositorio proporciona herramientas; **no crea ni activa un servicio de respaldos remoto**. TI necesita PostgreSQL client tools compatibles (`pg_dump`, `pg_restore`, `psql`), un volumen cifrado, copia externa, retención y controles de acceso. Los adjuntos de esta versión están en PostgreSQL y entran en su respaldo; archivos originales Excel no se almacenan. Si se añade Supabase Storage, sus objetos requieren un respaldo separado.

Configura fuera de Git un archivo basado en `scripts/backup.env.example`:

- `DATABASE_BACKUP_URL`: conexión permitida para leer la base completa.
- `BACKUP_DIRECTORY`: directorio fuera del repositorio, con acceso exclusivo.
- Opcionalmente `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` para registrar el resultado en Integraciones.

```bash
node --env-file=/etc/sonacol/backup.env scripts/database-backup.mjs
```

Se genera un dump de formato custom con SHA-256 y manifiesto JSON. Los secretos van al entorno de PostgreSQL, no a argumentos impresos. Los archivos usan permisos 600; el servicio de ejemplo usa umask 0077. No hay borrado automático de respaldos ni cifrado implementado en el script: el volumen y la copia externa deben configurarse con TI.

Para probar recuperación, aprovisiona una base **vacía y aislada** llamada `sonacol_restore_...`, con roles/extensiones compatibles con Supabase. `DATABASE_RESTORE_URL` debe apuntar a ella, nunca a producción:

```bash
node --env-file=/etc/sonacol/backup.env scripts/database-backup.mjs verify-restore /var/backups/sonacol/NOMBRE.dump.json
```

La herramienta verifica la huella, el nombre de destino y que no existan tablas de aplicación/Auth, restaura en una transacción sin `--clean` y consulta tablas críticas. TI debe además contrastar caja, recuentos, usuarios y adjuntos contra el corte respaldado y documentar duración y resultado. Las herramientas no estaban disponibles para una restauración PostgreSQL real en esta entrega: solo se probaron las barreras contra un destino productivo, archivos alterados y respaldo dentro de Git.

Los ejemplos `sonacol-backup.service/.timer` ejecutan el respaldo a las 02:00 de America/Santiago. La prueba periódica de recuperación se programa en infraestructura aislada bajo responsabilidad de TI. No requiere GitHub Actions.

## 24. Nuevos objetos y referencias técnicas

| Objetos | Responsabilidad |
| --- | --- |
| `treasury_access`, `treasury_set_access`, `treasury_require` | Admisión y capacidades verificadas |
| `treasury_settings` | Umbrales por moneda y antigüedad aceptable |
| `treasury_tasks`, `treasury_save_task` | Agenda de gestión con responsable y revisión |
| `treasury_scenarios`, `treasury_forecasts` | Copias verificables, hipótesis y medición futura |
| `treasury_manual_details/comments/attachments` | Planificación, contexto y respaldos de MANUAL |
| `treasury_statements`, `treasury_bank_transactions`, `treasury_statement_rows` | Evidencia bancaria, identidad y pertenencia |
| `treasury_matches`, `treasury_match_items` | Asignaciones parciales/agrupadas y reversas |
| `treasury_fx_history`, `treasury_fx_rates` | Tasas por vigencia y fuente |
| `treasury_operations`, `treasury_health` | Ejecuciones SAP y respaldos/restauraciones |
| `treasury_client_errors`, `treasury_assistant_usage` | Monitoreo limitado y cuotas de consultas |

- Motor: `src/financial-engine/decisions.ts`, `assistant.ts`, `report.ts`, `snapshot.ts`.
- RPC y contexto: `src/services/decisionService.ts`.
- Cartolas: `src/import-engine/statement.ts`.
- PDF: `src/lib/pdf-report.ts`, carga bajo demanda de pdf-lib.
- Acceso y visualización: componentes de `src/components/treasury/` y pantallas nuevas de `src/pages/`.
- Operaciones: `scripts/`, Edge Functions y migraciones del 19 de septiembre.

Documentación técnica de referencia: [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa), [SAP Service Layer](https://help.sap.com/doc/056f69366b5345a386bb8149f1700c19/10.0/en-US/Service%20Layer%20API%20Reference.html), [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [pdf-lib](https://pdf-lib.js.org/docs/api/classes/pdfdocument).


## 25. Activar ERP y planificación

Esta entrega implementa la primera etapa funcional; no acredita que se haya publicado el frontend ni aplicado SQL productivo. El código y las migraciones deben actualizarse juntos. No requiere jobs de GitHub.

1. Obtén la rama en el nuevo repositorio, conservando tus cambios locales:

```bash
git status
git fetch origin
git switch fix/erp-investment-opening
git pull --ff-only origin fix/erp-investment-opening
npx --yes pnpm@11.19.0 install --frozen-lockfile
npx --yes pnpm@11.19.0 check
npx --yes pnpm@11.19.0 build
```

2. En una copia aislada con las migraciones anteriores instaladas, aplica **una sola vez y en orden**:

```text
supabase/migrations/20260926000000000_erp_raw_import.sql
supabase/migrations/20260926010000000_business_planning.sql
supabase/migrations/20260926020000000_erp_investment_opening.sql
```

3. Verifica la migración CAJA → ERP: selecciona fechas de corte comparables, revisa cobertura, confirma que MANUAL se mantiene y resuelve los ajustes y rescates pendientes en Planificación. No certifica equivalencia comparar saldos de cortes distintos. La correspondencia por nombres de clientes diferentes requiere revisión explícita.
4. Crea una regla de cobro y un ajuste particular; confirma que cambia la fecha prevista y se conserva el vencimiento original. Programa un rescate parcial y comprueba capital, reserva, remanente y flujo diario. Reimporta ERP y revisa que las decisiones se mantienen y la versión anterior sigue intacta.
5. Tras aceptar esa copia, aplica las migraciones pendientes al entorno destino con su procedimiento de respaldo y publica el frontend compatible con el alojamiento habitual.

Los mayores ERP solo acreditan las cuentas y monedas presentes en la exportación. El perfil no identifica automáticamente el instrumento individual dentro de una misma cuenta contable, ni concilia un rescate planeado con una transacción real. Estas correspondencias deben confirmarse antes de ampliar la automatización. Los libros reales y sus datos financieros no forman parte del repositorio; las pruebas versionadas usan ejemplos anónimos.


### Corrección de carga ERP sin fila OB

Si ya instalaste las dos migraciones de la primera etapa, **no las repitas**. Actualiza el frontend con la rama `fix/erp-investment-opening` y aplica únicamente:

```text
supabase/migrations/20260926020000000_erp_investment_opening.sql
```

Esta migración reemplaza la validación y la composición de posiciones; no borra ni reescribe las filas ERP, MANUAL o decisiones existentes. Mantiene los permisos anteriores. Debe aplicarse antes de usar el frontend actualizado.

El caso reportado combinaba dos condiciones: la fila OB estaba ausente y el primer movimiento de inversiones era anterior al inicio declarado. Cambiar solamente la fecha no resuelve la ausencia de OB en la versión anterior. La corrección calcula la apertura como saldo acumulado menos primer movimiento, comprueba cada saldo posterior y muestra el cálculo en la vista previa y en Planificación. Las filas originales y sus importes permanecen intactos.

Para el archivo reportado, el primer movimiento de COLOCACIONES es del **31/08/2026**: el inicio del mayor de inversiones debe incluir ese día. El inicio de bancos es independiente. Confirma la fecha de corte según la extracción real; la fecha de la última transacción no certifica el corte.

El filtro **Con errores** ahora funciona incluso antes de obtener una comparación SQL y cada error muestra hoja, fila y motivo. No se marcan como inválidas todas las filas por una comparación todavía pendiente.

La verificación local de esta corrección incluye **186 pruebas de lógica/SQL y cuatro pruebas de navegador aprobadas**, TypeScript y build correctos, y la carga del ERP adjunto en PostgreSQL aislado: 289 filas originales, cero errores con el período de inversiones corregido y apertura calculada visible. El capital de inversión no se convierte en flujo futuro por este cálculo. No se modificó el XLSM ni la base productiva.

## 26. Segunda etapa: decisiones CAJA

Rama **`feat/caja-business-migration`**, basada en `fix/erp-investment-opening`. Implementa el trabajo operativo sobre la primera etapa; las decisiones financieras ambiguas requieren revisión en la plataforma. El código está preparado para instalarse: no se aplicó SQL ni se publicó el frontend en producción durante esta entrega. GitHub Actions sigue siendo exclusivamente manual.

### Instalar sobre la primera etapa

Con los cambios locales conservados y desde la carpeta del proyecto:

```bash
git fetch origin
git switch feat/caja-business-migration
git pull --ff-only origin feat/caja-business-migration
```

La migración nueva depende de las tres migraciones ERP de la sección 25. **No repitas las que ya aplicaste.** Si ya está instalada la corrección de aperturas, aplica solamente este archivo en el SQL Editor del proyecto Supabase correcto:

```bash
pbcopy < supabase/migrations/20260926030000000_caja_business_migration.sql
```

Si falta `20260926020000000_erp_investment_opening.sql`, aplícala antes. Conserva tu respaldo y utiliza el historial CLI existente si administras las migraciones con Supabase CLI. La actualización agrega evidencia y funciones; no borra ni reimporta datos. Los ajustes y sus valores existentes permanecen intactos hasta que el usuario adopte una regla o los edite.

Después actualiza el frontend con tu proceso habitual:

```bash
npx --yes pnpm@11.19.0 install --frozen-lockfile
npx --yes pnpm@11.19.0 check
npx --yes pnpm@11.19.0 build
```

### Revisar correspondencias

En **Planificación y reglas → Decisiones por revisar**, abre una decisión. La pantalla muestra cliente, documento, importe, vencimiento, fechas CAJA, banco, cuenta y coordenada de origen junto al destino ERP. Selecciona el destino y confirma que revisaste la correspondencia. Una coincidencia de monto no acredita identidad; un folio distinto permanece visible como advertencia.

La asociación se guarda por identidad ERP y se conserva en las siguientes cargas del mismo corte o posteriores. Al reasignar una factura, sus vínculos MANUAL se trasladan en la misma transacción. Un destino ocupado se rechaza; los enlaces con importes incompatibles siguen fuera de la proyección hasta corregirse. Los rescates requieren posición, monto, moneda, fecha y cuenta receptora, y mantienen el control de capital reservado. No se deduce pago o ejecución por ausencia del registro.

`source_json` conserva la evidencia normalizada original y la referencia de archivo/fila. Al actualizar una instalación de etapa 1 se recupera desde el lote CAJA, si aún existe. Después, esa evidencia sobrevive a la eliminación del lote fuente y al arrastre diario. Si el origen se eliminó antes de instalar esta migración, la pantalla indica que falta la evidencia: no se reconstruye inventándola.

### Configurar cobranza y recuperar decisiones iniciales

**Configurar cobranzas** permite seleccionar un cliente por su código ERP, días naturales desde el vencimiento, prioridad y cuenta receptora. El punto de partida observado en CAJA es **+5 días naturales**; no se introducen ajustes de fines de semana o feriados. Los bancos observados en las correspondencias se muestran como referencia; la cuenta se selecciona explícitamente por su código bancario.

1. Pulsa **Revisar impacto** para ver facturas alcanzadas, fechas calculadas que seguirán la regla y fechas explícitas que se preservarán.
2. Pulsa **Aplicar regla revisada**. Si cambió la planificación durante la revisión, debes generar una vista previa nueva.
3. Revisa el resultado en Cobranzas. La regla se conserva para las nuevas facturas del cliente en las siguientes cargas.

Solo se libera la fecha de un ajuste inicial **sin ediciones**, con correspondencia vigente, sin AJ VCTO manual y cuyo VCTO/fecha calculada coincide exactamente con vencimiento +5. Se preservan fechas manuales, excepciones, decisiones ya editadas y casos sin correspondencia. Para hacer que una decisión revisada siga una regla, edita su fecha prevista y déjala vacía. La evidencia CAJA se conserva.

La prioridad mayor se aplica al final; los ajustes explícitos siguen prevaleciendo. La adopción rechaza otra regla de cobranza de igual o mayor prioridad que afecte ese alcance: puedes editar la existente o elegir una prioridad mayor. Las reglas de clasificación por descripción siguen disponibles en **Crear regla**. La sección 27 incorpora las reglas iniciales verificadas; las condiciones adicionales requieren validación.

### Comparar la proyección diaria

En **Explicar cambios → Control histórico de la migración (opcional) → Comparación diaria con CAJA**, selecciona una carga CAJA trabajada y un horizonte de 30, 60 o 90 días. Ambos lados usan el motor financiero existente, la misma moneda original y el mismo corte. La pantalla no cambia el corte de una exportación para forzar una comparación.

- Cortes distintos, una carga parcial o saldos bancarios ausentes en la moneda elegida impiden la comparación.
- Cuentas bancarias diferentes, decisiones pendientes y vínculos inválidos se señalan como revisiones pendientes.
- La tabla muestra saldo CAJA, saldo plataforma y diferencias de saldo, cobros, rescates y MANUAL. Las diferencias se expresan como **plataforma menos CAJA**.
- El detalle explica movimientos solo presentes en un lado y cambios de fecha, importe o banco. Las correspondencias guardadas permiten comparar entidades con identificadores distintos.

Una coincidencia numérica al corte y moneda elegidos no certifica otras monedas, escenarios o reglas. Este control permite revisar decisiones históricas trasladadas; no condiciona el inicio ni la continuidad de la operación desde ERP descrita en la sección 27.

### Verificación de la entrega

La entrega de esta segunda etapa pasó **189 pruebas** de lógica y PostgreSQL aislado, incluida la actualización sobre una etapa 1 con datos, la inmutabilidad ERP, preservación de fechas manuales, rechazo de revisiones obsoletas, permisos, vínculos sin doble conteo, evidencias tras eliminar el origen, reimportaciones e históricos congelados. La aceptación de navegador cubrió correspondencias, adopción de reglas, comparación diaria, importación ERP y corte declarado en la compilación de producción. La verificación de la corrección posterior figura en la sección 27.

Los libros reales se leyeron sin modificarlos. La prueba de adopción se ejecutó en una base aislada y con un corte común **simulado únicamente para ejercitar el traslado**; no certifica igualdad de cobertura entre los archivos recibidos. Con los cortes distintos declarados para la comparación real, el comparador se bloquea correctamente. TypeScript, build y control estático de secretos se verifican; ESLint conserva cinco advertencias de Fast Refresh preexistentes, sin errores.

## 27. Operación nativa sin Excel CAJA

El objetivo es **reemplazar el sistema financiero manual CAJA**. La plataforma recibe ERP como materia prima, mantiene los datos de negocio del usuario y produce los cálculos, proyecciones diarias, caja disponible, dashboard e informes. No necesita un CAJA trabajado para arrancar ni para seguir operando. El código implementado se encuentra en `feat/erp-native-operations`, basado en la entrega de la sección 26.

### Qué ejecuta la plataforma

| Funcionalidad | Entrada | Implementación nativa |
| --- | --- | --- |
| Caja contable disponible | Aperturas y movimientos BANCOS | Suma con signo por cuenta y moneda hasta el corte |
| Fecha prevista de cobro | Vencimiento contractual CLIENTES | Regla inicial de +5 días naturales; reglas por cliente; el ajuste explícito prevalece |
| Cuenta receptora | Catálogo de cuentas BANCOS y decisión del usuario | Configurar cobranzas por código de cliente ERP y cuenta bancaria; se conserva en siguientes cargas |
| Clasificación de movimientos | Descripción original BANCOS | Reglas propias ordenadas: la última coincidencia por prioridad prevalece; los casos restantes quedan Sin clasificar |
| Compromisos, pagos y cobros adicionales | Entrada del usuario | Proyecciones/MANUAL, fechas, categorías, recurrencias, estados y observaciones |
| Posiciones y rescates | Mayor COLOCACIONES + planificación del usuario | Capital real separado de rescates parciales, reservas y remanente; un estado ejecutado no inventa un abono bancario |
| Proyección diaria | ERP + reglas + ajustes + MANUAL + rescates | Caja inicial + ingresos − egresos; eventos desde el día posterior al corte y tratamiento visible de vencidos |
| Dashboard, reportes y escenarios | Modelo financiero compuesto | Consumen el mismo motor y contexto de corte/moneda |
| Histórico | Fotografías y decisiones versionadas | Reimportación sin sumar fotografías ni modificar previsiones congeladas |

La cuenta receptora, los compromisos y la programación de rescates son decisiones del negocio. Se introducen en la plataforma cuando no están en ERP. No se inventan importes, tasas o vencimientos de inversión ni se exige agregarlos a un Excel.

### Reglas iniciales incorporadas

Una nueva carga ERP con empresa **SONACOL** y sin configuración previa crea **16 reglas versionadas** dentro de la plataforma: una de cobranza y quince de clasificación. Son lógica ya verificada durante la auditoría; no se consulta ningún libro CAJA para ejecutarlas.

| Orden de coincidencia | Texto de la descripción | Categoría |
| --- | --- | --- |
| 20–26 | ABASTIBLE, ENEX, ENAP, ESMAX, GASCO, TRADING, COPEC | Recaudación clientes |
| 27 | RSCTE | Rescate de inversiones |
| 28–30 | ABONO, SUBSIDIO, BCO.ITAU2 | Abonos bancarios |
| 31 | COLOCACIONES | Colocaciones |
| 32–33 | PAGO, CARGO | Cargos bancarios |
| 34 | PAGO PAC | Pagos PAC |

Estas categorías no cambian el signo o importe contable importado. Por ejemplo, PAGO PAC prevalece sobre PAGO; ABONO prevalece sobre una coincidencia anterior de cliente. Los movimientos sin coincidencia se muestran como Sin clasificar para crear una regla o ajuste propio.

La regla general de cobranza tiene prioridad 0. Las condiciones por cliente y otras reglas pueden tener una prioridad mayor, y los ajustes explícitos siguen prevaleciendo. Las reglas iniciales pueden editarse o retirarse. Una nueva importación conserva toda la configuración, incluidas las reglas retiradas: nunca las reinstala sobre la decisión del usuario. Si una instalación ya tiene reglas propias de cobranza o clasificación, no se reemplaza ese tipo de reglas. Solo se incorpora el tipo todavía sin configurar; las retiradas también cuentan como configuración existente.

Las importaciones históricas no heredan reglas de fechas futuras. Instalar la migración tampoco reescribe cálculos anteriores. Los datos heredados y sus correspondencias pueden conservarse como evidencia, pero no son una dependencia de esta operación.

### Trabajo diario

1. Importa **ERP.xlsm** y declara su corte y cobertura.
2. En **Planificación y reglas**, revisa las reglas activas y utiliza **Configurar cobranzas** para definir condiciones por cliente y cuenta receptora. Las facturas nuevas del mismo cliente quedan incluidas automáticamente.
3. Registra compromisos y pagos en **Proyecciones**; introduce excepciones de cobro o clasificaciones en Planificación y programa rescates cuando corresponda.
4. Consulta **Flujo de caja**, dashboard, escenarios e informes. La plataforma calcula los resultados.
5. Importa la siguiente exportación ERP. Se actualizan los hechos y se conservan las decisiones propias. Revisa conflictos concretos cuando cambie o falte un registro.

El control de comparación con CAJA se encuentra exclusivamente en **Explicar cambios → Control histórico de la migración (opcional)**. Sirve para validar la reconstrucción durante el desarrollo; no aparece como paso de operación en Planificación ni exige mantener el Excel antiguo.

### Actualizar esta corrección de enfoque

Si ya instalaste las migraciones hasta `20260926030000000_caja_business_migration.sql`, conserva tus cambios locales, actualiza la rama y aplica **solamente** la migración nueva:

```bash
git fetch origin
git switch feat/erp-native-operations
git pull --ff-only origin feat/erp-native-operations
pbcopy < supabase/migrations/20260926040000000_erp_native_operations.sql
```

Pega el SQL en el editor del proyecto Supabase correcto y actualiza el frontend mediante tu proceso habitual. No repitas migraciones previas. Si todavía no aplicaste alguna dependencia, sigue su orden en la sección 9.

En una instalación existente con un ERP SONACOL ya aceptado y tipos de regla aún sin configurar, **Activar reglas iniciales** permite incorporarlos en el corte vigente sin reimportar un archivo. Requiere permiso de escritura y MFA. Si ya existen reglas de ambos tipos, continúa editándolas: el sistema respeta esa configuración. Una base vacía obtiene las reglas automáticamente en su primera carga ERP.

### Criterio de validación

La aceptación se realiza desde una base vacía y **sin cargar CAJA**: importar ERP, generar las fechas previstas, configurar banco/condiciones de un cliente, crear un ajuste, un pago manual y un rescate, verificar saldos diarios, congelar una previsión y reimportar ERP. Deben conservarse las decisiones y la previsión histórica, incluirse las facturas nuevas en las reglas y permanecer intactos los datos crudos. Este flujo tiene pruebas automáticas SQL y de navegador.

La corrección pasa **192 pruebas de lógica/PostgreSQL aislado y 5 pruebas de navegador** sobre la compilación de producción, con revisión visual de escritorio y móvil. TypeScript y build pasan; ESLint no presenta errores y conserva cinco advertencias preexistentes. La comprobación aislada del ERP recibido, sin cargar CAJA, importó 289 filas originales, creó 16 reglas y generó fechas previstas para 92 facturas. Ocho movimientos quedaron explícitamente sin clasificar. Estas pruebas no aplican migraciones ni despliegan cambios en producción.

Esta entrega incorpora la lógica identificada arriba y reutiliza los módulos nativos existentes. No declara implementadas reglas adicionales que aún no estén verificadas. Cualquier funcionalidad financiera pendiente debe completarse dentro de la plataforma; la respuesta no será volver a depender del archivo CAJA.

## 28. Patch: actualización ERP y formularios

Entrega incremental `sonacol-erp-actualizacion-formularios.patch`, preparada sobre `d2ba6a8bdc35c90997a94efb5f8c53e095e06dfa` (operación nativa ERP). A partir de esta entrega, los cambios se distribuyen mediante patches con su base identificada y sus comprobaciones.

### Correcciones

El lector dependía de los nombres exactos BANCOS, CLIENTES y COLOCACIONES. Un ERP sin BASE y con otra etiqueta, por ejemplo BANCO, terminaba en el lector anterior y pedía una hoja BASE. Ahora se identifican los tres reportes por sus encabezados completos dentro de las primeras 50 filas, conservando el nombre físico de cada pestaña y sus coordenadas. El tipo de reporte determina su período bancario o de inversiones, aunque cambie el nombre de la pestaña. Los libros históricos con BASE mantienen su lectura exclusiva de esa hoja.

Se rechazan reportes incompletos, encabezados inválidos y varias hojas del mismo tipo. El mensaje indica los reportes no reconocidos y las hojas encontradas; no solicita convertir ERP en un CAJA trabajado. No se inventan datos de una hoja ausente. La validación SQL conserva controles de importes, períodos, identidad, permisos y correspondencia entre hoja y origen.

El mismo nombre de archivo `ERP.xlsm` puede usarse para actualizar la información. Repetir el contenido y corte no duplica fotografías; cambiar solo los nombres de pestaña tampoco crea una nueva. Una actualización con nuevos datos o corte conserva las decisiones propias y el historial existente. Un archivo rechazado no reemplaza la carga vigente.

Los formularios de ajuste, rescate y política de cobranza limitan el ancho de sus campos a la ventana. Las opciones largas ya no ensanchan la cuadrícula ni ocultan los botones. En pantallas pequeñas, los campos y acciones se distribuyen en varias filas y la ventana permite desplazamiento vertical.

### Aplicar el patch

Desde la carpeta del repositorio, con el archivo descargado en Descargas:

```bash
git apply --check ~/Downloads/sonacol-erp-actualizacion-formularios.patch
git apply ~/Downloads/sonacol-erp-actualizacion-formularios.patch
```

La comprobación debe terminar sin errores. Si la base local difiere o hay cambios que se solapan, conserva ese trabajo y adapta el patch a esa versión; no fuerces su aplicación.

Con las migraciones anteriores ya instaladas, ejecuta **solo** `supabase/migrations/20260926050000000_erp_report_sheet_names.sql` en el editor SQL del proyecto Supabase correspondiente. En macOS puedes copiar su contenido así:

```bash
pbcopy < supabase/migrations/20260926050000000_erp_report_sheet_names.sql
```

Después compila y publica el frontend con tu proceso habitual (`pnpm build`) y recarga la aplicación. La migración actualiza la validación; no elimina archivos, registros ni decisiones. No se han ejecutado migraciones ni despliegues en producción durante la preparación del patch.

### Verificación

Pruebas con datos anónimos: lectura de pestañas renombradas en XLSX/XLSM/XLS, períodos separados, actualización de una base ya instalada, identidad estable, conservación de ajustes/MANUAL/historial, rechazos y permisos. En navegador se carga repetidamente `ERP.xlsm`, se cambia de corte, se comprueba que los saldos no se acumulan y que un archivo incompleto conserva la carga vigente. Los formularios se revisan con etiquetas largas a 1366, 390 y 320 píxeles de ancho, incluyendo guardar un ajuste desde móvil.

Resultado: **197 pruebas de lógica/PostgreSQL y 7 casos de navegador aprobados**, TypeScript y compilación correctos; ESLint sin errores y con las cinco advertencias preexistentes. El patch se comprueba además sobre una copia limpia de su commit base.

## 29. Patch: saldos bancarios desde ERP

`sonacol-erp-saldos-bancarios.patch` es incremental sobre la entrega de la sección 28 ya aplicada. No repite ese patch ni sustituye las migraciones previas. La base exacta del diff es el árbol Git `6f536632ddafaaba08dade3420e71d5f4843affb` (commit `d2ba6a8` más el patch de actualización ERP/formularios).

### Lectura y diagnóstico

La nueva hoja **SALDOS BANCOS** contiene `Cuenta asociada`, `Banco` y `Saldo Inicial`; el encabezado puede estar después de filas vacías y las columnas pueden cambiar de posición. Se conserva la hoja y fila original de cada apertura. El texto explicativo `saldo final = saldo inicial + (cargo - abono)` se reconoce como nota, no como un movimiento. Una cuenta sin movimientos conserva su apertura. El código de Cuenta asociada es una cuenta contable; no se presenta como número de cuenta bancaria.

En la versión revisada, el lector ERP ya usaba **Cargo − Abono**. Los problemas comprobados eran otros: no reconocía SALDOS BANCOS y dependía de cabeceras `Activos` dentro de BANCOS; además, SQL exigía que cada apertura apareciera en una fila anterior del mayor. El nuevo archivo separa las fuentes. No se ha comprobado que el despliegue del usuario contuviera una suma `Cargo + Abono`.

| Fuente | Datos importados | Uso en la plataforma |
| --- | --- | --- |
| SALDOS BANCOS | Cuenta, banco, saldo inicial | Una apertura por cuenta/moneda y período declarado |
| BANCOS | Cuenta asociada, fecha, Cargo (ML), Abono (ML), documento y transacción | Cargo es ingreso; Abono es egreso; movimiento con signo = Cargo − Abono |
| CLIENTES | Facturas y vencimientos contractuales | Cobros futuros según reglas/decisiones, sin duplicar caja ya contabilizada |
| COLOCACIONES | Mayor y saldos acumulados de inversiones | Posiciones y rescates programados; no es una segunda fuente de aperturas bancarias |
| Plataforma | Clasificaciones, ajustes, compromisos y reglas | Decisiones separadas de los hechos importados; una categoría nunca cambia el signo bancario |

**Saldo calculado = saldo inicial + total Cargo − total Abono.** El motor valida importe absoluto, signo y tipo ingreso/egreso. La apertura no aparece como ingreso del período ni se vuelve a proyectar. Desde la sección 37, cada fotografía mensual aceptada incluye también los movimientos anteriores que falten en el nuevo archivo. No se suman fotografías de días distintos.

Si SALDOS BANCOS está presente, sus aperturas son la fuente mensual. Una cabecera Activos adicional con importe bloquea la lectura aunque coincida: dos fuentes de apertura requieren aclaración y nunca se suman. Las etiquetas de grupo sin importe son válidas. Los archivos anteriores con aperturas Activos mantienen compatibilidad antes de adoptar el control mensual. Una hoja SALDOS BANCOS mal formada, una apertura vacía, una cuenta repetida, un movimiento sin apertura, monedas incompatibles o períodos inconsistentes producen errores explícitos. No se interpreta una celda vacía como cero.

### Control visible y alcance de la validación

La vista previa, **Saldos bancarios** y los informes muestran por cuenta: período declarado, apertura, cargos, abonos, saldo calculado, saldo informado y diferencia. Se exportan estos controles junto con la trazabilidad de hoja y fila. Dashboard y Flujo de caja parten de la misma caja calculada y la misma serie diaria.

El archivo recibido **no contiene saldo final informado ni fechas de cobertura en SALDOS BANCOS**. Por eso se muestran **No informado / No comprobable**, sin fabricar una diferencia cero. La cobertura sigue siendo una declaración del usuario al importar: el primer y último movimiento observado no certifican por sí solos el período de la exportación ni la fecha de su apertura.

Si una exportación incluye una columna explícita `Saldo Final`, se utiliza como referencia de control, nunca como otro ingreso o apertura. Una diferencia distinta de cero identifica cuenta, período e importes y bloquea la carga tanto en el frontend como en SQL. La comparación con una cartola sigue disponible como control externo.

### Aplicación

Con el patch de la sección 28 ya instalado, desde el repositorio:

```bash
git apply --check ~/Downloads/sonacol-erp-saldos-bancarios.patch
git apply ~/Downloads/sonacol-erp-saldos-bancarios.patch
pbcopy < supabase/migrations/20260927000000000_erp_bank_balances.sql
```

Ejecuta el contenido copiado en el editor SQL del proyecto Supabase correspondiente y después compila/publica el frontend con el procedimiento habitual. La migración nueva exige la validación anterior de nombres de reportes; no reescribe el historial. Ante un conflicto de aplicación, conserva los cambios locales y adapta el patch, sin forzarlo. No se han ejecutado migraciones ni despliegues en producción durante esta entrega.

Carga nuevamente ERP.xlsm y declara su cobertura real. Revisa el control bancario antes de confirmar. Si no existe saldo final de referencia, se puede calcular la caja desde aperturas y movimientos, pero el cierre permanece sin conciliación independiente.

### Verificación

Las pruebas cubren apertura separada, cuentas sin movimientos, saldos cero/negativos, egresos, aperturas duplicadas o inválidas, columnas movidas, fuentes contradictorias, cierre informado y diferencias. PostgreSQL valida los importes independientemente del cliente, conserva permisos, decisiones e historial al actualizar y no duplica una reimportación idéntica. Se comprueban también la clasificación sin cambio de signo, el saldo inicial de la proyección y el informe ejecutivo. Los fixtures publicados son anónimos; los datos financieros del archivo recibido no se incorporan al repositorio.

Resultado de esta entrega: **205 pruebas de lógica/PostgreSQL aprobadas**, TypeScript/build correctos y ESLint sin errores (cinco advertencias previas). Navegador: **27/32 aprobados**, incluidos los dos nuevos casos bancarios y los cuatro de ERP/planificación. Los cinco fallos restantes se reprodujeron también sobre la base anterior al patch: ruta antigua del flujo BASE, botón Agenda visual, formato de fecha histórica y textos antiguos de importación/dashboard. No se declara aprobada la suite completa; estos recorridos previos quedan documentados para su actualización.

## 30. Patch: egresos en Resumen y Flujo

`sonacol-flujo-egresos.patch` es incremental sobre `sonacol-erp-saldos-bancarios.patch` ya aplicado. Base exacta: árbol Git `1a860be9edf842e84df42af247bc49a2122d0d1f`. Esta entrega modifica el frontend y sus cálculos; **no requiere una nueva migración SQL**.

### Causa y comportamiento corregido

Las tarjetas y la tabla de proyección de Resumen/Flujo consumían exclusivamente los eventos futuros. Los abonos del ERP ya reducían la caja disponible, pero no tenían un indicador visible del total registrado en estas pantallas. Un valor cero de «Egresos previstos» podía interpretarse como ausencia de egresos bancarios.

Ambas pantallas muestran ahora **Flujo bancario registrado**, con cuatro cifras: apertura del período, ingresos Cargo, egresos Abono y saldo calculado al corte. Se aplica la misma carga seleccionada, banco y moneda que al resto de la vista. Cada cifra abre sus filas de origen. El flujo bancario diario permite verificar apertura + ingresos − egresos = cierre y consultar los abonos de un día. Las aperturas, incluidas las negativas, no se cuentan como movimientos del período.

Las proyecciones siguen comenzando al día siguiente del corte y muestran únicamente cobros/pagos futuros. Los egresos ya contabilizados no se trasladan al futuro ni se vuelven a descontar. «Programar egresos» conduce a los compromisos propios de la plataforma. Un ERP histórico por sí solo no declara pagos futuros.

Las cuentas sin movimientos conservan su apertura y muestran ingresos/egresos cero. Si las cuentas seleccionadas tienen períodos de origen diferentes, se indica la limitación y no se inventa una serie diaria consolidada; puede consultarse un banco con un período común. El libro histórico BASE, que no identifica siempre aperturas separadas, conserva su cálculo original.

### Correcciones relacionadas

| Hallazgo | Corrección |
| --- | --- |
| El mínimo incluye la caja al corte, pero la tarjeta buscaba su fecha solo entre días futuros | El motor expone la fecha real del mínimo. Si ocurre al corte, se abre la caja de origen; la etiqueta indica «Mínimo desde el corte» |
| El mayor egreso quedaba oculto cuando coincidía con el día del mínimo | Se conserva ese hito; se describe como el total de pagos del día |
| El flujo neto negativo se mostraba con valor absoluto | Se conserva el signo negativo en Resumen y Flujo |
| Sin ingresos ni egresos futuros, el gráfico inventaba 50%/50% | Se muestra un estado sin flujos previstos y no se calculan porcentajes sobre un total cero |
| La suma semanal/mensual producía residuos de coma flotante | Los ingresos, egresos y variaciones se acumulan en centavos, conservando primera apertura y último cierre |

### Aplicación y comprobación

Desde el repositorio, con la entrega bancaria anterior instalada:

```bash
git apply --check ~/Downloads/sonacol-flujo-egresos.patch
git apply ~/Downloads/sonacol-flujo-egresos.patch
pnpm build
```

Publica el frontend con el procedimiento habitual y recarga la aplicación. Las cargas ERP ya aceptadas contienen la información necesaria: no es preciso reimportar para visualizar estos indicadores. Si el patch no coincide con tu versión local, conserva los cambios y adapta la aplicación antes de continuar.

Revisa en Resumen y Flujo la misma carga/moneda/banco. Los egresos registrados deben coincidir con el total Abono de BANCOS, y su saldo calculado debe ser la apertura de la proyección. Los pagos futuros deben verse en sus fechas sin repetir movimientos ERP anteriores al corte. El selector de horizonte solo modifica el período futuro.

Las pruebas usan fixtures anónimos y PostgreSQL aislado. Cubren egresos registrados frente a compromisos futuros, trazabilidad, aperturas negativas y cuentas sin actividad, filtros, series diarias/semanales/mensuales, mínimo al corte, actualización ERP sin acumulación y conservación del histórico y decisiones. El Excel real se valida localmente y no se incorpora al repositorio. No se publica ni modifica la base de producción al preparar el patch.

Resultado: **212 pruebas de lógica/PostgreSQL y 5 pruebas de navegador aprobadas**, TypeScript y compilación correctos, ESLint sin errores (cinco advertencias preexistentes) y control estático de seguridad aprobado. Se comprobaron escritorio y móvil. La prueba aislada con el ERP recibido verificó 174 movimientos bancarios, incluidos 96 egresos, y coincidencia entre cierre bancario diario y caja disponible. Se ejecutó la regresión de navegador pertinente a este cambio; los cinco fallos de recorridos previos documentados en la sección 29 quedan fuera de esta entrega.

## 31. Patch: planificación inicial y ejecución de compromisos

**Estado de esta entrega: implementación con revisión de código; sin ejecutar pruebas, compilación ni migraciones, por instrucción del usuario. Los resultados de pruebas de secciones anteriores no validan este patch.**

`sonacol-planificacion-inicial.patch` es incremental sobre las tres entregas anteriores, incluida `sonacol-flujo-egresos.patch`. Base exacta: árbol Git `736bc6b3ff9b3749ce34102a7096173e934dcf0b`. Incorpora `20260928000000000_initial_business_plan.sql` y requiere las migraciones previas hasta `20260927000000000_erp_bank_balances.sql`.

### Brecha resuelta por el código

Una instalación iniciada solamente desde ERP no tenía los compromisos de PROYEC. La migración nueva incorpora un catálogo privado con los **43 movimientos del plan SONACOL del 24/09/2026: 26 egresos y 17 ingresos**, del 25/09 al 29/12/2026. Son datos iniciales del negocio, separados de las reglas de cálculo y de los hechos ERP. La instalación SQL no los activa ni cambia las cargas históricas.

En **Planificación y reglas** o **Proyecciones**, **Revisar planificación inicial** permite:

- Incorporar los registros faltantes en la última carga ERP SONACOL, con la cuenta y moneda validadas contra sus aperturas bancarias.
- Conservar registros existentes, incluidos los editados o eliminados, cuando tienen identidad de origen reconocida.
- Revisar posibles coincidencias y asociar expresamente el registro existente que debe conservarse. Un mismo monto por sí solo no prueba identidad.
- Seleccionar por separado las partidas vencidas. No se presupone que estén pagadas: mientras sigan pendientes se aplica la regla existente de trasladarlas al primer día proyectado.
- Conservar el importe original y la coordenada PROYEC/BASE como evidencia. Los importes operativos se redondean a dos decimales de forma explícita.

El catálogo con los datos financieros del plan está en la migración SQL de esta entrega; no se empaqueta como un archivo público del frontend. Su consulta exige acceso autenticado a tesorería y la incorporación exige permiso de escritura y MFA. El catálogo no es una fórmula para repetir esos importes en años posteriores. Los compromisos nuevos y las recurrencias se mantienen en la plataforma.

Una vez incorporados, los compromisos utilizan `daily_manual`, con sus mismas identidades y versiones. El arrastre ya existente conserva plan, ediciones, eliminaciones y ejecuciones en las siguientes cargas ERP del mismo corte o posteriores. Los históricos anteriores mantienen su espacio propio. No hace falta volver a cargar CAJA para incorporar este plan ni para operar después.

### Ejecución real y pendiente de proyectar

En **Proyecciones → Registrar ejecución**, selecciona un movimiento bancario ERP de la misma cuenta, moneda y sentido. Se puede asignar un importe parcial o completar el compromiso. El servidor limita la suma de asignaciones al importe bancario y al pendiente del compromiso, utiliza la revisión vigente y deja auditoría. Los cobros y pagos no se ejecutan automáticamente por coincidir en importe.

`Pendiente = importe planificado − ejecución vinculada`

La caja real sigue dependiendo exclusivamente de aperturas y movimientos bancarios. La asignación no añade ni resta otro movimiento real. El motor compartido de Flujo, Resumen, informes y escenarios proyecta solo el pendiente; una ejecución completa retira el evento futuro. Las tarjetas y la agenda de Proyecciones también utilizan el pendiente, y la tabla conserva el importe original.

Puede retirarse una asignación desde el mismo diálogo. Mientras existan ejecuciones, se impide eliminar el compromiso, cambiar su tipo/moneda/cuenta o reducirlo por debajo de lo ejecutado. Duplicar un compromiso no duplica sus ejecuciones. Los supuestos de escenario también deben respetar el mínimo ya ejecutado.

La evidencia de ejecución acompaña al compromiso cuando cambia el período ERP. Si un movimiento desaparece de una exportación que aún cubre su fecha, se muestra un aviso y se conserva la decisión hasta revisarla. No se infiere una reversa contable por ausencia. La cuenta del compromiso se muestra con el nombre vigente obtenido de su código bancario.

### Aplicación

Desde la raíz de tu repositorio, con el patch anterior aplicado:

```bash
git apply ~/Downloads/sonacol-planificacion-inicial.patch
pbcopy < supabase/migrations/20260928000000000_initial_business_plan.sql
```

Ejecuta el SQL copiado en el editor de tu proyecto Supabase y actualiza el frontend mediante tu procedimiento habitual. Después, selecciona la última carga ERP SONACOL, abre **Planificación y reglas → Revisar planificación inicial**, revisa la selección y pulsa **Aplicar selección**. Si la carga seleccionada es histórica respecto de otra versión, el diálogo permite consultar pero no incorporar el plan sobre ella; no cambies el corte para forzar una equivalencia artificial.

Las posibles coincidencias y las cuentas fuera de cobertura se señalan en la vista previa. No se sustituyen decisiones existentes para forzar los 43 registros. El horizonte de Resumen/Flujo determina qué parte del plan se muestra: el valor inicial de 30 días no incluye todos los compromisos hasta diciembre.

### Alcance y limitaciones

Este patch incorpora el plan conocido de PROYEC y su tratamiento como pendiente/ejecutado. Utiliza las reglas de cobranza y programación de rescates ya disponibles; **no inventa los rescates ni resuelve correspondencias de inversiones que todavía estén pendientes**, ni extiende los importes manuales de este plan más allá de diciembre. Los rescates deben continuar vinculados a una posición real y a su cuenta receptora en Planificación. La equivalencia completa con CAJA requiere la misma cobertura, decisiones de cobranza y programación de inversiones.

No se ejecutaron pruebas unitarias, SQL, navegador, validación TypeScript ni build para esta entrega. No se aplicó el SQL a una base local o productiva ni se realizó despliegue. La revisión fue por lectura del código y del diff. La integración y el comportamiento en ejecución quedan sin verificar.

## 32. Patch: expectativas de las pruebas de planificación

`sonacol-planificacion-check.patch` es incremental sobre `sonacol-planificacion-inicial.patch`, con base exacta en el árbol Git `45e70527540a8f8e9f531829485a53c0bfbc994b`. Corrige dos expectativas que quedaron desactualizadas al incorporar la planificación inicial.

- La prueba de previsiones congeladas exige la versión vigente `erp-business-plan-v2`, verifica que conserva decisiones, movimientos manuales y avisos, y comprueba que el snapshot completo almacenado permanece idéntico después de editar una decisión.
- La prueba de transición CAJA → ERP comprueba por separado el ajuste sin correspondencia, el rescate sin cuenta receptora válida y el aviso de ausencia de compromisos de egreso. Exige exactamente esos tres avisos; conserva las comprobaciones de fecha de cobro, decisiones migradas e importe/estado del rescate.

El registro de `pnpm check` proporcionado por el usuario muestra TypeScript correcto, ESLint sin errores y con cinco advertencias de Fast Refresh, y 210 de 212 pruebas aprobadas antes de este ajuste. Las dos fallas corresponden a las expectativas anteriores de versión y cantidad de avisos. Ese resultado pertenece a la ejecución del usuario y no valida esta corrección ni todos los nuevos recorridos de planificación.

Aplicación, desde la raíz del repositorio con el patch de planificación inicial ya incorporado:

```bash
git apply ~/Downloads/sonacol-planificacion-check.patch
```

Esta entrega modifica únicamente dos archivos de pruebas y esta documentación. No requiere nuevas migraciones SQL. Por instrucción del usuario, no se ejecutaron pruebas, TypeScript, lint, build ni migraciones al preparar esta corrección; la revisión fue por lectura de código y diff.

## 33. Patch 1: saldo real y cierre previsto del corte

**Entrega con revisión de código y diff. Sin ejecutar pruebas, TypeScript, lint, build, macros ni migraciones, por instrucción del usuario. Las verificaciones de entregas anteriores no validan este patch.**

`sonacol-posicion-caja.patch` parte del commit `10f2ca29bd10e3c15bcc08a43e8bb40b96163be1` de `feat/erp-native-operations`, que ya contiene `sonacol-planificacion-check.patch`. Requiere las migraciones anteriores hasta `20260928000000000_initial_business_plan.sql` y agrega `20261012000000000_cash_position.sql`.

### Criterio financiero

La lectura bancaria existente ya utiliza **Cargo − Abono** y mantiene aperturas separadas. La brecha identificada era posterior: todos los pendientes con fecha igual o anterior al corte se trasladaban al día siguiente. Además, los consumidores del snapshot descartaban su versión de cálculo.

Para las cargas ERP con versión `erp-cash-position-v3`, Resumen, Flujo, reportes, escenarios, agenda y asistente utilizan el mismo criterio:

| Concepto | Composición |
| --- | --- |
| Saldo bancario real al corte | Saldo inicial + cargos registrados − abonos registrados |
| Ingresos pendientes del corte | Cobros y rescates programados para esa fecha, todavía pendientes |
| Egresos pendientes del corte | Compromisos de esa fecha menos su ejecución vinculada |
| Cierre previsto del corte | Saldo real + ingresos pendientes − egresos pendientes |
| Apertura proyectada del día siguiente | Cierre previsto del corte |

Los movimientos bancarios registrados no se vuelven a proyectar. Las posiciones de inversión siguen siendo capital invertido; únicamente los rescates programados son eventos de ingreso. La categoría descriptiva no cambia el signo bancario. La ausencia de saldo final informado en ERP permite calcular el saldo y deja la comparación externa como «No comprobable».

Los pendientes **anteriores** al corte conservan su fecha original y la inclusión provisional en el día siguiente, con aviso explícito para revisar sus fechas. No se consideran cobros/pagos realizados ni se atribuyen al cierre del corte. Adoptar otra regla para estos vencidos requiere una decisión de negocio; este patch no presume que todo lo atrasado ocurrirá hoy.

El horizonte conserva su fecha final: un corte 09/10 con horizonte de 7 días termina el 16/10. La nueva serie contiene la fila pendiente del 09/10 y los 7 días posteriores, 8 filas en total. El mínimo considera tanto la caja real al corte como los cierres previstos. Si el mínimo corresponde al cierre previsto del corte, su enlace abre ese cálculo. Los días bajo umbral se cuentan una sola vez por fecha.

### Trazabilidad y cuentas

La sección compartida «Posición de caja» muestra las cuatro cifras y sus movimientos, además del detalle por cuenta y moneda original. Para cobros y rescates utiliza la cuenta receptora (`settlementLedger`), separada de la cuenta contable de origen. Si solo hay un banco declarado, se asigna exclusivamente cuando existe una única cuenta de esa moneda en la cobertura. Un pendiente sin cuenta única sigue incluido en el total filtrado y aparece para revisión; no se inventa saldo para esa cuenta.

Los reportes incluyen apertura diaria, egresos bancarios registrados, pendientes del corte, posición por cuenta y fechas de origen, planificación y cálculo. Conservan los avisos de cobertura y negocio. Los filtros de Resumen y Flujo siguen compartidos. Para comparar cifras utiliza la misma carga, moneda, banco y horizonte; los reportes ejecutivos muestran la moneda original y el total de bancos. La opción literal BASE de las vistas históricas no es una conversión de monedas.

La comparación CAJA/ERP utiliza un criterio de fechas común y avisa cuando recalcula la referencia antigua con el nuevo criterio. Sigue siendo una comparación dentro del motor; no sustituye la comprobación independiente de Excel prevista para la etapa de equivalencia.

### Activación e históricos

La migración agrega `daily_base_batches.projection_engine_version`. Mantiene el criterio anterior en las cargas existentes y activa el nuevo únicamente en la última carga global si corresponde a ERP. Las cargas nuevas guardan la nueva versión; el RPC solo la aplica al perfil ERP. Las cargas BASE/CAJA conservan su comportamiento anterior.

Una carga ERP activada conserva su versión cuando pasa a ser histórica. Las cargas ERP históricas anteriores a la migración mantienen el criterio previo. No se reescriben importes, fechas, datos originales, compromisos ni snapshots de escenarios/previsiones congeladas. Estos últimos se calculan usando la versión guardada dentro del snapshot. Una previsión sin versión conserva el criterio anterior.

La activación cambia la revisión del espacio de trabajo: es necesario actualizar la aplicación y volver a revisar los escenarios que se quieran rebasar sobre la carga vigente. Los nuevos guardados registran el motor real y rechazan un contexto con criterio desactualizado. El SQL debe instalarse junto con el frontend de esta entrega.

### Aplicación

Desde la raíz del repositorio, sobre la rama indicada y el patch anterior ya incorporado:

```bash
git apply ~/Downloads/sonacol-posicion-caja.patch
pbcopy < supabase/migrations/20261012000000000_cash_position.sql
```

Ejecuta el SQL copiado en el editor de tu proyecto Supabase. Actualiza el frontend por tu procedimiento habitual y recarga la aplicación. Selecciona la última carga ERP para ver «Posición de caja». No hace falta reimportar esa carga si era la última al instalar la migración. Si tenías seleccionada una carga histórica anterior, continuará mostrando el criterio antiguo.

### Alcance de la entrega y validación pendiente

La auditoría del CAJA 09/10 distinguió $2.172.083.343 de saldo contable y $2.886.785.491 de cierre previsto, después de $852.295.153 de rescate y $137.593.005 de egresos manuales del día. Son referencias de la auditoría del archivo, **no resultados obtenidos al ejecutar este patch**. La antigua ERP tiene otro corte; este cambio no fabrica datos actualizados ni garantiza esos importes en la instalación actual.

La planificación vigente, las colocaciones propuestas y el remanente posterior a colocaciones corresponden al siguiente patch. Esta entrega no reemplaza automáticamente los 43 compromisos iniciales de septiembre por los 38 de octubre. El resultado previsto sigue dependiendo de las decisiones realmente registradas en la plataforma.

Se incorporan casos de regresión para cierre del corte, Cargo/Abono, ejecución parcial/completa, cuenta receptora, pendientes sin cuenta, monedas, vencidos, agregación semanal/mensual, coherencia de reportes/escenarios, mínimo al corte y actualización de una instalación con históricos congelados. Se adaptan tres llamadas de pruebas existentes al contexto versionado. **Ninguno de estos casos fue ejecutado**; la compilación, la integración SQL y el comportamiento de navegador quedan pendientes de verificación. No se modificó producción ni se hizo push o despliegue.

## 34. Patch 2: planificación operativa y liquidez después de colocar

> Actualización posterior: el patch 3 agrega revisión preventiva de ejecuciones al importar ERP; véase la sección 35. No certifica equivalencia al mismo corte con CAJA.

**Revisión por lectura de código, diff y referencias del archivo. Sin ejecutar pruebas, TypeScript, lint, build, macros ni migraciones. Los casos nuevos se entregan sin ejecutar; no hay certificación de compilación, integración SQL ni equivalencia numérica de producción.**

`sonacol-planificacion-operativa.patch` es incremental sobre el commit `44fb0cdcda53cca9592c98c464b0bd4554758751` de `feat/erp-native-operations`, con el patch 1 ya aplicado. Agrega, en este orden:

1. `20261012010000000_planning_operations.sql`.
2. `20261012020000000_october_plan_review.sql`.

No modifica el lector de datos crudos ni instala datos operativos automáticamente. Mantiene `erp-cash-position-v3`, su corte seleccionado y los snapshots congelados. Las migraciones y el frontend deben actualizarse juntos; el antiguo botón de incorporación de septiembre se reemplaza por la transición revisada.

### Referencia de negocio y transición

La referencia es **CAJA SONACOL v4 09-10-2026.xlsm**, SHA-256 `786e2b1282c6ca60c0c91de9aaa78225c6bd835011f99983524fc5a61d80be98`. Su catálogo privado se consulta mediante un RPC autenticado. No requiere subir CAJA a la aplicación y no forma parte de la actualización diaria ERP.

| Elemento auditado | Implementación y decisión requerida |
| --- | --- |
| 38 compromisos de PROYEC | Movimientos manuales nativos con fecha, importe, tipo, categoría y cuenta. Adoptar, conservar un registro existente o dejar pendiente. |
| 5 colocaciones propuestas de INVERSIONES | Egresos planificados por cuenta, sin ejecución, rentabilidad ni vencimiento presumidos. |
| 6 rescates de COLOCACIONES | Decisiones sobre una posición ERP elegida expresamente; cuenta receptora de BASE, distinta del banco del fondo. |
| 6 políticas de cobranza por cliente | Vencimiento + 5 días naturales y cuenta receptora, aplicables a próximas facturas. Se confirman por código de cliente presente en ERP. |
| 48 referencias de facturas | Revisión de cuenta y de las 6 excepciones explícitas de fecha. No crean facturas ni duplican sus importes. |
| Fórmulas de fecha sin excepción | Permanecen como reglas; no se copia la fecha calculada como un ajuste fijo. |
| Importes manuales futuros | Permanecen como decisiones editables. No se deducen nuevas recurrencias de importes repetidos. La agenda conserva sus recurrencias semanales/mensuales explícitas. |

En **Planificación y reglas → Revisar transición del plan**, cada referencia empieza pendiente. Las opciones son crear, vincular conservando valores, o adoptar explícitamente los valores de la referencia sobre un registro existente. La revisión muestra ambos lados y requiere decidir conservar o retirar los compromisos anteriores sin correspondencia. Retirar cancela solo el pendiente; no indica que haya sido pagado y no borra ejecuciones.

La identidad de una referencia incluye su versión y origen. **Una fila de octubre nunca se empareja automáticamente con la misma fila de septiembre.** Las sugerencias por fecha/importe son solo ayudas. Una identidad incorporada, editada, cancelada o eliminada permanece reconocida en posteriores revisiones y cargas ERP. Se impide usar un registro para dos referencias de esta versión. Las proyecciones vinculadas a documentos deben desvincularse antes de sustituir sus valores o retirar su pendiente.

Adoptar valores de un compromiso reemplaza su fecha operativa, importe, cuenta, descripción y categoría; conserva estado, ejecución, comentarios, adjuntos e identidad de recurrencia. La fecha confirmada de su agenda se libera para que no oculte la nueva fecha adoptada. Conservar mantiene todos esos valores. Las operaciones son atómicas, requieren rol autorizado/MFA y rechazan revisiones desactualizadas.

### Cobranza y correspondencias incompletas

Las políticas por cliente pueden incorporarse independientemente de que las facturas de octubre aún no aparezcan en el ERP disponible. No sustituyen automáticamente reglas configuradas: hay que conservar o adoptar la decisión, y la adopción explícita asigna una prioridad superior a las reglas actuales. Las excepciones por factura siguen prevaleciendo.

Una referencia de factura exige coincidencia de empresa, código de cliente, documento, importe, moneda, emisión y vencimiento. Si hay varios destinos, deben revisarse sus identificadores y filas ERP. Sin coincidencia, queda pendiente; no se marca cobrada por ausencia.

La lectura del ERP de septiembre confirmó los códigos de cinco clientes. **COPEC requiere revisión:** CAJA indica RUT `0099520000-5` (referencia `C995200005`), mientras ese ERP contiene `C995200007`, `COPEC S.A.`. Este patch no equipara esos códigos por semejanza del nombre. La política y facturas de esa referencia no se asignan al otro código automáticamente. Puede configurarse una política nativa para el cliente correcto una vez aclarada la identidad.

### Colocaciones, rescates y cálculo

**Planificación → Colocaciones propuestas** permite crear, editar, cancelar y registrar ejecución de las colocaciones; también están en Proyecciones. La cuenta es explícita por código y moneda. Se elimina la elección arbitraria de la primera cuenta cuando varias comparten nombre de banco.

En un rescate guardado, **Editar → Ver o registrar ejecución guardada** abre la asignación contra cargos ERP. Compromisos y colocaciones utilizan el mismo control contra sus movimientos compatibles. Cada operación conserva importe original, asignaciones y pendiente; las reservas de rescate consumen solo el importe pendiente. Un movimiento no puede asignarse en exceso entre rescates y otros compromisos. Las asignaciones no crean otro movimiento real ni alteran el capital ERP.

Una ejecución completa elimina el evento futuro sin borrar su evidencia. Retirar una asignación vuelve a calcular el pendiente; cambiar manualmente el estado no demuestra una ejecución. Los estados «Ejecutado» anteriores sin asignaciones se conservan y se señalan para revisión. No pueden borrarse decisiones con asignaciones ni cambiar sus cuentas, monedas o posiciones sin retirarlas primero; el importe no puede quedar por debajo de lo ejecutado.

Resumen y Flujo muestran, en total y por cuenta:

`Saldo real + ingresos pendientes − pagos pendientes sin colocaciones = caja prevista antes de colocar`

`Caja prevista antes de colocar − colocaciones pendientes = liquidez prevista tras colocaciones`

Las colocaciones ya están incluidas una vez en los egresos del motor. El desglose no realiza una segunda resta. Los reportes contienen el mismo puente y el detalle diario. La apertura siguiente parte de la liquidez final prevista. Se mantienen monedas y fechas originales y la política de vencidos del patch 1.

### Aplicación

Desde la raíz de la rama indicada, con el patch 1 ya instalado:

```bash
git apply ~/Downloads/sonacol-planificacion-operativa.patch
pbcopy < supabase/migrations/20261012010000000_planning_operations.sql
```

Ejecuta el primer SQL una sola vez en el editor de Supabase. Después copia y ejecuta el segundo:

```bash
pbcopy < supabase/migrations/20261012020000000_october_plan_review.sql
```

Actualiza el frontend mediante tu procedimiento habitual y recarga la aplicación. Selecciona la última carga ERP y abre la revisión del plan. No reapliques migraciones anteriores ni cambies la fecha ERP para simular datos de octubre.

### Límites y controles pendientes

La auditoría de Excel distingue: caja real CLP **2.172.083.343**, rescate del día **852.295.153**, pagos manuales **137.593.005**, caja antes de colocar **2.886.785.491**, propuestas de colocación **2.877.900.000**, liquidez restante **8.885.491**. Son cifras del archivo de referencia, no resultados ejecutados de esta entrega. La ERP disponible es de otro corte; no se garantiza esa equivalencia en la instalación.

Las celdas auxiliares de vencimiento/rentabilidad de INVERSIONES estaban desactualizadas respecto del 09/10; no se utilizan para inventar nuevos rescates o intereses. Las 6 partidas de COLOCACIONES comparten la cuenta contable `511030001`: el ERP no aporta por sí solo identidad de fondo/tramo. La asignación y el límite de capital se revisan en la plataforma.

Pendiente de verificación en ejecución: instalación sobre la base vigente, adopción atómica e idempotente, edición y preservación de decisiones, cuentas y monedas, ejecuciones compartidas/parciales/completas, arrastre a nuevas cargas, vistas móviles y conservación de previsiones congeladas. Se agregan casos en `tests/planning-operations.test.ts`, sin ejecutarlos. El control más amplio de cobertura/reimportación y la comprobación independiente de equivalencia al mismo corte siguen correspondiendo a los patches 3 y 4.

## 35. Patch 3: revisión preventiva de actualización ERP

> El patch 4 agrega comparación opcional de cierre y corrige falsos positivos de la comparación histórica; véase sección 36.

Requiere ambos SQL del patch 2 y agrega `20261013000000000_erp_refresh_review.sql`. Instalar la migración antes de desplegar el frontend. No modifica filas existentes, cálculos de Cargo/Abono ni el mecanismo de arrastre; envuelve las RPC actuales y mantiene sus controles de permisos, versión y transacción.

La comparación de una carga vigente incorpora `refreshReview`: cuentas/monedas ausentes, asignaciones verificadas y evidencia que requiere revisión. Se suman conjuntamente ejecuciones de compromisos y rescates, incluso cancelados no eliminados. La revisión se repite en el servidor bajo el bloqueo de importación, sin confiar en el botón del navegador.

- Identidad exacta presente: compara cuenta, moneda, fecha, tipo e importe bancario original y comprueba el total asignado.
- Identidad ausente dentro del período cubierto: bloquea. Cambiar descripción o importe puede cambiar la identidad; no se intenta adivinar una correspondencia nueva.
- Cantidad de movimientos idénticos modificada: bloquea si afecta una ejecución. No deduplica movimientos legítimos por importe ni por descripción.
- Ejecución anterior a la apertura: conserva la evidencia histórica sin volver a contabilizarla. No certifica que la apertura sea correcta.
- Cuenta/moneda ausente: advierte, no interpreta cero, conserva la evidencia. No combina saldos de distintos cortes ni reconstruye la cuenta omitida.
- Carga histórica: no compara ni arrastra las ejecuciones de la planificación vigente. Mantiene el comportamiento histórico anterior.

Para un bloqueo, corregir primero una exportación incompleta o revisar la asignación en la versión vigente mediante su diálogo de ejecución. Retirar evidencia únicamente si es incorrecta y volver a analizar ERP. No existe reasignación automática ni una excepción para ignorar el bloqueo. Una corrección bancaria legítima puede exigir revisión explícita de la asignación anterior y vinculación posterior al movimiento corregido.

Sin pruebas, lint, compilación ni migraciones ejecutadas por solicitud del usuario. Pendiente validar en una base de ensayo: reimportación idéntica, cambio de corte/apertura, movimiento corregido o ausente, duplicados, combinación manual/rescate, conflictos concurrentes, cobertura por moneda y carga histórica. Este patch no incorpora un asistente de remapeo ni certifica el cierre de la migración o equivalencia con CAJA; requiere ERP del mismo corte para esa comprobación.

## 36. Patch 4: control de equivalencia del cierre

> La auditoría anterior está en `docs/erp-09-10-aperturas-vencimientos.md`. El contrato mensual de la sección 37 sustituye su interpretación diaria de SALDOS BANCOS y conserva el soporte de vencimientos explícitos.

Incremental sobre `9c20d45` (patches 1–3 publicados). No requiere nuevas migraciones, cambios de dependencias ni importación diaria de CAJA.

Resumen y Flujo de caja incluyen «Comparar cierre con una referencia» dentro de Posición de caja. Ingresa documento/hoja/celdas, fecha y seis totales independientes del cierre de referencia: saldo bancario real, ingresos pendientes, pagos pendientes sin colocaciones, caja antes de colocar, colocaciones pendientes y liquidez final. Las cifras no se precargan desde los cálculos de la app ni desde un Excel de otro corte. Cada campo acepta número sin separadores de miles y hasta dos decimales; vacío no equivale a cero.

La revisión exige corte idéntico, una moneda específica y confirmación del mismo alcance de cuentas y pendientes. Valida ambas ecuaciones de la referencia y contrasta el saldo ERP mostrado contra el control bancario por cuenta (apertura + cargos − abonos). Un saldo final no informado por ERP permanece desconocido y no se exige para calcularlo. Incidencias del motor, decisiones de negocio, cargas parciales y cuentas pendientes de asignación impiden indicar coincidencia sin observaciones. Las diferencias válidas se muestran aunque existan otras incidencias.

Los valores ingresados son locales al formulario y no se guardan como ajustes ni se reutilizan en otra carga, banco o moneda. La revisión puede exportarse a CSV mediante el permiso de exportación existente; incluye referencia, alcance, archivos de origen, cuentas, ambos valores, diferencias y observaciones. La comparación no modifica saldos ni verifica automáticamente que la referencia digitada sea auténtica/completa.

Se corrige también la comparación histórica CAJA/plataforma: un saldo neto coincidente deja de indicarse como coincidencia si hay movimientos sin correspondencia o diferencias de cuenta/tipo. Esa comparación continúa recalculando ambas cargas con el motor común y no constituye una comprobación independiente de fórmulas Excel.

### Estado de la migración

La operación diaria se mantiene en ERP más decisiones, compromisos, rescates, colocaciones y reglas nativas. CAJA puede servir de referencia de transición, no se añade como requisito diario. No se eliminan cargas históricas ni los mecanismos de consulta anteriores.

Entrega revisada estáticamente, **sin ejecutar pruebas, lint, TypeScript, compilación ni migraciones**. Pendiente comprobar en ejecución: diferencias compensadas, cuenta distinta dentro del mismo banco, campos vacíos/cero/negativos, cortes incompatibles, monedas, permisos CSV, cambios de carga y advertencias. Sigue pendiente la comparación financiera completa por cuenta y movimiento con ERP/CAJA reales del mismo corte; el control de seis totales no certifica por sí solo toda la funcionalidad financiera ni da por cerrada la migración.

## Guía y presentación

La guía de usuario está disponible en **Datos y control → Guía de usuario** (`/help`). Incluye búsqueda local, índice, procedimientos y glosario. El alcance del refinamiento visual se documenta en `docs/ui-refinement.md`; no requiere migraciones ni cambia cálculos financieros.

## 37. Apertura mensual y actualización incremental ERP

Contrato vigente: **SALDOS BANCOS es apertura mensual; BANCOS contiene movimientos fechados. Caja = apertura mensual + cargos acumulados − abonos acumulados.** El corte del archivo es independiente del primer día del mes. El informe completo, los controles por cuenta y las limitaciones están en [docs/erp-monthly-incremental.md](docs/erp-monthly-incremental.md).

El patch `sonacol-erp-mensual-incremental.patch` parte de `25e5207e15238cdce87da9571c1908b605ce6cfd` más `sonacol-refinamiento-visual.patch` ya aplicado, aunque siga sin commit. No repite el refinamiento visual. Después de comprobar y aplicar el patch, instala **solo** `supabase/migrations/20261014000000000_monthly_incremental_erp.sql`, después de `20261013010000000_daily_openings_maturities.sql`, y luego despliega el frontend actualizado. No vuelvas a ejecutar migraciones instaladas.

Para `ERP 13-10.xls`, usa empresa **SONACOL**, moneda **CLP**, corte **2026-10-13**, inicio bancario **2026-10-01** e inicio de inversiones **2026-09-30**. Si SALDOS BANCOS no informa fecha, el mes se declara en el contexto; su fecha original permanece vacía.

La comparación reconoce movimientos ya registrados e incorpora solo identidades bancarias nuevas. Conserva movimientos omitidos, sus fechas, origen y relaciones; muestra su efecto neto y permite desplegar su detalle. Bloquea aperturas inconsistentes y líneas ambiguas o corregidas de un asiento conocido. El resumen de una carga confirmada contiene contadores del servidor después de completar la transacción. Una repetición sin cambios reutiliza la fotografía y registra el intento exitoso sin añadir movimientos.

**Diferencia real pendiente:** al pasar del ERP 09-10 al 13-10 hay 8 movimientos nuevos, 16 coincidentes y 11 anteriores ausentes con efecto neto **−832.000.000 CLP**. Conservándolos, la caja calculada es **1.368.585.141 CLP**; leyendo únicamente el archivo del 13, es **2.200.585.141 CLP**. Se informa la diferencia y no se borran registros para igualar ambos resultados. Ambos archivos carecen de cierre bancario informado.

El registro bancario independiente sobrevive a la eliminación explícita de fotografías Excel; el diálogo informa sus cantidades. Borrar una fotografía no anula movimientos ni autoriza corregir sus importes. No se reescriben históricos al instalar la migración.
