# Task List: SwimCoach Tracker (`tasks/todo.md`)

## Phase 1: Foundation (`timer-lifecycle`)

## Task 1: Clean Set Restart on `SwimmerCard` & Unskip Reset Tests Without Card Button
**Description:** Clear in-memory `this.laps` when `SwimmerCard.handleStart()` starts from `IDLE` or `STOPPED` so new sets begin cleanly at `V1` while preserving IndexedDB laps. Pass `clearHistorical` through `metricsModal`'s `onReset` callback so `#metrics-modal-reset` resets only the stopwatch while `#metrics-reset-session` ("Borrar sesión") clears historical laps. Update `TC-SC-201`, `TC-SC-204`, `EMP-F2-05`, `EMP-F2-07`, `EMP-F2-08`, and `EMP-F2-11` to verify the no-card-reset-button design and test `card.handleReset()` directly.
**Acceptance criteria:**
- [x] `card.render()` does not render `#btn-reset-<id>` (`card._btnResetEl` is `null`).
- [x] Starting a timer from `IDLE` or `STOPPED` clears `card.laps` in UI memory while preserving IndexedDB laps.
- [x] `TC-SC-201`, `TC-SC-204`, `EMP-F2-05`, `EMP-F2-07`, `EMP-F2-08`, and `EMP-F2-11` are unskipped and pass.
**Verification:**
- [x] Tests pass: `node --test tests/unit/swimmer_card.test.js tests/unit/feature2_empirical.test.js`
- [x] Build succeeds: `npm test`
- [x] Manual check: Record laps, stop, start a new set, and verify card resets to `V1` while `Métricas` still shows previous session laps.
**Dependencies:** None
**Files likely touched:**
- `js/ui/swimmer-card.js`
- `js/ui/metrics-modal.js`
- `tests/unit/swimmer_card.test.js`
- `tests/unit/feature2_empirical.test.js`
**Estimated scope:** Medium: 3-5 files

---

## Checkpoint: After Task 1 (Foundation)
- [x] All tests pass (`node --test tests/unit/swimmer_card.test.js tests/unit/feature2_empirical.test.js`)
- [x] 0 skipped tests in the test suite
- [x] Review with human before proceeding

---

## Phase 2: Core Persistence (`swimmer-management` & `session-storage`)

## Task 2: Persist Heat Group (`groupId`) & Preserve Swimmer Fields on Edit
**Description:** Persist `swimmer.groupId` via `repository.saveSwimmer(this.swimmer)` when cycling heat groups on `.card-header`, and merge existing swimmer properties in `AppCoordinator.handleSaveSwimmer()` so editing a profile never wipes `groupId`.
**Acceptance criteria:**
- [x] Cycling `.card-header` updates `swimmer.groupId` and calls `repository.saveSwimmer(this.swimmer)`.
- [x] `handleSaveSwimmer()` merges `swimmerData` with `await repository.getSwimmer(swimmerData.id)` before saving.
**Verification:**
- [x] Tests pass: `node --test tests/unit/swimmer_card.test.js tests/unit/feature1_multigroup.test.js`
- [x] Build succeeds: `npm test`
- [x] Manual check: Assign G1 to a swimmer, edit their baseline time, reload page, and confirm G1 badge persists.
**Dependencies:** Task 1
**Files likely touched:**
- `js/ui/swimmer-card.js`
- `js/app.js`
**Estimated scope:** Small: 1-2 files

---

## Task 3: Active-Run Reload Hydration & DB-Backed CSV Export
**Description:** Update `loadSwimmers()` in `js/app.js` so `IDLE` swimmers mount with `laps: []`, active swimmers hydrate only laps from `timerState.startTime` onward, `groupId` restores from `swimmer.groupId`, and `exportCsv()` queries `repository.getLaps(swimmer.id)`.
**Acceptance criteria:**
- [x] Reloading when a swimmer is `IDLE` mounts `SwimmerCard` with `laps: []`.
- [x] Reloading when a swimmer is mid-run hydrates only laps with `timestamp >= timerState.startTime`.
- [x] `exportCsv()` exports all persisted laps from `repository.getLaps(swimmer.id)` even after a stopwatch reset.
**Verification:**
- [x] Tests pass: `npm test`
- [x] Build succeeds: `npm run verify`
- [x] Manual check: Record laps, reset stopwatch from modal, reload page, click Export CSV, and verify recorded laps appear in the CSV file.
**Dependencies:** Task 2
**Files likely touched:**
- `js/app.js`
**Estimated scope:** Small: 1-2 files

---

## Checkpoint: After Tasks 2-3 (Core Persistence)
- [x] All tests pass (`npm test && npm run verify`)
- [x] Group persistence and CSV export verified end-to-end
- [x] Review with human before proceeding to Phase 3

---

## Phase 3: Analytics Cleanup (`analytics-cleanup`)

## Task 4: Remove Distance / Volume Measure from Drill-Down View & Tests
**Description:** Remove `monthVolMeters` and `yearVolMeters` ("Volumen Este Mes" / "Volumen Este Año") from `showSwimmerDrillDown()` in `js/app.js`, keeping only lap counts (`Pases Este Mes`, `Pases Este Año`), and update the corresponding assertions in `tests/unit/feature4_drilldown.test.js`, `tests/unit/challenger_m2_empirical.test.js`, and `tests/verify_challenger_m2.js`.
**Acceptance criteria:**
- [x] `showSwimmerDrillDown()` no longer calculates `* 50` meters or renders `Volumen Este Mes` / `Volumen Este Año`.
- [x] `Pases Este Mes` and `Pases Este Año` remain displayed in `.stats-summary-grid`.
- [x] All drill-down and empirical tests pass.
**Verification:**
- [x] Tests pass: `node --test tests/unit/feature4_drilldown.test.js tests/unit/challenger_m2_empirical.test.js`
- [x] Build succeeds: `npm test && npm run verify`
- [x] Manual check: Open Estadísticas Globales -> click a swimmer -> verify only `Pases Este Mes` and `Pases Este Año` appear under Acumulados de Rendimiento.
**Dependencies:** Task 3
**Files likely touched:**
- `js/app.js`
- `tests/unit/feature4_drilldown.test.js`
- `tests/unit/challenger_m2_empirical.test.js`
- `tests/verify_challenger_m2.js`
**Estimated scope:** Medium: 3-5 files

---

## Checkpoint: Complete
- [x] All acceptance criteria met
- [x] Full test and verification suite green (`npm test && npm run verify`)
- [x] Ready for review
