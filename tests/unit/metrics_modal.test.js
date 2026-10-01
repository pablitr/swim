import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

// Setup Mock DOM for MetricsModal Testing in Node.js
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
    this._value = '';
    this.disabled = false;
    this.title = '';
  }

  get value() {
    return this._value || '';
  }

  set value(val) {
    this._value = val !== undefined && val !== null ? String(val) : '';
  }

  focus() {}

  reset() {}

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
    const eventType = typeof event === 'string' ? event : (event.type || 'click');
    const fns = this._listeners[eventType] || [];
    const eventObj = typeof event === 'string' ? { type: event, target: this, preventDefault() {}, stopPropagation() {} } : event;
    if (!eventObj.target) eventObj.target = this;
    for (const fn of fns) fn(eventObj);
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

    // extract data-* attributes
    const dataRegex = /data-([a-zA-Z0-9_-]+)=["']([^"']+)["']/g;
    let dataMatch;
    while ((dataMatch = dataRegex.exec(attrs)) !== null) {
      const key = dataMatch[1].replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      el.dataset[key] = dataMatch[2];
      el.dataset[dataMatch[1]] = dataMatch[2];
    }

    elements.push(el);
  }
  return elements;
}

import { metricsModal } from '../../js/ui/metrics-modal.js';
import { modalManager } from '../../js/ui/modal.js';
import { repository } from '../../js/storage/repository.js';
import { timerEngine, TIMER_STATES } from '../../js/timing/timer-engine.js';

