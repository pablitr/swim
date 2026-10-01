import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

// Mock DOM with Tree Hierarchy & Event Bubbling
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
  const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '');
  const tagRegex = /<\/?([a-zA-Z0-9]+)([^>]*?)(\/?)>/g;
  const stack = [rootParent];
  let match;

  while ((match = tagRegex.exec(cleanHtml)) !== null) {
    const isClosing = match[0].startsWith('</');
    const tagName = match[1].toLowerCase();
    const attrs = match[2];
    const isSelfClosing = match[3] === '/' || VOID_ELEMENTS.has(tagName);

    if (isClosing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tagName.toLowerCase() === tagName) {
          stack.length = i;
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

import { SwimmerCard } from '../../js/ui/swimmer-card.js';
import { timerEngine, TIMER_STATES } from '../../js/timing/timer-engine.js';
import { repository } from '../../js/storage/repository.js';
import { app } from '../../js/app.js';
const AppCoordinator = app.constructor;

describe('Feature 1: Multi-Timer Launch (Multi-Group Heats) Empirical Challenger Suite', () => {
  beforeEach(async () => {
    await repository.init();
    await repository.clearAll();
  });

  const baseSwimmer = {
    id: 'swimmer-f1-test',
    name: 'Valentina Rossi',
    lane: 2,
    baseline100mSeconds: 62.0
  };

  test('F1-CH-01: groupId cycles 0 -> 1 -> 2 -> 3 -> 4 -> 0 when IDLE', () => {
    const card = new SwimmerCard({ swimmer: baseSwimmer });
    card.render();

    assert.strictEqual(card.groupId, 0);
    assert.strictEqual(card._groupBadgeEl.style.display, 'none');

    const sequence = [
      { id: 1, text: '🔴 G1', cls: 'card-group-badge group-1' },
      { id: 2, text: '🔵 G2', cls: 'card-group-badge group-2' },
      { id: 3, text: '🟡 G3', cls: 'card-group-badge group-3' },
      { id: 4, text: '🟢 G4', cls: 'card-group-badge group-4' },
      { id: 0, text: '', cls: 'card-group-badge' }
    ];

    for (const step of sequence) {
      card._headerEl.dispatchEvent({ type: 'click' });
      assert.strictEqual(card.groupId, step.id);
      if (step.id > 0) {
        assert.strictEqual(card._groupBadgeEl.style.display, 'inline-flex');
        assert.strictEqual(card._groupBadgeEl.textContent, step.text);
        assert.strictEqual(card._groupBadgeEl.className, step.cls);
        assert.strictEqual(card.element.dataset.groupId, String(step.id));
      } else {
        assert.strictEqual(card._groupBadgeEl.style.display, 'none');
        assert.strictEqual(card._groupBadgeEl.textContent, '');
        assert.strictEqual(card.element.dataset.groupId, undefined);
      }
    }
  });

  test('F1-CH-02: groupId cycles 0 -> 1 -> 2 -> 3 -> 4 -> 0 when STOPPED', () => {
    const card = new SwimmerCard({ swimmer: baseSwimmer });
    card.render();
    card.timerState.state = TIMER_STATES.STOPPED;

    card._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card.groupId, 1);

    card._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card.groupId, 2);

    card._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card.groupId, 3);

    card._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card.groupId, 4);

    card._headerEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(card.groupId, 0);
  });

  test('F1-CH-03: Gating: Clicking header while RUNNING does NOT change groupId', () => {
    const card = new SwimmerCard({ swimmer: baseSwimmer, groupId: 2 });
    card.render();
    card.timerState.state = TIMER_STATES.RUNNING;

    assert.strictEqual(card.groupId, 2);
    for (let i = 0; i < 5; i++) {
      card._headerEl.dispatchEvent({ type: 'click' });
      assert.strictEqual(card.groupId, 2, 'groupId must not change when RUNNING');
      assert.strictEqual(card._groupBadgeEl.textContent, '🔵 G2');
    }
  });

  test('F1-CH-04: Gating: Clicking header while PAUSED does NOT change groupId', () => {
    const card = new SwimmerCard({ swimmer: baseSwimmer, groupId: 3 });
    card.render();
    card.timerState.state = TIMER_STATES.PAUSED;

    assert.strictEqual(card.groupId, 3);
    for (let i = 0; i < 5; i++) {
      card._headerEl.dispatchEvent({ type: 'click' });
      assert.strictEqual(card.groupId, 3, 'groupId must not change when PAUSED');
      assert.strictEqual(card._groupBadgeEl.textContent, '🟡 G3');
    }
  });

  test('F1-CH-05: Clicking .btn-card-lupa stops propagation and does NOT cycle group', () => {
    const card = new SwimmerCard({ swimmer: baseSwimmer, groupId: 1 });
    card.render();

    assert.strictEqual(card.groupId, 1);
    card._btnLupaEl.dispatchEvent({ type: 'click', bubbles: true });
    assert.strictEqual(card.groupId, 1, 'Lupa button click must not alter groupId');
  });

  test('F1-CH-06: Starting grouped card fires onGroupStart; starting ungrouped card (groupId 0) starts directly', async () => {
    let groupStartCalls = 0;
    let receivedGroupId = null;

    const groupedCard = new SwimmerCard({
      swimmer: baseSwimmer,
      groupId: 4,
      callbacks: {
        onGroupStart: async (gId) => {
          groupStartCalls++;
          receivedGroupId = gId;
        }
      }
    });
    groupedCard.render();

    await groupedCard.handleStart();
    assert.strictEqual(groupStartCalls, 1);
    assert.strictEqual(receivedGroupId, 4);
    assert.strictEqual(groupedCard.timerState.state, TIMER_STATES.IDLE);

    // Now test ungrouped card (groupId 0)
    let soloCallbackCalled = false;
    const soloCard = new SwimmerCard({
      swimmer: { id: 'solo-swimmer', name: 'Solo', lane: 3 },
      groupId: 0,
      callbacks: {
        onGroupStart: async () => { soloCallbackCalled = true; }
      }
    });
    soloCard.render();

    await soloCard.handleStart();
    assert.strictEqual(soloCallbackCalled, false, 'Group 0 must not call onGroupStart');
    assert.strictEqual(soloCard.timerState.state, TIMER_STATES.RUNNING);
  });

  test('F1-CH-07: Concurrent Group Launch via AppCoordinator starts all IDLE/STOPPED cards in group concurrently', async () => {
    const s1 = { id: 'g-s1', name: 'Swimmer 1', lane: 1 };
    const s2 = { id: 'g-s2', name: 'Swimmer 2', lane: 2 };
    const s3 = { id: 'g-s3', name: 'Swimmer 3', lane: 3 };
    const s4 = { id: 'g-s4', name: 'Swimmer 4', lane: 4 };

    await repository.saveSwimmer(s1);
    await repository.saveSwimmer(s2);
    await repository.saveSwimmer(s3);
    await repository.saveSwimmer(s4);

    const coordinator = new AppCoordinator();
    coordinator.cards = new Map();

    const c1 = new SwimmerCard({ swimmer: s1, groupId: 1, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } });
    const c2 = new SwimmerCard({ swimmer: s2, groupId: 1, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } });
    const c3 = new SwimmerCard({ swimmer: s3, groupId: 2, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } });
    const c4 = new SwimmerCard({ swimmer: s4, groupId: 0, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } });

    c1.render();
    c2.render();
    c3.render();
    c4.render();

    coordinator.cards.set(s1.id, c1);
    coordinator.cards.set(s2.id, c2);
    coordinator.cards.set(s3.id, c3);
    coordinator.cards.set(s4.id, c4);

    // Start Group 1 from Card 1
    await c1.handleStart();

    // c1 and c2 are in Group 1 -> must be RUNNING
    assert.strictEqual(c1.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(c2.timerState.state, TIMER_STATES.RUNNING);

    // c3 (Group 2) and c4 (Group 0) must remain IDLE
    assert.strictEqual(c3.timerState.state, TIMER_STATES.IDLE);
    assert.strictEqual(c4.timerState.state, TIMER_STATES.IDLE);
  });

  test('F1-CH-08: Isolation & Safety: PAUSED cards in same group are not corrupted or restarted', async () => {
    const s1 = { id: 'iso-s1', name: 'Iso 1', lane: 1 };
    const s2 = { id: 'iso-s2', name: 'Iso 2 (Paused)', lane: 2 };

    await repository.saveSwimmer(s1);
    await repository.saveSwimmer(s2);

    const coordinator = new AppCoordinator();
    coordinator.cards = new Map();

    const c1 = new SwimmerCard({ swimmer: s1, groupId: 1, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } });
    const c2 = new SwimmerCard({ swimmer: s2, groupId: 1, callbacks: { onGroupStart: (g, s) => coordinator.handleGroupStart(g, s) } });

    c1.render();
    c2.render();

    c2.timerState.state = TIMER_STATES.PAUSED;
    c2.timerState.accumulatedMs = 45000;
    await repository.saveTimerState(c2.timerState);

    coordinator.cards.set(s1.id, c1);
    coordinator.cards.set(s2.id, c2);

    // Start Group 1 from Card 1
    await c1.handleStart();

    // Card 1 starts RUNNING
    assert.strictEqual(c1.timerState.state, TIMER_STATES.RUNNING);

    // Card 2 must remain strictly PAUSED with its 45000ms intact
    assert.strictEqual(c2.timerState.state, TIMER_STATES.PAUSED);
    assert.strictEqual(c2.timerState.accumulatedMs, 45000);
  });
});
