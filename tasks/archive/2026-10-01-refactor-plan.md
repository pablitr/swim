# Plan de Refactorización Guiada: SwimCoach Tracker (`tasks/plan.md`)

> **Cómo usar este plan con Flash 3.8 (iterando con `/clear`):**
> En cada iteración, ejecuta `/clear` y envíale a Flash 3.8 este prompt cambiando el número de paso:
> ```text
> Lee @tasks/plan.md y @tasks/todo.md. Ejecuta ÚNICAMENTE el Paso N del plan.
> Respeta todas las Invariantes Estrictas y Casos Borde descritos en ese paso, ejecuta el comando de verificación al terminar, marca el paso como completado en tasks/todo.md y detente.
> ```

---

## Resumen de Arquitectura y Problemas que Resuelve este Plan

1. **Los tiempos no se pierden al pulsar "Detener" (`#btn-stop-<id>`):**
   - Cuando un nadador está en `RUNNING` y el entrenador pulsa **Detener**, si existe tiempo transcurrido desde el último pase (`elapsedMs - lastLapCumulativeMs >= 10`), la tarjeta registra automáticamente ese tramo final como pase en memoria (`this.laps`) y en `IndexedDB` antes de pasar el cronómetro a estado `STOPPED`.
   - En estado `STOPPED`, los pases de la serie recién terminada permanecen visibles en la tarjeta hasta que se inicie una nueva serie (`Iniciar`) o se reinicie el reloj.
2. **Separación estricta entre "Reiniciar cronómetro" y "Borrar sesión":**
   - **Reiniciar cronómetro (`#metrics-modal-reset` o reinicio maestro):** Pone el reloj de la tarjeta en `00:00.00` (`IDLE`) y limpia `card.laps` para la próxima serie, pero **jamás borra `IndexedDB`** ni vacía la vista del modal de Métricas Individuales.
   - **Borrar sesión (`#metrics-reset-session`):** Única acción (junto con eliminar nadador) que borra los pases históricos de `IndexedDB` (`clearHistorical: true`).
3. **Conexión total entre Métricas Individuales (Lupa) y Estadísticas Globales:**
   - Ambas vistas comparten el mismo particionador de sesiones (`js/analytics/session-partitioner.js`) y la misma fuente de verdad (`repository.getLaps(swimmer.id)` en `IndexedDB`).
   - **Métricas Individuales (Lupa)** muestra arriba la **Serie Actual / Última Serie** (zonas, métricas rápidas, boxplot y tabla de pases) y debajo la lista de **Series Anteriores** con sus boxplots.
   - **Estadísticas Globales** lee de `IndexedDB` (no solo de `card.laps` en memoria), por lo que nunca pierde las vueltas ni los ritmos cuando un cronómetro se detiene o se reinicia a `00:00.00`.
4. **Service Worker sin bloqueo por caché vieja (`sw.js`):**
   - Estrategia **Network-First con fallback a caché offline** (`swimcoach-v7`) para que el navegador cargue siempre el código JS actualizado cuando hay red y funcione offline en la pileta.

---

## Grafo de Dependencias

```text
Paso 1: Captura automática del parcial final al Detener (js/ui/swimmer-card.js + tests)
   │
   ▼
Paso 2: Módulo compartido de Sesiones (js/analytics/session-partitioner.js + js/app.js)
   │
   ├──► Paso 3: Rediseño de Métricas Individuales (Lupa) y Reset no destructivo (js/ui/metrics-modal.js)
   │
   └──► Paso 4: Sincronización de Estadísticas Globales con IndexedDB (js/app.js)
           │
           ▼
        Paso 5: Service Worker Network-First y Validación End-to-End (sw.js + suite completa)
```

---

## Paso 1: Captura Automática del Parcial Final al Detener el Cronómetro

