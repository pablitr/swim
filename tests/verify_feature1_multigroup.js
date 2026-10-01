#!/usr/bin/env node

/**
 * Empirical Verification & Stress Test Suite: Feature 1 (Multi-Timer Launch / Multi-Group Heats)
 *
 * Requirements Verified:
 * 1. groupId cycling: 0 -> 1 -> 2 -> 3 -> 4 -> 0 when IDLE or STOPPED.
 * 2. Visual state updates: group badge display, color class, emoji text, dataset.groupId.
 * 3. Event safety & gating: Clicking header while RUNNING or PAUSED strictly preserves groupId.
 * 4. Event bubbling: Clicking header children (e.g. swimmer name) cycles group; clicking .btn-card-lupa stops propagation.
 * 5. Concurrent Group Launch: Starting a grouped card fires onGroupStart and launches all matching IDLE/STOPPED cards concurrently.
 * 6. Group isolation: Cards with groupId 0, cards in other groups, and cards in the same group that are RUNNING or PAUSED remain untouched.
 * 7. Ungrouped launch: Starting a card with groupId 0 does not fire onGroupStart and launches only itself.
 * 8. Re-entrancy & infinite recursion prevention (isGroupTriggered flag).
 * 9. Rapid double-click / burst-tap stress resistance.
 */

import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

// Realistic Mock DOM with Tree Hierarchy, Event Bubbling and stopPropagation
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
      add: (...classes) => {
        const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
        for (const cls of classes) set.add(cls);
        this.className = Array.from(set).join(' ');
      },
      remove: (...classes) => {
        const set = new Set((this.className || '').split(/\s+/).filter(Boolean));
        for (const cls of classes) set.delete(cls);
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
    this.children = [];
    parseHtmlToMockElements(this._innerHTML, this);
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
    let stopped = false;
    const evt = typeof event === 'string' ? { type: event } : { ...event };
    evt.target = this;
    evt.currentTarget = this;
    evt.stopPropagation = () => { stopped = true; };
    evt.preventDefault = () => { evt.defaultPrevented = true; };

    let cur = this;
    while (cur && !stopped) {
      evt.currentTarget = cur;
      const fns = cur._listeners[evt.type] || [];
      for (const fn of fns) {
        fn(evt);
        if (stopped) break;
      }
      if (evt.bubbles === false) break;
      cur = cur.parentNode;
    }
    return !evt.defaultPrevented;
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

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr', 'path', 'line', 'polygon', 'polyline', 'rect', 'circle']);

function parseHtmlToMockElements(html, rootParent) {
  // Strip comments
  const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '');
  const tagRegex = /<\/?([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
  const stack = [rootParent];
  let lastIndex = 0;
  let match;

  while ((match = tagRegex.exec(cleanHtml)) !== null) {
    const isClosing = match[0].startsWith('</');
    const tagName = match[1].toLowerCase();
    const attrs = match[2];
    const isSelfClosing = match[3] === '/' || VOID_ELEMENTS.has(tagName);

    if (isClosing) {
      // Find matching tag in stack
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName.toLowerCase() === tagName) {
          stack.length = i; // Pop back to parent
          break;
        }
      }
    } else {
      const parent = stack[stack.length - 1];
      const el = new MockElement(tagName);
      el.parentNode = parent;

      const idMatch = attrs.match(/id=["']([^"']+)["']/);
      if (idMatch) el.id = idMatch[1];
      const classMatch = attrs.match(/class=["']([^"']+)["']/);
      if (classMatch) el.className = classMatch[1];
      if (attrs.includes('disabled')) el.disabled = true;

      parent.children.push(el);

      if (!isSelfClosing) {
        stack.push(el);
      }
    }
  }

  return rootParent.children;
}

// Global setup
globalThis.document = {
  readyState: 'complete',
  createElement: (tag) => new MockElement(tag),
  getElementById: (id) => null,
  addEventListener: () => {},
  removeEventListener: () => {}
};
globalThis.confirm = () => true;

