import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

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
      add: (...classes) => {
        const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
        for (const c of classes) set.add(c);
        this.className = Array.from(set).join(' ');
      },
      remove: (...classes) => {
        const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
        for (const c of classes) set.delete(c);
        this.className = Array.from(set).join(' ');
      },
      contains: (cls) => (this.className || '').split(/\s+/).includes(cls)
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
    const ev = typeof event === 'string'
      ? { type: event, target: this, preventDefault() {}, stopPropagation() {} }
      : event;
    if (!ev.target) ev.target = this;
    if (!ev.preventDefault) ev.preventDefault = () => {};
    if (!ev.stopPropagation) ev.stopPropagation = () => {};

    const fns = this._listeners[ev.type] || [];
    for (const fn of fns) {
      await fn(ev);
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

    const dataRegex = /data-([a-zA-Z0-9_-]+)=["']([^"']+)["']/g;
    let dataMatch;
    while ((dataMatch = dataRegex.exec(attrs)) !== null) {
      const rawKey = dataMatch[1];
      const camelKey = rawKey.replace(/-([a-z])/g, (_, l) => l.toUpperCase());
      el.dataset[camelKey] = dataMatch[2];
      el.dataset[rawKey] = dataMatch[2];
    }

    elements.push(el);
  }
  return elements;
}

import { calculateTrainingZones } from '../../js/analytics/zones.js';
import { metricsModal } from '../../js/ui/metrics-modal.js';
import { modalManager } from '../../js/ui/modal.js';
import { SwimmerCard } from '../../js/ui/swimmer-card.js';
import { repository } from '../../js/storage/repository.js';
import { timerEngine, TIMER_STATES } from '../../js/timing/timer-engine.js';

