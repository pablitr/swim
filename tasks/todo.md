# Lista de Tareas: CSV legible, etiquetas y borrado por sesión

> Prompt por iteración (tras /clear):
> Lee @tasks/plan.md y @tasks/todo.md. Ejecuta ÚNICAMENTE el Paso N del plan.
> Respeta las Invariantes y Casos Borde de ese paso, corre su comando de verificación,
> marca las casillas en tasks/todo.md y detente.

## Paso 1: Helpers de sesión + repository.updateLapsTag / deleteLaps
- [x] `normalizeSessionTag`, `getSessionTag`, `getSessionKey`, `SESSION_TAG_MAX_LENGTH` exportados
- [x] `repository.updateLapsTag(ids, tag)` y `repository.deleteLaps(ids)`
- [x] Tests en analytics.test.js y storage.test.js
- [x] VERIFY: `node --test tests/unit/analytics.test.js tests/unit/storage.test.js`

## Paso 2: js/ui/session-card.js
- [x] `renderSessionMetaHTML`, `renderSessionCardHTML` (apertura exacta `<div class="drilldown-session-card">`)
- [x] `bindSessionCardActions` con input inline (Enter/blur guarda una vez, Esc cancela) y tacho con confirm
- [x] tests/unit/session_card.test.js
- [x] VERIFY: `node --test tests/unit/session_card.test.js tests/unit/boxplot.test.js`

## Paso 3: Drill-down Estadísticas Globales
- [x] `SwimmerCard.handleSessionDeleted(ids)`
- [x] `showSwimmerDrillDown` usa session-card y bindea lápiz/tacho
- [x] TC-DD-408, TC-DD-409, TC-SC-213
- [x] VERIFY: `node --test tests/unit/feature4_drilldown.test.js tests/unit/challenger_m2_empirical.test.js tests/unit/swimmer_card.test.js`

## Paso 4: Lupa (metrics-modal)
- [x] Header "Serie actual" con lápiz/tacho; Series Anteriores vía session-card
- [x] Callback `onDeleteSession` en swimmer-card; botón renombrado a "Borrar todo el historial"
- [x] TC-MM-310, TC-MM-311; TC-MM-301..309 en verde
- [x] VERIFY: `node --test tests/unit/metrics_modal.test.js tests/unit/swimmer_card.test.js`

## Paso 5: js/analytics/csv-export.js
- [x] `buildSummaryRows`, `buildDetailRows`, `rowsToCsv`, helpers locales
- [x] tests/unit/csv_export.test.js (timestamps con constructor local)
- [x] VERIFY: `node --test tests/unit/csv_export.test.js`

## Paso 6: app.js — botones CSV y sin Estado
- [x] `#btn-export-csv-summary` y `#btn-export-csv-detail`; `exportCsv(mode)` usa csv-export.js; nombre con fecha local
- [x] Columna Estado eliminada (colspan 5)
- [x] VERIFY: `node --test tests/unit/feature4_drilldown.test.js tests/unit/challenger_m2_empirical.test.js && node tests/verify_spanish.js`

## Paso 7: CSS + sw.js v8 + E2E
- [x] Estilos de `.session-tag`, botones, input, `.current-session-meta`
- [x] Fix layout en `#metrics-modal`: `.modal-body > * { flex-shrink: 0 }`, `.laps-table-wrapper` (`max-height: 260px; flex-shrink: 0`) y `#metrics-modal-body .drilldown-sessions-stack` sin scroll anidado que comprima la tabla de pases
- [x] `swimcoach-v8` + nuevos módulos en PRECACHE_URLS
- [x] VERIFY: `npm test && npm run verify && node tests/verify_spanish.js`