### Objetivo
Garantizar que cuando el entrenador pulsa **Detener** (`#btn-stop-<id>`) mientras el nadador está nadando (`RUNNING`), el tiempo transcurrido desde el último pase (o desde `00:00.00` si no hubo pases previos) se guarde automáticamente como el pase final de la serie en `this.laps` y en `IndexedDB`, antes de transicionar el reloj a `STOPPED`.

### Archivos a inspeccionar y modificar
- `js/ui/swimmer-card.js` (método `handleStop()` y flujo hacia `handleLap()`)
- `tests/unit/swimmer_card.test.js`
- `tests/unit/feature2_empirical.test.js`

### Especificación Técnica e Instrucciones de Razonamiento
1. En `SwimmerCard.handleStop()` (`js/ui/swimmer-card.js`):
   - Antes de invocar `timerEngine.stop(this.swimmer.id)`, verifica si `this.timerState.state === TIMER_STATES.RUNNING`.
   - Si está en `RUNNING`, calcula el tiempo parcial pendiente de registrar:
     - `const currentElapsedMs = timerEngine.getElapsedMs(this.timerState);`
     - `const lastLapCumulativeMs = Number(this.timerState.lastLapCumulativeMs) || 0;`
     - `const pendingSplitMs = currentElapsedMs - lastLapCumulativeMs;`
   - **Condición exacta de auto-registro:** Si `pendingSplitMs >= 10` (10 milisegundos o más), llama a `await this.handleLap()` antes de llamar a `await timerEngine.stop(this.swimmer.id)`.
2. **Por qué el umbral `pendingSplitMs >= 10` y solo en `RUNNING` (Casos Borde Críticos):**
   - **Caso borde 1 (`PAUSED -> STOPPED`):** Si el entrenador ya había pulsado `Pase+Pausa` o `Pausar`, el estado es `PAUSED`. Al pulsar luego `Detener`, **no** debe registrarse otro pase (esto preserva el test `EMP-F2-10`).
   - **Caso borde 2 (`handleLap()` seguido inmediatamente de `handleStop()` en el mismo tick de CPU):** En el test existente `EMP-F2-07`, se ejecuta `await card.handleLap(); await card.handleStop();` sin `setTimeout` intermedio (`pendingSplitMs` es `0`–`2` ms). El umbral `pendingSplitMs >= 10` evita crear un segundo pase artificial de `0ms` y mantiene `EMP-F2-07` en verde.
   - **Caso real en pileta (`RUNNING` con tiempo transcurrido `>= 10ms`):** El entrenador inicia el reloj (o toma el pase 1) y cuando el nadador termina toca `Detener`. Como `pendingSplitMs >= 10`, se registra automáticamente el pase final en `this.laps` y en `IndexedDB`, y luego el reloj queda en `STOPPED` mostrando el tiempo final y los últimos pases en la tarjeta.
3. **Invariantes Estrictas:**
   - `handleStop()` **no** debe vaciar `this.laps`. Los pases de la serie recién detenida deben seguir mostrándose en `#recent-laps-list-<id>` mientras el estado sea `STOPPED`.
   - `TimerEngine.stop()` en `js/timing/timer-engine.js` debe mantener su contrato de bajo nivel intacto para no romper `TC-T1-104` en `tests/unit/timing.test.js`.

### Tests a añadir / verificar
- En `tests/unit/swimmer_card.test.js`, añade el test `TC-SC-212`:
  1. Inicia una tarjeta (`await card.handleStart()`), espera `40ms`, y llama a `await card.handleStop()` sin haber llamado a `handleLap()`.
  2. Verifica que `card.timerState.state === TIMER_STATES.STOPPED`.
  3. Verifica que `card.laps.length === 1`, que `card.laps[0].lapNumber === 1`, y que `await repository.getLaps(swimmer.id)` contiene exactamente ese pase persistido.
  4. Verifica que `card._recentLapsListEl.innerHTML` incluye `'V1'` (el pase sigue visible en la tarjeta tras detener).

### Comando de Verificación del Paso 1
```bash
node --test tests/unit/swimmer_card.test.js tests/unit/feature2_empirical.test.js tests/unit/timing.test.js
```

