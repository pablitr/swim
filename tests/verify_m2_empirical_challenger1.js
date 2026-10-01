#!/usr/bin/env node

/**
 * Empirical Challenge Suite: Milestone 2 Verification Runner
 *
 * Focus Areas:
 * 1. In-Modal Swimmer Profile Editing & Reciprocal Training Zone Recalculation
 *    - Reciprocal velocity formula: Pace = Baseline / Effort%
 *    - Example: 54.0s baseline -> 75% = 72.0s, 80% = 67.5s, 90% = 60.0s, 100% = 54.0s
 *    - Strict rejection of naive linear scaling (e.g. 54 * 0.75 = 40.5s)
 *    - Instant DOM recalculation without page reload
 *    - Persistence in IndexedDB and synchronization with SwimmerCard (lane, name, group ID preservation)
 * 2. In-Modal Lap Deletion & Deliberate Gap Preservation
 *    - 5 recorded laps [1, 2, 3, 4, 5]
 *    - Deleting Lap 3 leaves [1, 2, 4, 5] with original lapNumber intact (NO re-indexing to 1..4)
 *    - Deleting latest lap (Lap 5) rolls back timerState.lastLapCumulativeMs to Lap 4's cumulative duration
 *    - Deleting all laps cleanly transitions to Spanish empty state ("Sin pases registrados aún.") without exceptions
 * 3. Adversarial Edge Cases & State Invariants
 *    - Sequential rollback of lastLapCumulativeMs on reverse deletion
 *    - Correct split duration calculation for new laps recorded after latest-lap deletion
 *    - Group ID preservation across modal mutations
 *    - Empty/invalid baseline resilience
 */

import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

// ─────────────────────────────────────────────────────────────
// DOM Mock Environment
// ─────────────────────────────────────────────────────────────

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

    // Parse data-* attributes
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

// ─────────────────────────────────────────────────────────────
// Module Imports
// ─────────────────────────────────────────────────────────────

import { calculateTrainingZones } from '../js/analytics/zones.js';
import { metricsModal } from '../js/ui/metrics-modal.js';
import { modalManager } from '../js/ui/modal.js';
import { SwimmerCard } from '../js/ui/swimmer-card.js';
import { repository } from '../js/storage/repository.js';
import { timerEngine, TIMER_STATES } from '../js/timing/timer-engine.js';

// Setup Mock DOM Registry
const domElements = new Map();
function register(id, el) {
  el.id = id;
  domElements.set(id, el);
  return el;
}

function setupGlobalDOM() {
  domElements.clear();

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

  // Reset module references
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
}

// ─────────────────────────────────────────────────────────────
// Test Runner Engine
// ─────────────────────────────────────────────────────────────

let totalAssertions = 0;
let passedChallenges = 0;
let failedChallenges = 0;

function logPass(msg) {
  console.log(`  ✔ PASS: ${msg}`);
}

function logFail(msg, err) {
  console.error(`  ❌ FAIL: ${msg}`);
  if (err) console.error(err);
}

// ─────────────────────────────────────────────────────────────
// CHALLENGE 1: In-Modal Profile Editing & Reciprocal Training Zones
// ─────────────────────────────────────────────────────────────

