# Task Assignment: Milestone 1 Worker (Engine Optimization & 100% Spanish Localization)

**Assigned Agent**: worker_m1
**Role**: Implementation Worker
**Authoritative Request**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/ORIGINAL_REQUEST.md` (MUST read first)
**Project Document**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/orchestrator_2/PROJECT.md`
**Performance Explorer Report**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_perf/handoff.md`
**Translation Explorer Report**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_trans/handoff.md`
**Proposed Spanish Verification Script**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_trans/proposed_verify_spanish.js`
**Project Root**: `/home/pablito/emprende/swimcoach_tracker`
**Working Directory**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m1`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Write Ownership (Exclusive to this Worker)
You exclusively own:
- `manifest.json`
- `js/ui/boxplot-svg.js`
- `js/app.js` (translation mapping for states)
- `js/timing/ticker.js`
- `js/storage/repository.js`
- `js/timing/timer-engine.js`
- `tests/verify_spanish.js`
- `tests/unit/boxplot.test.js`
- `tests/unit/adversarial_stress.test.js`

Do NOT modify `js/ui/swimmer-card.js` or `css/styles.css` in this milestone (those belong to M2).

## Objectives & Scope

### 1. 100% Spanish Localization (Requirement R1)
- In `manifest.json`: Localize `description` to Spanish ("PWA local para cronometraje simultáneo de nadadores, ritmo sostenible y análisis de zonas de entrenamiento").
- In `js/ui/boxplot-svg.js`: Replace all English fallback text and aria-labels with Spanish:
  - "No lap data recorded" -> "Sin datos de pases registrados"
  - "No valid lap times" -> "Sin tiempos de pase válidos"
  - "Boxplot: No lap data available" -> "Diagrama de caja: Sin datos de pases disponibles"
  - "Boxplot: No valid lap data" -> "Diagrama de caja: Sin datos de pases válidos"
  - `role="img" aria-label="Boxplot of ${stats.count} laps (Median: ${stats.median}s)"` -> `role="img" aria-label="Diagrama de caja de ${stats.count} pases (Mediana: ${stats.median}s)"`
- In `js/app.js`: Define `TIMER_STATE_LABELS_ES = { IDLE: 'Listo', RUNNING: 'En curso', PAUSED: 'Pausado', STOPPED: 'Detenido' }` and use it to translate the "Estado" column in `showGlobalStats()` (`<td><span class="status-indicator">${TIMER_STATE_LABELS_ES[card.timerState.state] || card.timerState.state}</span></td>`).
- Copy / install `proposed_verify_spanish.js` to `tests/verify_spanish.js`. Ensure it runs and passes cleanly (`node tests/verify_spanish.js`).
- Update test files asserting on the old English strings:
  - `tests/unit/boxplot.test.js` (lines 10, 16, 19)
  - `tests/unit/adversarial_stress.test.js` (line 281)

### 2. Ticker Throttling & Storage Batching (Requirement R5 Engine)
- In `js/timing/ticker.js`:
  - Enforce a target frame rate (e.g. 60 FPS / ~16ms, or 30 FPS / ~33ms) so that high-refresh screens (90Hz, 120Hz) do not over-fire redundant ticks while preserving drift-free wall-clock precision.
- In `js/storage/repository.js`:
  - Implement `async saveLapAndTimerState(lap, state)` using a single transaction across stores `[STORES.LAPS, STORES.TIMER_STATES]` with a single `commit()` to avoid double sequential disk flushes.
- In `js/timing/timer-engine.js`:
  - In `recordLap(swimmerId)`: Replace back-to-back `await this.repository.saveLap(lap); await this.repository.saveTimerState(state);` with `await this.repository.saveLapAndTimerState(lap, state);`.

### 3. Verification
Run the verification commands:
- `node tests/verify_spanish.js` -> MUST PASS (0 English UI strings).
- `node tests/verify_acceptance.js` -> MUST PASS (5/5 acceptance criteria).
- `node --test tests/unit/boxplot.test.js tests/unit/adversarial_stress.test.js tests/unit/timing.test.js tests/unit/storage.test.js tests/unit/analytics.test.js` -> MUST PASS.

## Output
Write your handoff report to:
`/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m1/handoff.md`
Report your exact changes, commands run, test outputs, and notify parent via `send_message`.


## 2026-09-30T20:00:53Z
You are assigned as worker_m1 for Milestone 1 (Engine Optimization & 100% Spanish Localization) of the SwimCoach Tracker project.
Your working directory is: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m1
Your dispatch instructions and file boundaries are at: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m1/DISPATCH.md
Read /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/ORIGINAL_REQUEST.md first.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement:
1. 100% Spanish localization in manifest.json, js/ui/boxplot-svg.js, js/app.js, and tests/verify_spanish.js.
2. Ticker throttling in js/timing/ticker.js and atomic dual-write storage batching in js/storage/repository.js and js/timing/timer-engine.js.
3. Update test assertions in tests/unit/boxplot.test.js and tests/unit/adversarial_stress.test.js.
4. Run verification tests: node tests/verify_spanish.js, node tests/verify_acceptance.js, and unit tests.
When done, write your handoff report to /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m1/handoff.md and notify your parent via send_message.
