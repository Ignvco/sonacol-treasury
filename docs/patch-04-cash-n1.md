# SONACOL Treasury — FASE 1 / PATCH 04 (caja N y proyección N+1)

Base remota revisada: `feat/erp-native-operations` @ `91925827143c8749864ceb27d309eefef727d61a` (27-oct-2026). Aplica únicamente si no se incorporaron otros cambios en los archivos modificados. Preserve commits locales y no fuerce un `git reset`.

## Alcance de la implementación

- Motor `erp-cash-position-v4`: caja **real** al corte N desde movimientos BANCO y apertura; los movimientos BANCO conciliados no vuelven a entrar en el pronóstico. El corte N tiene una **tarjeta separada de cierre previsto**, nunca una fila en la serie oficial.
- La proyección oficial contiene **horizonte** filas y comienza N+1 (en vez de N), a partir de caja **real** del corte. Pendientes de N y vencidos anteriores se arrastran a N+1 sin convertirlos en operaciones ejecutadas ni duplicarlos. Movimientos posteriores conservan su fecha prevista. Los vencimientos/inversiones no son caja disponible ni rescates automáticos.
- `v4` suma importes en unidades menores exactas con `bigint` para movimientos, cuentas, flujo, vínculos y ejecuciones dentro del motor. Cualquier importe que no tenga centavos exactos o exceda la capacidad segura de los adaptadores actuales se rechaza en vez de redondearse silenciosamente. Las APIs y UI aún exponen `number`: pendiente migrar contrato de transporte a cadena decimal en fase posterior.
- Motor `erp-cash-position-v3`, versiones antiguas y proyecciones guardadas se mantienen sin cambio de criterio. No se modifican snapshots históricos ni reglas financieras SQL existentes.
- Dashboard con filtro por rango: en `v4` usa la **misma serie del motor** y la recorta a las fechas elegidas; en versiones previas conserva el cálculo heredado. Nunca reabre la caja real ni usa `projectCashFlow` alternativo cuando `engineVersion=v4`.

## Activación deliberadamente bloqueada

**No hay migración SQL en este patch ni cambio de default a v4**. La versión activa proviene del snapshot ERP servido por la base. Se necesita primero verificar el historial de 15 migraciones ejecutadas manualmente desde Supabase y preparar una migración *separada, no destructiva*, que habilite `v4` solo para nuevas importaciones, tras revisión de `projection_engine_version`, `get_daily_base_snapshot`, validación de escenarios y permisos. Modificar un batch antiguo o el motor v3 en vivo reescribiría el significado de pronósticos históricos.

**En consecuencia:** al instalar este patch, las pantallas que reciban `erp-cash-position-v3` deben conservar su comportamiento actual. El nuevo motor N+1 está implementado y probado por fixtures con versión explícita; aún **NO** es el motor predeterminado ni una modificación visible en producción. No realizar `supabase db push`, `supabase migration repair`, `supabase db reset` ni ejecutar migraciones antiguas.

## Validar en el Mac

```sh
git branch --show-current
git status --short
git apply --check ~/Downloads/SONACOL_FASE1_PATCH_04_CAJA_N1.patch
git apply ~/Downloads/SONACOL_FASE1_PATCH_04_CAJA_N1.patch
node --import tsx --test tests/cash-position-n1.test.ts
pnpm check
pnpm build
```

## Criterios para activar en una entrega siguiente

1. Reconciliar evidencia del catálogo y SQL de migraciones ejecutadas desde SQL Editor; respaldo y prueba de restauración verificados.
2. Integración real ERP 14-10 y CAJA SONACOL: saldo por cuenta / moneda / corte, sin usar como origen las cifras históricas 09-10 ni el error contable descartado de 832 millones.
3. Adaptar el servidor para etiquetar **solo nuevas cargas** con `erp-cash-position-v4` y validar rechazos si intentan guardar escenarios con una versión distinta. Los históricos v3 deben conservar su `engine_version`.
4. Ejecutar tests completos con PGlite, navegador y versiones guardadas; validar moneda, pendientes del corte, deduplicación, fuente documental y escenarios editados.
5. La selección `BASE` heredada contiene importes literales sin conversión FX; NO se debe interpretar como liquidez multimoneda en CLP. Se integrará catálogo cuenta real ↔ cuenta contable y moneda en fases posteriores.

No se ejecutan Actions ni se modifica Supabase desde este patch.
