#!/usr/bin/env node

/**
 * ============================================================================
 * SwimCoach Tracker - SwimmerCard Empirical Challenge & Ergonomics Test Harness
 * Agent: challenger_m2_1 (Empirical Challenger)
 * Milestone: 2 (High-Contrast Poolside Card & Controls)
 * ============================================================================
 *
 * This test harness empirically exercises:
 * 1. 3-Lap Split Feed Reverse Order (Laps 4, 3, 2 displayed; Lap 1 rolls off; placeholders)
 * 2. Zero CLS Placeholder Rows (Always strictly 3 rows: empty, 1 lap, 2 laps, 3+ laps)
 * 3. Reiniciar (Reset) Button Lifecycle & State Restoration (IDLE, 00:00.00, storage sync)
 * 4. Start / Pausar / Reanudar / Detener State Machine Transitions & Visual Attributes
 * 5. Pase Button Debounce (300ms threshold prevents double-tap race conditions)
 * 6. High-Frequency Tapping & Burst Stress Testing
 * 7. 100% Spanish Accessibility & Ergonomics Verification
 * 8. Performance Dirty-Checking & Ticker Subscription Hygiene
 */

import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

// ----------------------------------------------------------------------------
// Lightweight High-Fidelity Mock DOM Engine
// ----------------------------------------------------------------------------

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
    if (this._textContent) return this._textContent;
    if (this.children.length > 0) {
      return this.children.map(c => c.textContent).join(' ');
    }
    return '';
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

  removeEventListener(event, fn) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(f => f !== fn);
  }

  async dispatchEvent(event) {
    const eventObj = typeof event === 'string' ? { type: event } : event;
    if (!eventObj.preventDefault) eventObj.preventDefault = () => {};
    if (!eventObj.stopPropagation) eventObj.stopPropagation = () => {};
    const fns = this._listeners[eventObj.type] || [];
    for (const fn of fns) {
      await fn(eventObj);
    }
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
  // Match tags with attributes and inner content
  const elRegex = /<([a-zA-Z0-9]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9]+)([^>]*)\/>|<([a-zA-Z0-9]+)([^>]*)>/g;
  let match;
  while ((match = elRegex.exec(html)) !== null) {
    const tag = match[1] || match[4] || match[6];
    const attrs = match[2] || match[5] || match[7] || '';
    const inner = match[3] || '';

    const el = new MockElement(tag);
    el.parentNode = parent;

    const idMatch = attrs.match(/id=["']([^"']+)["']/);
    if (idMatch) el.id = idMatch[1];

    const classMatch = attrs.match(/class=["']([^"']+)["']/);
    if (classMatch) el.className = classMatch[1];

    const ariaMatch = attrs.match(/aria-label=["']([^"']+)["']/);
    if (ariaMatch) el['aria-label'] = ariaMatch[1];

    const titleMatch = attrs.match(/title=["']([^"']+)["']/);
    if (titleMatch) el.title = titleMatch[1];

    if (attrs.includes('disabled')) el.disabled = true;

    if (inner && inner.trim()) {
      el.innerHTML = inner;
      const rawText = inner.replace(/<[^>]*>/g, '').trim();
      if (rawText) el.textContent = rawText;
    }

    elements.push(el);
  }
  return elements;
}

// Set global environment
globalThis.document = {
  createElement: (tag) => new MockElement(tag),
  getElementById: () => null
};
globalThis.confirm = () => true;

// ----------------------------------------------------------------------------
// Imports under test
// ----------------------------------------------------------------------------
import { SwimmerCard } from '../../../js/ui/swimmer-card.js';
import { timerEngine, TIMER_STATES, formatTime } from '../../../js/timing/timer-engine.js';
import { repository } from '../../../js/storage/repository.js';
import { ticker } from '../../../js/timing/ticker.js';

// ----------------------------------------------------------------------------
// Test Harness Reporting Setup
// ----------------------------------------------------------------------------
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

async function runTest(suiteName, testName, testFn) {
  totalTests++;
  try {
    await testFn();
    passedTests++;
    console.log(`  ✔ [PASS] ${testName}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✖ [FAIL] ${testName}`);
    console.error(`    Error: ${err.message}`);
    failureDetails.push({ suiteName, testName, error: err.message, stack: err.stack });
  }
}

