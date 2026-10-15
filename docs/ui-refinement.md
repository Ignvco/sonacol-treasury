# Refinamiento visual y guía de usuario

Base: `25e5207`, rama `feat/erp-native-operations`, después del patch de aperturas y vencimientos. Este cambio no necesita migraciones.

## Auditoría y alcance

Se inspeccionaron las 18 pantallas operativas del menú, las rutas de acceso/error, el shell, los componentes de tesorería y los formularios de importación, planificación y ejecución. La revisión inicial fue de código; la validación de navegador usa datos anónimos en una base aislada, no la instalación de producción.

| Área | Hallazgo y tratamiento |
| --- | --- |
| Shell y navegación | Fondo punteado, sombras en estado activo y cabecera de altura fija. Fondo liso, selección suave y distribución flexible en móvil. Se conservan enlaces, etiquetas, menús y acciones. |
| Resumen, tarjetas e indicadores | Sombras profundas, tarjetas que se elevaban al pasar el cursor y superficies decorativas. Radios de 16 px, sombra mínima, azul corporativo sólido y sin desplazamiento decorativo. No cambia ninguna cifra, serie ni callback. |
| Tablas | Cabeceras pequeñas, en mayúsculas y con opacidad adicional. Se mejora tamaño y contraste; se conservan orden, búsqueda, densidad, columnas, paginación y scroll. |
| Formularios y modales | Inputs pequeños en móvil y espaciado de paneles poco flexible. Altura táctil de 44 px para los controles compartidos, texto de 16 px en inputs móviles y modal con padding adaptable. Se mantienen límites, validaciones y eventos. |
| Hoy, Resumen, Flujo, Cobranzas, Proyecciones, Reportes | Descripciones generales redundantes. Se retiran las seleccionadas o se acortan al contexto de fecha; se mantienen advertencias, ecuaciones, monedas, estados y trazabilidad. |
| Planificación | Introducción extensa sobre la arquitectura. Se convierte en encabezado operativo breve. Se mantienen instrucciones de adopción, capital remanente, cuentas receptoras y confirmación de ejecuciones. |
| Inversiones y Bancos | Las fechas, fuentes y saldos por cuenta son esenciales. No se retiran sus advertencias ni la evidencia por asiento. Solo se elimina la descripción redundante del portafolio. |
| Conciliación, Escenarios, Precisión y Cambios | Instrucciones sobre confirmación, simulación, reversa y falta de observaciones son funcionales. Se conservan. |
| Importaciones, Integraciones, Configuración y Seguridad | Se retiran introducciones genéricas. Se conservan estados de integración, permisos, cobertura, eliminación y errores. |
| Acceso y error | Se preserva la recuperación de acceso y el guard de autenticación. Los estilos compartidos mantienen etiquetas y foco. |

No se cambia la estructura de los componentes operativos, sus contratos, props, eventos, modelos, APIs, consultas ni permisos. Los cambios de clases y contenido visual no modifican cálculos. La única funcionalidad añadida es la guía aislada `/help`, registrada bajo el shell autenticado existente y enlazada en ambas navegaciones.

## Guía

`src/pages/help/chapters.ts` es la fuente de 22 capítulos en español, basada en las pantallas y servicios existentes. `src/pages/help/index.tsx` incorpora búsqueda local sin distinción de acentos, índice y enlaces a módulos. No escribe datos ni consulta servicios financieros adicionales desde la página.

Se prioriza la guía sobre un recorrido superpuesto. Un tour que señale formularios dinámicos necesitaría anclajes y sincronización con diálogos/permisos; no se añaden esas intervenciones a los componentes actuales. La guía es opcional y puede consultarse de nuevo desde el menú.

## Observaciones fuera del alcance

- Existen mensajes heredados que utilizan «BASE» aunque el origen seleccionado sea ERP. La guía explica este vocabulario. No se cambia la detección ni el significado de esos controles.
- La advertencia de cobertura puede repetirse entre el shell y la pantalla. Se conserva porque expresa riesgo financiero y retirar sus componentes queda fuera del alcance autorizado.
- El último patch financiero cambió la interpretación de aperturas y el registro de ejecuciones, pero varias pruebas anteriores siguen esperando los contratos previos. Se reportan sus resultados, sin cambiar fixtures financieros para obtener un resultado verde.
- Las posiciones agregadas no permiten deducir automáticamente capital remanente por vencimiento. La guía conserva esta limitación y no ofrece un rescate automático.

## Validación

El detalle final de comandos, resultados y limitaciones se entrega en `sonacol-refinamiento-visual-instrucciones.md`. Los tests nuevos de ayuda comprueban búsqueda, navegación y overflow de las 19 rutas de contenido en 1440, 390 y 320 px. Las pruebas operativas reutilizan las existentes con una base PostgreSQL aislada en memoria.
