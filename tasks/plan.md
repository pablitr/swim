# Implementation Plan: SwimCoach Tracker — Clean Set Lifecycle, Session History & Heat Group Persistence

## Overview
Keep the pool-deck `SwimmerCard` free of a reset button (reset lives exclusively inside the Metrics modal), clear active card laps when starting a new set from `IDLE` or `STOPPED` without wiping persisted IndexedDB history, persist heat group assignments (`G1–G4`) across reloads and profile edits, hydrate `SwimmerCard` on reload with only the active set's laps while feeding Global Stats and CSV Export from full IndexedDB history, and remove the unused distance/meters volume measure from the drill-down view and tests.

## Dependency Graph
```text
timer-lifecycle (Task 1: Clean Set Restart in SwimmerCard + Remove Obsolete Card-Reset Button Tests)
    │
    ├── swimmer-management (Task 2: Persist groupId on SwimmerCard & Merge Profile Updates in App)
    │
    └── session-storage & hydration (Task 3: Reload Active-Set Hydration + DB-Backed Global Stats & CSV Export)
            │
            └── analytics-cleanup (Task 4: Remove Unused Distance Volume Measure from Drill-Down & Tests)
```

## Architecture Decisions
- **No Reset Button on `SwimmerCard`:** Pool-deck cards expose only `Iniciar/Pausar/Reanudar`, `Pase+Pausa`, and `Detener`. Resetting a swimmer's stopwatch is triggered from the Metrics modal (`#metrics-modal-reset` for non-destructive stopwatch reset, `#metrics-reset-session` with `clearHistorical: true` for full session wipe) or master header reset.
- **Clean Set Restart (`IDLE` / `STOPPED -> RUNNING`):** Starting a timer clears in-memory `card.laps` so the card UI starts cleanly at `V1` while keeping all historical laps intact in `STORES.LAPS`.
- **No Distance / Volume Measure:** Since pool lengths and set distances vary continuously without pool-deck distance entry, total distance (`monthVolMeters` / `yearVolMeters`) is removed altogether in favor of direct lap/pass counts (`Pases Este Mes`, `Pases Este Año`).
- **Persisted Heat Groups (`G1–G4`):** Tapping `.card-header` persists `swimmer.groupId` to IndexedDB, and `handleSaveSwimmer` merges edits with the stored swimmer record so `groupId` is never overwritten when editing name, lane, or baseline.
- **Timestamp-Filtered Reload Hydration:** On page reload, `IDLE` swimmers mount with `laps: []`; active (`RUNNING`, `PAUSED`, `STOPPED`) swimmers hydrate only laps belonging to the current timer run (`lap.timestamp >= timerState.startTime`).

---

## Task List

### Phase 1: Foundation (`timer-lifecycle`)
- [ ] **Task 1:** Clear in-memory `card.laps` on `IDLE`/`STOPPED -> RUNNING`, wire `#metrics-reset-session` to `clearHistorical: true`, and update the 6 skipped tests in `tests/unit/swimmer_card.test.js` and `tests/unit/feature2_empirical.test.js` to test `handleReset()` without a card reset button.

### Checkpoint: Foundation
- [ ] `node --test tests/unit/swimmer_card.test.js tests/unit/feature2_empirical.test.js` passes with 0 failures and 0 skipped tests.

### Phase 2: Core Persistence (`swimmer-management` & `session-storage`)
- [ ] **Task 2:** Persist `swimmer.groupId` when cycling heat groups on `.card-header` and preserve existing swimmer fields in `AppCoordinator.handleSaveSwimmer()`.
- [ ] **Task 3:** Hydrate only active-run laps on reload, query `repository.getLaps()` in `exportCsv()`, and include persisted laps in `showGlobalStats()`.

### Checkpoint: Core Persistence
- [ ] `npm test` and `npm run verify` pass with 0 failures.

### Phase 3: Analytics Cleanup (`analytics-cleanup`)
- [ ] **Task 4:** Remove `monthVolMeters` and `yearVolMeters` ("Volumen Este Mes" / "Volumen Este Año") from `js/app.js` and update drill-down unit tests (`tests/unit/feature4_drilldown.test.js` and `tests/unit/challenger_m2_empirical.test.js`).

### Checkpoint: Complete
- [ ] Full test and verification suite green (`npm test && npm run verify`) with 0 skipped tests.

---

## Vertical Slices (`/build` Executor Specification)

---

## Task 1: Clean Set Restart on `SwimmerCard` & Unskip Reset Tests Without Card Button

**Description:** Clear in-memory `this.laps` when `SwimmerCard.handleStart()` starts from `IDLE` or `STOPPED` so new sets begin cleanly at `V1` while preserving IndexedDB laps. Pass `clearHistorical` through `metricsModal`'s `onReset` callback so `#metrics-modal-reset` resets only the stopwatch while `#metrics-reset-session` ("Borrar sesión") clears historical laps. Update `TC-SC-201`, `TC-SC-204`, `EMP-F2-05`, `EMP-F2-07`, `EMP-F2-08`, and `EMP-F2-11` so they verify the no-card-reset-button design and test `card.handleReset()` directly, leaving 0 skipped tests.

