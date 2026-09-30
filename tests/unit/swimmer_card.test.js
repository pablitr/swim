import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

// Setup Mock DOM for SwimmerCard UI Testing in Node.js
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

  dispatchEvent(event) {
    const fns = this._listeners[event.type || event] || [];
    for (const fn of fns) fn(event);
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
    elements.push(el);
  }
  return elements;
}

import { SwimmerCard } from '../../js/ui/swimmer-card.js';
import { timerEngine, TIMER_STATES } from '../../js/timing/timer-engine.js';
import { repository } from '../../js/storage/repository.js';

describe('SwimmerCard UI Component Unit Tests (M2 High-Contrast & Controls)', () => {
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

  afterEach(() => {
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
  });

  const swimmer = {
    id: 'swimmer-card-test',
    name: 'Alex García',
    lane: 4,
    baseline100mSeconds: 60.0
  };

  test('TC-SC-201: render() builds card with cached DOM nodes and initial IDLE state', () => {
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

  test('TC-SC-202: _updateRecentLaps() displays exactly 3 rows in reverse order with placeholders', () => {
    const card = new SwimmerCard({ swimmer });
    card.render();

    // 1. Initial empty state: 3 placeholder rows
    assert.ok(card._recentLapsListEl.innerHTML.includes('placeholder'));
    assert.ok(card._recentLapsListEl.innerHTML.includes('V-'));

    // 2. Add 1 lap
    card.laps = [
      { lapNumber: 1, splitDurationMs: 45000, cumulativeDurationMs: 45000 }
    ];
    card._updateRecentLaps();

    assert.ok(card._recentLapsListEl.innerHTML.includes('V1'), 'Must show V1');
    assert.ok(card._recentLapsListEl.innerHTML.includes('00:45.00'), 'Must show formatted time 00:45.00');
    assert.ok(card._recentLapsListEl.innerHTML.includes('placeholder'), 'Must retain placeholders for missing laps');

    // 3. Add 4 laps: verify 3 most recent are displayed (Lap 4, Lap 3, Lap 2)
    card.laps = [
      { lapNumber: 1, splitDurationMs: 45000, cumulativeDurationMs: 45000 },
      { lapNumber: 2, splitDurationMs: 46000, cumulativeDurationMs: 91000 },
      { lapNumber: 3, splitDurationMs: 44500, cumulativeDurationMs: 135500 },
      { lapNumber: 4, splitDurationMs: 43200, cumulativeDurationMs: 178700 }
    ];
    card._updateRecentLaps();

    const html = card._recentLapsListEl.innerHTML;
    assert.ok(html.includes('V4'), 'Must show Lap 4');
    assert.ok(html.includes('V3'), 'Must show Lap 3');
    assert.ok(html.includes('V2'), 'Must show Lap 2');
    assert.ok(!html.includes('V1'), 'Lap 1 must roll off when 4 laps exist');
    assert.ok(!html.includes('placeholder'), 'All 3 rows must be populated with no placeholders');

    // Verify reverse chronological order (V4 appears before V3, and V3 before V2)
    const idx4 = html.indexOf('V4');
    const idx3 = html.indexOf('V3');
    const idx2 = html.indexOf('V2');
    assert.ok(idx4 < idx3 && idx3 < idx2, 'Laps must be in reverse order: V4, V3, V2');
  });

  test('TC-SC-203: updateTimeDisplay() uses cached DOM reference with dirty-checking', () => {
    const card = new SwimmerCard({ swimmer });
    card.render();

    card.timerState = {
      swimmerId: swimmer.id,
      state: TIMER_STATES.PAUSED,
      startTime: 1000,
      lastResumeTime: 1000,
      accumulatedMs: 15420
    };

    // First call updates DOM
    card.updateTimeDisplay();
    assert.strictEqual(card._timeEl.textContent, '00:15.42');
    assert.strictEqual(card._lastTimeStr, '00:15.42');

    // Mutate internal state and call again
    card.timerState.accumulatedMs = 20500;
    card.updateTimeDisplay();
    assert.strictEqual(card._timeEl.textContent, '00:20.50');
    assert.strictEqual(card._lastTimeStr, '00:20.50');
  });

  test('TC-SC-204: State machine updates visual controls (Iniciar, Pausar, Reanudar, Detener, Reiniciar)', () => {
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

  test('TC-SC-205: handleReset() resets timer to IDLE, clears laps, and resets lap feed', async () => {
    await repository.saveSwimmer(swimmer);
    const card = new SwimmerCard({ swimmer });
    card.render();

    // Start timer and add laps
    await card.handleStart();
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);

    await card.handleLap();
    await card.handleLap();
    assert.strictEqual(card.laps.length, 2);

    // Invoke handleReset() directly
    await card.handleReset();

    // Verify state reset to IDLE and time to zero
    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE);
    assert.strictEqual(card.timerState.accumulatedMs, 0);
    assert.strictEqual(card.laps.length, 0);
    assert.strictEqual(card._timeEl.textContent, '00:00.00');
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO');
    assert.strictEqual(card._lapCountEl.textContent, 'V1');

    // Verify recent laps are reset to placeholders
    assert.ok(card._recentLapsListEl.innerHTML.includes('placeholder'));
  });

  test('TC-SC-206: 100% Spanish labels and accessibility attributes', () => {
    const card = new SwimmerCard({ swimmer });
    const el = card.render();

    const html = el.innerHTML;
    const spanishLabels = ['Iniciar', 'Detener', 'Reiniciar', 'PASE', 'Métricas', 'LISTO'];
    for (const label of spanishLabels) {
      assert.ok(html.includes(label), `Card must include Spanish label: ${label}`);
    }

    // Verify no English buttons exist
    const englishLabels = ['>Start<', '>Stop<', '>Reset<', '>Lap<'];
    for (const english of englishLabels) {
      assert.ok(!html.includes(english), `Card must NOT include English button: ${english}`);
    }
  });
});