// Helper: Setup fresh swimmer & repository
async function setupCard(swimmerData = {}) {
  await repository.init();
  await repository.clearAll();
  const swimmer = {
    id: swimmerData.id || `swim-emp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: swimmerData.name || 'Mateo Silva',
    lane: swimmerData.lane || 3,
    baseline100mSeconds: swimmerData.baseline || 60.0
  };
  await repository.saveSwimmer(swimmer);
  const card = new SwimmerCard({ swimmer });
  card.render();
  return { card, swimmer };
}

// ----------------------------------------------------------------------------
// MAIN EXECUTION
// ----------------------------------------------------------------------------
async function main() {
  console.log('======================================================================');
  console.log('   SwimCoach Tracker - SwimmerCard Empirical Challenge Harness (M2)   ');
  console.log('======================================================================\n');

  // =========================================================================
  // SUITE 1: 3-Lap Split Feed Reverse Order & CLS Zero Placeholders
  // =========================================================================
  console.log('[Suite 1] Testing 3-Lap Split Feed Reverse Order & Placeholder Rows...');

  await runTest('Suite 1', 'TC-H-101: 0 Laps renders strictly 3 placeholder rows (V-, --:--.--, --:--.--)', async () => {
    const { card } = await setupCard();
    const rows = card._recentLapsListEl.querySelectorAll('.recent-lap-row');
    assert.strictEqual(rows.length, 3, 'Feed must maintain strictly 3 rows for zero CLS');

    const placeholders = card._recentLapsListEl.querySelectorAll('.placeholder');
    assert.strictEqual(placeholders.length, 3, 'All 3 rows must be placeholders when 0 laps recorded');

    for (const row of rows) {
      assert.ok(row.innerHTML.includes('V-'), 'Placeholder must show V-');
      assert.ok(row.innerHTML.includes('--:--.--'), 'Placeholder must show --:--.--');
    }
  });

  await runTest('Suite 1', 'TC-H-102: 1 Lap renders 1 active row + 2 placeholder rows (total 3)', async () => {
    const { card } = await setupCard();
    card.laps = [
      { lapNumber: 1, splitDurationMs: 45230, cumulativeDurationMs: 45230 }
    ];
    card._updateRecentLaps();

    const rows = card._recentLapsListEl.querySelectorAll('.recent-lap-row');
    assert.strictEqual(rows.length, 3, 'Must maintain exactly 3 rows');

    const placeholders = card._recentLapsListEl.querySelectorAll('.placeholder');
    assert.strictEqual(placeholders.length, 2, 'Must have 2 placeholders remaining');

    // Row 0 must be Lap 1
    const r0 = rows[0];
    assert.ok(r0.innerHTML.includes('V1'), 'Row 0 must be V1');
    assert.ok(r0.innerHTML.includes('00:45.23'), 'Row 0 must show 00:45.23');
  });

  await runTest('Suite 1', 'TC-H-103: 2 Laps renders V2 at top, V1 second, 1 placeholder (total 3)', async () => {
    const { card } = await setupCard();
    card.laps = [
      { lapNumber: 1, splitDurationMs: 45000, cumulativeDurationMs: 45000 },
      { lapNumber: 2, splitDurationMs: 46100, cumulativeDurationMs: 91100 }
    ];
    card._updateRecentLaps();

    const rows = card._recentLapsListEl.querySelectorAll('.recent-lap-row');
    assert.strictEqual(rows.length, 3, 'Must maintain exactly 3 rows');

    const placeholders = card._recentLapsListEl.querySelectorAll('.placeholder');
    assert.strictEqual(placeholders.length, 1, 'Must have 1 placeholder');

    // Row 0 must be V2, Row 1 must be V1
    assert.ok(rows[0].innerHTML.includes('V2'), 'Top row must be V2 (reverse order)');
    assert.ok(rows[0].innerHTML.includes('00:46.10'), 'V2 split must be 00:46.10');
    assert.ok(rows[0].innerHTML.includes('01:31.10'), 'V2 cumulative must be 01:31.10');

    assert.ok(rows[1].innerHTML.includes('V1'), 'Second row must be V1');
    assert.ok(rows[1].innerHTML.includes('00:45.00'), 'V1 split must be 00:45.00');
  });

  await runTest('Suite 1', 'TC-H-104: 3 Laps renders V3, V2, V1 in reverse order with 0 placeholders', async () => {
    const { card } = await setupCard();
    card.laps = [
      { lapNumber: 1, splitDurationMs: 45000, cumulativeDurationMs: 45000 },
      { lapNumber: 2, splitDurationMs: 46000, cumulativeDurationMs: 91000 },
      { lapNumber: 3, splitDurationMs: 44000, cumulativeDurationMs: 135000 }
    ];
    card._updateRecentLaps();

    const rows = card._recentLapsListEl.querySelectorAll('.recent-lap-row');
    assert.strictEqual(rows.length, 3, 'Must maintain exactly 3 rows');

    const placeholders = card._recentLapsListEl.querySelectorAll('.placeholder');
    assert.strictEqual(placeholders.length, 0, 'Zero placeholders when 3 laps exist');

    assert.ok(rows[0].innerHTML.includes('V3'), 'Row 0 is V3');
    assert.ok(rows[1].innerHTML.includes('V2'), 'Row 1 is V2');
    assert.ok(rows[2].innerHTML.includes('V1'), 'Row 2 is V1');
  });

  await runTest('Suite 1', 'TC-H-105: 4 Laps displays exactly [V4, V3, V2]; Lap 1 rolls off', async () => {
    const { card } = await setupCard();
    card.laps = [
      { lapNumber: 1, splitDurationMs: 45000, cumulativeDurationMs: 45000 },
      { lapNumber: 2, splitDurationMs: 46000, cumulativeDurationMs: 91000 },
      { lapNumber: 3, splitDurationMs: 44000, cumulativeDurationMs: 135000 },
      { lapNumber: 4, splitDurationMs: 43500, cumulativeDurationMs: 178500 }
    ];
    card._updateRecentLaps();

    const rows = card._recentLapsListEl.querySelectorAll('.recent-lap-row');
    assert.strictEqual(rows.length, 3, 'Must maintain exactly 3 rows');

    const html = card._recentLapsListEl.innerHTML;
    assert.ok(html.includes('V4'), 'Must include V4');
    assert.ok(html.includes('V3'), 'Must include V3');
    assert.ok(html.includes('V2'), 'Must include V2');
    assert.ok(!html.includes('V1'), 'Lap 1 must roll off when 4 laps exist');

    // Verify ordering
    const idx4 = html.indexOf('V4');
    const idx3 = html.indexOf('V3');
    const idx2 = html.indexOf('V2');
    assert.ok(idx4 < idx3 && idx3 < idx2, 'Reverse chronological order: V4 < V3 < V2');

    // Verify times
    assert.ok(html.includes(formatTime(43500)), 'V4 split time formatted');
    assert.ok(html.includes(formatTime(178500)), 'V4 cumulative time formatted');
  });

  await runTest('Suite 1', 'TC-H-106: 10 Laps displays exactly [V10, V9, V8] in reverse order', async () => {
    const { card } = await setupCard();
    card.laps = Array.from({ length: 10 }, (_, i) => ({
      lapNumber: i + 1,
      splitDurationMs: 45000 + i * 100,
      cumulativeDurationMs: (i + 1) * 45000
    }));
    card._updateRecentLaps();

    const rows = card._recentLapsListEl.querySelectorAll('.recent-lap-row');
    assert.strictEqual(rows.length, 3, 'Must maintain exactly 3 rows');

    const html = card._recentLapsListEl.innerHTML;
    assert.ok(html.includes('V10'), 'Must include V10');
    assert.ok(html.includes('V9'), 'Must include V9');
    assert.ok(html.includes('V8'), 'Must include V8');
    assert.ok(!html.includes('V7<'), 'Laps prior to V8 must not be in feed');
    assert.ok(!html.includes('V1<'), 'Lap 1 must not be in feed');
  });

  // =========================================================================
  // SUITE 2: Reiniciar (Reset) Button Lifecycle & State Restoration
  // =========================================================================
  console.log('\n[Suite 2] Testing Reiniciar (Reset) Button Lifecycle & State Restoration...');

  await runTest('Suite 2', 'TC-H-201: Reiniciar button disabled initially in clean IDLE state', async () => {
    const { card } = await setupCard();
    assert.strictEqual(card._btnResetEl.disabled, true, 'Reset button must be disabled initially');
  });

  await runTest('Suite 2', 'TC-H-202: Reiniciar button enabled when RUNNING', async () => {
    const { card } = await setupCard();
    await card.handleStart();
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(card._btnResetEl.disabled, false, 'Reset button must be enabled when RUNNING');
  });

  await runTest('Suite 2', 'TC-H-203: Reiniciar button enabled when PAUSED', async () => {
    const { card } = await setupCard();
    await card.handleStart();
    await card.handlePause();
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);
    assert.strictEqual(card._btnResetEl.disabled, false, 'Reset button must be enabled when PAUSED');
  });

  await runTest('Suite 2', 'TC-H-204: Reiniciar button enabled when STOPPED with elapsed time', async () => {
    const { card } = await setupCard();
    await card.handleStart();
    await card.handleStop();
    assert.strictEqual(card.timerState.state, TIMER_STATES.STOPPED);
    assert.strictEqual(card._btnResetEl.disabled, false, 'Reset button must be enabled when STOPPED with elapsed time');
  });

  await runTest('Suite 2', 'TC-H-205: Clicking Reiniciar while RUNNING resets state to IDLE, 00:00.00, LISTO, V1, 3 placeholders, and clears IndexedDB laps', async () => {
    const { card, swimmer } = await setupCard();
    await card.handleStart();
    await card.handleLap();
    await card.handleLap();

    assert.strictEqual(card.laps.length, 2);
    const dbLapsBefore = await repository.getLaps(swimmer.id);
    assert.strictEqual(dbLapsBefore.length, 2, 'IndexedDB must have 2 laps before reset');

    // Simulate clicking Reiniciar button
    await card._btnResetEl.dispatchEvent('click');

    // Verify in-memory state
    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE, 'State must transition to IDLE');
    assert.strictEqual(card.timerState.accumulatedMs, 0, 'Accumulated time must be 0');
    assert.strictEqual(card.laps.length, 0, 'Laps array must be cleared');
    assert.strictEqual(card._timeEl.textContent, '00:00.00', 'Stopwatch text must be 00:00.00');
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO', 'State label must be LISTO');
    assert.strictEqual(card._lapCountEl.textContent, 'V1', 'Lap counter must be V1');

    // Verify placeholders restored
    const placeholders = card._recentLapsListEl.querySelectorAll('.placeholder');
    assert.strictEqual(placeholders.length, 3, 'Feed must return to 3 placeholder rows');

    // Verify IndexedDB state
    const dbLapsAfter = await repository.getLaps(swimmer.id);
    assert.strictEqual(dbLapsAfter.length, 0, 'IndexedDB laps must be wiped');

    const dbState = await repository.getTimerState(swimmer.id);
    assert.strictEqual(dbState.state, TIMER_STATES.IDLE, 'IndexedDB timer state must be IDLE');
    assert.strictEqual(dbState.accumulatedMs, 0, 'IndexedDB timer accumulatedMs must be 0');

    // Verify button states
    assert.strictEqual(card._btnStartEl.disabled, false, 'Start button enabled');
    assert.ok(card._btnStartEl.innerHTML.includes('Iniciar'), 'Start button displays Iniciar');
    assert.strictEqual(card._btnStopEl.disabled, true, 'Stop button disabled');
    assert.strictEqual(card._lapBtnEl.disabled, true, 'Lap button disabled');
    assert.strictEqual(card._btnResetEl.disabled, true, 'Reset button disabled after reset');
  });

  await runTest('Suite 2', 'TC-H-206: Clicking Reiniciar while PAUSED cleanly resets', async () => {
    const { card } = await setupCard();
    await card.handleStart();
    await card.handlePause();
    await card.handleLap(); // Ignored in PAUSED, but just checking
    await card._btnResetEl.dispatchEvent('click');

    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE);
    assert.strictEqual(card._timeEl.textContent, '00:00.00');
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO');
  });

  await runTest('Suite 2', 'TC-H-207: Clicking Reiniciar while STOPPED cleanly resets', async () => {
    const { card } = await setupCard();
    await card.handleStart();
    await card.handleStop();
    await card._btnResetEl.dispatchEvent('click');

    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE);
    assert.strictEqual(card._timeEl.textContent, '00:00.00');
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO');
  });

  // =========================================================================
  // SUITE 3: Start / Pausar / Reanudar / Detener State Machine Transitions
  // =========================================================================
  console.log('\n[Suite 3] Testing Start / Pausar / Reanudar / Detener State Machine...');

  await runTest('Suite 3', 'TC-H-301: Full Lifecycle State Transitions: IDLE -> RUNNING -> PAUSED -> RUNNING -> STOPPED', async () => {
    const { card } = await setupCard();

    // 1. Initial IDLE
    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE);
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO');
    assert.ok(card._btnStartEl.innerHTML.includes('Iniciar'));
    assert.strictEqual(card._btnStartEl.disabled, false);
    assert.strictEqual(card._btnStopEl.disabled, true);
    assert.strictEqual(card._lapBtnEl.disabled, true);

    // 2. Click Iniciar -> RUNNING
    await card._btnStartEl.dispatchEvent('click');
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(card._stateLabelEl.textContent, 'EN MARCHA');
    assert.ok(card._btnStartEl.innerHTML.includes('Pausar'));
    assert.ok(card._btnStartEl.classList.contains('is-running'));
    assert.ok(card.element.classList.contains('running'));
    assert.strictEqual(card._btnStopEl.disabled, false);
    assert.strictEqual(card._lapBtnEl.disabled, false);

    // 3. Click Pausar -> PAUSED
    await card._btnStartEl.dispatchEvent('click');
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);
    assert.strictEqual(card._stateLabelEl.textContent, 'PAUSADO');
    assert.ok(card._btnStartEl.innerHTML.includes('Reanudar'));
    assert.ok(card._btnStartEl.classList.contains('is-paused'));
    assert.ok(card.element.classList.contains('paused'));
    assert.strictEqual(card._btnStopEl.disabled, false);
    assert.strictEqual(card._lapBtnEl.disabled, true, 'Lap button must be disabled in PAUSED');

    // 4. Click Reanudar -> RUNNING
    await card._btnStartEl.dispatchEvent('click');
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(card._stateLabelEl.textContent, 'EN MARCHA');
    assert.ok(card._btnStartEl.innerHTML.includes('Pausar'));
    assert.strictEqual(card._lapBtnEl.disabled, false);

    // 5. Click Detener -> STOPPED
    await card._btnStopEl.dispatchEvent('click');
    assert.strictEqual(card.timerState.state, TIMER_STATES.STOPPED);
    assert.strictEqual(card._stateLabelEl.textContent, 'DETENIDO');
    assert.ok(card._btnStartEl.innerHTML.includes('Iniciar'));
    assert.strictEqual(card._btnStopEl.disabled, true);
    assert.strictEqual(card._lapBtnEl.disabled, true);
    assert.ok(!card.element.classList.contains('running'));
    assert.ok(!card.element.classList.contains('paused'));
  });

  await runTest('Suite 3', 'TC-H-302: STOPPED -> Iniciar starts fresh heat', async () => {
    const { card } = await setupCard();
    await card.handleStart();
    await card.handleStop();
    assert.strictEqual(card.timerState.state, TIMER_STATES.STOPPED);

    await card._btnStartEl.dispatchEvent('click');
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(card._stateLabelEl.textContent, 'EN MARCHA');
  });

  await runTest('Suite 3', 'TC-H-303: PAUSED -> Detener transitions directly to STOPPED', async () => {
    const { card } = await setupCard();
    await card.handleStart();
    await card.handlePause();
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);

    await card._btnStopEl.dispatchEvent('click');
    assert.strictEqual(card.timerState.state, TIMER_STATES.STOPPED);
    assert.strictEqual(card._stateLabelEl.textContent, 'DETENIDO');
  });

  // =========================================================================
  // SUITE 4: Pase Button Debouncing & Race Condition Immunity
  // =========================================================================
  console.log('\n[Suite 4] Testing Pase Button Debouncing & Race Conditions...');

  await runTest('Suite 4', 'TC-H-401: Double-tap within 50ms records strictly 1 lap', async () => {
    const { card } = await setupCard();
    await card.handleStart();

    // First tap at t=0
    const p1 = card._lapBtnEl.dispatchEvent('click');
    // Rapid double-tap at t=20ms
    const p2 = card._lapBtnEl.dispatchEvent('click');
    await Promise.all([p1, p2]);

    assert.strictEqual(card.laps.length, 1, 'Double-tap within 300ms window must record only 1 lap');
    assert.strictEqual(card._lapCountEl.textContent, 'V2', 'Next lap counter must be V2');
  });

  await runTest('Suite 4', 'TC-H-402: 10 rapid tap burst within 150ms records strictly 1 lap', async () => {
    const { card } = await setupCard();
    await card.handleStart();

    const burstPromises = [];
    for (let i = 0; i < 10; i++) {
      burstPromises.push(card._lapBtnEl.dispatchEvent('click'));
    }
    await Promise.all(burstPromises);

    assert.strictEqual(card.laps.length, 1, 'Burst of 10 taps must be debounced to exactly 1 lap');
  });

  await runTest('Suite 4', 'TC-H-403: Consecutive taps separated by >300ms record multiple laps accurately', async () => {
    const { card } = await setupCard();
    await card.handleStart();

    // Tap 1
    await card._lapBtnEl.dispatchEvent('click');
    assert.strictEqual(card.laps.length, 1);

    // Advance mock time or sleep > 300ms
    await new Promise(r => setTimeout(r, 320));

    // Tap 2
    await card._lapBtnEl.dispatchEvent('click');
    assert.strictEqual(card.laps.length, 2);

    // Advance > 300ms
    await new Promise(r => setTimeout(r, 320));

    // Tap 3
    await card._lapBtnEl.dispatchEvent('click');
    assert.strictEqual(card.laps.length, 3);

    // Verify lap numbers
    assert.strictEqual(card.laps[0].lapNumber, 1);
    assert.strictEqual(card.laps[1].lapNumber, 2);
    assert.strictEqual(card.laps[2].lapNumber, 3);
  });

  await runTest('Suite 4', 'TC-H-404: Tapping Pase when PAUSED, STOPPED or IDLE is completely ignored', async () => {
    const { card } = await setupCard();

    // IDLE
    await card._lapBtnEl.dispatchEvent('click');
    assert.strictEqual(card.laps.length, 0, 'No lap recorded in IDLE');

    // RUNNING -> PAUSED
    await card.handleStart();
    await card.handlePause();
    card.lastLapTapTime = 0; // Reset debounce timer to test state guard
    await card._lapBtnEl.dispatchEvent('click');
    assert.strictEqual(card.laps.length, 0, 'No lap recorded in PAUSED');

    // STOPPED
    await card.handleStop();
    card.lastLapTapTime = 0;
    await card._lapBtnEl.dispatchEvent('click');
    assert.strictEqual(card.laps.length, 0, 'No lap recorded in STOPPED');
  });

  // =========================================================================
  // SUITE 5: Ergonomics, Accessibility & 100% Spanish Translation
  // =========================================================================
  console.log('\n[Suite 5] Testing Ergonomics, Accessibility & Spanish UI...');

  await runTest('Suite 5', 'TC-H-501: All buttons have valid Spanish aria-labels, titles, and text', async () => {
    const { card } = await setupCard();

    assert.strictEqual(card._btnStartEl.getAttribute('aria-label'), 'Iniciar cronómetro');
    assert.strictEqual(card._btnStopEl.getAttribute('aria-label'), 'Detener cronómetro');
    assert.strictEqual(card._btnResetEl.getAttribute('aria-label'), 'Reiniciar cronómetro');
    assert.strictEqual(card._lapBtnEl.getAttribute('aria-label'), 'Registrar pase de vuelta');
    assert.strictEqual(card._btnLupaEl.getAttribute('aria-label'), 'Ver métricas completas');

    // Dynamic state labels
    await card.handleStart();
    assert.strictEqual(card._btnStartEl.getAttribute('aria-label'), 'Pausar cronómetro');
    assert.strictEqual(card._btnStartEl.title, 'Pausar');

    await card.handlePause();
    assert.strictEqual(card._btnStartEl.getAttribute('aria-label'), 'Reanudar cronómetro');
    assert.strictEqual(card._btnStartEl.title, 'Reanudar');
  });

  await runTest('Suite 5', 'TC-H-502: Zero English strings in rendered markup', async () => {
    const { card } = await setupCard();
    const html = card.element.innerHTML;

    const forbiddenEnglish = [
      'Start', 'Stop', 'Reset', 'Resume', 'Pause', 'Lap',
      'Ready', 'Running', 'Paused', 'Stopped', 'Metrics',
      'Lane', 'Swimmer', 'Split', 'Cumulative'
    ];

    for (const term of forbiddenEnglish) {
      // Regex checking for isolated word in text or attributes
      const wordRegex = new RegExp(`\\b${term}\\b`, 'i');
      // Except if it is part of an ID like "btn-start" or class name
      // We check visible text content
      const visibleText = card.element.textContent;
      assert.ok(
        !wordRegex.test(visibleText),
        `Visible card text contains forbidden English word: "${term}" (Found in "${visibleText}")`
      );
    }
  });

  // =========================================================================
  // SUITE 6: Performance Dirty-Checking & Ticker Subscription Hygiene
  // =========================================================================
  console.log('\n[Suite 6] Testing Performance Dirty-Checking & Ticker Hygiene...');

  await runTest('Suite 6', 'TC-H-601: updateTimeDisplay() skips DOM writes when formatted time is unchanged', async () => {
    const { card } = await setupCard();
    card.timerState = {
      swimmerId: card.swimmer.id,
      state: TIMER_STATES.PAUSED,
      accumulatedMs: 12340
    };

    card.updateTimeDisplay();
    assert.strictEqual(card._timeEl.textContent, '00:12.34');
    assert.strictEqual(card._lastTimeStr, '00:12.34');

    // Spy on textContent setter
    let writeCount = 0;
    Object.defineProperty(card._timeEl, 'textContent', {
      get() { return this._textContent; },
      set(val) { writeCount++; this._textContent = val; }
    });

    // Calling again with same time must NOT write to DOM
    card.updateTimeDisplay();
    assert.strictEqual(writeCount, 0, 'DOM write must be skipped when time is identical (dirty checking)');

    // Changing accumulated time by 10ms (same centiseconds: 12340 -> 12345)
    card.timerState.accumulatedMs = 12345;
    card.updateTimeDisplay();
    assert.strictEqual(writeCount, 0, 'DOM write must be skipped if centisecond string is identical');

    // Changing by 50ms (different centiseconds: 12345 -> 12395)
    card.timerState.accumulatedMs = 12395;
    card.updateTimeDisplay();
    assert.strictEqual(writeCount, 1, 'DOM write occurs when centisecond string changes');
    assert.strictEqual(card._timeEl.textContent, '00:12.39');
  });

  await runTest('Suite 6', 'TC-H-602: destroy() properly unbinds ticker and cleans DOM nodes', async () => {
    const { card } = await setupCard();
    const parent = new MockElement('div');
    card.mount(parent);
    assert.strictEqual(parent.children.length, 1);

    await card.handleStart();
    // Verify ticker subscribed
    assert.strictEqual(ticker.has(`swimmer-${card.swimmer.id}`), true);

    // Destroy
    card.destroy();
    assert.strictEqual(ticker.has(`swimmer-${card.swimmer.id}`), false, 'Ticker must be unsubscribed');
    assert.strictEqual(parent.children.length, 0, 'Card element must be removed from parent');
    assert.strictEqual(card.element, null, 'Internal DOM reference must be nullified');
  });

  // =========================================================================
  // SUITE 7: Multi-Swimmer Concurrent Timing & Feed Isolation
  // =========================================================================
  console.log('\n[Suite 7] Testing Multi-Swimmer Concurrent Timing & Feed Isolation...');

  await runTest('Suite 7', 'TC-H-701: 4 Swimmers running concurrently maintain isolated 3-lap feeds', async () => {
    await repository.init();
    await repository.clearAll();

    const cards = [];
    for (let lane = 1; lane <= 4; lane++) {
      const sw = { id: `swim-lane-${lane}`, name: `Nadador Carril ${lane}`, lane };
      await repository.saveSwimmer(sw);
      const c = new SwimmerCard({ swimmer: sw });
      c.render();
      cards.push(c);
    }

    // Start all 4
    await Promise.all(cards.map(c => c._btnStartEl.dispatchEvent('click')));

    // Swimmer 1 records 1 lap
    await cards[0]._lapBtnEl.dispatchEvent('click');

    // Swimmer 2 records 2 laps
    await cards[1]._lapBtnEl.dispatchEvent('click');
    await new Promise(r => setTimeout(r, 310));
    await cards[1]._lapBtnEl.dispatchEvent('click');

    // Swimmer 3 records 4 laps
    for (let l = 0; l < 4; l++) {
      await cards[2]._lapBtnEl.dispatchEvent('click');
      await new Promise(r => setTimeout(r, 310));
    }

    // Swimmer 4 records 0 laps

    // Assert feeds isolation
    // Swimmer 1: 1 lap, 2 placeholders
    assert.strictEqual(cards[0].laps.length, 1);
    assert.strictEqual(cards[0]._recentLapsListEl.querySelectorAll('.placeholder').length, 2);
    assert.ok(cards[0]._recentLapsListEl.innerHTML.includes('V1'));

    // Swimmer 2: 2 laps, 1 placeholder
    assert.strictEqual(cards[1].laps.length, 2);
    assert.strictEqual(cards[1]._recentLapsListEl.querySelectorAll('.placeholder').length, 1);
    assert.ok(cards[1]._recentLapsListEl.innerHTML.includes('V2'));
    assert.ok(cards[1]._recentLapsListEl.innerHTML.includes('V1'));

    // Swimmer 3: 4 laps, 0 placeholders, shows V4, V3, V2 (V1 rolled off)
    assert.strictEqual(cards[2].laps.length, 4);
    assert.strictEqual(cards[2]._recentLapsListEl.querySelectorAll('.placeholder').length, 0);
    assert.ok(cards[2]._recentLapsListEl.innerHTML.includes('V4'));
    assert.ok(cards[2]._recentLapsListEl.innerHTML.includes('V3'));
    assert.ok(cards[2]._recentLapsListEl.innerHTML.includes('V2'));
    assert.ok(!cards[2]._recentLapsListEl.innerHTML.includes('V1<'));

    // Swimmer 4: 0 laps, 3 placeholders
    assert.strictEqual(cards[3].laps.length, 0);
    assert.strictEqual(cards[3]._recentLapsListEl.querySelectorAll('.placeholder').length, 3);
  });

  // =========================================================================
  // SUITE 8: State Machine Idempotency & Edge Defense
  // =========================================================================
  console.log('\n[Suite 8] Testing State Machine Idempotency & Edge Defense...');

  await runTest('Suite 8', 'TC-H-801: Redundant start calls while RUNNING are strictly idempotent', async () => {
    const { card } = await setupCard();
    await card.handleStart();
    const state1 = { ...card.timerState };

    // Duplicate call
    await card.handleStart();
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(card.timerState.startTime, state1.startTime);
  });

  await runTest('Suite 8', 'TC-H-802: Redundant pause calls while PAUSED are strictly idempotent', async () => {
    const { card } = await setupCard();
    await card.handleStart();
    await card.handlePause();
    const acc1 = card.timerState.accumulatedMs;

    // Duplicate call
    await card.handlePause();
    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);
    assert.strictEqual(card.timerState.accumulatedMs, acc1);
  });

  await runTest('Suite 8', 'TC-H-803: Redundant stop calls while STOPPED are strictly idempotent', async () => {
    const { card } = await setupCard();
    await card.handleStart();
    await card.handleStop();
    const acc1 = card.timerState.accumulatedMs;

    // Duplicate call
    await card.handleStop();
    assert.strictEqual(card.timerState.state, TIMER_STATES.STOPPED);
    assert.strictEqual(card.timerState.accumulatedMs, acc1);
  });

  await runTest('Suite 8', 'TC-H-804: Calling reset while already IDLE maintains clean IDLE state', async () => {
    const { card } = await setupCard();
    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE);
    await card.handleReset();
    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE);
    assert.strictEqual(card._timeEl.textContent, '00:00.00');
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO');
  });

  // =========================================================================
  // SUITE 9: Rehydration & Hard Reload Simulation
  // =========================================================================
  console.log('\n[Suite 9] Testing Rehydration & Hard Reload Simulation...');

  await runTest('Suite 9', 'TC-H-901: Fresh card instance reconstructed from stored state renders accurately', async () => {
    const { card, swimmer } = await setupCard();
    await card.handleStart();
    await card.handleLap();
    await new Promise(r => setTimeout(r, 310));
    await card.handleLap();
    await new Promise(r => setTimeout(r, 310));
    await card.handleLap();
    await new Promise(r => setTimeout(r, 310));
    await card.handleLap(); // 4 laps

    assert.strictEqual(card.laps.length, 4);

    // Destroy first card to simulate page unload
    card.destroy();

    // Rehydrate from IndexedDB
    const rehydratedState = await repository.getTimerState(swimmer.id);
    const rehydratedLaps = await repository.getLaps(swimmer.id);

    assert.strictEqual(rehydratedLaps.length, 4);

    // Create fresh SwimmerCard instance as app.js would on reload
    const freshCard = new SwimmerCard({
      swimmer,
      timerState: rehydratedState,
      laps: rehydratedLaps
    });
    freshCard.render();

    // Verify 3 most recent laps are rendered in reverse order
    const html = freshCard._recentLapsListEl.innerHTML;
    assert.ok(html.includes('V4'), 'Rehydrated card shows V4');
    assert.ok(html.includes('V3'), 'Rehydrated card shows V3');
    assert.ok(html.includes('V2'), 'Rehydrated card shows V2');
    assert.ok(!html.includes('V1<'), 'Rehydrated card rolls off V1');

    // Verify button and counter state
    assert.strictEqual(freshCard._lapCountEl.textContent, 'V5', 'Next lap counter is V5');
    assert.strictEqual(freshCard._btnResetEl.disabled, false, 'Reset button is enabled');
    freshCard.destroy();
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n======================================================================');
  console.log(`HARNESS RESULTS: Total: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
  console.log('======================================================================');

  if (failedTests > 0) {
    console.error('\nFAILURE BREAKDOWN:');
    for (const f of failureDetails) {
      console.error(`- [${f.suiteName}] ${f.testName}: ${f.error}`);
    }
    process.exit(1);
  } else {
    console.log('\n🎉 ALL EMPIRICAL CHALLENGES PASSED! SwimmerCard is fully verified.');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal harness error:', err);
  process.exit(1);
});
