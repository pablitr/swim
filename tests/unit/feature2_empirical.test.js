import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

// Enhanced Mock DOM specifically for empirical testing of async event listeners and UI transitions
class MockElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.id = '';
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentNode = null;
    this._listeners = {};
    this._innerHTML = '';
    this._textContent = '';
    this.disabled = false;
    this.title = '';
  }

  get classList() {
    return {
      add: (cls) => {
        const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
        set.add(cls);
        this.className = Array.from(set).join(' ');
      },
      remove: (cls) => {
        const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
        set.delete(cls);
        this.className = Array.from(set).join(' ');
      },
      contains: (cls) => {
        return (this.className || '').split(/\s+/).includes(cls);
      }
    };
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = String(html);
    this.children = parseHtmlToMockElements(this._innerHTML, this);
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(text) {
    this._textContent = String(text);
  }

  setAttribute(name, val) {
    this[name] = val;
    if (name === 'id') this.id = val;
    if (name === 'class') this.className = val;
    if (name === 'disabled') this.disabled = Boolean(val);
  }

  getAttribute(name) {
    return this[name] ?? null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }

  async dispatchEvent(event) {
    const ev = typeof event === 'string' ? { type: event } : event;
    const fns = this._listeners[ev.type] || [];
    const results = [];
    for (const fn of fns) {
      results.push(fn(ev));
    }
    await Promise.all(results);
  }

  querySelector(sel) {
    if (sel.startsWith('#')) {
      const id = sel.slice(1);
      return this._find(el => el.id === id);
    }
    if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      return this._find(el => el.classList.contains(cls));
    }
    return this._find(el => el.tagName.toLowerCase() === sel.toLowerCase());
  }

  querySelectorAll(sel) {
    const matches = [];
    const collect = (el) => {
      for (const child of el.children) {
        if (sel.startsWith('.')) {
          if (child.classList.contains(sel.slice(1))) matches.push(child);
        } else if (sel.startsWith('#')) {
          if (child.id === sel.slice(1)) matches.push(child);
        } else if (child.tagName.toLowerCase() === sel.toLowerCase()) {
          matches.push(child);
        }
        collect(child);
      }
    };
    collect(this);
    return matches;
  }

  _find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const found = child._find(predicate);
      if (found) return found;
    }
    return null;
  }
}

