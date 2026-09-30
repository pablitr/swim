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
    const fns = this._listeners[event.type] || [];
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
    elements.push(el);
  }
  return elements;
}

import { SwimmerCard } from '../../js/ui/swimmer-card.js';
import { calculateTrainingZones } from '../../js/analytics/zones.js';
import { computeSustainablePace } from '../../js/analytics/pace-calculator.js';

describe('SwimmerCard UI Component Unit Tests', () => {
  let originalDocument;
  let originalConfirm;

  beforeEach(() => {
    originalDocument = globalThis.document;
    originalConfirm = globalThis.confirm;
    globalThis.document = {
      createElement: (tag) => new MockElement(tag),
      getElementById: (id) => null
    };
    globalThis.confirm = () => true;
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
    name: 'Michael Phelps',
    lane: 4,
    baseline100mSeconds: 60.0
  };

  test('TC-SC-101: render() computes training zones via calculateTrainingZones and includes Pace (Mode) box', () => {
    const card = new SwimmerCard({ swimmer });
    const el = card.render();

    // Verify Zones calculated via calculateTrainingZones (60s baseline: 75% = 80.0s, 80% = 75.0s, 90% = 66.7s)
    const expectedZones = calculateTrainingZones(60.0);
    assert.strictEqual(expectedZones.zone75, 80.0);
    assert.strictEqual(expectedZones.zone80, 75.0);

    assert.ok(el.innerHTML.includes('80.0s'), 'Must display 75% zone as 80.0s');
    assert.ok(el.innerHTML.includes('75.0s'), 'Must display 80% zone as 75.0s');
    assert.ok(el.innerHTML.includes('66.7s'), 'Must display 90% zone as 66.7s');

    // Anti-regression: verify naive multiplication 45s is NOT present
    assert.ok(!el.innerHTML.includes('45.0s</span></span>'), 'Anti-regression: 75% zone must NOT be 45s');

    // Verify 4th metric box exists
    const paceEl = el.querySelector(`#metric-pace-${swimmer.id}`);
    assert.ok(paceEl, 'Must render metric-pace element');
    assert.strictEqual(paceEl.textContent, '--', 'Initial pace metric must be --');
  });

  test('TC-SC-102: updateMetrics() and updateLapsTable() wire sustainable pace and outlier flags for [45, 45, 46, 60]', () => {
    const card = new SwimmerCard({ swimmer });
    const el = card.render();

    // Add laps: [45s, 45s, 46s, 60s (outlier)]
    card.laps = [
      { lapNumber: 1, splitDurationMs: 45000, cumulativeDurationMs: 45000, timestamp: 1000 },
      { lapNumber: 2, splitDurationMs: 45000, cumulativeDurationMs: 90000, timestamp: 2000 },
      { lapNumber: 3, splitDurationMs: 46000, cumulativeDurationMs: 136000, timestamp: 3000 },
      { lapNumber: 4, splitDurationMs: 60000, cumulativeDurationMs: 196000, timestamp: 4000 }
    ];

    card.updateMetrics();
    card.updateLapsTable();

    // 1. Verify Sustainable Pace metric box shows ~45.00s
    const paceEl = el.querySelector(`#metric-pace-${swimmer.id}`);
    assert.ok(paceEl, 'paceEl must exist');
    assert.strictEqual(paceEl.textContent, '45.00s', 'Pace metric must display 45.00s modal pace');

    // 2. Verify outlier flags populated on laps
    assert.strictEqual(card.laps[0].isOutlier, false, 'Lap 1 is inlier');
    assert.strictEqual(card.laps[1].isOutlier, false, 'Lap 2 is inlier');
    assert.strictEqual(card.laps[2].isOutlier, false, 'Lap 3 is inlier');
    assert.strictEqual(card.laps[3].isOutlier, true, 'Lap 4 (60s) is outlier');

    // 3. Verify laps table HTML contains outlier styling and pill
    const tbody = el.querySelector(`#laps-body-${swimmer.id}`);
    assert.ok(tbody, 'tbody must exist');
    assert.ok(tbody.innerHTML.includes('class="outlier"'), 'Must render outlier CSS class on 60s row');
    assert.ok(tbody.innerHTML.includes('<span class="outlier-pill">OUTLIER</span>'), 'Must render OUTLIER pill');
  });

  test('TC-SC-103: updateBoxplot() invokes renderBoxplot passing options object', async () => {
    const card = new SwimmerCard({ swimmer });
    const el = card.render();

    card.laps = [
      { lapNumber: 1, splitDurationMs: 45000, cumulativeDurationMs: 45000 },
      { lapNumber: 2, splitDurationMs: 46000, cumulativeDurationMs: 91000 }
    ];

    await card.updateBoxplot();

    const boxplotWrapper = el.querySelector(`#boxplot-${swimmer.id}`);
    assert.ok(boxplotWrapper, 'boxplot wrapper must exist');
    assert.ok(boxplotWrapper.innerHTML.includes('<svg'), 'Boxplot must render SVG markup');
    assert.ok(boxplotWrapper.innerHTML.includes('viewBox="0 0 300 80"'), 'Default options viewBox width/height preserved');
  });

  test('TC-SC-104: Empty laps state displays -- and resets tables', () => {
    const card = new SwimmerCard({ swimmer, laps: [] });
    const el = card.render();

    const paceEl = el.querySelector(`#metric-pace-${swimmer.id}`);
    assert.strictEqual(paceEl.textContent, '--');

    const tbody = el.querySelector(`#laps-body-${swimmer.id}`);
    assert.ok(tbody.innerHTML.includes('No laps recorded yet'));

    const boxplotWrapper = el.querySelector(`#boxplot-${swimmer.id}`);
    assert.ok(boxplotWrapper.innerHTML.includes('Record laps to view pace boxplot'));
  });
});