---

## Paso 2: Módulo Compartido de Partición de Sesiones (`js/analytics/session-partitioner.js`)

### Objetivo
Extraer la lógica que agrupa pases cronológicos en series/sesiones de entrenamiento a un módulo compartido (`js/analytics/session-partitioner.js`) para que tanto **Métricas Individuales (Lupa)** como **Estadísticas Globales** utilicen exactamente la misma definición de serie actual e historial de sesiones.

### Archivos a inspeccionar y modificar
- Crear `js/analytics/session-partitioner.js`
- Modificar `js/app.js`
- Modificar `tests/unit/analytics.test.js`

### Especificación Técnica e Instrucciones de Razonamiento
1. Crea `js/analytics/session-partitioner.js` y exporta dos funciones puras:
   - `partitionLapsIntoSessions(allLaps)`:
     - Si `!Array.isArray(allLaps) || allLaps.length === 0`, devuelve `[]`.
     - Crea una copia ordenada cronológicamente por `timestamp` ascendente (si ambos objetos tienen `timestamp` numérico; si no tienen `timestamp`, preserva su orden relativo original).
     - Recorre los pases y abre una nueva sesión cada vez que para el pase actual respecto al anterior (`prevLap`) se cumpla cualquiera de estas dos condiciones:
       1. Reinicio de numeración de vuelta: `(lap.lapNumber === 1 && prevLap.lapNumber !== 1) || (lap.lapNumber <= prevLap.lapNumber)`
       2. Brecha temporal mayor a 20 minutos: `Boolean(lap.timestamp && prevLap.timestamp && (lap.timestamp - prevLap.timestamp > 20 * 60 * 1000))`
     - Devuelve `Array<Array<Object>>` con las sesiones en orden cronológico (la primera es la más antigua, la última es la más reciente).
   - `splitCurrentAndHistoricalSessions(allLaps)`:
     - Llama a `const sessions = partitionLapsIntoSessions(allLaps);`
     - Si `sessions.length === 0`, devuelve `{ sessions: [], currentSession: [], previousSessions: [] }`.
     - Devuelve:
       - `sessions`: todas las sesiones en orden cronológico.
       - `currentSession`: `sessions[sessions.length - 1]` (la serie/sesión más reciente o activa).
       - `previousSessions`: `sessions.slice(0, -1).reverse()` (las sesiones anteriores en orden cronológico inverso, de más reciente a más antigua).
2. En `js/app.js`:
   - Reemplaza la función local `partitionLapsIntoSessions` importándola desde `./analytics/session-partitioner.js`.
3. En `tests/unit/analytics.test.js`:
   - Añade un bloque `describe('Session Partitioner Tests', ...)` que pruebe:
     - Partición por reinicio de `lapNumber` (`1, 2, 3 -> 1, 2`).
     - Partición por brecha de tiempo `> 20 min` aunque `lapNumber` continúe.
     - `splitCurrentAndHistoricalSessions` devolviendo `currentSession` (última serie) y `previousSessions` en orden inverso.

### Comando de Verificación del Paso 2
```bash
node --test tests/unit/analytics.test.js tests/unit/feature4_drilldown.test.js tests/unit/challenger_m2_empirical.test.js
```

---

## Paso 3: Rediseño de Métricas Individuales (Lupa) y Separación de Reinicio de Reloj vs Borrado de Historial

### Objetivo
1. Evitar que pulsar **Reiniciar cronómetro** (`#metrics-modal-reset`) dentro del modal de Métricas borre visualmente los pases del modal.
2. Conectar el diseño de **Métricas Individuales (Lupa)** con el de **Estadísticas Globales**: mostrar en la parte superior los datos de la **Serie Actual / Última Serie** (`currentSession`) y debajo una sección de **Series Anteriores** (`previousSessions`) con tarjetas `.drilldown-session-card` y boxplots normalizados.

### Archivos a inspeccionar y modificar
- `js/ui/metrics-modal.js`
- `js/ui/swimmer-card.js`
- `tests/unit/metrics_modal.test.js`

