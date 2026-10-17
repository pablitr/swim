// Session Card UI Component - SwimCoach Tracker
// Shared renderer and action binder for training session cards in Global Stats and Metrics Modal.

import { getSessionTag, getSessionKey, normalizeSessionTag } from '../analytics/session-partitioner.js';
import { computeSustainablePace } from '../analytics/pace-calculator.js';
import { renderBoxplotSVG } from './boxplot-svg.js';
import { formatTime } from '../timing/timer-engine.js';

/**
 * Escape special HTML characters to prevent XSS.
 * Exact match of AppCoordinator._escapeHtml.
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Formats a session timestamp into Spanish locale date string or returns fallback.
 * @param {number|string|Date} timestamp
 * @param {string} fallback
 * @returns {string}
 */
export function formatSessionDate(timestamp, fallback = '') {
  if (timestamp != null) {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }
  return fallback;
}

/**
 * Renders the session metadata header HTML: date + tag + pencil | N pases + trash.
 * @param {Array<Object>} session
 * @param {{ fallbackLabel?: string }} options
 * @returns {string}
 */
export function renderSessionMetaHTML(session, { fallbackLabel } = {}) {
  const n = Array.isArray(session) ? session.length : 0;
  const key = getSessionKey(session);
  const tag = getSessionTag(session);
  const dateLabel = formatSessionDate(session?.[0]?.timestamp, fallbackLabel !== undefined ? fallbackLabel : 'Sesión');

  return `<div class="drilldown-session-meta">
  <div class="session-title" data-session-key="${escapeHtml(key)}">
    <strong>${escapeHtml(dateLabel)}</strong>
    ${tag ? `<span class="session-tag">${escapeHtml(tag)}</span>` : ''}
    <button type="button" class="btn-icon btn-session-tag" data-session-key="${escapeHtml(key)}" aria-label="Etiquetar sesión" title="Etiquetar sesión"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
  </div>
  <div class="session-meta-right">
    <span>${n} ${n === 1 ? 'pase' : 'pases'}</span>
    <button type="button" class="btn-icon btn-session-delete" data-session-key="${escapeHtml(key)}" aria-label="Borrar sesión" title="Borrar sesión"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
  </div>
</div>`;
}

/**
 * Renders a complete session card HTML with metadata, stats and boxplot SVG.
 * Note: opening tag is strictly <div class="drilldown-session-card"> without extra attributes.
 * @param {Array<Object>} session
 * @param {{ fallbackLabel?: string, baseline?: number, globalMin?: number, globalMax?: number }} options
 * @returns {string}
 */
export function renderSessionCardHTML(session, { fallbackLabel, baseline, globalMin, globalMax } = {}) {
  const splitsSeconds = (session || []).map(l => (l.splitDurationMs || 0) / 1000);
  const bestSplitMs = (session && session.length > 0)
    ? Math.min(...session.map(l => l.splitDurationMs || 0))
    : 0;
  const paceData = computeSustainablePace(splitsSeconds);
  const paceStr = (paceData && paceData.sustainablePace != null)
    ? `${paceData.sustainablePace.toFixed(2)}s`
    : '--';

  const baselineVal = baseline != null ? Number(baseline) : undefined;
  const boxplotMarkup = renderBoxplotSVG(splitsSeconds, {
    baseline: baselineVal,
    width: 440,
    height: 75,
    globalMin,
    globalMax
  });

  return `<div class="drilldown-session-card">
  ${renderSessionMetaHTML(session, { fallbackLabel })}
  <div class="drilldown-session-stats">
    <span>Mejor: <strong>${formatTime(bestSplitMs)}</strong></span>
    <span>Ritmo: <strong>${paceStr}</strong></span>
  </div>
  <div class="drilldown-session-chart">
    ${boxplotMarkup}
  </div>
</div>`;
}

/**
 * Binds tag editing and deletion interactions to session cards within a container element.
 * @param {Element} containerEl
 * @param {Array<Array<Object>>} sessions
 * @param {{ onTag?: (session: Array<Object>, tag: string) => Promise<void>|void, onDelete?: (session: Array<Object>) => Promise<void>|void }} handlers
 */
export function bindSessionCardActions(containerEl, sessions, { onTag, onDelete } = {}) {
  if (!containerEl) return;

  const sessionMap = new Map();
  for (const s of (sessions || [])) {
    const k = getSessionKey(s);
    if (k) sessionMap.set(k, s);
  }

  function findTitleEl(key) {
    let el = null;
    try {
      el = containerEl.querySelector(`.session-title[data-session-key="${key}"]`);
    } catch (_) {}
    if (!el && containerEl.querySelectorAll) {
      const titles = Array.from(containerEl.querySelectorAll('.session-title'));
      el = titles.find(t => {
        const k = t.dataset?.sessionKey || t.dataset?.['session-key'] || t.getAttribute?.('data-session-key');
        return k === key;
      }) || null;
    }
    return el;
  }

  function attachTagBtnListener(btn) {
    btn.addEventListener('click', (e) => {
      if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
      }
      const key = btn.dataset?.sessionKey || btn.dataset?.['session-key'] || btn.getAttribute?.('data-session-key') || '';
      const session = sessionMap.get(key);
      if (!session) return;

      const titleEl = findTitleEl(key);
      if (!titleEl) return;

      const originalHTML = titleEl.innerHTML;
      const currentTag = getSessionTag(session);
      titleEl.innerHTML = `<input type="text" class="session-tag-input" maxlength="60" placeholder="Ej: 4x100 libre, técnica brazada" value="${escapeHtml(currentTag)}">`;

      const input = titleEl.querySelector('.session-tag-input');
      if (!input) return;

      if (typeof input.focus === 'function') input.focus();
      if (typeof input.select === 'function') input.select();

      let done = false;
      const commit = async () => {
        if (done) return;
        done = true;
        const newTag = normalizeSessionTag(input.value);
        if (typeof onTag === 'function') {
          await onTag(session, newTag);
        }
      };

      const cancel = () => {
        if (done) return;
        done = true;
        titleEl.innerHTML = originalHTML;
        const restoredBtn = titleEl.querySelector('.btn-session-tag');
        if (restoredBtn) {
          attachTagBtnListener(restoredBtn);
        }
      };

      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          await commit();
        } else if (e.key === 'Escape') {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          cancel();
        }
      });

      input.addEventListener('blur', async () => {
        await commit();
      });
    });
  }

  const tagBtns = containerEl.querySelectorAll('.btn-session-tag');
  tagBtns.forEach(btn => attachTagBtnListener(btn));

  const deleteBtns = containerEl.querySelectorAll('.btn-session-delete');
  deleteBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (e) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
      }
      const key = btn.dataset?.sessionKey || btn.dataset?.['session-key'] || btn.getAttribute?.('data-session-key') || '';
      const session = sessionMap.get(key);
      if (!session) return;

      const n = session.length;
      const dateLabel = formatSessionDate(session[0]?.timestamp, 'Sesión');
      const countLabel = `${n} ${n === 1 ? 'pase' : 'pases'}`;
      const msg = `¿Borrar la sesión del ${dateLabel} (${countLabel})? Esta acción no se puede deshacer.`;

      const confirmed = (typeof window !== 'undefined' && typeof window.confirm === 'function')
        ? window.confirm(msg)
        : (typeof globalThis !== 'undefined' && typeof globalThis.confirm === 'function')
          ? globalThis.confirm(msg)
          : true;

      if (!confirmed) return;
      if (typeof onDelete === 'function') {
        await onDelete(session);
      }
    });
  });
}
