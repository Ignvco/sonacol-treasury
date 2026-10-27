/** User-facing documentation only. No financial rules are executed here. */
export const chapters = [
  {
    id: "inicio", title: "Primeros pasos", route: "/today", module: "Hoy",
    paragraphs: [
      "SONACOL reúne los datos importados de ERP, las decisiones manuales y la planificación de tesorería. ERP aporta los hechos; los compromisos, reglas y rescates se administran en la plataforma. El Excel CAJA anterior sirve como referencia de transición, no como archivo diario obligatorio.",
      "Trabaja siempre con una fecha de corte y una moneda identificadas. Una importación histórica, una cuenta sin cobertura o una proyección no equivalen al saldo bancario disponible hoy.",
    ],
    steps: ["Importa y confirma la ERP en Importaciones.", "Comprueba apertura, cargos y abonos por cuenta en Bancos.", "Revisa cuentas receptoras, cobros y rescates en Planificación y reglas; registra compromisos en Proyecciones.", "Consulta Resumen y Flujo de caja. Investiga las advertencias antes de usar el saldo proyectado.", "Registra ejecuciones contra movimientos ERP y genera Reportes cuando termines la revisión."],
  },
  {
    id: "navegacion", title: "Navegación, fechas y controles", route: "/settings", module: "Configuración",
    paragraphs: [
      "El menú agrupa Visión general, Operaciones, Decisiones y Datos y control. En móvil, Abrir navegación despliega las mismas secciones. La cabecera contiene la fecha de trabajo, búsqueda, moneda, notificaciones y menú de usuario.",
      "La fecha de trabajo permite elegir una carga concreta o la última disponible. Seleccionar un histórico consulta esa versión: no suma sus saldos con los de otras fechas. Corte significa fecha de los datos, no fecha de subida del archivo.",
      "Las pantallas financieras pueden tener filtros propios de banco, moneda y horizonte. Revisa estos controles además del selector general de moneda. BASE o moneda original sin conversión no representa una moneda única: no compares una suma nominal de monedas diferentes con un saldo CLP.",
      "En las tablas, utiliza Buscar cuando esté disponible, las cabeceras ordenables, la paginación y las opciones de columnas y densidad. Algunas preferencias se conservan en el navegador. Si faltan filas o columnas, revisa esos ajustes. En móvil, desplaza horizontalmente las tablas anchas.",
      "Las acciones visibles dependen de tu rol, autorización y contexto. Que una opción no esté disponible no autoriza a cambiar permisos ni a modificar una carga histórica para forzarla.",
    ], steps: [],
  },
  {
    id: "importar", title: "Importar y actualizar ERP", route: "/importations", module: "Importaciones",
    paragraphs: [
      "Se admiten XLSX, XLSM y XLS, hasta 20 MB y 20.000 filas. El lector reconoce los reportes de bancos, clientes y colocaciones por su estructura; SALDOS BANCOS aporta las aperturas bancarias. El formato histórico CAJA se procesa por su hoja BASE.",
      "SALDOS BANCOS contiene la apertura mensual, equivalente al cierre del mes anterior. Declara el primer día del mes como inicio bancario y la fecha de actualización como corte. Los movimientos conservan sus fechas dentro del mes. Si la hoja no contiene fecha, confirmas el mes de sus saldos; no se inventa una fecha en el archivo. El mayor de inversiones conserva su propio período.",
      "La vista previa todavía no guarda la información. Revisa las filas y confirma con Aplicar cambios o Confirmar revisión sin cambios, según el resultado mostrado. Espera la confirmación del servidor. Repetir exactamente el archivo no debe generar movimientos duplicados. Una nueva versión revisa identidades y cobertura, no asume ejecuciones por coincidencia de importe.",
      "La actualización incorpora únicamente identidades bancarias nuevas y conserva los movimientos anteriores ausentes del archivo, sus conciliaciones y las ejecuciones. Revisa los contadores y el efecto neto de los movimientos conservados. Una línea nueva o corregida en un asiento ERP ya conocido se bloquea si no puede identificarse inequívocamente. Las aperturas no se acumulan entre cargas. Una importación histórica conserva su propia fecha y no traslada el plan activo hacia atrás.",
      "El registro bancario es incremental. CLIENTES y COLOCACIONES representan el estado de sus reportes en cada carga: envíalos completos para la cobertura declarada. Un archivo de la tarde con nuevos movimientos bancarios no convierte los otros reportes en incrementales. El nombre del archivo no determina su fecha de corte.",
    ],
    steps: ["Selecciona o arrastra el archivo. Declara empresa, moneda, corte e inicio de los períodos bancario y de inversiones según la exportación real.", "Pulsa Aplicar cobertura y comparar. Revisa el perfil detectado, las hojas, los totales por cuenta y las filas nuevas, modificadas o con errores.", "Revisa Actualización ERP y ejecuciones. Si aparece un conflicto, identifica el movimiento y corrige su origen o su asignación justificada; no elimines el historial para sortearlo.", "Marca la revisión solicitada y confirma con Aplicar cambios o Confirmar revisión sin cambios. Espera el resultado; después verifica el archivo en el historial y sus filas de origen.", "Comprueba la fecha de trabajo y los saldos en Bancos. Una cuenta o moneda ausente de la exportación está fuera de cobertura, no tiene necesariamente saldo cero."],
  },
  {
    id: "bancos", title: "Bancos y saldos diarios", route: "/banks", module: "Bancos",
    paragraphs: [
      "SALDOS BANCOS informa la apertura mensual por empresa, cuenta y moneda. BANCOS aporta los movimientos: CARGO es ingreso y suma; ABONO es egreso y resta. Saldo al corte = apertura mensual + cargos acumulados − abonos acumulados hasta el corte. La apertura no es un ingreso, no se suma nuevamente cada día y no se acumulan aperturas de meses distintos.",
      "Filtra banco y moneda, revisa los controles de cada cuenta y abre el origen de las cifras cuando esté disponible. El saldo calculado puede existir sin saldo final informado por ERP. Sin ese dato independiente no se puede certificar una diferencia de cierre igual a cero.",
      "No confundas saldo contable con cartola conciliada. Los movimientos de reversa deben conservar su identidad; importes iguales no prueban duplicidad. Las diferencias se investigan por cuenta, fecha, apertura, cargos, abonos y fuente, sin ajustes automáticos para hacerlas desaparecer.",
    ], steps: [],
  },
  {
    id: "hoy", title: "Hoy: prioridades y agenda", route: "/today", module: "Hoy",
    paragraphs: ["Consulta la liquidez, el umbral, el horizonte y los cambios relevantes con los filtros de esta pantalla. Abre el respaldo de una cifra para investigar su origen.", "Tu agenda de gestión permite registrar tareas con título, detalle, fecha y responsable, según permisos. Las tareas organizan el trabajo; no crean un ingreso, pago o ejecución bancaria."],
    steps: ["Revisa las alertas y el horizonte seleccionado.", "Abre los movimientos que expliquen una cifra o un cambio.", "Crea o actualiza las tareas de seguimiento y registra las decisiones financieras en el módulo correspondiente."],
  },
  {
    id: "resumen", title: "Resumen y posición de caja", route: "/dashboard", module: "Resumen",
    paragraphs: [
      "La posición de caja separa saldo real, ingresos pendientes, pagos sin colocaciones, liquidez antes de colocar, colocaciones pendientes y liquidez después de colocar. Las colocaciones propuestas reducen la caja prevista; no se descuentan otra vez si ya están incluidas como egresos.",
      "Selecciona banco, moneda y horizonte. Abre las cifras y cuentas con desglose para seguir los registros que las componen. La actividad bancaria muestra los cargos y abonos registrados; la proyección muestra importes futuros pendientes. Una ausencia de egresos futuros no implica ausencia de abonos ya registrados.",
      "El control opcional de equivalencia compara totales de una referencia independiente del mismo corte y una moneda específica. Completa todos los campos y confirma el alcance. El formulario es de sesión, no guarda un cierre en la base de datos y no demuestra equivalencia movimiento por movimiento. Sus diferencias no corrigen saldos automáticamente.",
    ], steps: [],
  },
  {
    id: "flujo", title: "Flujo de caja y detalle diario", route: "/cashflow", module: "Flujo de caja",
    paragraphs: [
      "Revisa la serie diaria y las agrupaciones disponibles con el mismo corte, banco, moneda y horizonte que uses para comparar. Cada saldo se construye desde la apertura y los ingresos y egresos del período. Selecciona el saldo de un día para ver el cálculo.",
      "Las ejecuciones ya registradas en bancos no se suman de nuevo como compromisos pendientes. Los vínculos entre registros evitan duplicar el mismo cobro. Los criterios de fechas dependen de la versión del cálculo conservada por la carga; las previsiones congeladas mantienen su criterio histórico.",
      "Para investigar un egreso, distingue primero si está registrado en BANCOS, si es un compromiso manual pendiente o si pertenece a otra fecha/cuenta. Revisa las advertencias de cobertura antes de concluir que falta información.",
    ], steps: [],
  },
  {
    id: "cobranzas", title: "Cobranzas", route: "/receivables", module: "Cobranzas",
    paragraphs: ["Consulta la cartera, documentos abiertos y antigüedad de saldos. Busca el cliente o documento y revisa su detalle y vencimiento.", "El vencimiento contractual de ERP y la fecha prevista de cobro son distintos. Las condiciones por cliente, cuenta receptora y excepciones se gestionan en Planificación y reglas. Una factura que desaparece de una exportación no demuestra por sí sola que se haya cobrado."], steps: [],
  },
  {
    id: "inversiones", title: "Inversiones y vencimientos ERP", route: "/investments", module: "Inversiones",
    paragraphs: [
      "El calendario muestra las fechas explícitas de las entradas de inversión ERP, con su moneda original y origen. Los días se calculan respecto del corte seleccionado. Por vencer cuenta fechas de asientos en los próximos 30 días, no capital disponible. El detalle del mayor conserva también salidas, aperturas y registros sin fecha válida. No confundas fecha de operación con vencimiento.",
      "Una fecha vacía no se sustituye por una fecha ficticia. Una fecha inválida debe corregirse en la fuente. Las posiciones agregadas pueden tener varios vencimientos y retiros históricos sin correspondencia de lote; los importes por asiento no equivalen automáticamente al capital remanente por vencimiento.",
      "El dinero invertido no se convierte automáticamente en saldo bancario disponible. Programa el rescate en Planificación, revisa capital remanente, fecha e identidad de la cuenta receptora, y registra su ejecución cuando exista el cargo ERP correspondiente.",
    ], steps: [],
  },
  {
    id: "planificacion", title: "Planificación y reglas", route: "/planning", module: "Planificación y reglas",
    paragraphs: [
      "Este módulo administra ajustes sobre ERP, reglas operativas, cobranzas y rescates. Las decisiones explícitas prevalecen sobre las reglas. Los avisos de decisiones por revisar indican que el destino requiere comprobación con la cobertura actual.",
      "Las reglas iniciales disponibles para SONACOL incluyen cobranza a cinco días naturales y clasificación por descripción. Actívalas solo si corresponden al negocio. Configura las cuentas receptoras por cliente y revisa la vista previa de impacto antes de adoptar una política de cobranza; las fechas explícitas y excepciones se preservan según la revisión mostrada.",
      "La transición del plan de referencia 09/10/2026 es una revisión inicial, no una carga diaria de CAJA. Revisa qué conservar, incorporar o actualizar y las correspondencias explícitas. Retirar un compromiso cancela el pendiente y conserva las ejecuciones; una ausencia en la referencia no prueba pago. Adoptar valores no renueva automáticamente los meses siguientes.",
    ],
    steps: ["Revisa las decisiones pendientes y las cuentas receptoras de las cobranzas.", "Para un rescate, selecciona la posición y pulsa Programar rescate. Define importe, moneda, fecha y cuenta receptora dentro del capital disponible.", "Si aparece un vencimiento ERP, puedes usarlo como fecha, tras verificar importe remanente y destino. Guarda la decisión.", "Para ejecutar un rescate guardado, abre su ejecución y vincula el cargo bancario real. Revisa el pendiente resultante y el flujo."],
  },
  {
    id: "manual", title: "Proyecciones y compromisos manuales", route: "/projections", module: "Proyecciones",
    paragraphs: [
      "Registra ingresos y egresos que no vienen como hechos ejecutados de ERP. El formulario permite descripción, tipo, categoría, importe, moneda, fechas, estado y cuenta bancaria, además de información de seguimiento. Revisa el impacto antes de guardar.",
      "Las recurrencias semanales o mensuales generan las ocurrencias indicadas. Duplicar permite preparar otro compromiso, sin copiar sus ejecuciones. Las colocaciones propuestas se gestionan también desde Planificación y reducen la liquidez prevista de la cuenta elegida.",
      "La ejecución parcial o total exige asignar un movimiento ERP real compatible con cuenta, moneda y sentido. Un abono respalda un pago; un cargo respalda un ingreso o rescate. Cambiar una fecha o estado no sustituye esta evidencia. El flujo futuro usa el importe pendiente, y el ejecutado permanece en la caja bancaria.",
    ],
    steps: ["Crea o edita el compromiso y verifica la cuenta y moneda.", "Guarda y revisa que aparezca en la tabla y en la proyección de la fecha correspondiente.", "Después de actualizar ERP, abre la ejecución del compromiso y selecciona el movimiento e importe asignado.", "Comprueba el total ejecutado y el pendiente. Para corregir una asignación utiliza su acción explícita de retirada; no crees otra transacción compensatoria ficticia."],
  },
  {
    id: "conciliacion", title: "Conciliación con cartola", route: "/reconciliation", module: "Conciliación",
    paragraphs: ["Selecciona una cuenta importada y carga una cartola CSV independiente. Revisa el formato y validaciones del diálogo de importación antes de confirmar.", "Las sugerencias de coincidencia no se confirman automáticamente. Selecciona las partidas contables y bancarias, revisa importes y confirma la conciliación; pueden asignarse importes parciales. El historial conserva la operación y permite una reversa justificada según permisos.", "Conciliar una cartola comprueba correspondencias. No reemplaza la importación ERP ni equivale a registrar la ejecución de un compromiso de planificación."],
    steps: ["Elige cuenta y revisa su origen.", "Importa y valida la cartola CSV.", "Revisa pendientes o sugerencias, selecciona partidas e importes y confirma.", "Comprueba el historial; si debes revertir, aporta el motivo solicitado."],
  },
  {
    id: "cambios", title: "Explicar cambios", route: "/changes", module: "Explicar cambios",
    paragraphs: ["Selecciona dos cargas y una moneda para consultar altas, bajas, modificaciones y su trazabilidad antes/después. Cada versión conserva las decisiones manuales de su fecha.", "Una baja significa que el registro falta en la segunda versión: no demuestra pago ni conciliación. La comparación histórica de migración CAJA/ERP es opcional y requiere el mismo corte y una moneda; no es un paso diario obligatorio."], steps: [],
  },
  {
    id: "escenarios", title: "Laboratorio de caja", route: "/scenarios", module: "Laboratorio de caja",
    paragraphs: ["Simula cambios de fecha, importe o exclusión sobre movimientos futuros sin modificar los datos operativos. Selecciona escenario, nombre, moneda, horizonte y umbral; compara el saldo mínimo y el resultado frente a la referencia.", "Guardar escenario conserva los supuestos y una copia del origen. Rebasar sobre datos actuales exige revisar los supuestos que siguen correspondiendo. Congelar previsión actual guarda la previsión operativa sin los supuestos del laboratorio, para medirla después en Precisión."],
    steps: ["Abre o crea un escenario y establece sus controles.", "Ajusta los supuestos de los movimientos futuros y revisa gráfico y tabla.", "Guarda el escenario si deseas conservarlo. Usa Congelar previsión actual solo para registrar la previsión operativa que quieres evaluar posteriormente."],
  },
  {
    id: "precision", title: "Precisión de las previsiones", route: "/accuracy", module: "Precisión",
    paragraphs: ["Selecciona una previsión congelada. La pantalla compara lo previsto con las observaciones disponibles de cargas posteriores y muestra días observados, error absoluto medio y sesgo.", "Sesgo positivo significa observado mayor que previsto. Sin cargas de ciertas fechas no se inventan observaciones. El saldo contable observado no equivale a una cartola conciliada y una muestra pequeña no demuestra capacidad predictiva futura."], steps: [],
  },
  {
    id: "asistente", title: "Asistente de tesorería", route: "/assistant", module: "Asistente",
    paragraphs: ["Elige una consulta disponible o escribe una pregunta. Revisa corte, moneda y horizonte de la respuesta y abre sus movimientos de respaldo.", "La interpretación con IA externa es opcional y requiere configuración de TI. Si la activas, evita datos confidenciales en el texto de la pregunta. Las cifras se calculan en la plataforma; si el servicio externo falla, las consultas verificadas siguen siendo la alternativa disponible."], steps: [],
  },
  {
    id: "reportes", title: "Reportes y exportaciones", route: "/reports", module: "Reportes",
    paragraphs: ["Selecciona moneda y horizonte; consulta indicadores, proyección y detalle diario. Con permiso de exportación puedes descargar el informe Excel o PDF y sus datos de contexto y trazabilidad.", "Antes de compartirlo, comprueba archivo, corte, moneda, horizonte, advertencias y versión del cálculo. Las exportaciones por asiento de vencimientos conservan importes originales, no capital remanente por fecha. Si faltan botones de exportación, consulta a una persona administradora."], steps: [],
  },
  {
    id: "datos", title: "Historial e integraciones", route: "/integrations", module: "Integraciones",
    paragraphs: ["La eliminación se bloquea si dejaría compromisos, decisiones o vínculos sin una copia equivalente, o si afecta previsiones, escenarios u otro trabajo dependiente. Las reglas iniciales sin modificar no bloquean por sí solas. Revisa las dependencias mostradas: eliminar una carga no sirve para corregir una diferencia de cálculo.", "Eliminar un archivo no anula sus movimientos en el registro bancario incremental. Una nueva importación reconocerá esos movimientos. La auditoría de versiones manuales conserva valores desde la instalación de esta protección; no recupera información eliminada anteriormente.", "Integraciones muestra el estado de las fuentes e historial de sincronizaciones. Guardado, Revisar, No guardado, Sin verificar y Sin cambios describen resultados diferentes; un registro sin verificar no acredita datos persistidos.", "La recepción SAP y una conexión bancaria automática requieren configuración externa; no se activan por visitar esta pantalla. La cartola CSV se carga desde Conciliación. El flujo habitual de ERP se inicia en Importaciones."], steps: [],
  },
  {
    id: "seguridad", title: "Configuración y seguridad", route: "/security", module: "Seguridad",
    paragraphs: ["Configuración reúne parámetros, preferencias, tasas disponibles, usuarios, roles y auditoría. La moneda de visualización y los filtros de moneda de cada pantalla cumplen funciones distintas: comprueba qué unidad indica la cifra.", "Seguridad muestra las condiciones de acceso. Las personas administradoras autorizadas gestionan solicitudes, roles, requisitos de acceso y umbrales por moneda. Las cuentas nuevas pueden quedar pendientes de aprobación y puede exigirse MFA. Otra persona administradora debe cambiar tus propios permisos.", "Si no puedes entrar, sigue la recuperación indicada en la pantalla o solicita asistencia al administrador. No compartas contraseñas ni códigos de verificación."], steps: [],
  },
  {
    id: "rutina", title: "Rutina diaria y cierre de revisión", route: "/dashboard", module: "Resumen",
    paragraphs: ["Completa el circuito de datos antes de tomar decisiones de liquidez. La plataforma calcula la caja; la revisión de diferencias y la asignación de ejecuciones requieren evidencia del usuario."],
    steps: ["Actualiza ERP y confirma que el corte y la cobertura son correctos.", "Comprueba la ecuación bancaria por cuenta y resuelve advertencias de importación.", "Revisa cobros previstos, compromisos, colocaciones y vencimientos. Ajusta decisiones con justificación.", "Vincula los pagos y rescates ejecutados a sus movimientos bancarios; verifica los pendientes.", "Compara Resumen, Flujo y Reportes con el mismo alcance. Abre los desgloses de diferencias.", "Si cuentas con una referencia independiente, usa el control de equivalencia del mismo corte y moneda. Conserva el reporte y la evidencia de diferencias."],
  },
  {
    id: "problemas", title: "Solución de problemas", route: "/importations", module: "Importaciones",
    paragraphs: [
      "No veo egresos: revisa corte, banco, moneda y filtros; separa abonos registrados de compromisos futuros. Comprueba el origen y el importe pendiente antes de crear una nueva fila.",
      "No puedo actualizar ERP: identifica la fila y mensaje en la vista previa. Verifica encabezados, períodos y fechas; si hay ejecuciones vinculadas, revisa la identidad del movimiento. No cambies fechas para simular cobertura ni borres cargas para eludir conflictos.",
      "No aparece un vencimiento: comprueba que el archivo incluya la columna explícita y que se haya importado con el lector actualizado. Consulta el panel por asiento en una posición agregada. Una fecha ausente requiere revisar ERP, no inventar un plazo.",
      "Saldo inesperado: comprueba apertura mensual + cargos acumulados − abonos acumulados para la misma empresa, cuenta, moneda, mes y corte. Verifica la fecha real de la apertura y la cobertura de movimientos. Las cuentas no cubiertas no son cero; no sumes aperturas de varios períodos. Documenta la diferencia y la fuente.",
      "Cambios concurrentes: si la aplicación informa que la versión cambió, recarga, revisa las decisiones y vuelve a guardar sobre el estado vigente.",
      "Falta actualizar la base de datos: solicita al responsable técnico revisar las migraciones pendientes en el orden de entrega. No reintentes operaciones destructivas como solución.",
      "Al solicitar ayuda, indica pantalla, mensaje exacto, archivo y hoja/fila, fecha de corte, cuenta, moneda y acción realizada. Comparte los datos necesarios por el canal autorizado de tu organización.",
    ], steps: [],
  },
  {
    id: "glosario", title: "Glosario", route: "/help", module: "Guía de usuario",
    paragraphs: [
      "Corte: fecha a la que corresponde una carga. Fecha de carga: momento en que se sube, que puede ser posterior.",
      "Apertura mensual: saldo de cierre del mes anterior utilizado como referencia del mes actual; no es movimiento. La apertura diaria proyectada se deriva del cierre previsto anterior y no es una nueva apertura ERP. Cargo: ingreso bancario. Abono: egreso bancario.",
      "Cobertura: cuentas, monedas y períodos incluidos en una exportación. Fuera de cobertura no significa saldo cero.",
      "Compromiso: ingreso o pago planificado. Ejecutado: importe respaldado mediante asignación de movimientos ERP. Pendiente: parte que aún afecta el flujo futuro.",
      "Colocación: fondos invertidos o inversión propuesta, según el módulo. Rescate: liberación planificada de capital hacia una cuenta receptora. Vencimiento: fecha contractual explícita del asiento, distinta de la fecha de operación.",
      "Escenario: simulación con supuestos. Previsión congelada: fotografía de la proyección operativa guardada para evaluar su precisión.",
      "Conciliación: correspondencia confirmada con una cartola independiente. Trazabilidad: posibilidad de seguir una cifra hasta archivo, hoja, fila y decisiones asociadas.",
      "BASE: hoja del formato CAJA histórico y término que aún aparece en algunos controles de la plataforma. En filtros, BASE puede indicar importes originales sin conversión; comprueba el contexto.",
    ], steps: [],
  },
];