function parseHtmlToMockElements(html, parent) {
  const elements = [];
  const elRegex = /<([a-zA-Z0-9]+)([^>]*)>/g;
  let match;
  while ((match = elRegex.exec(html)) !== null) {
    const tag = match[1];
    const attrs = match[2];
    const el = new MockElement(tag);
    el.parentNode = parent;
    const idMatch = attrs.match(/id=["']([^"']+)["']/);
    if (idMatch) el.id = idMatch[1];
    const classMatch = attrs.match(/class=["']([^"']+)["']/);
    if (classMatch) el.className = classMatch[1];
    if (attrs.includes('disabled')) el.disabled = true;

    // Capture innerHTML for elements with id if present in container html
    if (el.id) {
      const innerRegex = new RegExp(`<${tag}[^>]*id=["']${el.id}["'][^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
      const innerMatch = innerRegex.exec(html);
      if (innerMatch) {
        el._innerHTML = innerMatch[1];
      }
    }

    elements.push(el);
  }
  return elements;
}

import { SwimmerCard } from '../../js/ui/swimmer-card.js';
import { timerEngine, TIMER_STATES, formatTime } from '../../js/timing/timer-engine.js';
import { repository } from '../../js/storage/repository.js';
import { ticker } from '../../js/timing/ticker.js';

describe('Empirical Verification: Feature 2 — Split "Pause / Lap+Pause" Button and Reset Functionality', () => {
  let originalDocument;
  let originalConfirm;

  beforeEach(async () => {
    originalDocument = globalThis.document;
    originalConfirm = globalThis.confirm;
    globalThis.document = {
      createElement: (tag) => new MockElement(tag),
      getElementById: (id) => null
    };
    globalThis.confirm = () => true;

    await repository.init();
    await repository.clearAll();
  });

  afterEach(async () => {
    if (originalDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = originalDocument;
    }
    if (originalConfirm === undefined) {
      delete globalThis.confirm;
    } else {
      globalThis.confirm = originalConfirm;
    }
    await repository.clearAll();
  });

  const testSwimmer = {
    id: 'swimmer-f2-empirical',
    name: 'Valeria Rivas',
    lane: 3,
    baseline100mSeconds: 62.5
  };

  // =========================================================================
  // Verification 1: Split Button Rendering in RUNNING State
  // =========================================================================
  test('EMP-F2-01: When RUNNING, split buttons are rendered: [⏸️] and [↺+⏸️] with equal flex layout', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    // 1. Initial IDLE state
    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE);
    assert.strictEqual(card._splitContainerEl.classList.contains('is-split'), false, 'Container must NOT have is-split in IDLE');
    assert.strictEqual(card._btnLapPauseEl.style.display, 'none', 'Lap+Pause must be hidden in IDLE');
    assert.strictEqual(card._btnLapPauseEl.disabled, true, 'Lap+Pause must be disabled in IDLE');
    assert.ok(card._btnStartEl.innerHTML.includes('Iniciar'), 'Primary button displays Iniciar in IDLE');

    // 2. Start timer -> transition to RUNNING
    await card.handleStart();
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);

    // 3. Verify split button layout and icons
    assert.strictEqual(card._splitContainerEl.classList.contains('is-split'), true, 'Container must have is-split class when RUNNING');
    assert.strictEqual(card._btnLapPauseEl.style.display, 'inline-flex', 'Lap+Pause button must be displayed when RUNNING');
    assert.strictEqual(card._btnLapPauseEl.disabled, false, 'Lap+Pause button must be enabled when RUNNING');

    // Verify icons and labels: [⏸️] Pausar and [↺+⏸️] Pase+Pausa
    assert.ok(card._btnStartEl.innerHTML.includes('Pausar'), 'Primary button must display Pausar label');
    assert.ok(card._btnStartEl.innerHTML.includes('<rect'), 'Primary button must contain pause SVG icon [⏸️]');
    assert.ok(card._btnLapPauseEl.innerHTML.includes('Pase+Pausa'), 'Lap+Pause button must display Pase+Pausa label');
    assert.ok(card._btnLapPauseEl.innerHTML.includes('<polyline') || card._btnLapPauseEl.innerHTML.includes('<line'), 'Lap+Pause button must contain lap+pause SVG icon [↺+⏸️]');

    // Verify both buttons reside inside the split container
    assert.ok(card._btnStartEl.classList.contains('btn-card-action'));
    assert.ok(card._btnLapPauseEl.classList.contains('btn-card-action'));
    assert.ok(card._btnLapPauseEl.classList.contains('btn-card-lap-pause'));
  });

  // =========================================================================
  // Verification 2: Tapping [↺+⏸️] records lap split AND pauses timer
  // =========================================================================
  test('EMP-F2-02: Tapping [↺+⏸️] records a lap split AND pauses the timer atomically', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    // Start timer and simulate elapsed time
    await card.handleStart();
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);

    await new Promise(r => setTimeout(r, 60));

    // Tap [↺+⏸️] Pase+Pausa button via simulated DOM click
    await card._btnLapPauseEl.dispatchEvent({ type: 'click' });

    // 1. Timer state is PAUSED
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED, 'Timer state must be PAUSED after Lap+Pause');
    assert.strictEqual(card._stateLabelEl.textContent, 'PAUSADO', 'State label must indicate PAUSADO');
    assert.ok(card.timerState.accumulatedMs >= 50, `accumulatedMs must be recorded: ${card.timerState.accumulatedMs}`);

    // 2. Exactly one lap recorded
    assert.strictEqual(card.laps.length, 1, 'Exactly 1 lap must be in card.laps');
    const recordedLap = card.laps[0];
    assert.strictEqual(recordedLap.lapNumber, 1, 'Lap number must be 1');
    assert.ok(recordedLap.splitDurationMs >= 50, `splitDurationMs must reflect elapsed time: ${recordedLap.splitDurationMs}`);
    assert.strictEqual(recordedLap.splitDurationMs, recordedLap.cumulativeDurationMs, 'Split and cumulative must match for Lap 1');

    // 3. Lap is persisted in repository
    const storedLaps = await repository.getLaps(testSwimmer.id);
    assert.strictEqual(storedLaps.length, 1, 'Exactly 1 lap must be persisted in repository');
    assert.strictEqual(storedLaps[0].id, recordedLap.id);
    assert.strictEqual(storedLaps[0].splitDurationMs, recordedLap.splitDurationMs);

    // 4. Stored timer state in repository is also PAUSED
    const storedState = await repository.getTimerState(testSwimmer.id);
    assert.strictEqual(storedState.state, TIMER_STATES.PAUSED, 'Repository timer state must be PAUSED');
    assert.strictEqual(storedState.accumulatedMs, card.timerState.accumulatedMs);

    // 5. Recent laps list updated in UI
    const recentHtml = card._recentLapsListEl.innerHTML;
    assert.ok(recentHtml.includes('V1'), 'Recent laps must show V1');
    assert.ok(recentHtml.includes(formatTime(recordedLap.splitDurationMs)), 'First lap row must show formatted split duration');
    assert.ok(recentHtml.includes('placeholder'), 'Missing rows must retain placeholders for zero CLS');
  });

  // =========================================================================
  // Verification 3: Debounce Protection (300ms) on Rapid Double Tap
  // =========================================================================
  test('EMP-F2-03: Rapid double tap (< 300ms) on [↺+⏸️] is debounced without duplicate laps', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    await card.handleStart();
    await new Promise(r => setTimeout(r, 40));

    // First tap
    const firstTapPromise = card._btnLapPauseEl.dispatchEvent({ type: 'click' });

    // Immediate second tap (0-1ms later)
    const secondTapPromise = card._btnLapPauseEl.dispatchEvent({ type: 'click' });

    await Promise.all([firstTapPromise, secondTapPromise]);

    // Verify debounce prevented duplicate lap
    assert.strictEqual(card.laps.length, 1, 'Must record exactly 1 lap despite rapid double tap');
    const storedLaps = await repository.getLaps(testSwimmer.id);
    assert.strictEqual(storedLaps.length, 1, 'Repository must contain exactly 1 lap');
  });

  test('EMP-F2-03-B: Adversarial high-frequency click burst (5 rapid taps within 100ms)', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    await card.handleStart();

    // Burst of 5 taps in immediate succession
    await card._btnLapPauseEl.dispatchEvent({ type: 'click' });
    await card._btnLapPauseEl.dispatchEvent({ type: 'click' });
    await card._btnLapPauseEl.dispatchEvent({ type: 'click' });
    await card._btnLapPauseEl.dispatchEvent({ type: 'click' });
    await card._btnLapPauseEl.dispatchEvent({ type: 'click' });

    assert.strictEqual(card.laps.length, 1, 'Debounce burst must record strictly 1 lap');
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);
  });

  // =========================================================================
  // Verification 4: Resuming from PAUSED returns to single Reanudar button
  // =========================================================================
  test('EMP-F2-04: When PAUSED, returns to single Reanudar button; Resuming restores split buttons', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    await card.handleStart();
    await new Promise(r => setTimeout(r, 40));

    // Tap Lap+Pause -> PAUSED
    await card._btnLapPauseEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);

    // Verify in PAUSED state: single Reanudar button, split container collapsed
    assert.strictEqual(card._splitContainerEl.classList.contains('is-split'), false, 'Container must NOT be split when PAUSED');
    assert.strictEqual(card._btnLapPauseEl.style.display, 'none', 'Lap+Pause must be hidden when PAUSED');
    assert.strictEqual(card._btnLapPauseEl.disabled, true, 'Lap+Pause must be disabled when PAUSED');
    assert.ok(card._btnStartEl.innerHTML.includes('Reanudar'), 'Single button must display Reanudar when PAUSED');
    assert.ok(card._btnStartEl.classList.contains('is-paused'), 'Button must have is-paused class');

    // Click Reanudar via primary button
    await card._btnStartEl.dispatchEvent({ type: 'click' });

    // Verify resumed to RUNNING state: returns to split buttons
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING, 'State must return to RUNNING');
    assert.strictEqual(card._splitContainerEl.classList.contains('is-split'), true, 'Split container must be restored');
    assert.strictEqual(card._btnLapPauseEl.style.display, 'inline-flex', 'Lap+Pause must be visible again');
    assert.strictEqual(card._btnLapPauseEl.disabled, false, 'Lap+Pause must be enabled again');
    assert.ok(card._btnStartEl.innerHTML.includes('Pausar'), 'Primary button returns to Pausar');
  });

  // =========================================================================
  // Verification 5: Resetting to 00:00.00 and IDLE while preserving persisted laps
  // =========================================================================
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
    assert.strictEqual(card._lapBtnEl.disabled, true, 'Lap button must be disabled when IDLE');
    assert.ok(card._btnStartEl.innerHTML.includes('Iniciar'), 'Primary button must show Iniciar');
    assert.strictEqual(card._btnLapPauseEl.style.display, 'none', 'Lap+Pause must be hidden after reset');

    // 4. Verify recent laps feed reset to placeholders for the active card session
    assert.strictEqual(card.laps.length, 0, 'Card active session laps must be cleared');
    assert.ok(card._recentLapsListEl.innerHTML.includes('placeholder'), 'Recent laps must revert to placeholders');

    // 5. CRITICAL INVARIANT: Persisted laps in IndexedDB MUST BE PRESERVED
    const persistedAfterReset = await repository.getLaps(testSwimmer.id);
    assert.strictEqual(
      persistedAfterReset.length,
      3,
      'CRITICAL: Historical laps in IndexedDB repository MUST be preserved after card Reiniciar click'
    );
    assert.strictEqual(persistedAfterReset[0].lapNumber, 1);
    assert.strictEqual(persistedAfterReset[1].lapNumber, 2);
    assert.strictEqual(persistedAfterReset[2].lapNumber, 3);
    assert.strictEqual(persistedAfterReset[0].id, persistedBeforeReset[0].id);
    assert.strictEqual(persistedAfterReset[1].id, persistedBeforeReset[1].id);
    assert.strictEqual(persistedAfterReset[2].id, persistedBeforeReset[2].id);
  });

  // =========================================================================
  // Verification 6: Starting a new session after Reset appends laps cleanly
  // =========================================================================
  test('EMP-F2-06: Starting new session after Reset appends new laps to repository without corrupting history', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    // Session 1: 2 laps then reset
    await card.handleStart();
    await new Promise(r => setTimeout(r, 40));
    await card.handleLap();
    await new Promise(r => setTimeout(r, 40));
    await card.handleLapPause();
    await card.handleReset();

    // Session 2: Start again
    await card.handleStart();
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
    await new Promise(r => setTimeout(r, 40));
    await card.handleLap(); // Lap 1 of session 2

    // Card should now have 1 lap in active session
    assert.strictEqual(card.laps.length, 1);
    assert.strictEqual(card.laps[0].lapNumber, 1);

    // Repository should contain all 3 laps (2 from session 1 + 1 from session 2)
    const allLaps = await repository.getLaps(testSwimmer.id);
    assert.strictEqual(allLaps.length, 3, 'Repository must accumulate laps across reset sessions');
  });

  // =========================================================================
  // Verification 7: Reset Button Gating across all 4 States
  // =========================================================================
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

    // Swimmer A is IDLE; Swimmer B is STILL RUNNING undisturbed
    assert.strictEqual(cardA.timerState.state, TIMER_STATES.IDLE);
    assert.strictEqual(cardA._timeEl.textContent, '00:00.00');
    assert.strictEqual(cardB.timerState.state, TIMER_STATES.RUNNING);

    // Swimmer A's lap remains persisted in repository
    const lapsA = await repository.getLaps(swimmerA.id);
    assert.strictEqual(lapsA.length, 1);
  });

  // =========================================================================
  // Verification 9: Successive Lap+Pause across 3 Pause-Resume cycles
  // =========================================================================
  test('EMP-F2-09: Successive Lap+Pause across 3 cycles enforces strict incremental splits and monotonic cumulative times', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    // Cycle 1
    await card.handleStart();
    await new Promise(r => setTimeout(r, 40));
    await card.handleLapPause();
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);
    assert.strictEqual(card.laps.length, 1);

    // Cycle 2: Resume then Lap+Pause
    await new Promise(r => setTimeout(r, 310)); // wait >300ms for debounce
    await card.handleResume();
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
    await new Promise(r => setTimeout(r, 40));
    await card.handleLapPause();
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);
    assert.strictEqual(card.laps.length, 2);

    // Cycle 3: Resume then Lap+Pause
    await new Promise(r => setTimeout(r, 310)); // wait >300ms for debounce
    await card.handleResume();
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
    await new Promise(r => setTimeout(r, 40));
    await card.handleLapPause();
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);
    assert.strictEqual(card.laps.length, 3);

    // Mathematical integrity verification
    const [lap1, lap2, lap3] = card.laps;
    assert.ok(lap1.cumulativeDurationMs > 0);
    assert.ok(lap2.cumulativeDurationMs > lap1.cumulativeDurationMs, 'Cumulative time must be strictly monotonic');
    assert.ok(lap3.cumulativeDurationMs > lap2.cumulativeDurationMs, 'Cumulative time must be strictly monotonic');

    assert.strictEqual(lap1.splitDurationMs, lap1.cumulativeDurationMs);
    assert.strictEqual(lap2.splitDurationMs, lap2.cumulativeDurationMs - lap1.cumulativeDurationMs);
    assert.strictEqual(lap3.splitDurationMs, lap3.cumulativeDurationMs - lap2.cumulativeDurationMs);
  });

  // =========================================================================
  // Verification 10: Inactive/Dead State Safety
  // =========================================================================
  test('EMP-F2-10: Calling handleLapPause() when IDLE, PAUSED, or STOPPED is safely ignored', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    // 1. In IDLE
    await card.handleLapPause();
    assert.strictEqual(card.laps.length, 0);
    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE);

    // 2. In PAUSED
    await card.handleStart();
    await card.handlePause();
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);
    await card.handleLapPause();
    assert.strictEqual(card.laps.length, 0);
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);

    // 3. In STOPPED
    await card.handleStop();
    assert.strictEqual(card.timerState.state, TIMER_STATES.STOPPED);
    await card.handleLapPause();
    assert.strictEqual(card.laps.length, 0);
    assert.strictEqual(card.timerState.state, TIMER_STATES.STOPPED);
  });

  // =========================================================================
  // Verification 11: Reset from RUNNING State
  // =========================================================================
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

  // =========================================================================
  // Verification 12: Historical Wipe vs Card Reset Contract
  // =========================================================================
  test('EMP-F2-12: Full historical wipe contract: clearHistorical=true removes repository laps, standard reset preserves them', async () => {
    await repository.saveSwimmer(testSwimmer);
    const card = new SwimmerCard({ swimmer: testSwimmer });
    card.render();

    // Record 2 laps
    await card.handleStart();
    await card.handleLap();
    await card.handleLap();
    assert.strictEqual(card.laps.length, 2);

    // Standard card reset (no options) preserves repository laps
    await card.handleReset();
    let repoLaps = await repository.getLaps(testSwimmer.id);
    assert.strictEqual(repoLaps.length, 2, 'Standard reset must preserve repository laps');

    // Modal explicit reset with clearHistorical: true deletes repository laps
    await card.handleReset({ clearHistorical: true });
    repoLaps = await repository.getLaps(testSwimmer.id);
    assert.strictEqual(repoLaps.length, 0, 'Reset with clearHistorical: true must delete repository laps');
  });
});