**Acceptance criteria:**
- [ ] `card.render()` does not render `#btn-reset-<id>` (`card._btnResetEl` is `null`).
- [ ] Starting a timer from `IDLE` or `STOPPED` clears `card.laps` in memory while keeping historical laps in `repository`.
- [ ] `TC-SC-201`, `TC-SC-204`, `EMP-F2-05`, `EMP-F2-07`, `EMP-F2-08`, and `EMP-F2-11` are unskipped and pass.

**Dependencies:** None
**Files likely touched:** `js/ui/swimmer-card.js`, `js/ui/metrics-modal.js`, `tests/unit/swimmer_card.test.js`, `tests/unit/feature2_empirical.test.js`
**Estimated scope:** Medium (4 files)

### FILE: `js/ui/swimmer-card.js`
````javascript
<<<<<<< SEARCH
        metricsModal.open(this.swimmer, allLaps, {
          onReset: () => this.handleReset({ clearHistorical: false }),
          canReset: () => this.timerState.state !== TIMER_STATES.IDLE || this.laps.length > 0,
=======
        metricsModal.open(this.swimmer, allLaps, {
          onReset: (opts = {}) => this.handleReset({ clearHistorical: Boolean(opts.clearHistorical) }),
          canReset: () => this.timerState.state !== TIMER_STATES.IDLE || this.laps.length > 0 || allLaps.length > 0,
>>>>>>> REPLACE
<<<<<<< SEARCH
  async handleStart(options = {}) {
    const isGroupTriggered = Boolean(options && options.isGroupTriggered);
    if (!isGroupTriggered && this.groupId > 0 && typeof this.callbacks.onGroupStart === 'function') {
      await this.callbacks.onGroupStart(this.groupId, this.swimmer.id);
      return;
    }
    
    this.timerState = await timerEngine.start(this.swimmer.id);
=======
  async handleStart(options = {}) {
    const isGroupTriggered = Boolean(options && options.isGroupTriggered);
    if (!isGroupTriggered && this.groupId > 0 && typeof this.callbacks.onGroupStart === 'function') {
      await this.callbacks.onGroupStart(this.groupId, this.swimmer.id);
      return;
    }
    if (this.timerState.state === TIMER_STATES.IDLE || this.timerState.state === TIMER_STATES.STOPPED) {
      this.laps = [];
    }

    this.timerState = await timerEngine.start(this.swimmer.id);
>>>>>>> REPLACE
````

### FILE: `js/ui/metrics-modal.js`
````javascript
<<<<<<< SEARCH
        try {
          const updatedLaps = await this.callbacks.onReset();
          this.laps = Array.isArray(updatedLaps) ? updatedLaps : [];
          this._renderBody(this.swimmer, this.laps);
        } catch (err) {
          console.error('[MetricsModal] No se pudo borrar la sesión:', err);
=======
        try {
          const updatedLaps = await this.callbacks.onReset({ clearHistorical: true });
          this.laps = Array.isArray(updatedLaps) ? updatedLaps : [];
          this._renderBody(this.swimmer, this.laps);
        } catch (err) {
          console.error('[MetricsModal] No se pudo borrar la sesión:', err);
>>>>>>> REPLACE
````

### FILE: `tests/unit/swimmer_card.test.js`
````javascript
<<<<<<< SEARCH
  test.skip('TC-SC-201: render() builds card with cached DOM nodes and initial IDLE state', () => {
    const card = new SwimmerCard({ swimmer });
    const el = card.render();

    assert.strictEqual(el.id, `card-${swimmer.id}`);
    assert.strictEqual(el.dataset.swimmerId, swimmer.id);

    // Verify all critical DOM nodes are properly cached
    assert.ok(card._timeEl, 'card._timeEl must be cached');
    assert.ok(card._stateLabelEl, 'card._stateLabelEl must be cached');
    assert.ok(card._recentLapsListEl, 'card._recentLapsListEl must be cached');
    assert.ok(card._lapBtnEl, 'card._lapBtnEl must be cached');
    assert.ok(card._lapCountEl, 'card._lapCountEl must be cached');
    assert.ok(card._btnStartEl, 'card._btnStartEl must be cached');
    assert.ok(card._btnStopEl, 'card._btnStopEl must be cached');
    assert.ok(card._btnResetEl, 'card._btnResetEl must be cached');

    // Initial values
    assert.strictEqual(card._timeEl.textContent, '00:00.00');
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO');
    assert.strictEqual(card._lapCountEl.textContent, 'V1');

    // Initial button states
    assert.strictEqual(card._lapBtnEl.disabled, true, 'Lap button must be disabled in IDLE');
    assert.strictEqual(card._btnStopEl.disabled, true, 'Stop button must be disabled in IDLE');
    assert.strictEqual(card._btnResetEl.disabled, true, 'Reset button must be disabled with zero elapsed time');
    assert.strictEqual(card._btnStartEl.disabled, false, 'Start button must be enabled in IDLE');
    assert.ok(card._btnStartEl.innerHTML.includes('Iniciar'), 'Start button must display "Iniciar" in IDLE');
  });
=======
  test('TC-SC-201: render() builds card with cached DOM nodes and initial IDLE state (without card reset button)', () => {
    const card = new SwimmerCard({ swimmer });
    const el = card.render();

    assert.strictEqual(el.id, `card-${swimmer.id}`);
    assert.strictEqual(el.dataset.swimmerId, swimmer.id);

    // Verify all critical DOM nodes are properly cached and card reset button is omitted
    assert.ok(card._timeEl, 'card._timeEl must be cached');
    assert.ok(card._stateLabelEl, 'card._stateLabelEl must be cached');
    assert.ok(card._recentLapsListEl, 'card._recentLapsListEl must be cached');
    assert.ok(card._lapBtnEl, 'card._lapBtnEl must be cached');
    assert.ok(card._lapCountEl, 'card._lapCountEl must be cached');
    assert.ok(card._btnStartEl, 'card._btnStartEl must be cached');
    assert.ok(card._btnStopEl, 'card._btnStopEl must be cached');
    assert.strictEqual(card._btnResetEl, null, 'card._btnResetEl must be null (reset lives in metrics modal)');

    // Initial values
    assert.strictEqual(card._timeEl.textContent, '00:00.00');
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO');
    assert.strictEqual(card._lapCountEl.textContent, 'V1');

    // Initial button states
    assert.strictEqual(card._lapBtnEl.disabled, true, 'Lap button must be disabled in IDLE');
    assert.strictEqual(card._btnStopEl.disabled, true, 'Stop button must be disabled in IDLE');
    assert.strictEqual(card._btnStartEl.disabled, false, 'Start button must be enabled in IDLE');
    assert.ok(card._btnStartEl.innerHTML.includes('Iniciar'), 'Start button must display "Iniciar" in IDLE');
  });
>>>>>>> REPLACE
<<<<<<< SEARCH
  test.skip('TC-SC-204: State machine updates visual controls (Iniciar, Pausar, Reanudar, Detener, Reiniciar)', () => {
    const card = new SwimmerCard({ swimmer });
    card.render();

    // 1. RUNNING state
    card.timerState.state = TIMER_STATES.RUNNING;
    card.timerState.accumulatedMs = 5000;
    card.updateUI();

    assert.strictEqual(card._stateLabelEl.textContent, 'EN MARCHA');
    assert.ok(card._btnStartEl.innerHTML.includes('Pausar'), 'Start button must show Pausar when RUNNING');
    assert.strictEqual(card._btnStopEl.disabled, false, 'Stop button must be enabled when RUNNING');
    assert.strictEqual(card._btnResetEl.disabled, false, 'Reset button must be enabled when RUNNING');
    assert.strictEqual(card._lapBtnEl.disabled, false, 'Lap button must be enabled when RUNNING');

    // 2. PAUSED state
    card.timerState.state = TIMER_STATES.PAUSED;
    card.updateUI();

    assert.strictEqual(card._stateLabelEl.textContent, 'PAUSADO');
    assert.ok(card._btnStartEl.innerHTML.includes('Reanudar'), 'Start button must show Reanudar when PAUSED');
    assert.strictEqual(card._btnStopEl.disabled, false, 'Stop button must be enabled when PAUSED');
    assert.strictEqual(card._btnResetEl.disabled, false, 'Reset button must be enabled when PAUSED');
    assert.strictEqual(card._lapBtnEl.disabled, true, 'Lap button must be disabled when PAUSED');

    // 3. STOPPED state
    card.timerState.state = TIMER_STATES.STOPPED;
    card.updateUI();

    assert.strictEqual(card._stateLabelEl.textContent, 'DETENIDO');
    assert.ok(card._btnStartEl.innerHTML.includes('Iniciar'), 'Start button must show Iniciar when STOPPED');
    assert.strictEqual(card._btnStopEl.disabled, true, 'Stop button must be disabled when STOPPED');
    assert.strictEqual(card._btnResetEl.disabled, false, 'Reset button must remain enabled when STOPPED with elapsed time');
    assert.strictEqual(card._lapBtnEl.disabled, true, 'Lap button must be disabled when STOPPED');
  });
=======
  test('TC-SC-204: State machine updates visual controls (Iniciar, Pausar, Reanudar, Detener)', () => {
    const card = new SwimmerCard({ swimmer });
    card.render();

    // 1. RUNNING state
    card.timerState.state = TIMER_STATES.RUNNING;
    card.timerState.accumulatedMs = 5000;
    card.updateUI();

    assert.strictEqual(card._stateLabelEl.textContent, 'EN MARCHA');
    assert.ok(card._btnStartEl.innerHTML.includes('Pausar'), 'Start button must show Pausar when RUNNING');
    assert.strictEqual(card._btnStopEl.disabled, false, 'Stop button must be enabled when RUNNING');
    assert.strictEqual(card._lapBtnEl.disabled, false, 'Lap button must be enabled when RUNNING');

    // 2. PAUSED state
    card.timerState.state = TIMER_STATES.PAUSED;
    card.updateUI();

    assert.strictEqual(card._stateLabelEl.textContent, 'PAUSADO');
    assert.ok(card._btnStartEl.innerHTML.includes('Reanudar'), 'Start button must show Reanudar when PAUSED');
    assert.strictEqual(card._btnStopEl.disabled, false, 'Stop button must be enabled when PAUSED');
    assert.strictEqual(card._lapBtnEl.disabled, true, 'Lap button must be disabled when PAUSED');

    // 3. STOPPED state
    card.timerState.state = TIMER_STATES.STOPPED;
    card.updateUI();

    assert.strictEqual(card._stateLabelEl.textContent, 'DETENIDO');
    assert.ok(card._btnStartEl.innerHTML.includes('Iniciar'), 'Start button must show Iniciar when STOPPED');
    assert.strictEqual(card._btnStopEl.disabled, true, 'Stop button must be disabled when STOPPED');
    assert.strictEqual(card._lapBtnEl.disabled, true, 'Lap button must be disabled when STOPPED');
  });
>>>>>>> REPLACE
````

### FILE: `tests/unit/feature2_empirical.test.js`
````javascript
<<<<<<< SEARCH
  test.skip('EMP-F2-05: Tapping "Reiniciar" resets display to 00:00.00 and timer to IDLE while preserving persisted laps', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    // 1. Run and record 3 laps
    await card.handleStart();
    await new Promise(r => setTimeout(r, 40));
    await card.handleLap();
    await new Promise(r => setTimeout(r, 40));
    await card.handleLap();
    await new Promise(r => setTimeout(r, 40));
    await card.handleLapPause(); // Lap 3 + Pause

    assert.strictEqual(card.laps.length, 3, 'Card should have 3 laps recorded');
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);

    const persistedBeforeReset = await repository.getLaps(testSwimmer.id);
    assert.strictEqual(persistedBeforeReset.length, 3, 'Repository must hold all 3 laps before reset');

    // 2. Click "Reiniciar" button on the card
    assert.strictEqual(card._btnResetEl.disabled, false, 'Reset button must be enabled before click');
    await card._btnResetEl.dispatchEvent({ type: 'click' });

    // 3. Verify card stopwatch display and state reset
    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE, 'Timer state must be reset to IDLE');
    assert.strictEqual(card.timerState.accumulatedMs, 0, 'accumulatedMs must be 0');
    assert.strictEqual(card._timeEl.textContent, '00:00.00', 'Stopwatch display must be reset to 00:00.00');
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO', 'State label must be LISTO');
    assert.strictEqual(card._lapCountEl.textContent, 'V1', 'Lap counter on giant button must be V1');
    assert.strictEqual(card._btnResetEl.disabled, true, 'Reset button must become disabled after clean reset');
    assert.strictEqual(card._btnStopEl.disabled, true, 'Stop button must become disabled after reset');
=======
  test('EMP-F2-05: Calling handleReset() resets display to 00:00.00 and timer to IDLE while preserving persisted laps', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    // 1. Run and record 3 laps
    await card.handleStart();
    await new Promise(r => setTimeout(r, 40));
    await card.handleLap();
    await new Promise(r => setTimeout(r, 40));
    await card.handleLap();
    await new Promise(r => setTimeout(r, 40));
    await card.handleLapPause(); // Lap 3 + Pause

    assert.strictEqual(card.laps.length, 3, 'Card should have 3 laps recorded');
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);

    const persistedBeforeReset = await repository.getLaps(testSwimmer.id);
    assert.strictEqual(persistedBeforeReset.length, 3, 'Repository must hold all 3 laps before reset');

    // 2. Trigger handleReset() (as invoked by modal/master reset)
    await card.handleReset();

    // 3. Verify card stopwatch display and state reset
    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE, 'Timer state must be reset to IDLE');
    assert.strictEqual(card.timerState.accumulatedMs, 0, 'accumulatedMs must be 0');
    assert.strictEqual(card._timeEl.textContent, '00:00.00', 'Stopwatch display must be reset to 00:00.00');
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO', 'State label must be LISTO');
    assert.strictEqual(card._lapCountEl.textContent, 'V1', 'Lap counter on giant button must be V1');
    assert.strictEqual(card._btnStopEl.disabled, true, 'Stop button must become disabled after reset');
>>>>>>> REPLACE
<<<<<<< SEARCH
  test.skip('EMP-F2-07: Reset button enabled/disabled state gating is strictly enforced', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    // 1. Initial IDLE (accumulatedMs = 0, laps = 0) -> DISABLED
    assert.strictEqual(card._btnResetEl.disabled, true, 'Must be disabled in clean initial IDLE');

    // 2. RUNNING -> ENABLED
    await card.handleStart();
    assert.strictEqual(card._btnResetEl.disabled, false, 'Must be enabled when RUNNING');

    // 3. PAUSED -> ENABLED
    await card.handlePause();
    assert.strictEqual(card._btnResetEl.disabled, false, 'Must be enabled when PAUSED');

    // 4. STOPPED -> ENABLED
    await card.handleStop();
    assert.strictEqual(card._btnResetEl.disabled, false, 'Must be enabled when STOPPED');

    // 5. Reset back to IDLE -> DISABLED
    await card.handleReset();
    assert.strictEqual(card._btnResetEl.disabled, true, 'Must return to disabled after clean reset');
  });

  // =========================================================================
  // Verification 8: Multi-Swimmer Independence for Lap+Pause and Reset
  // =========================================================================
  test.skip('EMP-F2-08: Multi-swimmer independence: Lap+Pause and Reset on Swimmer A do not affect Swimmer B', async () => {
    const swimmerA = { id: 'swim-indep-a', name: 'Swimmer Alpha', lane: 1 };
    const swimmerB = { id: 'swim-indep-b', name: 'Swimmer Beta', lane: 2 };

    await repository.saveSwimmer(swimmerA);
    await repository.saveSwimmer(swimmerB);

    const cardA = new SwimmerCard({ swimmer: swimmerA });
    const cardB = new SwimmerCard({ swimmer: swimmerB });
    cardA.render();
    cardB.render();

    // Start both
    await cardA.handleStart();
    await cardB.handleStart();
    assert.strictEqual(cardA.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(cardB.timerState.state, TIMER_STATES.RUNNING);

    await new Promise(r => setTimeout(r, 50));

    // Swimmer A taps Lap+Pause
    await cardA._btnLapPauseEl.dispatchEvent({ type: 'click' });

    // Swimmer A is PAUSED with 1 lap; Swimmer B remains RUNNING with 0 laps
    assert.strictEqual(cardA.timerState.state, TIMER_STATES.PAUSED);
    assert.strictEqual(cardA.laps.length, 1);
    assert.strictEqual(cardB.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(cardB.laps.length, 0);

    // Swimmer A taps Reiniciar
    await cardA._btnResetEl.dispatchEvent({ type: 'click' });
=======
  test('EMP-F2-07: Restarting from STOPPED clears active card.laps while preserving repository laps', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    await card.handleStart();
    await new Promise(r => setTimeout(r, 30));
    await card.handleLap();
    await card.handleStop();
    assert.strictEqual(card.timerState.state, TIMER_STATES.STOPPED);
    assert.strictEqual(card.laps.length, 1);

    // Restart from STOPPED -> active card laps cleared, DB laps preserved
    await card.handleStart();
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(card.laps.length, 0, 'Active card laps must be cleared when starting new set from STOPPED');
    assert.strictEqual(card._lapCountEl.textContent, 'V1');
    const persisted = await repository.getLaps(testSwimmer.id);
    assert.strictEqual(persisted.length, 1, 'Repository laps must remain intact');
  });

  // =========================================================================
  // Verification 8: Multi-Swimmer Independence for Lap+Pause and Reset
  // =========================================================================
  test('EMP-F2-08: Multi-swimmer independence: Lap+Pause and Reset on Swimmer A do not affect Swimmer B', async () => {
    const swimmerA = { id: 'swim-indep-a', name: 'Swimmer Alpha', lane: 1 };
    const swimmerB = { id: 'swim-indep-b', name: 'Swimmer Beta', lane: 2 };

    await repository.saveSwimmer(swimmerA);
    await repository.saveSwimmer(swimmerB);

    const cardA = new SwimmerCard({ swimmer: swimmerA });
    const cardB = new SwimmerCard({ swimmer: swimmerB });
    cardA.render();
    cardB.render();

    // Start both
    await cardA.handleStart();
    await cardB.handleStart();
    assert.strictEqual(cardA.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(cardB.timerState.state, TIMER_STATES.RUNNING);

    await new Promise(r => setTimeout(r, 50));

    // Swimmer A taps Lap+Pause
    await cardA._btnLapPauseEl.dispatchEvent({ type: 'click' });

    // Swimmer A is PAUSED with 1 lap; Swimmer B remains RUNNING with 0 laps
    assert.strictEqual(cardA.timerState.state, TIMER_STATES.PAUSED);
    assert.strictEqual(cardA.laps.length, 1);
    assert.strictEqual(cardB.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(cardB.laps.length, 0);

    // Swimmer A resets
    await cardA.handleReset();
>>>>>>> REPLACE
<<<<<<< SEARCH
  test.skip('EMP-F2-11: Resetting while RUNNING cleanly stops ticker, resets to IDLE, and updates UI', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    await card.handleStart();
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);

    // Reset directly during RUNNING
    await card.handleReset();

    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE);
    assert.strictEqual(card._timeEl.textContent, '00:00.00');
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO');
    assert.strictEqual(card._btnResetEl.disabled, true);
    assert.strictEqual(card._btnLapPauseEl.style.display, 'none');
    assert.strictEqual(card._splitContainerEl.classList.contains('is-split'), false);
  });
=======
  test('EMP-F2-11: Resetting while RUNNING cleanly stops ticker, resets to IDLE, and updates UI', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    await card.handleStart();
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);

    // Reset directly during RUNNING
    await card.handleReset();

    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE);
    assert.strictEqual(card._timeEl.textContent, '00:00.00');
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO');
    assert.strictEqual(card._btnLapPauseEl.style.display, 'none');
    assert.strictEqual(card._splitContainerEl.classList.contains('is-split'), false);
  });
>>>>>>> REPLACE
````

### VERIFY
```bash
node --test tests/unit/swimmer_card.test.js tests/unit/feature2_empirical.test.js
```

---

## Task 2: Persist Heat Group (`groupId`) & Preserve Swimmer Fields on Edit

**Description:** Persist `swimmer.groupId` to `repository.saveSwimmer` when cycling heat groups on `.card-header` in `js/ui/swimmer-card.js`, restore `swimmer.groupId` in `AppCoordinator.loadSwimmers()`, and merge existing swimmer properties in `AppCoordinator.handleSaveSwimmer()` so editing a swimmer's name, lane, or baseline never overwrites `groupId`.

**Acceptance criteria:**
- [ ] Tapping `.card-header` updates `this.swimmer.groupId` and persists via `repository.saveSwimmer(this.swimmer)`.
- [ ] `loadSwimmers()` initializes `groupId` from `swimmer.groupId` when no in-memory card exists yet.
- [ ] `handleSaveSwimmer()` merges `swimmerData` with the existing stored swimmer record before saving.

**Dependencies:** Task 1
**Files likely touched:** `js/ui/swimmer-card.js`, `js/app.js`
**Estimated scope:** Small (2 files)

### FILE: `js/ui/swimmer-card.js`
````javascript
<<<<<<< SEARCH
    // Tapping .card-header cycles groupId (0 -> 1 -> 2 -> 3 -> 4 -> 0)
    // Safety constraint: strictly disabled if RUNNING or PAUSED. Only allowed when IDLE or STOPPED.
    if (this._headerEl) {
      this._headerEl.addEventListener('click', (e) => {
        if (this.timerState.state === TIMER_STATES.RUNNING || this.timerState.state === TIMER_STATES.PAUSED) {
          return;
        }
        this.groupId = (this.groupId + 1) % 5;
        this._updateGroupBadge();
      });
    }
=======
    // Tapping .card-header cycles groupId (0 -> 1 -> 2 -> 3 -> 4 -> 0)
    // Safety constraint: strictly disabled if RUNNING or PAUSED. Only allowed when IDLE or STOPPED.
    if (this._headerEl) {
      this._headerEl.addEventListener('click', async (e) => {
        if (this.timerState.state === TIMER_STATES.RUNNING || this.timerState.state === TIMER_STATES.PAUSED) {
          return;
        }
        this.groupId = (this.groupId + 1) % 5;
        if (this.swimmer) this.swimmer.groupId = this.groupId;
        this._updateGroupBadge();
        if (typeof repository !== 'undefined' && repository && typeof repository.saveSwimmer === 'function' && this.swimmer?.id) {
          try {
            await repository.saveSwimmer(this.swimmer);
          } catch (_) {
            // Ignore persistence errors for transient test objects
          }
        }
      });
    }
>>>>>>> REPLACE
````

### FILE: `js/app.js`
````javascript
<<<<<<< SEARCH
  async handleSaveSwimmer(swimmerData) {
    const isNew = !swimmerData.id;
    await repository.saveSwimmer(swimmerData);
=======
  async handleSaveSwimmer(swimmerData) {
    const isNew = !swimmerData.id;
    if (!isNew) {
      const existing = await repository.getSwimmer(swimmerData.id);
      if (existing) {
        swimmerData = { ...existing, ...swimmerData };
      }
    }
    await repository.saveSwimmer(swimmerData);
>>>>>>> REPLACE
````

### VERIFY
```bash
node --test tests/unit/swimmer_card.test.js tests/unit/feature1_multigroup.test.js
```

---

## Task 3: Active-Run Reload Hydration & DB-Backed Global Stats / CSV Export

**Description:** Update `loadSwimmers()` in `js/app.js` so `IDLE` swimmers mount with `laps: []` and active swimmers hydrate only laps belonging to the current run (`lap.timestamp >= timerState.startTime`). Update `exportCsv()` to query persisted laps from `repository.getLaps(swimmer.id)` so historical laps export even after a stopwatch reset. Update `showGlobalStats()` to merge in-memory and persisted laps if `card.laps` is empty.

**Acceptance criteria:**
- [ ] Reloading when a swimmer is `IDLE` mounts `SwimmerCard` with `laps: []` while historical laps remain in IndexedDB.
- [ ] Reloading when a swimmer is `RUNNING`, `PAUSED`, or `STOPPED` hydrates only laps recorded since `timerState.startTime` (falling back to `currentLapIndex - 1` when `startTime` is absent).
- [ ] `exportCsv()` exports all persisted laps from `repository.getLaps(swimmer.id)` even after a card reset.

**Dependencies:** Task 2
**Files likely touched:** `js/app.js`
**Estimated scope:** Small (1 file)

### FILE: `js/app.js`
````javascript
<<<<<<< SEARCH
      const laps = await repository.getLaps(swimmer.id);
      const existingCard = this.cards.get(swimmer.id);
      const groupId = existingCard ? existingCard.groupId : 0;

      const card = new SwimmerCard({
        swimmer,
        timerState,
        laps,
        groupId,
=======
      const allLaps = await repository.getLaps(swimmer.id);
      const activeLapCount = Math.max(0, (Number(timerState.currentLapIndex) || 1) - 1);
      let laps = [];
      if (timerState.state !== TIMER_STATES.IDLE && activeLapCount > 0) {
        laps = timerState.startTime
          ? allLaps.filter(l => (Number(l.timestamp) || 0) >= timerState.startTime)
          : allLaps.slice(-activeLapCount);
      }
      const existingCard = this.cards.get(swimmer.id);
      const groupId = existingCard ? existingCard.groupId : (Number(swimmer.groupId) || 0);

      const card = new SwimmerCard({
        swimmer,
        timerState,
        laps,
        groupId,
>>>>>>> REPLACE
<<<<<<< SEARCH
  /** Download swimmer profiles, current timer state, and recorded laps as a CSV file. */
  exportCsv() {
    const rows = [[
      'ID Nadador', 'Nadador', 'Carril', 'Base 100 m (s)', 'Estado',
      'Tiempo actual', 'Tiempo actual (ms)', 'Pase', 'Parcial (ms)',
      'Acumulado (ms)', 'Fecha del pase'
    ]];

    for (const card of this.cards.values()) {
      const swimmer = card.swimmer;
      const timer = card.timerState;
      const elapsedMs = timerEngine.getElapsedMs(timer);
      const profileAndTimer = [
        swimmer.id,
        swimmer.name,
        swimmer.lane ?? '',
        swimmer.baseline100mSeconds ?? swimmer.baseline100m ?? '',
        TIMER_STATE_LABELS_ES[timer.state] || timer.state,
        formatTime(elapsedMs),
        Math.round(elapsedMs)
      ];

      if (card.laps.length === 0) {
        rows.push([...profileAndTimer, '', '', '', '']);
        continue;
      }

      for (const lap of card.laps) {
=======
  /** Download swimmer profiles, current timer state, and recorded laps as a CSV file. */
  async exportCsv() {
    const rows = [[
      'ID Nadador', 'Nadador', 'Carril', 'Base 100 m (s)', 'Estado',
      'Tiempo actual', 'Tiempo actual (ms)', 'Pase', 'Parcial (ms)',
      'Acumulado (ms)', 'Fecha del pase'
    ]];

    for (const card of this.cards.values()) {
      const swimmer = card.swimmer;
      const timer = card.timerState;
      const elapsedMs = timerEngine.getElapsedMs(timer);
      const profileAndTimer = [
        swimmer.id,
        swimmer.name,
        swimmer.lane ?? '',
        swimmer.baseline100mSeconds ?? swimmer.baseline100m ?? '',
        TIMER_STATE_LABELS_ES[timer.state] || timer.state,
        formatTime(elapsedMs),
        Math.round(elapsedMs)
      ];

      const persistedLaps = (repository && typeof repository.getLaps === 'function')
        ? await repository.getLaps(swimmer.id)
        : [];
      const exportLaps = persistedLaps.length >= card.laps.length ? persistedLaps : card.laps;

      if (exportLaps.length === 0) {
        rows.push([...profileAndTimer, '', '', '', '']);
        continue;
      }

      for (const lap of exportLaps) {
>>>>>>> REPLACE
````

### VERIFY
```bash
npm test
```

---

## Task 4: Remove Distance / Volume Measure from Drill-Down View & Tests

**Description:** Remove `monthVolMeters` and `yearVolMeters` calculations and the two "Volumen Este Mes" / "Volumen Este Año" boxes from `showSwimmerDrillDown()` in `js/app.js`, keeping only `Pases Este Mes` and `Pases Este Año`. Update the assertions in `tests/unit/feature4_drilldown.test.js`, `tests/unit/challenger_m2_empirical.test.js`, and `tests/verify_challenger_m2.js`.

**Acceptance criteria:**
- [ ] `showSwimmerDrillDown()` in `js/app.js` no longer computes `monthLaps.length * 50` or renders `Volumen Este Mes` / `Volumen Este Año`.
- [ ] `Pases Este Mes` and `Pases Este Año` remain displayed in `.stats-summary-grid`.
- [ ] `npm test` and `npm run verify` pass with 0 failures.

**Dependencies:** Task 3
**Files likely touched:** `js/app.js`, `tests/unit/feature4_drilldown.test.js`, `tests/unit/challenger_m2_empirical.test.js`, `tests/verify_challenger_m2.js`
**Estimated scope:** Medium (4 files)

### FILE: `js/app.js`
````javascript
<<<<<<< SEARCH
    const monthVolMeters = monthLaps.length * 50;
    const yearVolMeters = yearLaps.length * 50;

    // Partition laps into training sessions
=======
    // Partition laps into training sessions
>>>>>>> REPLACE
<<<<<<< SEARCH
      <div class="modal-section-title">Acumulados de Rendimiento</div>
      <div class="stats-summary-grid">
        <div class="metric-box">
          <div class="metric-label">Pases Este Mes</div>
          <div class="metric-value">${monthLaps.length}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Volumen Este Mes</div>
          <div class="metric-value">${monthVolMeters.toLocaleString('es-ES')} m</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Pases Este Año</div>
          <div class="metric-value">${yearLaps.length}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Volumen Este Año</div>
          <div class="metric-value">${yearVolMeters.toLocaleString('es-ES')} m</div>
        </div>
      </div>
=======
      <div class="modal-section-title">Acumulados de Rendimiento</div>
      <div class="stats-summary-grid">
        <div class="metric-box">
          <div class="metric-label">Pases Este Mes</div>
          <div class="metric-value">${monthLaps.length}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Pases Este Año</div>
          <div class="metric-value">${yearLaps.length}</div>
        </div>
      </div>
>>>>>>> REPLACE
````

### FILE: `tests/unit/feature4_drilldown.test.js`
````javascript
<<<<<<< SEARCH
  test('TC-DD-403: Month and Year volume accumulators calculate laps and meters (laps * 50m) accurately', async () => {
=======
  test('TC-DD-403: Month and Year lap accumulators calculate monthly and yearly lap counts accurately', async () => {
>>>>>>> REPLACE
<<<<<<< SEARCH
    // Month accumulator: exactly 3 laps = 150m
    assert.ok(contentEl.innerHTML.includes('<div class="metric-value">3</div>'), 'Must show 3 laps this month');
    assert.ok(contentEl.innerHTML.includes('150 m'), 'Must show 150 m this month');

    // Year accumulator: if curMonth > 0, 3 + 2 = 5 laps (250m). If curMonth === 0, exactly 3 laps (150m)
    const expectedYearLaps = curMonth > 0 ? 5 : 3;
    const expectedYearMeters = expectedYearLaps * 50;
    assert.ok(contentEl.innerHTML.includes(`${expectedYearMeters} m`), `Must show ${expectedYearMeters} m this year`);
  });
=======
    // Month accumulator: exactly 3 laps
    assert.ok(contentEl.innerHTML.includes('<div class="metric-value">3</div>'), 'Must show 3 laps this month');

    // Year accumulator: if curMonth > 0, 3 + 2 = 5 laps. If curMonth === 0, 3 laps
    const expectedYearLaps = curMonth > 0 ? 5 : 3;
    assert.ok(contentEl.innerHTML.includes(`<div class="metric-value">${expectedYearLaps}</div>`), `Must show ${expectedYearLaps} laps this year`);
  });
>>>>>>> REPLACE
<<<<<<< SEARCH
    const contentEl = domElements.get('global-stats-content');
    assert.ok(contentEl.innerHTML.includes('Sin sesiones de entrenamiento registradas aún para este nadador.'));
    assert.ok(contentEl.innerHTML.includes('0 m'));
    assert.ok(contentEl.innerHTML.includes('← Volver a Estadísticas Globales'));
=======
    const contentEl = domElements.get('global-stats-content');
    assert.ok(contentEl.innerHTML.includes('Sin sesiones de entrenamiento registradas aún para este nadador.'));
    assert.ok(contentEl.innerHTML.includes('<div class="metric-value">0</div>'));
    assert.ok(contentEl.innerHTML.includes('← Volver a Estadísticas Globales'));
>>>>>>> REPLACE
````

### FILE: `tests/unit/challenger_m2_empirical.test.js`
````javascript
<<<<<<< SEARCH
      // Month accumulator: exactly 3 laps = 150m
      assert.ok(contentEl.innerHTML.includes('<div class="metric-value">3</div>'), 'Must show 3 laps this month');
      assert.ok(contentEl.innerHTML.includes('150 m'), 'Must show 150 m this month');

      // Year accumulator
      const expectedYearLaps = isJan ? 3 : 5;
      const expectedYearMeters = expectedYearLaps * 50;
      assert.ok(contentEl.innerHTML.includes(`<div class="metric-value">${expectedYearLaps}</div>`), `Must show ${expectedYearLaps} laps this year`);
      assert.ok(contentEl.innerHTML.includes(`${expectedYearMeters} m`), `Must show ${expectedYearMeters} m this year`);
=======
      // Month accumulator: exactly 3 laps
      assert.ok(contentEl.innerHTML.includes('<div class="metric-value">3</div>'), 'Must show 3 laps this month');

      // Year accumulator
      const expectedYearLaps = isJan ? 3 : 5;
      assert.ok(contentEl.innerHTML.includes(`<div class="metric-value">${expectedYearLaps}</div>`), `Must show ${expectedYearLaps} laps this year`);
>>>>>>> REPLACE
````

### FILE: `tests/verify_challenger_m2.js`
````javascript
<<<<<<< SEARCH
    assert.ok(
      contentEl.innerHTML.includes('<div class="metric-value">3</div>'),
      'Must display 3 pases este mes'
    );
    assert.ok(
      contentEl.innerHTML.includes('150 m'),
      'Must display 150 m volumen este mes (3 * 50m)'
    );

    const expectedYearLaps = isJanuary ? 3 : 5;
    const expectedYearMeters = expectedYearLaps * 50;
    assert.ok(
      contentEl.innerHTML.includes(`<div class="metric-value">${expectedYearLaps}</div>`),
      `Must display ${expectedYearLaps} pases este año`
    );
    assert.ok(
      contentEl.innerHTML.includes(`${expectedYearMeters} m`),
      `Must display exactly ${expectedYearMeters} m volumen este año`
    );
=======
    assert.ok(
      contentEl.innerHTML.includes('<div class="metric-value">3</div>'),
      'Must display 3 pases este mes'
    );

    const expectedYearLaps = isJanuary ? 3 : 5;
    assert.ok(
      contentEl.innerHTML.includes(`<div class="metric-value">${expectedYearLaps}</div>`),
      `Must display ${expectedYearLaps} pases este año`
    );
>>>>>>> REPLACE
````

### VERIFY
```bash
npm test && npm run verify
```

---

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Deleting a lap mid-run could shift `allLaps.slice(-activeLapCount)` into an earlier session on reload | Medium | `loadSwimmers()` filters active laps by `lap.timestamp >= timerState.startTime` when `startTime` is present. |
| Calling `repository.saveSwimmer` on transient test swimmers in `SwimmerCard` | Low | Guarded with `if (this.swimmer?.id)` and `try / catch` so unit tests without DB initialization never fail. |
| Editing a swimmer profile overwrites `groupId` | Medium | `handleSaveSwimmer()` merges `swimmerData` onto `await repository.getSwimmer(id)` before saving. |
