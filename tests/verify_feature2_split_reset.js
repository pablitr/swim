#!/usr/bin/env node

/**
 * Empirical Verification & Adversarial Stress Runner: Feature 2 (Split "Pause / Lap+Pause" & Reset)
 *
 * Requirements Verified:
 * 1. When RUNNING, split buttons are rendered: [⏸️] and [↺+⏸️].
 * 2. Tapping [↺+⏸️] records a lap split AND pauses the timer atomically.
 * 3. Rapid double tap is debounced (300ms) without creating duplicate laps.
 * 4. Resuming from PAUSED returns to single Reanudar button; resuming returns to split buttons.
 * 5. Tapping "Reiniciar" resets display to 00:00.00 and timer to IDLE while preserving persisted laps in IndexedDB.
 * 6. Historical preservation invariant: card reset vs modal explicit full-wipe.
 * 7. Multi-swimmer concurrent isolation across split pause and reset operations.
 *
 * Exits with code 0 on PASS, code 1 on FAIL.
 */

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

import { SwimmerCard } from '../js/ui/swimmer-card.js';
import { timerEngine, TIMER_STATES, formatTime } from '../js/timing/timer-engine.js';
import { repository } from '../js/storage/repository.js';
import { closeDB } from '../js/storage/db.js';

async function runFeature2EmpiricalVerification() {
  console.log('======================================================================');
  console.log('   Empirical Challenger: Feature 2 (Split Button & Reset) Suite       ');
  console.log('======================================================================\n');

  globalThis.document = {
    createElement: (tag) => new MockElement(tag),
    getElementById: () => null
  };
  globalThis.confirm = () => true;

  await repository.init();
  await repository.clearAll();

  const swimmer = {
    id: 'swim-f2-runner',
    name: 'Camila Rossi',
    lane: 4,
    baseline100mSeconds: 61.0
  };
  await repository.saveSwimmer(swimmer);

  const checks = [];

  const runCheck = async (name, fn) => {
    try {
      await fn();
      checks.push({ name, pass: true });
      console.log(`  ✔ [PASS] ${name}`);
    } catch (err) {
      checks.push({ name, pass: false, error: err.message });
      console.log(`  ✖ [FAIL] ${name}\n     Error: ${err.message}`);
    }
  };

  // Check 1: Split buttons rendered in RUNNING state
  await runCheck('When RUNNING, split buttons are rendered: [⏸️] and [↺+⏸️]', async () => {
    const card = new SwimmerCard({ swimmer });
    card.render();

    assert.strictEqual(card._splitContainerEl.classList.contains('is-split'), false, 'IDLE must not have is-split');
    assert.strictEqual(card._btnLapPauseEl.style.display, 'none');

    await card.handleStart();

    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(card._splitContainerEl.classList.contains('is-split'), true, 'RUNNING must have is-split');
    assert.strictEqual(card._btnLapPauseEl.style.display, 'inline-flex');
    assert.strictEqual(card._btnLapPauseEl.disabled, false);
    assert.ok(card._btnStartEl.innerHTML.includes('Pausar'));
    assert.ok(card._btnLapPauseEl.innerHTML.includes('Pase+Pausa'));
  });

  // Check 2: Tapping Lap+Pause records lap split AND pauses timer
  await runCheck('Tapping [↺+⏸️] records a lap split AND pauses the timer', async () => {
    const card = new SwimmerCard({ swimmer });
    card.render();

    await card.handleStart();
    await new Promise(r => setTimeout(r, 50));

    await card._btnLapPauseEl.dispatchEvent({ type: 'click' });

    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);
    assert.strictEqual(card._stateLabelEl.textContent, 'PAUSADO');
    assert.strictEqual(card.laps.length, 1);
    assert.strictEqual(card.laps[0].lapNumber, 1);
    assert.ok(card.laps[0].splitDurationMs >= 40);

    const repoLaps = await repository.getLaps(swimmer.id);
    assert.strictEqual(repoLaps.length, 1);
  });

  // Check 3: Debounce 300ms on rapid double tap
  await runCheck('Rapid double tap is debounced (300ms) without creating duplicate laps', async () => {
    await repository.clearAll();
    await repository.saveSwimmer(swimmer);

    const card = new SwimmerCard({ swimmer });
    card.render();

    await card.handleStart();
    await new Promise(r => setTimeout(r, 40));

    const p1 = card._btnLapPauseEl.dispatchEvent({ type: 'click' });
    const p2 = card._btnLapPauseEl.dispatchEvent({ type: 'click' });
    await Promise.all([p1, p2]);

    assert.strictEqual(card.laps.length, 1, 'Only 1 lap should be recorded on rapid double tap');
    const repoLaps = await repository.getLaps(swimmer.id);
    assert.strictEqual(repoLaps.length, 1);
  });

  // Check 4: Resume from PAUSED returns to single Reanudar button
  await runCheck('Resuming from PAUSED returns to single Reanudar button, then restores split buttons', async () => {
    const card = new SwimmerCard({ swimmer });
    card.render();

    await card.handleStart();
    await card.handlePause();

    assert.strictEqual(card.timerState.state, TIMER_STATES.PAUSED);
    assert.strictEqual(card._splitContainerEl.classList.contains('is-split'), false);
    assert.strictEqual(card._btnLapPauseEl.style.display, 'none');
    assert.ok(card._btnStartEl.innerHTML.includes('Reanudar'));

    await card._btnStartEl.dispatchEvent({ type: 'click' });

    assert.strictEqual(card.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(card._splitContainerEl.classList.contains('is-split'), true);
    assert.strictEqual(card._btnLapPauseEl.style.display, 'inline-flex');
    assert.ok(card._btnStartEl.innerHTML.includes('Pausar'));
  });

  // Check 5: Tapping "Reiniciar" resets display to 00:00.00 and timer to IDLE while preserving persisted laps
  await runCheck('Tapping "Reiniciar" resets display to 00:00.00 and timer to IDLE while preserving persisted laps', async () => {
    await repository.clearAll();
    await repository.saveSwimmer(swimmer);

    const card = new SwimmerCard({ swimmer });
    card.render();

    await card.handleStart();
    await new Promise(r => setTimeout(r, 30));
    await card.handleLap();
    await new Promise(r => setTimeout(r, 30));
    await card.handleLapPause();

    assert.strictEqual(card.laps.length, 2);
    const beforeReset = await repository.getLaps(swimmer.id);
    assert.strictEqual(beforeReset.length, 2);

    await card._btnResetEl.dispatchEvent({ type: 'click' });

    assert.strictEqual(card.timerState.state, TIMER_STATES.IDLE);
    assert.strictEqual(card.timerState.accumulatedMs, 0);
    assert.strictEqual(card._timeEl.textContent, '00:00.00');
    assert.strictEqual(card._stateLabelEl.textContent, 'LISTO');
    assert.strictEqual(card._lapCountEl.textContent, 'V1');
    assert.strictEqual(card.laps.length, 0);

    const afterReset = await repository.getLaps(swimmer.id);
    assert.strictEqual(afterReset.length, 2, 'Historical laps in IndexedDB MUST be preserved on card reset');
  });

  // Check 6: Full historical wipe contract
  await runCheck('Explicit modal wipe (clearHistorical=true) deletes repository laps', async () => {
    const card = new SwimmerCard({ swimmer });
    card.render();

    let laps = await repository.getLaps(swimmer.id);
    assert.strictEqual(laps.length, 2);

    await card.handleReset({ clearHistorical: true });

    laps = await repository.getLaps(swimmer.id);
    assert.strictEqual(laps.length, 0, 'clearHistorical=true must delete repository laps');
  });

  // Check 7: Multi-Swimmer Independence
  await runCheck('Multi-Swimmer Independence during concurrent Lap+Pause and Reset', async () => {
    await repository.clearAll();
    const swA = { id: 's-a', name: 'Swimmer A', lane: 1 };
    const swB = { id: 's-b', name: 'Swimmer B', lane: 2 };
    await repository.saveSwimmer(swA);
    await repository.saveSwimmer(swB);

    const cardA = new SwimmerCard({ swimmer: swA });
    const cardB = new SwimmerCard({ swimmer: swB });
    cardA.render();
    cardB.render();

    await cardA.handleStart();
    await cardB.handleStart();

    await new Promise(r => setTimeout(r, 40));
    await cardA._btnLapPauseEl.dispatchEvent({ type: 'click' });

    assert.strictEqual(cardA.timerState.state, TIMER_STATES.PAUSED);
    assert.strictEqual(cardA.laps.length, 1);
    assert.strictEqual(cardB.timerState.state, TIMER_STATES.RUNNING);
    assert.strictEqual(cardB.laps.length, 0);

    await cardA._btnResetEl.dispatchEvent({ type: 'click' });
    assert.strictEqual(cardA.timerState.state, TIMER_STATES.IDLE);
    assert.strictEqual(cardB.timerState.state, TIMER_STATES.RUNNING);

    const lapsA = await repository.getLaps(swA.id);
    assert.strictEqual(lapsA.length, 1);
  });

  console.log('\n======================================================================');
  console.log('                      VERIFICATION SUMMARY                            ');
  console.log('======================================================================');
  const passed = checks.filter(c => c.pass).length;
  console.log(`Passed: ${passed} / ${checks.length} checks`);
  console.log('======================================================================\n');

  await repository.clearAll();
  closeDB();

  if (passed === checks.length) {
    console.log('🎉 ALL FEATURE 2 EMPIRICAL CHECKS PASSED!\n');
    process.exit(0);
  } else {
    console.error('❌ SOME CHECKS FAILED!\n');
    process.exit(1);
  }
}

runFeature2EmpiricalVerification().catch(err => {
  console.error('Fatal Runner Error:', err);
  process.exit(1);
});