describe('MetricsModal UI Component Unit Tests (M2 Editing & Gap Preservation)', () => {
  let originalDocument;
  let originalWindow;
  let domElements;

  beforeEach(async () => {
    await repository.init();
    await repository.clearAll();
    await timerEngine.init(repository);

    originalDocument = globalThis.document;
    originalWindow = globalThis.window;

    domElements = new Map();
    const register = (id, el) => {
      el.id = id;
      domElements.set(id, el);
      return el;
    };

    const metricsModalEl = register('metrics-modal', new MockElement('div'));
    const metricsTitleEl = register('metrics-modal-title', new MockElement('h2'));
    const metricsLaneEl = register('metrics-modal-lane', new MockElement('span'));
    const metricsBodyEl = register('metrics-modal-body', new MockElement('div'));
    const metricsCloseBtn = register('metrics-modal-close', new MockElement('button'));
    const metricsEditBtn = register('metrics-modal-edit', new MockElement('button'));

    // Register swimmer modal elements for modalManager
    const swimmerModalEl = register('swimmer-modal', new MockElement('div'));
    const swimmerFormEl = register('swimmer-form', new MockElement('form'));
    const modalTitleEl = register('modal-title', new MockElement('h2'));
    const swimmerIdInput = register('swimmer-id-input', new MockElement('input'));
    const swimmerNameInput = register('swimmer-name-input', new MockElement('input'));
    const swimmerLaneInput = register('swimmer-lane-input', new MockElement('input'));
    const swimmerBaselineInput = register('swimmer-baseline-input', new MockElement('input'));
    const modalCloseBtn = register('modal-close-btn', new MockElement('button'));
    const modalCancelBtn = register('modal-cancel-btn', new MockElement('button'));

    globalThis.document = {
      getElementById: (id) => domElements.get(id) || null,
      createElement: (tag) => new MockElement(tag),
      addEventListener: () => {},
      removeEventListener: () => {}
    };

    globalThis.window = {
      confirm: () => true,
      alert: () => {}
    };

    // Re-initialize metricsModal and modalManager references
    metricsModal.modalEl = null;
    metricsModal.titleEl = null;
    metricsModal.laneEl = null;
    metricsModal.bodyEl = null;
    metricsModal.closeBtn = null;
    metricsModal.editBtn = null;
    metricsModal._editBound = false;

    modalManager.modalEl = null;
    modalManager.formEl = null;
    modalManager.init();
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  test('TC-MM-301: open() renders swimmer name, lane, and training zones with reciprocal formula', () => {
    const swimmer = {
      id: 'swimmer-test-1',
      name: 'Sofia Pellegrini',
      lane: 4,
      baseline100mSeconds: 60.0
    };

    metricsModal.open(swimmer, []);

    assert.equal(metricsModal.titleEl.textContent, 'Sofia Pellegrini');
    assert.equal(metricsModal.laneEl.textContent, 'C4');
    assert.ok(metricsModal.modalEl.classList.contains('open'));

    // 60s baseline reciprocal zones: 75% = 80.0s, 80% = 75.0s, 90% = 66.7s, 100% = 60.0s
    assert.ok(metricsModal.bodyEl.innerHTML.includes('80.0s'), 'Should contain 75% zone 80.0s');
    assert.ok(metricsModal.bodyEl.innerHTML.includes('75.0s'), 'Should contain 80% zone 75.0s');
    assert.ok(metricsModal.bodyEl.innerHTML.includes('66.7s'), 'Should contain 90% zone 66.7s');
    assert.ok(metricsModal.bodyEl.innerHTML.includes('60.0s'), 'Should contain 100% zone 60.0s');
  });

  test('TC-MM-302: Pencil button (✏️) opens profile edit form with prefilled baseline', async () => {
    const swimmer = {
      id: 'swimmer-test-2',
      name: 'Michael Phelps',
      lane: 5,
      baseline100mSeconds: 52.5
    };

    await repository.saveSwimmer(swimmer);
    metricsModal.open(swimmer, []);

    // Trigger edit button click
    const editBtn = domElements.get('metrics-modal-edit');
    assert.ok(editBtn, 'Edit button must exist');
    editBtn.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });

    // Verify modalManager opened with prefilled values
    const nameInput = domElements.get('swimmer-name-input');
    const laneInput = domElements.get('swimmer-lane-input');
    const baselineInput = domElements.get('swimmer-baseline-input');

    assert.equal(nameInput.value, 'Michael Phelps');
    assert.equal(laneInput.value, '5');
    assert.equal(baselineInput.value, '52.5');
  });

  test('TC-MM-303: Saving updated baseline recalculates training zones immediately without reload', async () => {
    const swimmer = {
      id: 'swimmer-test-3',
      name: 'Katie Ledecky',
      lane: 3,
      baseline100mSeconds: 60.0
    };

    await repository.saveSwimmer(swimmer);
    let editedSwimmerData = null;

    metricsModal.open(swimmer, [], {
      onEdit: (updated) => {
        editedSwimmerData = updated;
      }
    });

    // Open edit form
    const editBtn = domElements.get('metrics-modal-edit');
    editBtn.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });

    // Modify baseline from 60.0 to 50.0
    const baselineInput = domElements.get('swimmer-baseline-input');
    baselineInput.value = '50.0';

    // Submit form
    const form = domElements.get('swimmer-form');
    await modalManager._handleSubmit({ preventDefault() {} });

    // Verify reciprocal formula for 50s baseline:
    // 75% = 50 / 0.75 = 66.67 -> 66.7s
    // 80% = 50 / 0.80 = 62.5s
    // 90% = 50 / 0.90 = 55.56 -> 55.6s
    // 100% = 50.0s
    assert.ok(metricsModal.bodyEl.innerHTML.includes('66.7s'), 'Zones should recalculate to 66.7s for 75%');
    assert.ok(metricsModal.bodyEl.innerHTML.includes('62.5s'), 'Zones should recalculate to 62.5s for 80%');
    assert.ok(metricsModal.bodyEl.innerHTML.includes('55.6s'), 'Zones should recalculate to 55.6s for 90%');
    assert.ok(metricsModal.bodyEl.innerHTML.includes('50.0s'), 'Zones should recalculate to 50.0s for 100%');

    assert.equal(editedSwimmerData.baseline100mSeconds, 50.0);
  });

  test('TC-MM-304: Lap table renders trash icon button (.btn-lap-delete) for every row', () => {
    const swimmer = { id: 's1', name: 'Alex', lane: 1 };
    const laps = [
      { id: 'lap-1', swimmerId: 's1', lapNumber: 1, splitDurationMs: 30000, cumulativeDurationMs: 30000 },
      { id: 'lap-2', swimmerId: 's1', lapNumber: 2, splitDurationMs: 31000, cumulativeDurationMs: 61000 },
      { id: 'lap-3', swimmerId: 's1', lapNumber: 3, splitDurationMs: 32000, cumulativeDurationMs: 93000 }
    ];

    metricsModal.open(swimmer, laps);

    const deleteButtons = metricsModal.bodyEl.querySelectorAll('.btn-lap-delete');
    assert.equal(deleteButtons.length, 3, 'Must render exactly 3 delete buttons');
  });

  test('TC-MM-305: DELIBERATE GAP PRESERVATION: deleting Lap 2 leaves Laps 1 and 3 with original lap numbers', async () => {
    const swimmer = { id: 's1', name: 'Alex', lane: 1 };
    const laps = [
      { id: 'lap-1', swimmerId: 's1', lapNumber: 1, splitDurationMs: 30000, cumulativeDurationMs: 30000 },
      { id: 'lap-2', swimmerId: 's1', lapNumber: 2, splitDurationMs: 31000, cumulativeDurationMs: 61000 },
      { id: 'lap-3', swimmerId: 's1', lapNumber: 3, splitDurationMs: 32000, cumulativeDurationMs: 93000 }
    ];

    for (const lap of laps) {
      await repository.saveLap(lap);
    }

    let deletedCallbackId = null;
    let deletedCallbackNum = null;

    metricsModal.open(swimmer, laps, {
      onDeleteLap: (lapId, lapNum) => {
        deletedCallbackId = lapId;
        deletedCallbackNum = lapNum;
      }
    });

    // Delete Lap 2
    await metricsModal._handleDeleteLap('lap-2', 2);

    // Verify remaining laps in metricsModal.laps
    assert.equal(metricsModal.laps.length, 2, 'Should have 2 remaining laps');
    assert.equal(metricsModal.laps[0].lapNumber, 1, 'First lap must retain lapNumber: 1');
    assert.equal(metricsModal.laps[1].lapNumber, 3, 'Second lap must retain original lapNumber: 3 (NOT renumbered to 2)');

    // Verify DOM preserves gaps: #1 and #3
    assert.ok(metricsModal.bodyEl.innerHTML.includes('#1'), 'DOM should display #1');
    assert.ok(metricsModal.bodyEl.innerHTML.includes('#3'), 'DOM should display #3');
    assert.ok(!metricsModal.bodyEl.innerHTML.includes('#2'), 'DOM should not display #2');

    // Verify callback was notified
    assert.equal(deletedCallbackId, 'lap-2');
    assert.equal(deletedCallbackNum, 2);

    // Verify deleted from repository
    const storedLaps = await repository.getLaps('s1');
    assert.equal(storedLaps.length, 2);
    assert.ok(!storedLaps.some(l => l.id === 'lap-2'));
  });

  test('TC-MM-306: Deleting latest recorded lap updates timerState.lastLapCumulativeMs to previous lap cumulative duration', async () => {
    const swimmer = { id: 's1', name: 'Alex', lane: 1 };
    const laps = [
      { id: 'lap-1', swimmerId: 's1', lapNumber: 1, splitDurationMs: 30000, cumulativeDurationMs: 30000 },
      { id: 'lap-2', swimmerId: 's1', lapNumber: 2, splitDurationMs: 31000, cumulativeDurationMs: 61000 }
    ];

    for (const lap of laps) {
      await repository.saveLap(lap);
    }

    const initialTimerState = {
      swimmerId: 's1',
      state: TIMER_STATES.RUNNING,
      accumulatedMs: 65000,
      currentLapIndex: 3,
      lastLapCumulativeMs: 61000
    };
    await repository.saveTimerState(initialTimerState);

    metricsModal.open(swimmer, laps);

    // Delete latest lap (Lap 2)
    await metricsModal._handleDeleteLap('lap-2', 2);

    // State should now have lastLapCumulativeMs updated to Lap 1's cumulativeDurationMs (30000)
    const updatedState = await repository.getTimerState('s1');
    assert.equal(updatedState.lastLapCumulativeMs, 30000, 'lastLapCumulativeMs should roll back to previous lap');
  });

  test('TC-MM-307: Deleting all laps displays clean Spanish empty state "Sin pases registrados aún."', async () => {
    const swimmer = { id: 's1', name: 'Alex', lane: 1 };
    const laps = [
      { id: 'lap-1', swimmerId: 's1', lapNumber: 1, splitDurationMs: 30000, cumulativeDurationMs: 30000 }
    ];
    await repository.saveLap(laps[0]);

    metricsModal.open(swimmer, laps);
    await metricsModal._handleDeleteLap('lap-1', 1);

    assert.equal(metricsModal.laps.length, 0);
    assert.ok(metricsModal.bodyEl.innerHTML.includes('Sin pases registrados aún.'));
  });
});