async function challenge1_reciprocalZonesAndProfileEdit() {
  console.log('\n======================================================================');
  console.log('CHALLENGE 1: In-Modal Profile Editing & Reciprocal Training Zones');
  console.log('======================================================================');

  await repository.init();
  await repository.clearAll();
  await timerEngine.init(repository);
  setupGlobalDOM();

  // Test 1.1: Pure Mathematical Verification of Reciprocal Velocity Formula (54.0s baseline)
  console.log('[Step 1.1] Mathematical verification of reciprocal velocity formula for 54.0s baseline:');
  const baseline = 54.0;
  const zones = calculateTrainingZones(baseline);

  const expected75 = baseline / 0.75; // 72.0s
  const expected80 = baseline / 0.80; // 67.5s
  const expected90 = baseline / 0.90; // 60.0s
  const expected100 = baseline / 1.00; // 54.0s

  assert.equal(zones.zone75, expected75, `75% zone must equal ${expected75}, got ${zones.zone75}`);
  assert.equal(zones.zone80, expected80, `80% zone must equal ${expected80}, got ${zones.zone80}`);
  assert.equal(zones.zone90, expected90, `90% zone must equal ${expected90}, got ${zones.zone90}`);
  assert.equal(zones.zone100, expected100, `100% zone must equal ${expected100}, got ${zones.zone100}`);
  totalAssertions += 4;
  logPass(`Reciprocal calculations match exact formula: 75%=72.0s, 80%=67.5s, 90%=60.0s, 100%=54.0s`);

  // Adversarial check: Reject naive multiplication
  const naive75 = baseline * 0.75; // 40.5s
  assert.notEqual(zones.zone75, naive75, 'Naive multiplication (40.5s) must be rejected');
  assert.ok(zones.zone75 > baseline, 'Sub-maximal effort 75% MUST result in higher time than baseline');
  totalAssertions += 2;
  logPass('Adversarial check passed: Naive multiplication (40.5s) strictly rejected');

  // Test 1.2: Swimmer setup with initial baseline 60.0s
  console.log('[Step 1.2] Initialize swimmer with baseline 60.0s and render metrics modal:');
  const swimmer = {
    id: 'swimmer-challenger-1',
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

  // Verify initial modal DOM contains 60s baseline zones: 80.0s, 75.0s, 66.7s, 60.0s
  const bodyHTMLInitial = metricsModal.bodyEl.innerHTML;
  assert.ok(bodyHTMLInitial.includes('80.0s'), 'Initial modal must render 80.0s for 75%');
  assert.ok(bodyHTMLInitial.includes('75.0s'), 'Initial modal must render 75.0s for 80%');
  assert.ok(bodyHTMLInitial.includes('66.7s'), 'Initial modal must render 66.7s for 90%');
  assert.ok(bodyHTMLInitial.includes('60.0s'), 'Initial modal must render 60.0s for 100%');
  totalAssertions += 4;
  logPass('Initial modal DOM rendered 60.0s baseline reciprocal zones');

  // Test 1.3: Trigger in-modal profile editing via pencil button
  console.log('[Step 1.3] Trigger pencil button (✏️) and verify prefilled form:');
  const editBtn = domElements.get('metrics-modal-edit');
  assert.ok(editBtn, 'Pencil edit button must be present in DOM');
  await editBtn.dispatchEvent({ type: 'click' });

  const nameInput = domElements.get('swimmer-name-input');
  const laneInput = domElements.get('swimmer-lane-input');
  const baselineInput = domElements.get('swimmer-baseline-input');

  assert.equal(nameInput.value, 'Carlos Belmonte');
  assert.equal(laneInput.value, '2');
  assert.equal(baselineInput.value, '60');
  totalAssertions += 4;
  logPass('Swimmer form opened with prefilled values from swimmer profile');

  // Test 1.4: Update baseline to 54.0s, lane to 3, name to "Carlos Belmonte Jr."
  console.log('[Step 1.4] Update baseline to 54.0s, lane to 3, name to "Carlos Belmonte Jr.":');
  nameInput.value = 'Carlos Belmonte Jr.';
  laneInput.value = '3';
  baselineInput.value = '54.0';

  await modalManager._handleSubmit({ preventDefault() {} });

  // Test 1.5: Verify instant recalculation in modal DOM without reload
  console.log('[Step 1.5] Verify instant recalculation in modal DOM:');
  assert.equal(metricsModal.titleEl.textContent, 'Carlos Belmonte Jr.');
  assert.equal(metricsModal.laneEl.textContent, 'C3');

  const updatedBodyHTML = metricsModal.bodyEl.innerHTML;
  assert.ok(updatedBodyHTML.includes('72.0s'), 'Updated modal must render 72.0s for 75%');
  assert.ok(updatedBodyHTML.includes('67.5s'), 'Updated modal must render 67.5s for 80%');
  assert.ok(updatedBodyHTML.includes('60.0s'), 'Updated modal must render 60.0s for 90%');
  assert.ok(updatedBodyHTML.includes('54.0s'), 'Updated modal must render 54.0s for 100%');

  // Verify old values are completely removed
  assert.ok(!updatedBodyHTML.includes('80.0s'), 'Old 80.0s zone must be removed');
  totalAssertions += 7;
  logPass('Modal header and reciprocal training zones recalculated instantly to 72.0s, 67.5s, 60.0s, 54.0s');

  // Test 1.6: Verify persistence in IndexedDB
  console.log('[Step 1.6] Verify persistence in IndexedDB:');
  const persistedSwimmer = await repository.getSwimmer('swimmer-challenger-1');
  assert.equal(persistedSwimmer.name, 'Carlos Belmonte Jr.');
  assert.equal(persistedSwimmer.lane, 3);
  assert.equal(persistedSwimmer.baseline100mSeconds, 54.0);
  totalAssertions += 3;
  logPass('Swimmer updates persisted accurately in IndexedDB');

  // Test 1.7: SwimmerCard synchronization & Group Badge preservation
  console.log('[Step 1.7] Verify SwimmerCard synchronization and Group Heat ID preservation:');
  assert.ok(editedCardSwimmer, 'onEdit callback must have been fired for card synchronization');
  assert.equal(editedCardSwimmer.baseline100mSeconds, 54.0);

  // Create actual SwimmerCard instance and verify UI updates
  const card = new SwimmerCard({ swimmer: persistedSwimmer, groupId: 3 });
  card.render();
  card._updateGroupBadge();
  assert.equal(card.groupId, 3);

  // Trigger simulated edit on card
  card.swimmer = { ...card.swimmer, name: 'Carlos Belmonte III', lane: 5 };
  card.updateUI();

  assert.equal(card.groupId, 3, 'Group ID must be strictly preserved after swimmer profile update');
  assert.equal(card.element.querySelector('.card-lane-badge').textContent, 'C5');
  assert.equal(card.element.querySelector('.card-swimmer-name').textContent, 'Carlos Belmonte III');
  totalAssertions += 6;
  logPass('SwimmerCard lane badge and name updated while strictly preserving Group Heat ID (G3)');

  // Test 1.8: Edge Case - Swimmer without baseline
  console.log('[Step 1.8] Edge case: Swimmer with 0 or missing baseline:');
  const swimmerNoBaseline = { id: 's-no-base', name: 'Novice Swimmer', lane: 1, baseline100mSeconds: 0 };
  metricsModal.open(swimmerNoBaseline, []);
  assert.ok(metricsModal.bodyEl.innerHTML.includes('Sin tiempo base de 100m configurado.'));
  totalAssertions += 1;
  logPass('Swimmer without baseline handled gracefully with Spanish fallback message');

  passedChallenges++;
}

// ─────────────────────────────────────────────────────────────
// CHALLENGE 2: In-Modal Lap Deletion & Deliberate Gap Preservation
// ─────────────────────────────────────────────────────────────

async function challenge2_lapDeletionAndGapPreservation() {
  console.log('\n======================================================================');
  console.log('CHALLENGE 2: In-Modal Lap Deletion with Deliberate Gap Preservation');
  console.log('======================================================================');

  await repository.init();
  await repository.clearAll();
  await timerEngine.init(repository);
  setupGlobalDOM();

  const swimmerId = 'swimmer-challenger-laps';
  const swimmer = {
    id: swimmerId,
    name: 'Elena Ramos',
    lane: 4,
    baseline100mSeconds: 58.0
  };
  await repository.saveSwimmer(swimmer);

  // Record 5 laps:
  // Lap 1: split 30000ms, cum 30000ms
  // Lap 2: split 31000ms, cum 61000ms
  // Lap 3: split 32000ms, cum 93000ms
  // Lap 4: split 33000ms, cum 126000ms
  // Lap 5: split 34000ms, cum 160000ms
  const initialLaps = [
    { id: 'lap-ch-1', swimmerId, lapNumber: 1, splitDurationMs: 30000, cumulativeDurationMs: 30000, timestamp: 1000 },
    { id: 'lap-ch-2', swimmerId, lapNumber: 2, splitDurationMs: 31000, cumulativeDurationMs: 61000, timestamp: 2000 },
    { id: 'lap-ch-3', swimmerId, lapNumber: 3, splitDurationMs: 32000, cumulativeDurationMs: 93000, timestamp: 3000 },
    { id: 'lap-ch-4', swimmerId, lapNumber: 4, splitDurationMs: 33000, cumulativeDurationMs: 126000, timestamp: 4000 },
    { id: 'lap-ch-5', swimmerId, lapNumber: 5, splitDurationMs: 34000, cumulativeDurationMs: 160000, timestamp: 5000 }
  ];

  for (const lap of initialLaps) {
    await repository.saveLap(lap);
  }

  const initialTimerState = {
    swimmerId,
    state: TIMER_STATES.RUNNING,
    startTime: Date.now() - 170000,
    lastResumeTime: Date.now() - 170000,
    accumulatedMs: 0,
    currentLapIndex: 6,
    lastLapCumulativeMs: 160000
  };
  await repository.saveTimerState(initialTimerState);

  // SwimmerCard integration to track onDeleteLap callback
  let cardLaps = [...initialLaps];
  let cardTimerState = { ...initialTimerState };

  metricsModal.open(swimmer, initialLaps, {
    onDeleteLap: async (lapId, lapNumber) => {
      cardLaps = cardLaps.filter(l => (lapId ? l.id !== lapId : String(l.lapNumber) !== String(lapNumber)));
      const lastLap = cardLaps.length > 0 ? cardLaps[cardLaps.length - 1] : null;
      cardTimerState.lastLapCumulativeMs = lastLap ? lastLap.cumulativeDurationMs : 0;
    }
  });

  // Verify initial render: 5 delete buttons, all 5 laps listed
  const deleteBtns = metricsModal.bodyEl.querySelectorAll('.btn-lap-delete');
  assert.equal(deleteBtns.length, 5, 'Must render exactly 5 delete buttons');
  assert.equal(metricsModal.laps.length, 5, 'Modal must initially hold 5 laps');
  totalAssertions += 2;
  logPass('Initial state verified: 5 laps rendered with trash buttons');

  // ─────────────────────────────────────────────────────────
  // STEP 2A: Delete Lap 3 (Middle Lap) & Verify Gap Preservation
  // ─────────────────────────────────────────────────────────
  console.log('\n[Step 2A] Delete Lap 3 (Middle Lap) and verify deliberate gap preservation:');
  await metricsModal._handleDeleteLap('lap-ch-3', 3);

  // 1. Verify in-memory modal laps
  assert.equal(metricsModal.laps.length, 4, 'Modal must have 4 laps remaining');
  const modalLapNumbers = metricsModal.laps.map(l => l.lapNumber);
  assert.deepEqual(modalLapNumbers, [1, 2, 4, 5], 'Modal lap numbers must strictly be [1, 2, 4, 5]');
  totalAssertions += 2;
  logPass('In-memory laps array strictly preserves gap: [1, 2, 4, 5]');

  // 2. CRITICAL DELIBERATE GAP PRESERVATION: Ensure lap 4 was NOT renumbered to 3!
  const lap4 = metricsModal.laps.find(l => l.id === 'lap-ch-4');
  const lap5 = metricsModal.laps.find(l => l.id === 'lap-ch-5');
  assert.equal(lap4.lapNumber, 4, 'CRITICAL: Lap 4 must NOT be renumbered to 3');
  assert.equal(lap5.lapNumber, 5, 'CRITICAL: Lap 5 must NOT be renumbered to 4');
  totalAssertions += 2;
  logPass('CRITICAL GAP PRESERVATION: Lap 4 and Lap 5 retain original numbers without re-indexing');

  // 3. Verify in IndexedDB
  const idbLapsAfter3 = await repository.getLaps(swimmerId);
  assert.equal(idbLapsAfter3.length, 4, 'IndexedDB must hold exactly 4 laps');
  const idbLapNumbers = idbLapsAfter3.map(l => l.lapNumber);
  assert.deepEqual(idbLapNumbers, [1, 2, 4, 5], 'IndexedDB lap numbers must strictly be [1, 2, 4, 5]');
  assert.ok(!idbLapsAfter3.some(l => l.id === 'lap-ch-3'), 'Lap 3 must be deleted from IndexedDB');
  totalAssertions += 3;
  logPass('IndexedDB confirms Lap 3 deleted and remaining lap numbers are strictly [1, 2, 4, 5]');

  // 4. Verify DOM rendering
  const bodyHTMLAfter3 = metricsModal.bodyEl.innerHTML;
  assert.ok(bodyHTMLAfter3.includes('#1'), 'DOM must contain #1');
  assert.ok(bodyHTMLAfter3.includes('#2'), 'DOM must contain #2');
  assert.ok(bodyHTMLAfter3.includes('#4'), 'DOM must contain #4');
  assert.ok(bodyHTMLAfter3.includes('#5'), 'DOM must contain #5');
  assert.ok(!bodyHTMLAfter3.includes('#3'), 'DOM must NOT contain #3');
  totalAssertions += 5;
  logPass('Modal DOM table preserves visual gap: rows #1, #2, #4, #5 rendered, row #3 absent');

  // 5. Verify timerState.lastLapCumulativeMs is NOT affected because Lap 5 is still the latest lap
  const stateAfter3 = await repository.getTimerState(swimmerId);
  assert.equal(stateAfter3.lastLapCumulativeMs, 160000, 'lastLapCumulativeMs must remain 160000 when middle lap is deleted');
  assert.equal(cardTimerState.lastLapCumulativeMs, 160000);
  totalAssertions += 2;
  logPass('timerState.lastLapCumulativeMs unchanged (160000) because latest lap was not deleted');

  // ─────────────────────────────────────────────────────────
  // STEP 2B: Delete Lap 5 (Latest Lap) & Verify Rollback to Lap 4
  // ─────────────────────────────────────────────────────────
  console.log('\n[Step 2B] Delete Lap 5 (Latest Lap) and verify rollback of lastLapCumulativeMs:');
  await metricsModal._handleDeleteLap('lap-ch-5', 5);

  // 1. Verify in-memory modal laps
  assert.equal(metricsModal.laps.length, 3, 'Modal must have 3 laps remaining');
  const modalLapNumbersAfter5 = metricsModal.laps.map(l => l.lapNumber);
  assert.deepEqual(modalLapNumbersAfter5, [1, 2, 4], 'Modal lap numbers must strictly be [1, 2, 4]');
  totalAssertions += 2;
  logPass('In-memory laps array updated to [1, 2, 4]');

  // 2. Verify in IndexedDB
  const idbLapsAfter5 = await repository.getLaps(swimmerId);
  assert.equal(idbLapsAfter5.length, 3, 'IndexedDB must hold exactly 3 laps');
  assert.deepEqual(idbLapsAfter5.map(l => l.lapNumber), [1, 2, 4]);
  assert.ok(!idbLapsAfter5.some(l => l.id === 'lap-ch-5'), 'Lap 5 must be deleted from IndexedDB');
  totalAssertions += 3;
  logPass('IndexedDB confirms Lap 5 deleted, retaining [1, 2, 4]');

  // 3. CRITICAL ROLLBACK: timerState.lastLapCumulativeMs MUST roll back to Lap 4 cumulative duration (126000 ms)
  const stateAfter5 = await repository.getTimerState(swimmerId);
  assert.equal(stateAfter5.lastLapCumulativeMs, 126000, 'CRITICAL ROLLBACK: lastLapCumulativeMs in repository must roll back to Lap 4 (126000)');
  assert.equal(cardTimerState.lastLapCumulativeMs, 126000, 'CRITICAL ROLLBACK: SwimmerCard timerState must roll back to Lap 4 (126000)');
  totalAssertions += 2;
  logPass('CRITICAL ROLLBACK VERIFIED: lastLapCumulativeMs successfully rolled back to 126000ms');

  // 4. Verify recording a subsequent lap behaves accurately with rolled-back cumulative duration
  console.log('[Step 2B.sub] Verify new lap calculation after rollback:');
  // Simulate timer continuing to 175000ms elapsed
  const now = Date.now();
  stateAfter5.startTime = now - 175000;
  stateAfter5.lastResumeTime = now - 175000;
  stateAfter5.accumulatedMs = 0;
  await repository.saveTimerState(stateAfter5);

  const { lap: newLap, state: newState } = await timerEngine.recordLap(swimmerId);
  assert.equal(newState.lastLapCumulativeMs, newLap.cumulativeDurationMs);
  // Split duration must be currentCumulativeMs - 126000
  const expectedSplit = newLap.cumulativeDurationMs - 126000;
  assert.equal(newLap.splitDurationMs, expectedSplit, `Split duration must equal ${expectedSplit}, got ${newLap.splitDurationMs}`);
  assert.ok(newLap.splitDurationMs > 0, 'Split duration must be positive');
  assert.equal(newLap.lapNumber, 6, 'Lap index increments forward monotonically (Lap 6)');
  totalAssertions += 4;
  logPass(`Subsequent lap recording accurately computes split (${newLap.splitDurationMs}ms) against rolled back base (126000ms)`);

  // Remove the newly recorded lap for Step 2C
  await repository.deleteLap(newLap.id);

  // Restore state to [1, 2, 4] with lastLapCumulativeMs = 126000
  stateAfter5.lastLapCumulativeMs = 126000;
  await repository.saveTimerState(stateAfter5);

  // ─────────────────────────────────────────────────────────
  // STEP 2C: Delete All Remaining Laps & Verify Empty State
  // ─────────────────────────────────────────────────────────
  console.log('\n[Step 2C] Delete all remaining laps ([1, 2, 4]) and verify clean Spanish empty state:');

  // Delete Lap 1
  await metricsModal._handleDeleteLap('lap-ch-1', 1);
  assert.equal(metricsModal.laps.length, 2);
  assert.deepEqual(metricsModal.laps.map(l => l.lapNumber), [2, 4]);

  // Delete Lap 2
  await metricsModal._handleDeleteLap('lap-ch-2', 2);
  assert.equal(metricsModal.laps.length, 1);
  assert.deepEqual(metricsModal.laps.map(l => l.lapNumber), [4]);

  // Delete Lap 4 (the final remaining lap)
  await metricsModal._handleDeleteLap('lap-ch-4', 4);
  assert.equal(metricsModal.laps.length, 0, 'Modal must have 0 laps remaining');
  totalAssertions += 4;
  logPass('All laps progressively deleted down to 0 laps');

  // 1. Verify IndexedDB is completely empty for this swimmer
  const idbLapsFinal = await repository.getLaps(swimmerId);
  assert.equal(idbLapsFinal.length, 0, 'IndexedDB must contain 0 laps');
  totalAssertions += 1;
  logPass('IndexedDB contains 0 laps');

  // 2. Verify timerState.lastLapCumulativeMs rolled back to 0
  const finalTimerState = await repository.getTimerState(swimmerId);
  assert.equal(finalTimerState.lastLapCumulativeMs, 0, 'lastLapCumulativeMs must roll back to 0 when no laps remain');
  assert.equal(cardTimerState.lastLapCumulativeMs, 0, 'Card lastLapCumulativeMs must roll back to 0');
  totalAssertions += 2;
  logPass('timerState.lastLapCumulativeMs successfully rolled back to 0ms');

  // 3. Verify clean Spanish empty state rendering
  const emptyBodyHTML = metricsModal.bodyEl.innerHTML;
  assert.ok(emptyBodyHTML.includes('Sin pases registrados aún.'), 'DOM must render Spanish empty state "Sin pases registrados aún."');
  assert.ok(!emptyBodyHTML.includes('<table class="laps-table">'), 'Laps table must not be rendered in empty state');
  assert.ok(!emptyBodyHTML.includes('quick-metrics'), 'Quick metrics must not be rendered when 0 laps');
  totalAssertions += 3;
  logPass('Clean Spanish empty state rendered without unhandled errors');

  passedChallenges++;
}

// ─────────────────────────────────────────────────────────────
// CHALLENGE 3: Adversarial Edge Cases & Stress Scenarios
// ─────────────────────────────────────────────────────────────

async function challenge3_adversarialStressScenarios() {
  console.log('\n======================================================================');
  console.log('CHALLENGE 3: Adversarial Stress Testing & Edge Cases');
  console.log('======================================================================');

  await repository.init();
  await repository.clearAll();
  await timerEngine.init(repository);
  setupGlobalDOM();

  // Test 3.1: Reverse Deletion Rollback Cascade (5 -> 4 -> 3 -> 2 -> 1)
  console.log('[Step 3.1] Reverse Deletion Rollback Cascade:');
  const swimmerId = 'swimmer-ch-stress';
  const swimmer = { id: swimmerId, name: 'Stress Swimmer', lane: 6, baseline100mSeconds: 50.0 };
  await repository.saveSwimmer(swimmer);

  const cumTimes = [25000, 51000, 78000, 106000, 135000];
  const laps = cumTimes.map((cum, idx) => ({
    id: `lap-rev-${idx + 1}`,
    swimmerId,
    lapNumber: idx + 1,
    splitDurationMs: idx === 0 ? cum : cum - cumTimes[idx - 1],
    cumulativeDurationMs: cum
  }));

  for (const l of laps) await repository.saveLap(l);
  await repository.saveTimerState({
    swimmerId,
    state: TIMER_STATES.PAUSED,
    accumulatedMs: 140000,
    currentLapIndex: 6,
    lastLapCumulativeMs: 135000
  });

  metricsModal.open(swimmer, laps);

  // Progressively delete from latest to first
  const expectedRollbacks = [106000, 78000, 51000, 25000, 0];
  for (let i = 5; i >= 1; i--) {
    await metricsModal._handleDeleteLap(`lap-rev-${i}`, i);
    const expected = expectedRollbacks[5 - i];
    const curState = await repository.getTimerState(swimmerId);
    assert.equal(curState.lastLapCumulativeMs, expected, `Deleting Lap ${i} must roll back lastLapCumulativeMs to ${expected}`);
    totalAssertions++;
  }
  logPass('Reverse deletion cascade correctly rolled back cumulative duration step by step: 106s -> 78s -> 51s -> 25s -> 0s');

  // Test 3.2: SwimmerCard monotonic lap count formatting when laps are deleted
  console.log('[Step 3.2] SwimmerCard monotonic lap count display:');
  const testCard = new SwimmerCard({ swimmer });
  testCard.render();
  testCard.timerState = { currentLapIndex: 5, state: TIMER_STATES.RUNNING };
  testCard.laps = [
    { lapNumber: 1, splitDurationMs: 25000 },
    { lapNumber: 2, splitDurationMs: 26000 },
    { lapNumber: 4, splitDurationMs: 27000 } // gap at 3
  ];
  testCard._updateLapCount();
  assert.equal(testCard._lapCountEl.textContent, 'V5', 'Next lap display should be V5 (Math.max(5, 4+1))');
  totalAssertions++;
  logPass('SwimmerCard lap badge correctly displays V5 preserving forward monotonicity');

  // Test 3.3: Delete non-existent lap gracefully handles error
  console.log('[Step 3.3] Graceful handling of non-existent lap deletion:');
  // Attempt to delete invalid lap ID
  await metricsModal._handleDeleteLap('non-existent-lap-id', 999);
  // Should not crash and laps length remains 0
  assert.equal(metricsModal.laps.length, 0);
  totalAssertions++;
  logPass('Non-existent lap deletion handled gracefully without unhandled rejection');

  // Test 3.4: Reciprocal formula stress test across diverse baselines
  console.log('[Step 3.4] Reciprocal formula stress test across extreme baselines:');
  const baselinesToTest = [
    { base: 45.0, exp75: 60.0, exp80: 56.25, exp90: 50.0 },
    { base: 60.0, exp75: 80.0, exp80: 75.0, exp90: 66.66666666666667 },
    { base: 72.5, exp75: 96.66666666666667, exp80: 90.625, exp90: 80.55555555555556 },
    { base: 120.0, exp75: 160.0, exp80: 150.0, exp90: 133.33333333333334 }
  ];

  for (const b of baselinesToTest) {
    const z = calculateTrainingZones(b.base);
    assert.ok(Math.abs(z.zone75 - b.exp75) < 1e-9);
    assert.ok(Math.abs(z.zone80 - b.exp80) < 1e-9);
    assert.ok(Math.abs(z.zone90 - b.exp90) < 1e-9);
    assert.equal(z.zone100, b.base);
    totalAssertions += 4;
  }
  logPass('Reciprocal formula mathematically robust across competitive and master swimming baselines (45s to 120s)');

  passedChallenges++;
}

// ─────────────────────────────────────────────────────────────
// MAIN EXECUTION
// ─────────────────────────────────────────────────────────────

async function runAllChallenges() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  SwimCoach Tracker - Milestone 2 Empirical Challenge Verification    ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  try {
    await challenge1_reciprocalZonesAndProfileEdit();
    await challenge2_lapDeletionAndGapPreservation();
    await challenge3_adversarialStressScenarios();

    console.log('\n======================================================================');
    console.log('                   CHALLENGE VERIFICATION SUMMARY                     ');
    console.log('======================================================================');
    console.log(`Passed Challenges: ${passedChallenges} / 3`);
    console.log(`Total Invariant Assertions Verified: ${totalAssertions}`);
    console.log('----------------------------------------------------------------------');
    console.log('Verdict: APPROVE');
    console.log('All empirical criteria for Milestone 2 satisfied with 100% precision.');
    console.log('======================================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ EMPIRICAL CHALLENGE SUITE FAILED:');
    console.error(err);
    console.log('\nVerdict: REQUEST_CHANGES');
    process.exit(1);
  }
}

runAllChallenges();
