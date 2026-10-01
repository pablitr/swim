import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Mock Element for Node.js DOM testing
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
    this._value = '';
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

import { app } from '../../js/app.js';
import { repository } from '../../js/storage/repository.js';
import { timerEngine, TIMER_STATES } from '../../js/timing/timer-engine.js';
import { SwimmerCard } from '../../js/ui/swimmer-card.js';

describe('Feature 4: Global Stats Drill-Down & Historical Traceability Suite', () => {
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

    register('swimmer-grid', new MockElement('div'));
    register('global-stats-modal', new MockElement('div'));
    register('global-stats-content', new MockElement('div'));
    register('btn-global-stats', new MockElement('button'));
    register('global-stats-close-btn', new MockElement('button'));
    register('btn-master-start', new MockElement('button'));
    register('btn-master-stop', new MockElement('button'));
    register('btn-master-reset', new MockElement('button'));
    register('btn-add-swimmer-trigger', new MockElement('button'));

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

    app.gridEl = domElements.get('swimmer-grid');
    app.globalStatsModalEl = domElements.get('global-stats-modal');
    app.cards.clear();
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  test('TC-DD-401: showGlobalStats renders swimmer names as clickable .swimmer-drilldown-btn buttons', () => {
    const swimmer1 = { id: 's1', name: 'Mireia Belmonte', lane: 4 };
    const swimmer2 = { id: 's2', name: 'Hugo González', lane: 5 };

    const card1 = new SwimmerCard({ swimmer: swimmer1, laps: [] });
    const card2 = new SwimmerCard({ swimmer: swimmer2, laps: [] });

    app.cards.set('s1', card1);
    app.cards.set('s2', card2);

    app.showGlobalStats();

    const contentEl = domElements.get('global-stats-content');
    const drilldownBtns = contentEl.querySelectorAll('.swimmer-drilldown-btn');

    assert.equal(drilldownBtns.length, 2, 'Must render 2 clickable drilldown buttons');
    assert.equal(drilldownBtns[0].dataset.swimmerId, 's1');
    assert.equal(drilldownBtns[1].dataset.swimmerId, 's2');
    assert.ok(contentEl.innerHTML.includes('Mireia Belmonte'));
    assert.ok(contentEl.innerHTML.includes('Hugo González'));
  });

  test('TC-DD-402: Clicking swimmer drilldown button opens historical view with [← Volver] button', async () => {
    const swimmer = { id: 's1', name: 'Mireia Belmonte', lane: 4, baseline100mSeconds: 61.2 };
    await repository.saveSwimmer(swimmer);

    const card = new SwimmerCard({ swimmer, laps: [] });
    app.cards.set('s1', card);

    app.showGlobalStats();

    // Trigger drilldown
    await app.showSwimmerDrillDown('s1');

    const contentEl = domElements.get('global-stats-content');
    assert.ok(contentEl.innerHTML.includes('← Volver a Estadísticas Globales'));
    assert.ok(contentEl.innerHTML.includes('Mireia Belmonte'));
    assert.ok(contentEl.innerHTML.includes('C4'));
    assert.ok(contentEl.innerHTML.includes('61.2s'));

    // Clicking back button restores summary table
    const backBtn = contentEl.querySelector('#btn-drilldown-back');
    assert.ok(backBtn, 'Back button must be present in DOM');
    backBtn.dispatchEvent({ type: 'click' });

    assert.ok(contentEl.innerHTML.includes('Resumen por Nadador'), 'Summary table restored after clicking back');
  });

  test('TC-DD-403: Month and Year volume accumulators calculate laps and meters (laps * 50m) accurately', async () => {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    // Timestamp in current month
    const thisMonthTime = new Date(curYear, curMonth, 15, 10, 0, 0).getTime();
    // Timestamp in earlier month this year (if Jan, use December of last year)
    const earlierMonthTime = curMonth > 0
      ? new Date(curYear, curMonth - 1, 15, 10, 0, 0).getTime()
      : new Date(curYear - 1, 11, 15, 10, 0, 0).getTime();
    // Timestamp in previous year
    const lastYearTime = new Date(curYear - 1, 5, 15, 10, 0, 0).getTime();

    const swimmer = { id: 's-acc', name: 'David Popovici', lane: 2, baseline100mSeconds: 47.0 };
    await repository.saveSwimmer(swimmer);

    const laps = [
      // 3 laps this month
      { id: 'l1', swimmerId: 's-acc', lapNumber: 1, splitDurationMs: 23500, cumulativeDurationMs: 23500, timestamp: thisMonthTime },
      { id: 'l2', swimmerId: 's-acc', lapNumber: 2, splitDurationMs: 24000, cumulativeDurationMs: 47500, timestamp: thisMonthTime + 30000 },
      { id: 'l3', swimmerId: 's-acc', lapNumber: 3, splitDurationMs: 23800, cumulativeDurationMs: 71300, timestamp: thisMonthTime + 60000 },
      // 2 laps earlier
      { id: 'l4', swimmerId: 's-acc', lapNumber: 1, splitDurationMs: 24000, cumulativeDurationMs: 24000, timestamp: earlierMonthTime },
      { id: 'l5', swimmerId: 's-acc', lapNumber: 2, splitDurationMs: 24200, cumulativeDurationMs: 48200, timestamp: earlierMonthTime + 30000 },
      // 1 lap last year
      { id: 'l6', swimmerId: 's-acc', lapNumber: 1, splitDurationMs: 25000, cumulativeDurationMs: 25000, timestamp: lastYearTime }
    ];

    for (const lap of laps) {
      await repository.saveLap(lap);
    }

    const card = new SwimmerCard({ swimmer, laps });
    app.cards.set('s-acc', card);

    await app.showSwimmerDrillDown('s-acc');

    const contentEl = domElements.get('global-stats-content');

    // Month accumulator: exactly 3 laps = 150m
    assert.ok(contentEl.innerHTML.includes('<div class="metric-value">3</div>'), 'Must show 3 laps this month');
    assert.ok(contentEl.innerHTML.includes('150 m'), 'Must show 150 m this month');

    // Year accumulator: if curMonth > 0, 3 + 2 = 5 laps (250m). If curMonth === 0, exactly 3 laps (150m)
    const expectedYearLaps = curMonth > 0 ? 5 : 3;
    const expectedYearMeters = expectedYearLaps * 50;
    assert.ok(contentEl.innerHTML.includes(`${expectedYearMeters} m`), `Must show ${expectedYearMeters} m this year`);
  });

  test('TC-DD-404: Session partitioning clusters laps across resets into distinct sessions and renders stacked boxplots', async () => {
    const swimmer = { id: 's-sessions', name: 'Caeleb Dressel', lane: 1, baseline100mSeconds: 48.0 };
    await repository.saveSwimmer(swimmer);

    const baseTime = Date.now() - 3600000;
    const laps = [
      // Session 1: 3 laps
      { id: 's1-l1', swimmerId: 's-sessions', lapNumber: 1, splitDurationMs: 24000, cumulativeDurationMs: 24000, timestamp: baseTime },
      { id: 's1-l2', swimmerId: 's-sessions', lapNumber: 2, splitDurationMs: 24500, cumulativeDurationMs: 48500, timestamp: baseTime + 30000 },
      { id: 's1-l3', swimmerId: 's-sessions', lapNumber: 3, splitDurationMs: 25000, cumulativeDurationMs: 73500, timestamp: baseTime + 60000 },
      // Session 2 (reset back to lap 1): 2 laps
      { id: 's2-l1', swimmerId: 's-sessions', lapNumber: 1, splitDurationMs: 23800, cumulativeDurationMs: 23800, timestamp: baseTime + 1800000 },
      { id: 's2-l2', swimmerId: 's-sessions', lapNumber: 2, splitDurationMs: 24100, cumulativeDurationMs: 47900, timestamp: baseTime + 1830000 }
    ];

    for (const lap of laps) {
      await repository.saveLap(lap);
    }

    const card = new SwimmerCard({ swimmer, laps });
    app.cards.set('s-sessions', card);

    await app.showSwimmerDrillDown('s-sessions');

    const contentEl = domElements.get('global-stats-content');
    const sessionCards = contentEl.querySelectorAll('.drilldown-session-card');
    assert.equal(sessionCards.length, 2, 'Must partition into exactly 2 sessions');

    // Must contain SVG boxplot elements without NaN
    assert.ok(contentEl.innerHTML.includes('<svg viewBox='), 'Must contain SVG boxplot markup');
    assert.ok(!contentEl.innerHTML.includes('NaN'), 'SVG boxplot must not contain NaN coordinates');
  });

  test('TC-DD-405: 0-laps swimmer displays clean Spanish empty state "Sin sesiones de entrenamiento registradas aún para este nadador."', async () => {
    const swimmer = { id: 's-empty', name: 'Nuevo Nadador', lane: 6 };
    await repository.saveSwimmer(swimmer);

    const card = new SwimmerCard({ swimmer, laps: [] });
    app.cards.set('s-empty', card);

    await app.showSwimmerDrillDown('s-empty');

    const contentEl = domElements.get('global-stats-content');
    assert.ok(contentEl.innerHTML.includes('Sin sesiones de entrenamiento registradas aún para este nadador.'));
    assert.ok(contentEl.innerHTML.includes('0 m'));
    assert.ok(contentEl.innerHTML.includes('← Volver a Estadísticas Globales'));
  });

  test('TC-DD-406: Privacy disclaimer is present in index.html footer and styled for high outdoor contrast', () => {
    const indexPath = path.join(PROJECT_ROOT, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');

    assert.ok(
      html.includes('class="privacy-disclaimer"'),
      'index.html must contain .privacy-disclaimer element'
    );
    assert.ok(
      html.includes('Los datos de uso y tiempos se sincronizan anónimamente en la nube para estadísticas de rendimiento.'),
      'Privacy disclaimer text must match exact Spanish specification'
    );

    const cssPath = path.join(PROJECT_ROOT, 'css/styles.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('.privacy-disclaimer'), 'css/styles.css must contain .privacy-disclaimer rule');
    assert.ok(css.includes('.app-footer'), 'css/styles.css must contain .app-footer rule');
    assert.ok(css.includes('flex-direction: column;'), '.app-footer must use column layout');
    assert.ok(css.includes('--text-muted'), 'Disclaimer must use high-contrast color token');
  });
});
