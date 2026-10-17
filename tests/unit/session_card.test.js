import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeHtml,
  formatSessionDate,
  renderSessionMetaHTML,
  renderSessionCardHTML,
  bindSessionCardActions
} from '../../js/ui/session-card.js';

// Setup Mock DOM for session_card tests in Node.js
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
    this._focused = false;
    this._selected = false;
  }

  get value() {
    return this._value || '';
  }

  set value(val) {
    this._value = val !== undefined && val !== null ? String(val) : '';
  }

  focus() {
    this._focused = true;
  }

  select() {
    this._selected = true;
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

  async dispatchEvent(event) {
    const eventType = typeof event === 'string' ? event : (event.type || 'click');
    const fns = this._listeners[eventType] || [];
    const eventObj = typeof event === 'string'
      ? { type: event, target: this, preventDefault() {}, stopPropagation() {} }
      : { target: this, preventDefault() {}, stopPropagation() {}, ...event };
    if (!eventObj.target) eventObj.target = this;
    for (const fn of fns) {
      await fn(eventObj);
    }
  }

  querySelector(sel) {
    const attrMatch = sel.match(/^([^[]*)\[([a-zA-Z0-9_-]+)=["']?([^"'\]]*)["']?\]$/);
    if (attrMatch) {
      const baseSel = attrMatch[1];
      const attrName = attrMatch[2];
      const attrVal = attrMatch[3];
      return this._find(el => {
        let baseOk = true;
        if (baseSel) {
          if (baseSel.startsWith('#')) baseOk = el.id === baseSel.slice(1);
          else if (baseSel.startsWith('.')) baseOk = el.classList.contains(baseSel.slice(1));
          else baseOk = el.tagName.toLowerCase() === baseSel.toLowerCase();
        }
        if (!baseOk) return false;
        if (attrName.startsWith('data-')) {
          const rawKey = attrName.slice(5);
          const camelKey = rawKey.replace(/-([a-z])/g, (_, l) => l.toUpperCase());
          return el.dataset[camelKey] === attrVal || el.dataset[rawKey] === attrVal;
        }
        return el.getAttribute(attrName) === attrVal;
      });
    }
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

    const valMatch = attrs.match(/value=["']([^"']*)["']/);
    if (valMatch) el.value = valMatch[1];

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

describe('SessionCard UI Component Tests', () => {
  let origWindow;
  let origConfirm;

  beforeEach(() => {
    origWindow = globalThis.window;
    origConfirm = globalThis.confirm;
    globalThis.window = {
      confirm: () => true
    };
  });

  afterEach(() => {
    globalThis.window = origWindow;
    globalThis.confirm = origConfirm;
  });

  test('escapeHtml correctly escapes HTML entities', () => {
    assert.equal(escapeHtml(''), '');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml('<script>alert("XSS") & \'test\'</script>'), '&lt;script&gt;alert(&quot;XSS&quot;) &amp; &#39;test&#39;&lt;/script&gt;');
  });

  test('formatSessionDate returns formatted Spanish string or fallback', () => {
    const ts = new Date(2026, 9, 16, 21, 2).getTime();
    const formatted = formatSessionDate(ts, 'Fallback');
    assert.ok(formatted.includes('16') && formatted.includes('21:02'), `Expected date string, got: ${formatted}`);
    assert.equal(formatSessionDate(null, 'Serie 1'), 'Serie 1');
    assert.equal(formatSessionDate(undefined, 'Fallback'), 'Fallback');
    assert.equal(formatSessionDate('invalid-date', 'Fallback'), 'Fallback');
  });

  test('renderSessionCardHTML starts with exact div and renders tags, count, and escaped HTML', () => {
    const session = [
      { id: 'lap-101', swimmerId: 's1', lapNumber: 1, splitDurationMs: 60000, cumulativeDurationMs: 60000, timestamp: 1700000000000, sessionTag: '<b>Técnica</b>' },
      { id: 'lap-102', swimmerId: 's1', lapNumber: 2, splitDurationMs: 62000, cumulativeDurationMs: 122000, timestamp: 1700000062000 }
    ];

    const html = renderSessionCardHTML(session, { fallbackLabel: 'Serie 1' });

    // Invariant: starts strictly with <div class="drilldown-session-card">
    assert.ok(html.startsWith('<div class="drilldown-session-card">'), 'Must start strictly with <div class="drilldown-session-card">');
    assert.ok(html.includes('2 pases'), 'Must contain "2 pases"');
    assert.ok(html.includes('btn-session-tag'), 'Must contain btn-session-tag');
    assert.ok(html.includes('btn-session-delete'), 'Must contain btn-session-delete');
    assert.ok(html.includes('data-session-key="lap-101"'), 'Must contain data-session-key');
    // Escaped tag
    assert.ok(html.includes('&lt;b&gt;Técnica&lt;/b&gt;'), 'Must escape HTML tags');
    assert.ok(!html.includes('<b>Técnica</b>'), 'Must not contain raw unescaped HTML tag');
    assert.ok(html.includes('<span class="session-tag">'), 'Must render .session-tag span');
  });

  test('renderSessionCardHTML does not render .session-tag when tag is empty', () => {
    const session = [
      { id: 'lap-201', swimmerId: 's1', lapNumber: 1, splitDurationMs: 50000, timestamp: 1700000000000 },
      { id: 'lap-202', swimmerId: 's1', lapNumber: 2, splitDurationMs: 51000, timestamp: 1700000051000 }
    ];

    const html = renderSessionCardHTML(session, { fallbackLabel: 'Serie 2' });
    assert.ok(!html.includes('<span class="session-tag">'), 'Must not render .session-tag when tag is empty');
  });

  test('bindSessionCardActions: delete session button with confirm = true calls onDelete with session', async () => {
    const session = [
      { id: 'lap-301', lapNumber: 1, splitDurationMs: 40000, timestamp: 1700000000000 },
      { id: 'lap-302', lapNumber: 2, splitDurationMs: 42000, timestamp: 1700000042000 }
    ];

    const containerEl = new MockElement('div');
    containerEl.innerHTML = renderSessionCardHTML(session, { fallbackLabel: 'Serie 1' });

    let deleteCalled = false;
    let deletedSession = null;

    globalThis.window.confirm = () => true;

    bindSessionCardActions(containerEl, [session], {
      onDelete: (s) => {
        deleteCalled = true;
        deletedSession = s;
      }
    });

    const deleteBtn = containerEl.querySelector('.btn-session-delete');
    assert.ok(deleteBtn, 'Must find delete button');

    await deleteBtn.dispatchEvent('click');
    assert.equal(deleteCalled, true, 'onDelete must be called');
    assert.equal(deletedSession, session, 'onDelete must receive the session');
  });

  test('bindSessionCardActions: delete session button with confirm = false does not call onDelete', async () => {
    const session = [
      { id: 'lap-401', lapNumber: 1, splitDurationMs: 40000, timestamp: 1700000000000 },
      { id: 'lap-402', lapNumber: 2, splitDurationMs: 42000, timestamp: 1700000042000 }
    ];

    const containerEl = new MockElement('div');
    containerEl.innerHTML = renderSessionCardHTML(session, { fallbackLabel: 'Serie 1' });

    let deleteCalled = false;
    globalThis.window.confirm = () => false;

    bindSessionCardActions(containerEl, [session], {
      onDelete: () => {
        deleteCalled = true;
      }
    });

    const deleteBtn = containerEl.querySelector('.btn-session-delete');
    await deleteBtn.dispatchEvent('click');
    assert.equal(deleteCalled, false, 'onDelete must not be called when confirm is cancelled');
  });

  test('bindSessionCardActions: tag editing inline with Enter calls onTag only once even if followed by blur', async () => {
    const session = [
      { id: 'lap-501', lapNumber: 1, splitDurationMs: 40000, timestamp: 1700000000000, sessionTag: '4x100 libre' },
      { id: 'lap-502', lapNumber: 2, splitDurationMs: 42000, timestamp: 1700000042000 }
    ];

    const containerEl = new MockElement('div');
    containerEl.innerHTML = renderSessionCardHTML(session, { fallbackLabel: 'Serie 1' });

    let tagCalls = 0;
    let taggedSession = null;
    let taggedValue = null;

    bindSessionCardActions(containerEl, [session], {
      onTag: (s, tag) => {
        tagCalls++;
        taggedSession = s;
        taggedValue = tag;
      }
    });

    const tagBtn = containerEl.querySelector('.btn-session-tag');
    assert.ok(tagBtn, 'Must find tag button');

    // Click pencil
    await tagBtn.dispatchEvent('click');

    const input = containerEl.querySelector('.session-tag-input');
    assert.ok(input, 'Must render .session-tag-input after click');
    assert.equal(input.value, '4x100 libre', 'Input must initialize with existing tag');

    // Simulate editing input value to ' 8x50 '
    input.value = ' 8x50 ';

    // Simulate Enter keydown
    await input.dispatchEvent({ type: 'keydown', key: 'Enter' });

    assert.equal(tagCalls, 1, 'onTag must be called once on Enter');
    assert.equal(taggedSession, session, 'onTag must receive session');
    assert.equal(taggedValue, '8x50', 'onTag must receive normalized trimmed value');

    // Simulate blur immediately following Enter
    await input.dispatchEvent({ type: 'blur' });
    assert.equal(tagCalls, 1, 'onTag must not be called a second time on blur');
  });

  test('bindSessionCardActions: Escape cancels editing and restores original HTML without calling onTag', async () => {
    const session = [
      { id: 'lap-601', lapNumber: 1, splitDurationMs: 40000, timestamp: 1700000000000, sessionTag: 'Velocidad' }
    ];

    const containerEl = new MockElement('div');
    containerEl.innerHTML = renderSessionCardHTML(session, { fallbackLabel: 'Serie 1' });

    let tagCalled = false;
    bindSessionCardActions(containerEl, [session], {
      onTag: () => {
        tagCalled = true;
      }
    });

    const tagBtn = containerEl.querySelector('.btn-session-tag');
    await tagBtn.dispatchEvent('click');

    const input = containerEl.querySelector('.session-tag-input');
    assert.ok(input, 'Input rendered');
    input.value = 'Nuevo valor que cancelo';

    // Press Escape
    await input.dispatchEvent({ type: 'keydown', key: 'Escape' });

    assert.equal(tagCalled, false, 'onTag must not be called on Escape');
    assert.equal(containerEl.querySelector('.session-tag-input'), null, 'Input must be removed');
    assert.ok(containerEl.querySelector('.btn-session-tag'), 'Tag button must be restored');
  });
});
