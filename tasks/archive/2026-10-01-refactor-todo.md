# Lista de Tareas para Flash 3.8: SwimCoach Tracker (`tasks/todo.md`)

> **Instrucciones de Iteración:**
> Ejecuta un solo paso por sesión siguiendo las especificaciones e invariantes de [`tasks/plan.md`](./plan.md). Al finalizar cada paso, corre su comando `VERIFY` y marca las casillas `[x]` correspondientes aquí antes de detenerte.

---

## Paso 1: Captura Automática del Parcial Final al Detener el Cronómetro
**Descripción:** En `SwimmerCard.handleStop()` (`js/ui/swimmer-card.js`), si el cronómetro está en estado `RUNNING` y el tramo transcurrido desde el último pase (`getElapsedMs(timerState) - lastLapCumulativeMs`) es `>= 10` ms, registrar automáticamente ese tramo como pase (`await this.handleLap()`) antes de llamar a `timerEngine.stop(swimmer.id)`. Mantener los pases visibles en la tarjeta mientras está en `STOPPED`.
**Criterios de aceptación:**
- [x] Pulsar `Detener` (`handleStop`) cuando el cronómetro está en `RUNNING` con `pendingSplitMs >= 10` registra automáticamente el pase final en `card.laps` y en `IndexedDB`.
- [x] Pulsar `Detener` desde `PAUSED` o inmediatamente después de `handleLap` (`pendingSplitMs < 10`) no genera un pase duplicado.
- [x] Los pases de la serie detenida siguen visibles en `#recent-laps-list-<id>` mientras el estado es `STOPPED`.
- [x] Nuevo test `TC-SC-212` añadido en `tests/unit/swimmer_card.test.js` y pasando.
**Verificación:**
- [x] `node --test tests/unit/swimmer_card.test.js tests/unit/feature2_empirical.test.js tests/unit/timing.test.js`
**Archivos:** `js/ui/swimmer-card.js`, `tests/unit/swimmer_card.test.js`

---

## Paso 2: Módulo Compartido de Partición de Sesiones (`js/analytics/session-partitioner.js`)
**Descripción:** Extraer `partitionLapsIntoSessions(allLaps)` a `js/analytics/session-partitioner.js` y añadir `splitCurrentAndHistoricalSessions(allLaps)` que devuelve `{ sessions, currentSession, previousSessions }`. Reemplazar la función local en `js/app.js` por la importación del nuevo módulo.
**Criterios de aceptación:**
- [x] `js/analytics/session-partitioner.js` exporta `partitionLapsIntoSessions` y `splitCurrentAndHistoricalSessions`.
- [x] `js/app.js` importa `partitionLapsIntoSessions` desde `./analytics/session-partitioner.js` sin duplicar código.
- [x] Tests unitarios de partición por reinicio de `lapNumber` y por brecha `> 20 min` añadidos en `tests/unit/analytics.test.js`.
**Verificación:**
- [x] `node --test tests/unit/analytics.test.js tests/unit/feature4_drilldown.test.js tests/unit/challenger_m2_empirical.test.js`
**Archivos:** `js/analytics/session-partitioner.js`, `js/app.js`, `tests/unit/analytics.test.js`

---

## Paso 3: Rediseño de Métricas Individuales (Lupa) y Separación Reiniciar Reloj vs Borrar Sesión
**Descripción:** En `js/ui/metrics-modal.js`, separar el comportamiento de `#metrics-modal-reset` (reinicia solo el reloj de la tarjeta a `00:00.00` pero conserva los pases en `IndexedDB` y en la vista del modal) frente a `#metrics-reset-session` (borra el historial de `IndexedDB` con `clearHistorical: true`). Usar `splitCurrentAndHistoricalSessions` en `_renderBody()` para mostrar las métricas rápidas, boxplot y tabla sobre `currentSession`, y renderizar debajo las `Series Anteriores` (`previousSessions`) con tarjetas `.drilldown-session-card`.
**Criterios de aceptación:**
- [x] Pulsar `#metrics-modal-reset` reinicia el reloj a `IDLE` (`00:00.00`) sin vaciar los pases mostrados en `metricsModal`.
- [x] Pulsar `#metrics-reset-session` ("Borrar sesión") elimina los pases de `IndexedDB` y muestra `"Sin pases registrados aún."`.
- [x] `_renderBody()` calcula métricas rápidas, boxplot principal y tabla de pases sobre `currentSession`, y muestra `Series Anteriores` con `.drilldown-session-card` cuando `previousSessions.length > 0`.
- [x] Todos los tests `TC-MM-301`..`TC-MM-307` y los nuevos `TC-MM-308` y `TC-MM-309` pasan en `tests/unit/metrics_modal.test.js`.
**Verificación:**
- [x] `node --test tests/unit/metrics_modal.test.js tests/unit/swimmer_card.test.js`
**Archivos:** `js/ui/metrics-modal.js`, `tests/unit/metrics_modal.test.js`

---

## Paso 4: Conectar Estadísticas Globales a IndexedDB (`js/app.js`)
**Descripción:** Actualizar `showGlobalStats()` en `js/app.js` con renderizado dual (render síncrono inicial con `card.laps` seguido de hidratación asíncrona desde `repository.getLaps(swimmer.id)`) para que `Total Vueltas`, `Mejor Pase` y la tabla `Resumen por Nadador` reflejen siempre todos los pases guardados en `IndexedDB`, incluso cuando el cronómetro de la tarjeta fue reiniciado a `00:00.00`.
**Criterios de aceptación:**
- [x] `showGlobalStats()` mantiene compatibilidad con llamadas síncronas y actualiza los totales y filas por nadador desde `repository.getLaps(swimmer.id)`.
- [x] Reiniciar el cronómetro de un nadador (`card.handleReset()`) no hace que sus vueltas ni su ritmo desaparezcan de `Estadísticas Globales`.
- [x] Nuevo test `TC-DD-407` añadido en `tests/unit/feature4_drilldown.test.js` y pasando.
**Verificación:**
- [x] `node --test tests/unit/feature4_drilldown.test.js tests/unit/challenger_m2_empirical.test.js`
**Archivos:** `js/app.js`, `tests/unit/feature4_drilldown.test.js`

---

## Paso 5: Service Worker Network-First (`sw.js`) y Verificación End-to-End
**Descripción:** Actualizar `sw.js` a `CACHE_NAME = 'swimcoach-v7'`, incluir `./js/analytics/session-partitioner.js` y `./js/telemetry/telemetry.js` en `PRECACHE_URLS`, y cambiar el listener `fetch` a estrategia **Network-First con fallback a caché offline** para evitar que el navegador sirva JS obsoleto.
**Criterios de aceptación:**
- [x] `sw.js` usa `CACHE_NAME = 'swimcoach-v7'` y estrategia Network-First con fallback offline.
- [x] Suite completa de tests unitarios y de aceptación en verde (`0 fail`, `0 skipped`).
**Verificación:**
- [x] `npm test && npm run verify`
**Archivos:** `sw.js`