### Especificación Técnica e Instrucciones de Razonamiento
1. **Diferenciación estricta entre los dos botones de reinicio en `js/ui/metrics-modal.js` y `js/ui/swimmer-card.js`:**
   - **Botón 1: `#metrics-modal-reset` (icono de reloj en el header del modal — "Reiniciar cronómetro"):**
     - Propósito: Poner el cronómetro de la tarjeta en `00:00.00` (`IDLE`) y vaciar `card.laps` en la tarjeta para que quede lista para una nueva serie, **conservando intacto el historial en `IndexedDB` y en el modal**.
     - En `MetricsModal._init()` (`js/ui/metrics-modal.js`), cuando se confirma `#metrics-modal-reset`:
       - Llama a `await this.callbacks.onReset({ clearHistorical: false })`.
       - **Corrección crítica:** NO asignes `this.laps = []`. Tras ejecutar `onReset({ clearHistorical: false })`, si `repository && typeof repository.getLaps === 'function'`, consulta `const persisted = await repository.getLaps(this.swimmer.id);` y si `persisted && persisted.length > 0`, actualiza `this.laps = persisted` (si `persisted` está vacío pero `this.laps` ya tenía datos en memoria en un entorno de test sin DB, conserva `this.laps`). Luego llama a `this._renderBody(this.swimmer, this.laps)`.
   - **Botón 2: `#metrics-reset-session` (botón rojo inferior — "Borrar sesión"):**
     - Propósito: Borrar el historial de pases en `IndexedDB` (`clearHistorical: true`) y reiniciar el reloj.
     - Cuando se confirma `#metrics-reset-session`, llama a `await this.callbacks.onReset({ clearHistorical: true })`, asigna `this.laps = []` y re-renderiza `this._renderBody(this.swimmer, this.laps)` mostrando `"Sin pases registrados aún."`.
2. **Separación de "Serie Actual" y "Series Anteriores" en `MetricsModal._renderBody(swimmer, laps)`:**
   - Importa `splitCurrentAndHistoricalSessions` desde `../analytics/session-partitioner.js` y `renderBoxplotSVG` desde `./boxplot-svg.js`.
   - Obtén `{ currentSession, previousSessions } = splitCurrentAndHistoricalSessions(laps)`.
   - **Métricas rápidas (`.quick-metrics`), Boxplot principal (`#metrics-boxplot-<id>`) y Tabla de pases (`.laps-table`):**
     - Calcúlalos y renderízalos usando `currentSession` (en lugar de mezclar todos los pases de `laps` en una sola tabla plana).
     - En la tabla de pases de `currentSession`, mantén exactamente la misma estructura HTML (`<tr class="${lap.isOutlier ? 'outlier' : ''}">`, `<strong>#${lap.lapNumber}</strong>`, `.btn-lap-delete` con `data-lap-id` y `data-lap-number`).
   - **Nueva sección "Series Anteriores" dentro del mismo modal:**
     - Si `previousSessions.length > 0`, calcula `globalMin` y `globalMax` en segundos entre todas las sesiones (`[currentSession, ...previousSessions]`) y renderiza debajo de la tabla de pases:
       ```html
       <div class="modal-section-title">Series Anteriores (${previousSessions.length})</div>
       <div class="drilldown-sessions-stack">
         <!-- Una tarjeta .drilldown-session-card por cada sesión en previousSessions -->
       </div>
       ```
     - Cada `.drilldown-session-card` debe mostrar la fecha/hora (o `Serie #N`), cantidad de pases (`X pases`), `Mejor: <strong>...</strong>`, `Ritmo: <strong>...</strong>` y el gráfico `renderBoxplotSVG(splitsSeconds, { baseline, width: 440, height: 75, globalMin, globalMax })` — exactamente igual que en `showSwimmerDrillDown` de `js/app.js`.