describe('Empirical Challenger M2 Verification Suite', () => {
  let domElements;
  let originalDocument;
  let originalWindow;

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

    register('metrics-modal', new MockElement('div'));
    register('metrics-modal-title', new MockElement('h2'));
    register('metrics-modal-lane', new MockElement('span'));
    register('metrics-modal-body', new MockElement('div'));
    register('metrics-modal-close', new MockElement('button'));
    register('metrics-modal-edit', new MockElement('button'));

    register('swimmer-modal', new MockElement('div'));
    register('swimmer-form', new MockElement('form'));
    register('modal-title', new MockElement('h2'));
    register('swimmer-id-input', new MockElement('input'));
    register('swimmer-name-input', new MockElement('input'));
    register('swimmer-lane-input', new MockElement('input'));
    register('swimmer-baseline-input', new MockElement('input'));
    register('modal-close-btn', new MockElement('button'));
    register('modal-cancel-btn', new MockElement('button'));

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

  test('TC-M2-CHAL-01: In-modal profile edit with 54.0s baseline recalculates reciprocal zones (72.0s, 67.5s, 60.0s, 54.0s) and syncs card UI', async () => {
    const swimmer = {
      id: 'swimmer-m2-c1',
      name: 'Carlos Belmonte',
      lane: 2,
      baseline100mSeconds: 60.0
    };
    await repository.saveSwimmer(swimmer);

    let editedCardSwimmer = null;
    metricsModal.open(swimmer, [], {
      onEdit: (updated) => {
        editedCardSwimmer = updated;
      }
    });

    // Check initial 60s zones
    assert.ok(metricsModal.bodyEl.innerHTML.includes('80.0s'));
    assert.ok(metricsModal.bodyEl.innerHTML.includes('75.0s'));
    assert.ok(metricsModal.bodyEl.innerHTML.includes('66.7s'));
    assert.ok(metricsModal.bodyEl.innerHTML.includes('60.0s'));

    // Trigger edit button
    const editBtn = domElements.get('metrics-modal-edit');
    await editBtn.dispatchEvent({ type: 'click' });

    // Update form to 54.0s baseline, lane 3, name Carlos Belmonte Jr.
    domElements.get('swimmer-name-input').value = 'Carlos Belmonte Jr.';
    domElements.get('swimmer-lane-input').value = '3';
    domElements.get('swimmer-baseline-input').value = '54.0';

    await modalManager._handleSubmit({ preventDefault() {} });

    // Reciprocal zones for 54.0s:
    // 75% = 54/0.75 = 72.0s
    // 80% = 54/0.80 = 67.5s
    // 90% = 54/0.90 = 60.0s
    // 100% = 54.0s
    const bodyHTML = metricsModal.bodyEl.innerHTML;
    assert.ok(bodyHTML.includes('72.0s'), 'Should contain 75% zone 72.0s');
    assert.ok(bodyHTML.includes('67.5s'), 'Should contain 80% zone 67.5s');
    assert.ok(bodyHTML.includes('60.0s'), 'Should contain 90% zone 60.0s');
    assert.ok(bodyHTML.includes('54.0s'), 'Should contain 100% zone 54.0s');
    assert.ok(!bodyHTML.includes('80.0s'), 'Old 80.0s zone must be removed');

    assert.equal(metricsModal.titleEl.textContent, 'Carlos Belmonte Jr.');
    assert.equal(metricsModal.laneEl.textContent, 'C3');

    // Persistence in DB
    const persisted = await repository.getSwimmer('swimmer-m2-c1');
    assert.equal(persisted.baseline100mSeconds, 54.0);
    assert.equal(persisted.lane, 3);
    assert.equal(persisted.name, 'Carlos Belmonte Jr.');

    // Card UI sync and group preservation
    assert.ok(editedCardSwimmer);
    assert.equal(editedCardSwimmer.baseline100mSeconds, 54.0);

    const card = new SwimmerCard({ swimmer: persisted, groupId: 3 });
    card.render();
    card._updateGroupBadge();
    assert.equal(card.groupId, 3);
    card.swimmer = { ...card.swimmer, name: 'Carlos Belmonte III', lane: 5 };
    card.updateUI();
    assert.equal(card.groupId, 3, 'Group ID must be preserved');
    assert.equal(card.element.querySelector('.card-lane-badge').textContent, 'C5');
  });

  test('TC-M2-CHAL-02: Deleting Lap 3 from 5 recorded laps strictly preserves gap [1, 2, 4, 5] without renumbering', async () => {
    const swimmerId = 'swimmer-m2-c2';
    const swimmer = { id: swimmerId, name: 'Elena Ramos', lane: 4, baseline100mSeconds: 58.0 };
    await repository.saveSwimmer(swimmer);

    const laps = [
      { id: 'lap-m2-1', swimmerId, lapNumber: 1, splitDurationMs: 30000, cumulativeDurationMs: 30000, timestamp: 1000 },
      { id: 'lap-m2-2', swimmerId, lapNumber: 2, splitDurationMs: 31000, cumulativeDurationMs: 61000, timestamp: 2000 },
      { id: 'lap-m2-3', swimmerId, lapNumber: 3, splitDurationMs: 32000, cumulativeDurationMs: 93000, timestamp: 3000 },
      { id: 'lap-m2-4', swimmerId, lapNumber: 4, splitDurationMs: 33000, cumulativeDurationMs: 126000, timestamp: 4000 },
      { id: 'lap-m2-5', swimmerId, lapNumber: 5, splitDurationMs: 34000, cumulativeDurationMs: 160000, timestamp: 5000 }
    ];
    for (const l of laps) await repository.saveLap(l);

    await repository.saveTimerState({
      swimmerId,
      state: TIMER_STATES.RUNNING,
      accumulatedMs: 165000,
      currentLapIndex: 6,
      lastLapCumulativeMs: 160000
    });

    metricsModal.open(swimmer, laps);

    // Delete Lap 3
    await metricsModal._handleDeleteLap('lap-m2-3', 3);

    // Verify modal laps
    assert.equal(metricsModal.laps.length, 4);
    assert.deepEqual(metricsModal.laps.map(l => l.lapNumber), [1, 2, 4, 5]);

    // Verify deliberate gap preservation: Lap 4 is NOT renumbered to 3, Lap 5 is NOT renumbered to 4
    assert.equal(metricsModal.laps.find(l => l.id === 'lap-m2-4').lapNumber, 4);
    assert.equal(metricsModal.laps.find(l => l.id === 'lap-m2-5').lapNumber, 5);

    // Verify IndexedDB
    const dbLaps = await repository.getLaps(swimmerId);
    assert.equal(dbLaps.length, 4);
    assert.deepEqual(dbLaps.map(l => l.lapNumber), [1, 2, 4, 5]);
    assert.ok(!dbLaps.some(l => l.id === 'lap-m2-3'));

    // Verify timerState.lastLapCumulativeMs remains 160000 because latest lap (Lap 5) was not deleted
    const timerState = await repository.getTimerState(swimmerId);
    assert.equal(timerState.lastLapCumulativeMs, 160000);
  });

  test('TC-M2-CHAL-03: Deleting latest lap (Lap 5) rolls back lastLapCumulativeMs to Lap 4 cumulative duration', async () => {
    const swimmerId = 'swimmer-m2-c3';
    const swimmer = { id: swimmerId, name: 'Elena Ramos', lane: 4, baseline100mSeconds: 58.0 };
    await repository.saveSwimmer(swimmer);

    const laps = [
      { id: 'lap-m2-1', swimmerId, lapNumber: 1, splitDurationMs: 30000, cumulativeDurationMs: 30000, timestamp: 1000 },
      { id: 'lap-m2-2', swimmerId, lapNumber: 2, splitDurationMs: 31000, cumulativeDurationMs: 61000, timestamp: 2000 },
      { id: 'lap-m2-4', swimmerId, lapNumber: 4, splitDurationMs: 33000, cumulativeDurationMs: 126000, timestamp: 4000 },
      { id: 'lap-m2-5', swimmerId, lapNumber: 5, splitDurationMs: 34000, cumulativeDurationMs: 160000, timestamp: 5000 }
    ];
    for (const l of laps) await repository.saveLap(l);

    await repository.saveTimerState({
      swimmerId,
      state: TIMER_STATES.RUNNING,
      accumulatedMs: 165000,
      currentLapIndex: 6,
      lastLapCumulativeMs: 160000
    });

    metricsModal.open(swimmer, laps);

    // Delete Lap 5 (latest lap)
    await metricsModal._handleDeleteLap('lap-m2-5', 5);

    // Verify remaining laps [1, 2, 4]
    assert.equal(metricsModal.laps.length, 3);
    assert.deepEqual(metricsModal.laps.map(l => l.lapNumber), [1, 2, 4]);

    // Verify rollback in DB: lastLapCumulativeMs must equal Lap 4's cumulativeDurationMs (126000)
    const updatedState = await repository.getTimerState(swimmerId);
    assert.equal(updatedState.lastLapCumulativeMs, 126000, 'Must roll back to 126000');
  });

  test('TC-M2-CHAL-04: Progressively deleting all laps transitions to Spanish empty state without errors', async () => {
    const swimmerId = 'swimmer-m2-c4';
    const swimmer = { id: swimmerId, name: 'Elena Ramos', lane: 4 };
    await repository.saveSwimmer(swimmer);

    const laps = [
      { id: 'lap-m2-1', swimmerId, lapNumber: 1, splitDurationMs: 30000, cumulativeDurationMs: 30000 }
    ];
    await repository.saveLap(laps[0]);
    await repository.saveTimerState({
      swimmerId,
      state: TIMER_STATES.RUNNING,
      accumulatedMs: 35000,
      currentLapIndex: 2,
      lastLapCumulativeMs: 30000
    });

    metricsModal.open(swimmer, laps);

    // Delete final lap
    await metricsModal._handleDeleteLap('lap-m2-1', 1);

    assert.equal(metricsModal.laps.length, 0);
    const dbLaps = await repository.getLaps(swimmerId);
    assert.equal(dbLaps.length, 0);

    const updatedState = await repository.getTimerState(swimmerId);
    assert.equal(updatedState.lastLapCumulativeMs, 0);

    const bodyHTML = metricsModal.bodyEl.innerHTML;
    assert.ok(bodyHTML.includes('Sin pases registrados aún.'));
  });
});