// Import application modules
const { SwimmerCard } = await import('../js/ui/swimmer-card.js');
const { timerEngine, TIMER_STATES } = await import('../js/timing/timer-engine.js');
const { repository } = await import('../js/storage/repository.js');
const { app } = await import('../js/app.js');
const AppCoordinator = app.constructor;

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assertCheck(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failedTests++;
    throw err;
  }
}

async function asyncAssertCheck(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}: ${err.message}`);
    failedTests++;
    throw err;
  }
}

async function runFeature1EmpiricalVerification() {
  console.log('======================================================================');
  console.log('  CHALLENGER 1: Empirical Verification of Feature 1 (Multi-Group Heats)');
  console.log('======================================================================\n');

  await repository.init();
  await repository.clearAll();

  // ====================================================================
  // TEST SUITE 1: Cycling groupId 0 -> 1 -> 2 -> 3 -> 4 -> 0
  // ====================================================================
  console.log('--- TEST SUITE 1: Cycling groupId (IDLE & STOPPED) ---');

  const swimmer1 = { id: 'swimmer-empirical-1', name: 'Laura Martinez', lane: 1, baseline100mSeconds: 58.5 };
  await repository.saveSwimmer(swimmer1);

  const card1 = new SwimmerCard({ swimmer: swimmer1 });
  card1.render();

  assertCheck('1.1 Initial state: groupId is 0, badge hidden, dataset unset', () => {
    assert.strictEqual(card1.groupId, 0);
    assert.strictEqual(card1._groupBadgeEl.style.display, 'none');
    assert.strictEqual(card1._groupBadgeEl.textContent, '');
    assert.strictEqual(card1.element.dataset.groupId, undefined);
  });

  const expectedProgression = [
    { click: 1, expectedId: 1, expectedText: '🔴 G1', expectedClass: 'card-group-badge group-1' },
    { click: 2, expectedId: 2, expectedText: '🔵 G2', expectedClass: 'card-group-badge group-2' },
    { click: 3, expectedId: 3, expectedText: '🟡 G3', expectedClass: 'card-group-badge group-3' },
    { click: 4, expectedId: 4, expectedText: '🟢 G4', expectedClass: 'card-group-badge group-4' },
    { click: 5, expectedId: 0, expectedText: '', expectedClass: 'card-group-badge' }
  ];

  for (const step of expectedProgression) {
    assertCheck(`1.2 IDLE Click #${step.click}: cycles to groupId ${step.expectedId}`, () => {
      card1._headerEl.dispatchEvent({ type: 'click' });
      assert.strictEqual(card1.groupId, step.expectedId);
      if (step.expectedId > 0) {
        assert.strictEqual(card1._groupBadgeEl.style.display, 'inline-flex');
        assert.strictEqual(card1._groupBadgeEl.textContent, step.expectedText);
        assert.strictEqual(card1._groupBadgeEl.className, step.expectedClass);
        assert.strictEqual(card1.element.dataset.groupId, String(step.expectedId));
      } else {
        assert.strictEqual(card1._groupBadgeEl.style.display, 'none');
        assert.strictEqual(card1._groupBadgeEl.textContent, '');
        assert.strictEqual(card1.element.dataset.groupId, undefined);
      }
    });
  }

  assertCheck('1.3 Wraps from 0 back to 1 on subsequent click', () => {
    card1._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card1.groupId, 1);
    assert.strictEqual(card1._groupBadgeEl.textContent, '🔴 G1');
  });

  assertCheck('1.4 STOPPED State allows cycling: 1 -> 2 -> 3 -> 4 -> 0', () => {
    card1.timerState.state = TIMER_STATES.STOPPED;

    card1._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card1.groupId, 2, 'STOPPED allows 1 -> 2');
    assert.strictEqual(card1._groupBadgeEl.textContent, '🔵 G2');

    card1._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card1.groupId, 3, 'STOPPED allows 2 -> 3');

    card1._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card1.groupId, 4, 'STOPPED allows 3 -> 4');

    card1._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card1.groupId, 0, 'STOPPED allows 4 -> 0');

    // Cycle back to 3 for subsequent tests
    card1._headerEl.dispatchEvent({ type: 'click' }); // -> 1
    card1._headerEl.dispatchEvent({ type: 'click' }); // -> 2
    card1._headerEl.dispatchEvent({ type: 'click' }); // -> 3
    assert.strictEqual(card1.groupId, 3);
  });

  // ====================================================================
  // TEST SUITE 2: Safety Gating (RUNNING & PAUSED Lockout)
  // ====================================================================
  console.log('\n--- TEST SUITE 2: Safety Gating (RUNNING & PAUSED) ---');

  assertCheck('2.1 RUNNING Gating: 10 repeated header clicks do NOT modify groupId', () => {
    card1.timerState.state = TIMER_STATES.RUNNING;
    assert.strictEqual(card1.groupId, 3);

    for (let i = 1; i <= 10; i++) {
      card1._headerEl.dispatchEvent({ type: 'click' });
      assert.strictEqual(card1.groupId, 3, `Attempt ${i}: groupId must remain 3`);
      assert.strictEqual(card1._groupBadgeEl.textContent, '🟡 G3');
    }
  });

  assertCheck('2.2 PAUSED Gating: 10 repeated header clicks do NOT modify groupId', () => {
    card1.timerState.state = TIMER_STATES.PAUSED;
    assert.strictEqual(card1.groupId, 3);

    for (let i = 1; i <= 10; i++) {
      card1._headerEl.dispatchEvent({ type: 'click' });
      assert.strictEqual(card1.groupId, 3, `Attempt ${i}: groupId must remain 3`);
      assert.strictEqual(card1._groupBadgeEl.textContent, '🟡 G3');
    }
  });

  assertCheck('2.3 Event Bubbling: Clicking swimmer name bubbles to header and cycles when IDLE', () => {
    card1.timerState.state = TIMER_STATES.IDLE;
    const nameEl = card1._headerEl.querySelector('.card-swimmer-name');
    assert.ok(nameEl, 'Swimmer name element must exist in header');

    nameEl.dispatchEvent({ type: 'click', bubbles: true });
    assert.strictEqual(card1.groupId, 4, 'Click on name element must cycle groupId from 3 to 4');
  });

  assertCheck('2.4 Event Propagation: Clicking .btn-card-lupa stops propagation and does NOT cycle group', () => {
    assert.ok(card1._btnLupaEl, 'Lupa button must exist');
    assert.strictEqual(card1.groupId, 4);

    // Clicking lupa triggers stopPropagation
    card1._btnLupaEl.dispatchEvent({ type: 'click', bubbles: true });
    assert.strictEqual(card1.groupId, 4, 'Clicking lupa must NOT cycle group');
  });

  assertCheck('2.5 Complete State Lifecycle: Cycling permitted only in valid states', () => {
    // Current: IDLE, groupId=4
    card1.timerState.state = TIMER_STATES.IDLE;
    card1._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card1.groupId, 0, 'IDLE allowed 4 -> 0');

    // RUNNING
    card1.timerState.state = TIMER_STATES.RUNNING;
    card1._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card1.groupId, 0, 'RUNNING blocked');

    // PAUSED
    card1.timerState.state = TIMER_STATES.PAUSED;
    card1._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card1.groupId, 0, 'PAUSED blocked');

    // STOPPED
    card1.timerState.state = TIMER_STATES.STOPPED;
    card1._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card1.groupId, 1, 'STOPPED allowed 0 -> 1');

    // Back to IDLE
    card1.timerState.state = TIMER_STATES.IDLE;
    card1._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card1.groupId, 2, 'IDLE allowed 1 -> 2');
  });

  // ====================================================================
  // TEST SUITE 3: onGroupStart & Concurrent Group Launch
  // ====================================================================
  console.log('\n--- TEST SUITE 3: onGroupStart & Concurrent Group Launch ---');

  await asyncAssertCheck('3.1 Direct handleStart() with groupId > 0 triggers onGroupStart callback', async () => {
    let firedGroupId = null;
    let firedSwimmerId = null;

    const testCard = new SwimmerCard({
      swimmer: { id: 'test-callback-swimmer', name: 'Test', lane: 2 },
      groupId: 2,
      callbacks: {
        onGroupStart: async (gId, sId) => {
          firedGroupId = gId;
          firedSwimmerId = sId;
        }
      }
    });
    testCard.render();

    await testCard.handleStart();
    assert.strictEqual(firedGroupId, 2, 'onGroupStart received groupId 2');
    assert.strictEqual(firedSwimmerId, 'test-callback-swimmer', 'onGroupStart received swimmerId');
    assert.strictEqual(testCard.timerState.state, TIMER_STATES.IDLE, 'Card itself waits for coordinator dispatch');
  });

  await asyncAssertCheck('3.2 Direct handleStart() with groupId === 0 starts immediately without callback', async () => {
    let callbackFired = false;
    const ungroupedSwimmer = { id: 'ungrouped-swimmer-test', name: 'Solo', lane: 3 };
    await repository.saveSwimmer(ungroupedSwimmer);

    const soloCard = new SwimmerCard({
      swimmer: ungroupedSwimmer,
      groupId: 0,
      callbacks: {
        onGroupStart: async () => { callbackFired = true; }
      }
    });
    soloCard.render();

    await soloCard.handleStart();
    assert.strictEqual(callbackFired, false, 'onGroupStart must NOT fire when groupId === 0');
    assert.strictEqual(soloCard.timerState.state, TIMER_STATES.RUNNING, 'groupId 0 card starts immediately');
  });

  await asyncAssertCheck('3.3 Full Fleet Concurrent Launch Coordination via AppCoordinator', async () => {
    // Setup a 6-swimmer fleet across different groups and initial states
    const swimmers = [
      { id: 'fleet-s1', name: 'Swimmer 1 (G1, IDLE)', lane: 1 },
      { id: 'fleet-s2', name: 'Swimmer 2 (G1, IDLE)', lane: 2 },
      { id: 'fleet-s3', name: 'Swimmer 3 (G1, STOPPED)', lane: 3 },
      { id: 'fleet-s4', name: 'Swimmer 4 (G2, IDLE)', lane: 4 },
      { id: 'fleet-s5', name: 'Swimmer 5 (G0, IDLE)', lane: 5 },
      { id: 'fleet-s6', name: 'Swimmer 6 (G1, PAUSED)', lane: 6 }
    ];

    for (const s of swimmers) {
      await repository.saveSwimmer(s);
    }

    const coordinator = new AppCoordinator();
    coordinator.cards = new Map();

    const cardFleet = [
      new SwimmerCard({ swimmer: swimmers[0], groupId: 1, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } }),
      new SwimmerCard({ swimmer: swimmers[1], groupId: 1, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } }),
      new SwimmerCard({ swimmer: swimmers[2], groupId: 1, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } }),
      new SwimmerCard({ swimmer: swimmers[3], groupId: 2, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } }),
      new SwimmerCard({ swimmer: swimmers[4], groupId: 0, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } }),
      new SwimmerCard({ swimmer: swimmers[5], groupId: 1, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } })
    ];

    // Render all
    cardFleet.forEach(c => c.render());

    // Configure states
    cardFleet[0].timerState.state = TIMER_STATES.IDLE;
    cardFleet[1].timerState.state = TIMER_STATES.IDLE;
    cardFleet[2].timerState.state = TIMER_STATES.STOPPED;
    cardFleet[3].timerState.state = TIMER_STATES.IDLE;
    cardFleet[4].timerState.state = TIMER_STATES.IDLE;

    // Card 6 is PAUSED with 25000ms accumulated
    cardFleet[5].timerState.state = TIMER_STATES.PAUSED;
    cardFleet[5].timerState.accumulatedMs = 25000;
    await repository.saveTimerState(cardFleet[5].timerState);

    cardFleet.forEach(c => coordinator.cards.set(c.swimmer.id, c));

    // Coach clicks Start on Swimmer 1 (Group 1)
    await cardFleet[0].handleStart();

    // 1. Swimmer 1, 2, 3 (Group 1, eligible) MUST be RUNNING
    assert.strictEqual(cardFleet[0].timerState.state, TIMER_STATES.RUNNING, 'Card 1 (G1) must be RUNNING');
    assert.strictEqual(cardFleet[1].timerState.state, TIMER_STATES.RUNNING, 'Card 2 (G1) must be RUNNING');
    assert.strictEqual(cardFleet[2].timerState.state, TIMER_STATES.RUNNING, 'Card 3 (G1, was STOPPED) must be RUNNING');

    // 2. Timestamps must be synchronized (started in same microtask turn via Promise.all)
    const t1 = cardFleet[0].timerState.startTime;
    const t2 = cardFleet[1].timerState.startTime;
    const t3 = cardFleet[2].timerState.startTime;
    assert.ok(Math.abs(t1 - t2) <= 15, `t1 (${t1}) and t2 (${t2}) must be synchronized <= 15ms`);
    assert.ok(Math.abs(t2 - t3) <= 15, `t2 (${t2}) and t3 (${t3}) must be synchronized <= 15ms`);

    // 3. ISOLATION: Swimmer 4 (Group 2) MUST remain IDLE
    assert.strictEqual(cardFleet[3].timerState.state, TIMER_STATES.IDLE, 'Card 4 (Group 2) must remain untouched IDLE');
    assert.strictEqual(cardFleet[3].timerState.startTime, null, 'Card 4 startTime must be null');

    // 4. ISOLATION: Swimmer 5 (Group 0) MUST remain IDLE
    assert.strictEqual(cardFleet[4].timerState.state, TIMER_STATES.IDLE, 'Card 5 (Group 0) must remain untouched IDLE');

    // 5. SAFETY: Swimmer 6 (Group 1, but PAUSED) MUST remain PAUSED and preserved
    assert.strictEqual(cardFleet[5].timerState.state, TIMER_STATES.PAUSED, 'Card 6 (Group 1, PAUSED) must remain PAUSED');
    assert.strictEqual(cardFleet[5].timerState.accumulatedMs, 25000, 'Card 6 accumulatedMs must remain exactly 25000ms');
  });

  await asyncAssertCheck('3.4 Sequential Launch: Launching Group 2 does NOT disturb running Group 1 or Group 0', async () => {
    const coordinator = new AppCoordinator();
    coordinator.cards = new Map();

    const sA = { id: 'seq-a', name: 'Swimmer A (G1, running)', lane: 1 };
    const sB = { id: 'seq-b', name: 'Swimmer B (G2, idle)', lane: 2 };
    const sC = { id: 'seq-c', name: 'Swimmer C (G0, idle)', lane: 3 };

    await repository.saveSwimmer(sA);
    await repository.saveSwimmer(sB);
    await repository.saveSwimmer(sC);

    const cardA = new SwimmerCard({ swimmer: sA, groupId: 1, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } });
    const cardB = new SwimmerCard({ swimmer: sB, groupId: 2, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } });
    const cardC = new SwimmerCard({ swimmer: sC, groupId: 0, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } });

    cardA.render();
    cardB.render();
    cardC.render();

    coordinator.cards.set(sA.id, cardA);
    coordinator.cards.set(sB.id, cardB);
    coordinator.cards.set(sC.id, cardC);

    // Launch Group 1
    await cardA.handleStart();
    assert.strictEqual(cardA.timerState.state, TIMER_STATES.RUNNING);
    const startA = cardA.timerState.startTime;

    // Small delay to simulate realistic coaching delay between heat starts
    await new Promise(r => setTimeout(r, 50));

    // Launch Group 2
    await cardB.handleStart();
    assert.strictEqual(cardB.timerState.state, TIMER_STATES.RUNNING);
    const startB = cardB.timerState.startTime;

    // Card A is still running and its original startTime was not reset
    assert.strictEqual(cardA.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(cardA.timerState.startTime, startA, 'Card A startTime must not be altered');
    assert.ok(startB > startA, 'Group 2 must have started after Group 1');

    // Card C is still untouched
    assert.strictEqual(cardC.timerState.state, TIMER_STATES.IDLE);

    // Launch Group 0
    await cardC.handleStart();
    assert.strictEqual(cardC.timerState.state, TIMER_STATES.RUNNING);
  });

  // ====================================================================
  // TEST SUITE 4: Adversarial Stress & Edge Cases
  // ====================================================================
  console.log('\n--- TEST SUITE 4: Adversarial Stress & Edge Cases ---');

  await asyncAssertCheck('4.1 Re-entrancy defense: isGroupTriggered flag prevents recursive calls', async () => {
    let onGroupStartCalls = 0;
    const swimmer = { id: 'reentrancy-swimmer', name: 'Stress Test', lane: 1 };
    await repository.saveSwimmer(swimmer);

    const card = new SwimmerCard({
      swimmer,
      groupId: 3,
      callbacks: {
        onGroupStart: async (groupId, swimmerId) => {
          onGroupStartCalls++;
          // When coordinator launches, it passes isGroupTriggered: true
          await card.handleStart({ isGroupTriggered: true });
        }
      }
    });
    card.render();

    await card.handleStart();
    assert.strictEqual(onGroupStartCalls, 1, 'onGroupStart must be called exactly once');
    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
  });

  await asyncAssertCheck('4.2 Rapid double click / burst start does not corrupt state or throw', async () => {
    const swimmer = { id: 'burst-swimmer', name: 'Burst Tap', lane: 1 };
    await repository.saveSwimmer(swimmer);

    const coordinator = new AppCoordinator();
    coordinator.cards = new Map();

    const card = new SwimmerCard({
      swimmer,
      groupId: 1,
      callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) }
    });
    card.render();
    coordinator.cards.set(swimmer.id, card);

    // Fire 5 concurrent start attempts simultaneously
    await Promise.all([
      card.handleStart(),
      card.handleStart(),
      card.handleStart(),
      card.handleStart(),
      card.handleStart()
    ]);

    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
  });

  await asyncAssertCheck('4.3 Empty group / non-existent group gracefully no-ops', async () => {
    const coordinator = new AppCoordinator();
    coordinator.cards = new Map();

    // Calling handleGroupStart with groupId 99 or 0 must resolve without exception
    await coordinator.handleGroupStart(0);
    await coordinator.handleGroupStart(99);
    assert.ok(true, 'Non-existent groupId handled gracefully');
  });

  await asyncAssertCheck('4.4 Master Start handles grouped cards without double-trigger issues', async () => {
    const s1 = { id: 'master-g1-s1', name: 'M1', lane: 1 };
    const s2 = { id: 'master-g1-s2', name: 'M2', lane: 2 };
    const s3 = { id: 'master-g2-s3', name: 'M3', lane: 3 };

    await repository.saveSwimmer(s1);
    await repository.saveSwimmer(s2);
    await repository.saveSwimmer(s3);

    const coordinator = new AppCoordinator();
    coordinator.cards = new Map();

    const c1 = new SwimmerCard({ swimmer: s1, groupId: 1, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } });
    const c2 = new SwimmerCard({ swimmer: s2, groupId: 1, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } });
    const c3 = new SwimmerCard({ swimmer: s3, groupId: 2, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } });

    c1.render();
    c2.render();
    c3.render();

    coordinator.cards.set(s1.id, c1);
    coordinator.cards.set(s2.id, c2);
    coordinator.cards.set(s3.id, c3);

    await coordinator.handleMasterStart();

    assert.strictEqual(c1.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(c2.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(c3.timerState.state, TIMER_STATES.RUNNING);
  });

  console.log('\n======================================================================');
  console.log(`RESULTS: ${passedTests} passed, ${failedTests} failed out of ${totalTests} assertions.`);
  console.log('======================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runFeature1EmpiricalVerification().catch((err) => {
  console.error('Unhandled verification error:', err);
  process.exit(1);
});
