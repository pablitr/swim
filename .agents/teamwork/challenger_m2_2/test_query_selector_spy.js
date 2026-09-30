/**
 * Empirical Test Harness: DOM querySelector spy and benchmark for updateTimeDisplay()
 *
 * Verifies that during high-frequency execution (e.g. 60 FPS animation ticker loop),
 * updateTimeDisplay() makes ZERO calls to:
 * - document.querySelector / document.querySelectorAll
 * - element.querySelector / element.querySelectorAll
 * - document.getElementById
 * - document.getElementsByClassName
 * - document.getElementsByTagName
 */

import 'fake-indexeddb/auto';

// Setup Mock DOM
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
    MockElement.spyCounts.elemQuerySelector++;
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
    MockElement.spyCounts.elemQuerySelectorAll++;
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

MockElement.spyCounts = {
  docQuerySelector: 0,
  docQuerySelectorAll: 0,
  elemQuerySelector: 0,
  elemQuerySelectorAll: 0,
  docGetElementById: 0,
  docGetElementsByClassName: 0,
  docGetElementsByTagName: 0
};

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

// Global document spy setup
globalThis.document = {
  createElement: (tag) => new MockElement(tag),
  getElementById: (id) => {
    MockElement.spyCounts.docGetElementById++;
    return null;
  },
  querySelector: (sel) => {
    MockElement.spyCounts.docQuerySelector++;
    return null;
  },
  querySelectorAll: (sel) => {
    MockElement.spyCounts.docQuerySelectorAll++;
    return [];
  },
  getElementsByClassName: (cls) => {
    MockElement.spyCounts.docGetElementsByClassName++;
    return [];
  },
  getElementsByTagName: (tag) => {
    MockElement.spyCounts.docGetElementsByTagName++;
    return [];
  }
};
globalThis.confirm = () => true;

// Now import swimmer card and modules
const { SwimmerCard } = await import('../../../js/ui/swimmer-card.js');
const { repository } = await import('../../../js/storage/repository.js');

await repository.init();
await repository.clearAll();

console.log('======================================================================');
console.log('  Empirical Test Harness 1: querySelector Spy on updateTimeDisplay()  ');
console.log('======================================================================\n');

const testSwimmer = {
  id: 'swimmer-perf-test',
  name: 'Empirical Speedster',
  lane: 1,
  baseline100m: 60
};

const card = new SwimmerCard({ swimmer: testSwimmer });
const el = card.render();

console.log('[Initial Setup] Card rendered. Spies armed.');
console.log(`Render-time element querySelector calls during initialization: ${MockElement.spyCounts.elemQuerySelector}`);

// Reset spies to measure ONLY execution during updateTimeDisplay
MockElement.spyCounts.docQuerySelector = 0;
MockElement.spyCounts.docQuerySelectorAll = 0;
MockElement.spyCounts.elemQuerySelector = 0;
MockElement.spyCounts.elemQuerySelectorAll = 0;
MockElement.spyCounts.docGetElementById = 0;
MockElement.spyCounts.docGetElementsByClassName = 0;
MockElement.spyCounts.docGetElementsByTagName = 0;

// Set timer state to RUNNING
await card.handleStart();

// Re-zero spies after handleStart (which updates UI controls once on state change)
MockElement.spyCounts.docQuerySelector = 0;
MockElement.spyCounts.docQuerySelectorAll = 0;
MockElement.spyCounts.elemQuerySelector = 0;
MockElement.spyCounts.elemQuerySelectorAll = 0;
MockElement.spyCounts.docGetElementById = 0;
MockElement.spyCounts.docGetElementsByClassName = 0;
MockElement.spyCounts.docGetElementsByTagName = 0;

console.log('\n[Phase 1] Executing 50,000 iterations of updateTimeDisplay()...');

const ITERATIONS = 50000;
const t0 = performance.now();

for (let i = 0; i < ITERATIONS; i++) {
  // Simulate time advancing 16ms each animation frame
  card.timerState.accumulatedMs += 16;
  card.updateTimeDisplay();
}

const t1 = performance.now();
const elapsedMs = t1 - t0;
const nsPerCall = (elapsedMs / ITERATIONS) * 1e6;

console.log(`Execution completed: ${ITERATIONS} iterations in ${elapsedMs.toFixed(2)} ms.`);
console.log(`Average throughput: ${(ITERATIONS / (elapsedMs / 1000)).toFixed(0)} calls/sec.`);
console.log(`Average latency: ${nsPerCall.toFixed(1)} ns per call.`);

console.log('\n[Phase 2] Spy Verification:');
console.log(`  - document.querySelector:              ${MockElement.spyCounts.docQuerySelector}`);
console.log(`  - document.querySelectorAll:           ${MockElement.spyCounts.docQuerySelectorAll}`);
console.log(`  - Element.prototype.querySelector:     ${MockElement.spyCounts.elemQuerySelector}`);
console.log(`  - Element.prototype.querySelectorAll:  ${MockElement.spyCounts.elemQuerySelectorAll}`);
console.log(`  - document.getElementById:             ${MockElement.spyCounts.docGetElementById}`);
console.log(`  - document.getElementsByClassName:     ${MockElement.spyCounts.docGetElementsByClassName}`);
console.log(`  - document.getElementsByTagName:       ${MockElement.spyCounts.docGetElementsByTagName}`);

const totalDOMQueries = Object.values(MockElement.spyCounts).reduce((a, b) => a + b, 0);

console.log(`\nTotal DOM query calls during 50,000 updateTimeDisplay() invocations: ${totalDOMQueries}`);

if (totalDOMQueries === 0) {
  console.log('\n✔ [PASS] Requirement 1 EMPIRICALLY CONFIRMED: 0 querySelector calls in updateTimeDisplay().');
} else {
  console.error(`\n❌ [FAIL] Requirement 1 VIOLATED: ${totalDOMQueries} DOM query calls detected!`);
  process.exit(1);
}