3. **Invariantes Estrictas (para no romper `TC-MM-301`..`TC-MM-307`):**
   - Cuando `laps` está vacío (`[]`), debe seguir mostrándose el texto exacto `"Sin pases registrados aún."`.
   - Cuando se elimina un pase con `_handleDeleteLap(lapId, lapNum)`, se elimina de `IndexedDB` (`repository.deleteLap(lapId)`) y de `this.laps` preservando los números originales de vuelta (`#1` y `#3` si se borra `#2`).
   - Al actualizar `state.lastLapCumulativeMs` tras borrar un pase, usa el último pase restante de `currentSession` (`const updatedCurrent = splitCurrentAndHistoricalSessions(this.laps).currentSession; const lastLap = updatedCurrent.length > 0 ? updatedCurrent[updatedCurrent.length - 1] : null;`).

### Tests a añadir en `tests/unit/metrics_modal.test.js`
- `TC-MM-308`: Verificar que pulsar `#metrics-modal-reset` invoca `onReset({ clearHistorical: false })` y **conserva** los pases visibles en el modal (no muestra `"Sin pases registrados aún."`), mientras que pulsar `#metrics-reset-session` invoca `onReset({ clearHistorical: true })`, limpia `repository` y muestra `"Sin pases registrados aún."`.
- `TC-MM-309`: Pasar a `metricsModal.open()` pases de 2 series distintas (Serie 1: `lapNumber: 1, 2`; Serie 2: `lapNumber: 1, 2, 3`) y verificar que la tabla `.laps-table` muestra los 3 pases de la Serie 2 y que se renderiza `.drilldown-session-card` en `Series Anteriores` para la Serie 1.

### Comando de Verificación del Paso 3
```bash
node --test tests/unit/metrics_modal.test.js tests/unit/swimmer_card.test.js
```

---

## Paso 4: Conectar Estadísticas Globales a IndexedDB y Unificar con Vista Individual

### Objetivo
Corregir `AppCoordinator.showGlobalStats()` en `js/app.js` para que lea todos los pases persistidos en `IndexedDB` (`repository.getLaps(swimmer.id)`) en lugar de depender únicamente de `card.laps` (que se vacía al reiniciar el reloj o al recargar en `IDLE`).

### Archivos a inspeccionar y modificar
- `js/app.js`
- `tests/unit/feature4_drilldown.test.js`
- `tests/unit/challenger_m2_empirical.test.js`

### Especificación Técnica e Instrucciones de Razonamiento
1. **Problema actual en `js/app.js` (líneas 199–240):**
   - `showGlobalStats()` toma `const allLaps = [...this.cards.values()].flatMap(c => c.laps);`. Si un nadador completó una serie y reinició el cronómetro para la siguiente, `card.laps` es `[]` y `Estadísticas Globales` muestra `0` vueltas y `--` en Mejor Pase y Ritmo.
2. **Patrón de Renderizado Dual (Síncrono Inicial + Hidratación IndexedDB) — MUY IMPORTANTE:**
   - Algunos tests existentes (`TC-DD-401`, `TC-DD-402` y `challenger_m2_empirical.test.js`) llaman a `app.showGlobalStats()` **sin `await`** e inspeccionan `contentEl.innerHTML` en la línea inmediatamente siguiente.
   - Por lo tanto, implementa `async showGlobalStats()` usando un método auxiliar privado `_renderGlobalStatsView(lapsBySwimmer)`:
     1. **Paso síncrono inmediato (antes del primer `await`):** Construye un `Map` inicial `initialLapsMap` donde para cada `card` de `this.cards.values()` usas `card.laps || []`, y llama inmediatamente a `this._renderGlobalStatsView(initialLapsMap)`. Esto abre el modal y puebla el DOM de forma síncrona en `0ms` (garantizando compatibilidad total con cualquier test que no use `await`).
     2. **Paso asíncrono de hidratación desde IndexedDB:** Si `repository && typeof repository.getLaps === 'function'`, consulta en paralelo los pases persistidos de todos los nadadores:
        ```javascript
        const entries = await Promise.all(
          [...this.cards.values()].map(async (card) => {
            const dbLaps = await repository.getLaps(card.swimmer.id);
            const effectiveLaps = (Array.isArray(dbLaps) && dbLaps.length >= card.laps.length)
              ? dbLaps
              : card.laps;
            return [card.swimmer.id, effectiveLaps];
          })
        );
        ```
     3. Vuelve a llamar a `this._renderGlobalStatsView(new Map(entries))` solo si el modal sigue en vista de tabla resumen (es decir, si el usuario o un test no navegó ya al drill-down `.drilldown-nav` mientras se resolvía la promesa: `if (!contentEl.querySelector('#btn-drilldown-back'))`).
