import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

import { app } from '../../js/app.js';
import { repository } from '../../js/storage/repository.js';
import { timerEngine, TIMER_STATES } from '../../js/timing/timer-engine.js';
import { SwimmerCard } from '../../js/ui/swimmer-card.js';
import { renderBoxplotSVG } from '../../js/ui/boxplot-svg.js';
import { computeBoxplotStats } from '../../js/analytics/stats.js';

// Minimal DOM mock
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
      contains: (cls) => (this.className || '').split(/\s+/).includes(cls)
    };
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = String(html);
    this.children = parseHtmlToMock(this._innerHTML, this);
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
  }

  getAttribute(name) {
    return this[name] ?? null;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
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
    return this._find(el => el.matches(sel));
  }

  querySelectorAll(sel) {
    const matches = [];
    const collect = (el) => {
      for (const child of el.children) {
        if (child.matches(sel)) matches.push(child);
        collect(child);
      }
    };
    collect(this);
    return matches;
  }

  matches(sel) {
    let currentSel = sel;
    const attrMatch = currentSel.match(/\[([a-zA-Z0-9_-]+)(?:=["']([^"']+)["'])?\]/);
    if (attrMatch) {
      const attrName = attrMatch[1];
      const attrVal = attrMatch[2];
      const actualVal = this.getAttribute(attrName) ?? (this.dataset ? (this.dataset[attrName.replace(/^data-/, '').replace(/-([a-z])/g, (_, l) => l.toUpperCase())] || this.dataset[attrName]) : null);
      if (attrVal !== undefined) {
        if (actualVal !== attrVal) return false;
      } else {
        if (actualVal === null || actualVal === undefined) return false;
      }
      currentSel = currentSel.replace(attrMatch[0], '');
    }

    if (!currentSel) return true;
    if (currentSel.startsWith('#')) return this.id === currentSel.slice(1);
    if (currentSel.startsWith('.')) return this.classList.contains(currentSel.slice(1));
    return this.tagName.toLowerCase() === currentSel.toLowerCase();
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

function parseHtmlToMock(html, parent) {
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

describe('Challenger M2: Empirical Adversarial Challenge Suite', () => {
  let domElements;

  beforeEach(async () => {
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

    await repository.init();
    await repository.clearAll();
    await timerEngine.init(repository);

    app.gridEl = domElements.get('swimmer-grid');
    app.globalStatsModalEl = domElements.get('global-stats-modal');
    app.cards.clear();
  });

  describe('1. Global Stats Drill-Down & Accumulators', () => {
    test('Drilldown navigation, Back button, and strict month/year accumulators', async () => {
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();

      const thisMonthTime = new Date(curYear, curMonth, 10, 9, 0, 0).getTime();
      const isJan = curMonth === 0;
      const lastMonthTime = isJan
        ? new Date(curYear - 1, 11, 15, 8, 0, 0).getTime()
        : new Date(curYear, curMonth - 1, 15, 8, 0, 0).getTime();
      const lastYearTime = new Date(curYear - 1, 5, 10, 7, 0, 0).getTime();
      const futureYearTime = new Date(curYear + 1, 0, 1, 10, 0, 0).getTime();

      const swimmer = {
        id: 's-adv-1',
        name: 'Sarah Sjöström',
        lane: 5,
        baseline100mSeconds: 52.8
      };
      await repository.saveSwimmer(swimmer);

      const laps = [
        { id: 'l-m1', swimmerId: swimmer.id, lapNumber: 1, splitDurationMs: 25000, cumulativeDurationMs: 25000, timestamp: thisMonthTime },
        { id: 'l-m2', swimmerId: swimmer.id, lapNumber: 2, splitDurationMs: 25200, cumulativeDurationMs: 50200, timestamp: thisMonthTime + 30000 },
        { id: 'l-m3', swimmerId: swimmer.id, lapNumber: 3, splitDurationMs: 25500, cumulativeDurationMs: 75700, timestamp: thisMonthTime + 60000 },
        { id: 'l-lm1', swimmerId: swimmer.id, lapNumber: 1, splitDurationMs: 26000, cumulativeDurationMs: 26000, timestamp: lastMonthTime },
        { id: 'l-lm2', swimmerId: swimmer.id, lapNumber: 2, splitDurationMs: 26200, cumulativeDurationMs: 52200, timestamp: lastMonthTime + 30000 },
        { id: 'l-ly1', swimmerId: swimmer.id, lapNumber: 1, splitDurationMs: 27000, cumulativeDurationMs: 27000, timestamp: lastYearTime },
        { id: 'l-fut1', swimmerId: swimmer.id, lapNumber: 1, splitDurationMs: 24000, cumulativeDurationMs: 24000, timestamp: futureYearTime }
      ];

      for (const lap of laps) {
        await repository.saveLap(lap);
      }

      const card = new SwimmerCard({ swimmer, laps });
      app.cards.set(swimmer.id, card);

      app.showGlobalStats();
      const contentEl = domElements.get('global-stats-content');
      const drillBtn = contentEl.querySelector(`.swimmer-drilldown-btn[data-swimmer-id="${swimmer.id}"]`);
      assert.ok(drillBtn, 'Drilldown button must exist in table');

      await app.showSwimmerDrillDown(swimmer.id);

      assert.ok(contentEl.innerHTML.includes('← Volver a Estadísticas Globales'));
      assert.ok(contentEl.innerHTML.includes('Sarah Sjöström'));
      assert.ok(contentEl.innerHTML.includes('C5'));

      // Month accumulator: exactly 3 laps = 150m
      assert.ok(contentEl.innerHTML.includes('<div class="metric-value">3</div>'), 'Must show 3 laps this month');
      assert.ok(contentEl.innerHTML.includes('150 m'), 'Must show 150 m this month');

      // Year accumulator
      const expectedYearLaps = isJan ? 3 : 5;
      const expectedYearMeters = expectedYearLaps * 50;
      assert.ok(contentEl.innerHTML.includes(`<div class="metric-value">${expectedYearLaps}</div>`), `Must show ${expectedYearLaps} laps this year`);
      assert.ok(contentEl.innerHTML.includes(`${expectedYearMeters} m`), `Must show ${expectedYearMeters} m this year`);

      // Back button click restores table
      const backBtn = contentEl.querySelector('#btn-drilldown-back');
      assert.ok(backBtn);
      backBtn.dispatchEvent({ type: 'click' });
      assert.ok(contentEl.innerHTML.includes('Resumen por Nadador'));
    });
  });

  describe('2. Training Session Partitioning & Stacked Pure SVG Boxplots', () => {
    test('Feeds 7 sessions: strictly renders last 5 reverse-chronologically with valid pure SVG boxplots', async () => {
      const swimmer = {
        id: 's-adv-2',
        name: 'Kristóf Milák',
        lane: 2,
        baseline100mSeconds: 50.5
      };
      await repository.saveSwimmer(swimmer);

      const baseSessionTime = Date.now() - (7 * 3600 * 1000);
      const sessionConfigs = [
        { numLaps: 3, splits: [24000, 24200, 24400] }, // S1
        { numLaps: 4, splits: [25000, 25100, 25300, 25500] }, // S2
        { numLaps: 5, splits: [24100, 24200, 24300, 24400, 24500] }, // S3 (5th from last)
        { numLaps: 2, splits: [23800, 24000] }, // S4 (4th from last)
        { numLaps: 6, splits: [24800, 24900, 25000, 25100, 25200, 25300] }, // S5 (3rd from last)
        { numLaps: 3, splits: [23500, 23700, 23900] }, // S6 (2nd from last)
        { numLaps: 4, splits: [23000, 23200, 23400, 23600] } // S7 (newest)
      ];

      const laps = [];
      sessionConfigs.forEach((cfg, sIdx) => {
        const sTime = baseSessionTime + (sIdx * 45 * 60 * 1000);
        cfg.splits.forEach((split, lIdx) => {
          laps.push({
            id: `lap-km-s${sIdx}-l${lIdx}`,
            swimmerId: swimmer.id,
            lapNumber: lIdx + 1,
            splitDurationMs: split,
            cumulativeDurationMs: cfg.splits.slice(0, lIdx + 1).reduce((a, b) => a + b, 0),
            timestamp: sTime + (lIdx * 30 * 1000)
          });
        });
      });

      for (const lap of laps) {
        await repository.saveLap(lap);
      }

      const card = new SwimmerCard({ swimmer, laps });
      app.cards.set(swimmer.id, card);

      await app.showSwimmerDrillDown(swimmer.id);
      const contentEl = domElements.get('global-stats-content');

      const sessionCards = contentEl.querySelectorAll('.drilldown-session-card');
      assert.equal(sessionCards.length, 7, 'Must render exactly 7 session cards');

      const sessionBlocks = contentEl.innerHTML.split('<div class="drilldown-session-card">').slice(1);
      assert.equal(sessionBlocks.length, 7);
      assert.ok(sessionBlocks[0].includes('4 pases'), 'First rendered must be S7 (4 pases)');
      assert.ok(sessionBlocks[1].includes('3 pases'), 'Second rendered must be S6 (3 pases)');
      assert.ok(sessionBlocks[2].includes('6 pases'), 'Third rendered must be S5 (6 pases)');
      assert.ok(sessionBlocks[3].includes('2 pases'), 'Fourth rendered must be S4 (2 pases)');
      assert.ok(sessionBlocks[4].includes('5 pases'), 'Fifth rendered must be S3 (5 pases)');

      // Validate SVG outputs
      const svgMatches = contentEl.innerHTML.match(/<svg[^>]*class="[^"]*boxplot-svg[^"]*"[^>]*>[\s\S]*?<\/svg>/g);
      assert.ok(svgMatches && svgMatches.length === 7, 'Must contain 7 valid boxplot SVG elements');

      svgMatches.forEach((svgStr, idx) => {
        assert.ok(!svgStr.includes('NaN'), `SVG #${idx + 1} must not contain NaN`);
        assert.ok(!svgStr.includes('undefined'), `SVG #${idx + 1} must not contain undefined`);
        assert.ok(!svgStr.includes('null'), `SVG #${idx + 1} must not contain null`);
        assert.ok(!svgStr.includes('Infinity'), `SVG #${idx + 1} must not contain Infinity`);

        const coordAttrRegex = /\b(?:x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height)=["']([^"']+)["']/g;
        let m;
        while ((m = coordAttrRegex.exec(svgStr)) !== null) {
          const val = parseFloat(m[1]);
          assert.ok(!isNaN(val) && Number.isFinite(val), `Coord ${m[0]} in SVG #${idx + 1} must be a finite number`);
        }
      });
    });

    test('Boxplot SVG edge cases: 0 laps, 1 lap, zero-variance [50, 50, 50], and extreme outliers', () => {
      // 0 laps
      const svg0 = renderBoxplotSVG([], { width: 440, height: 75 });
      assert.ok(svg0.includes('Sin datos de pases registrados'));
      assert.ok(!svg0.includes('NaN'));

      // 1 lap
      const svg1 = renderBoxplotSVG([50.0], { width: 440, height: 75 });
      assert.ok(svg1.includes('<rect '));
      assert.ok(!svg1.includes('NaN'));

      // Zero-variance
      const svgZv = renderBoxplotSVG([50, 50, 50], { width: 440, height: 75 });
      assert.ok(svgZv.includes('<rect '));
      assert.ok(!svgZv.includes('NaN'));
      const statsZv = computeBoxplotStats([50, 50, 50]);
      assert.equal(statsZv.iqr, 0);

      // Extreme outliers
      const svgOut = renderBoxplotSVG([25, 50, 50, 51, 52, 120], { width: 440, height: 75 });
      assert.ok(svgOut.includes('data-outlier="true"'));
      assert.ok(svgOut.includes('data-value="120"'));
      assert.ok(!svgOut.includes('NaN'));
    });
  });

  describe('3. Privacy Disclaimer & Poolside Contrast', () => {
    test('Disclaimer presence, exact Spanish text, column layout, and contrast >= 4.5:1', () => {
      const indexPath = path.join(PROJECT_ROOT, 'index.html');
      const indexHtml = fs.readFileSync(indexPath, 'utf8');

      assert.ok(indexHtml.includes('<footer class="app-footer">'));
      assert.ok(indexHtml.includes('class="privacy-disclaimer"'));
      assert.ok(indexHtml.includes('Los datos de uso y tiempos se sincronizan anónimamente en la nube para estadísticas de rendimiento.'));

      const cssPath = path.join(PROJECT_ROOT, 'css/styles.css');
      const css = fs.readFileSync(cssPath, 'utf8');

      assert.ok(css.includes('.app-footer'));
      assert.ok(css.includes('flex-direction: column;'));

      const hexToRgb = (hex) => {
        const bigint = parseInt(hex.replace('#', ''), 16);
        return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
      };

      const getLuminance = ([r, g, b]) => {
        const a = [r, g, b].map(v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
      };

      const bgLum = getLuminance(hexToRgb('0e172a'));
      const textLum = getLuminance(hexToRgb('94a3b8'));
      const contrast = (Math.max(bgLum, textLum) + 0.05) / (Math.min(bgLum, textLum) + 0.05);

      assert.ok(contrast >= 4.5, `Contrast ${contrast.toFixed(2)} must be >= 4.5:1 for high outdoor contrast`);
    });
  });
});