3. **Mejora de datos en `_renderGlobalStatsView(lapsBySwimmer)`:**
   - Calcula `allLaps`, `totalLaps` y `bestSplitMs` a partir de todos los arrays de `lapsBySwimmer`.
   - Para cada fila de nadador en `Resumen por Nadador`, usa `const laps = lapsBySwimmer.get(swimmer.id) || [];` para calcular `laps.length`, `best` y `paceStr`.
4. **Limpieza en `showSwimmerDrillDown(swimmerId)` (`js/app.js`):**
   - Cambia el título `"Últimas Sesiones de Entrenamiento (Hasta 5)"` por `"Historial de Sesiones de Entrenamiento"` (ya que muestra hasta 20 sesiones).

### Tests a añadir en `tests/unit/feature4_drilldown.test.js`
- Añade el test `TC-DD-407`:
  1. Crea un nadador, registra 3 pases con `card.handleStart()` y `card.handleLap()`, y luego reinicia el cronómetro de la tarjeta con `await card.handleReset()` (dejando `card.laps` en `[]`, pero con los 3 pases en `repository`).
  2. Llama a `await app.showGlobalStats()`.
  3. Verifica que `global-stats-content` muestra `Total Vueltas` = `3` (no `0`), y que la fila del nadador muestra `3` vueltas, su mejor pase y su ritmo sostenible calculado desde `IndexedDB`.

### Comando de Verificación del Paso 4
```bash
node --test tests/unit/feature4_drilldown.test.js tests/unit/challenger_m2_empirical.test.js
```

---

## Paso 5: Service Worker Network-First (`sw.js`) y Verificación End-to-End

### Objetivo
Evitar que el Service Worker sirva archivos JS obsoletos desde la caché (`swimcoach-v6`) cambiando a una estrategia **Network-First con fallback a caché offline**, e incluyendo todos los módulos actuales en el precaché.

### Archivos a inspeccionar y modificar
- `sw.js`

### Especificación Técnica e Instrucciones de Razonamiento
1. En `sw.js`:
   - Actualiza `const CACHE_NAME = 'swimcoach-v7';`.
   - En `PRECACHE_URLS`, asegúrate de que estén incluidos todos los módulos JS del proyecto, incluyendo:
     - `'./js/analytics/session-partitioner.js'`
     - `'./js/telemetry/telemetry.js'`
   - En el listener `self.addEventListener('fetch', ...)`:
     - Invierte el orden actual (que era *Cache-First*) a **Network-First**:
       1. Intenta primero `const networkResponse = await fetch(event.request);`.
       2. Si `networkResponse && networkResponse.status === 200`, guarda una copia (`networkResponse.clone()`) en `caches.open(CACHE_NAME)` y devuelve `networkResponse`.
       3. Si `fetch` lanza error (dispositivo sin conexión en la pileta) o falla: busca en caché con `const cachedResponse = await caches.match(event.request);` y si existe devuélvela; si es una petición `navigate`, devuelve el fallback `await caches.match('./index.html') || await caches.match('/')`.
2. Ejecuta la suite completa de tests unitarios y el verificador de aceptación para confirmar que los 5 pasos funcionan en conjunto sin regresiones.

### Comando de Verificación del Paso 5
```bash
npm test && npm run verify
```
