// App Coordinator - SwimCoach Tracker Master Controller
// Initializes storage, rehydrates running timers on hard reload, and manages global stats.

import { repository } from './storage/repository.js';
import { timerEngine, formatTime, TIMER_STATES } from './timing/timer-engine.js';
import { SwimmerCard } from './ui/swimmer-card.js';
import { modalManager } from './ui/modal.js';
import { computeSustainablePace } from './analytics/pace-calculator.js';
import { renderBoxplotSVG } from './ui/boxplot-svg.js';
import { telemetryService } from './telemetry/telemetry.js';
import { partitionLapsIntoSessions } from './analytics/session-partitioner.js';
import { renderSessionCardHTML, bindSessionCardActions, escapeHtml } from './ui/session-card.js';
import { buildSummaryRows, buildDetailRows, rowsToCsv, localDate } from './analytics/csv-export.js';
import { classifyForNewSeries, runNewSeries } from './timing/new-series.js';
import { openNewSeriesDialog, NEW_SERIES_CHOICE } from './ui/new-series-dialog.js';

class AppCoordinator {
  constructor() {
    this.cards = new Map();
    this.gridEl = null;
    this.globalStatsModalEl = null;
    this.telemetryService = telemetryService;

    this.handleMasterStart = this.handleMasterStart.bind(this);
    this.handleMasterStop = this.handleMasterStop.bind(this);
    this.handleNewSeries = this.handleNewSeries.bind(this);
    this.handleSaveSwimmer = this.handleSaveSwimmer.bind(this);
    this.handleDeleteSwimmer = this.handleDeleteSwimmer.bind(this);
    this.showGlobalStats = this.showGlobalStats.bind(this);
    this.closeGlobalStats = this.closeGlobalStats.bind(this);
    this.showSwimmerDrillDown = this.showSwimmerDrillDown.bind(this);
    this.exportCsv = this.exportCsv.bind(this);
    this._escapeHtml = this._escapeHtml.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);
  }

  /**
   * Bootstraps the application
   */
  async init() {
    this.gridEl = document.getElementById('swimmer-grid');
    this.globalStatsModalEl = document.getElementById('global-stats-modal');

    // 1. Initialize IndexedDB storage and timing engine
    await repository.init();
    await timerEngine.init(repository);

    // Initialize telemetry and wire observer
    telemetryService.init();
    timerEngine.onLap((lap) => {
      telemetryService.enqueueLap(lap);
    });

    // 2. Wire up Header & Global Controls
    const btnStartAll = document.getElementById('btn-master-start');
    const btnStopAll = document.getElementById('btn-master-stop');
    const btnAddTrigger = document.getElementById('btn-add-swimmer-trigger');
    const btnHeaderMenu = document.getElementById('btn-header-menu');
    const headerMenuEl = document.getElementById('header-menu');
    const btnNewSeries = document.getElementById('btn-new-series');
    const btnGlobalStats = document.getElementById('btn-global-stats');
    const btnCloseGlobalStats = document.getElementById('global-stats-close-btn');

    if (btnStartAll) btnStartAll.addEventListener('click', this.handleMasterStart);
    if (btnStopAll) btnStopAll.addEventListener('click', this.handleMasterStop);
    if (btnHeaderMenu && headerMenuEl) {
      btnHeaderMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleHeaderMenu();
      });
      if (typeof document.addEventListener === 'function') {
        document.addEventListener('click', (e) => {
          if (!headerMenuEl.hidden && !headerMenuEl.contains(e.target)) this._toggleHeaderMenu(false);
        });
      }
    }
    if (btnNewSeries) {
      btnNewSeries.addEventListener('click', () => {
        this._toggleHeaderMenu(false);
        this.handleNewSeries();
      });
    }
    if (btnAddTrigger) {
      btnAddTrigger.addEventListener('click', () => modalManager.open());
    }

    if (btnGlobalStats) {
      btnGlobalStats.addEventListener('click', this.showGlobalStats);
    }

    if (btnCloseGlobalStats) {
      btnCloseGlobalStats.addEventListener('click', this.closeGlobalStats);
    }

    if (this.globalStatsModalEl) {
      this.globalStatsModalEl.addEventListener('click', (e) => {
        if (e.target === this.globalStatsModalEl) {
          this.closeGlobalStats();
        }
      });
    }

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('keydown', this._handleKeyDown);
    }

    // 3. Initialize swimmer modal controller
    modalManager.init({
      onSave: this.handleSaveSwimmer
    });

    // 4. Load persisted data & rehydrate timers across reload
    await this.loadSwimmers();
  }

  /**
   * Load registered swimmers, timer states, and laps from IndexedDB
   */
  async loadSwimmers() {
    if (!this.gridEl) return;

    // Clear existing cards
    for (const card of this.cards.values()) {
      card.destroy();
    }
    this.cards.clear();
    this.gridEl.innerHTML = '';

    const swimmers = await repository.getSwimmers();
    const timerStates = await repository.getAllTimerStates();
    const timerStateMap = new Map(timerStates.map(s => [s.swimmerId, s]));

    if (swimmers.length === 0) {
      this._renderEmptyState();
      return;
    }

    for (const swimmer of swimmers) {
      const timerState = timerStateMap.get(swimmer.id) || {
        swimmerId: swimmer.id,
        state: TIMER_STATES.IDLE,
        startTime: null,
        lastResumeTime: null,
        accumulatedMs: 0,
        currentLapIndex: 1,
        lastLapCumulativeMs: 0
      };

      const allLaps = await repository.getLaps(swimmer.id);
      const activeLapCount = Math.max(0, (Number(timerState.currentLapIndex) || 1) - 1);
      let laps = [];
      if (timerState.state !== TIMER_STATES.IDLE && activeLapCount > 0) {
        laps = timerState.startTime
          ? allLaps.filter(l => (Number(l.timestamp) || 0) >= timerState.startTime)
          : allLaps.slice(-activeLapCount);
      }
      const existingCard = this.cards.get(swimmer.id);
      const groupId = existingCard ? existingCard.groupId : (Number(swimmer.groupId) || 0);

      const card = new SwimmerCard({
        swimmer,
        timerState,
        laps,
        groupId,
        callbacks: {
          onEdit: (swimmerData) => modalManager.open(swimmerData),
          onDelete: (swimmerId) => this.handleDeleteSwimmer(swimmerId),
          onGroupStart: (gId, sourceSwimmerId) => this.handleGroupStart(gId, sourceSwimmerId),
          onClearLaps: (swimmerId) => {
            console.log(`[App] Vueltas borradas para nadador ${swimmerId}`);
          },
          onTimerChange: (swimmerId, newState) => {
            console.log(`[App] Transición de cronómetro para ${swimmerId}:`, newState.state);
          }
        }
      });

      card.mount(this.gridEl);
      this.cards.set(swimmer.id, card);
    }
  }

  /**
   * Shows aggregated global statistics modal
   */
  async showGlobalStats() {
    if (!this.globalStatsModalEl) return;
    const contentEl = document.getElementById('global-stats-content');
    if (!contentEl) return;

    // 1. Synchronous initial render with in-memory card laps
    const initialLapsMap = new Map();
    for (const card of this.cards.values()) {
      initialLapsMap.set(card.swimmer.id, card.laps || []);
    }
    this._renderGlobalStatsView(initialLapsMap);

    // 2. Asynchronous hydration from IndexedDB
    if (repository && typeof repository.getLaps === 'function') {
      try {
        const entries = await Promise.all(
          [...this.cards.values()].map(async (card) => {
            let dbLaps = [];
            try {
              dbLaps = await repository.getLaps(card.swimmer.id);
            } catch (_) {}
            const cardLapsLength = card.laps ? card.laps.length : 0;
            const effectiveLaps = (Array.isArray(dbLaps) && dbLaps.length >= cardLapsLength)
              ? dbLaps
              : (card.laps || []);
            return [card.swimmer.id, effectiveLaps];
          })
        );

        // Re-render only if modal is still showing the summary view and DOM is present
        if (typeof document !== 'undefined' && !contentEl.querySelector('#btn-drilldown-back')) {
          this._renderGlobalStatsView(new Map(entries));
        }
      } catch (err) {
        console.error('[App] Error hidratando estadísticas globales desde IndexedDB:', err);
      }
    }
  }

  /**
   * Helper to render the global statistics summary table view
   * @param {Map<string, Array<Object>>} lapsBySwimmer
   * @private
   */
  _renderGlobalStatsView(lapsBySwimmer) {
    if (typeof document === 'undefined' || !this.globalStatsModalEl) return;
    const contentEl = document.getElementById('global-stats-content');
    if (!contentEl) return;

    const totalSwimmers = this.cards.size;
    const runningSwimmers = [...this.cards.values()].filter(c => c.timerState.state === TIMER_STATES.RUNNING).length;
    const allLaps = [...lapsBySwimmer.values()].flat();
    const totalLaps = allLaps.length;

    let bestSplitMs = null;
    if (allLaps.length > 0) {
      bestSplitMs = Math.min(...allLaps.map(l => l.splitDurationMs));
    }

    const swimmerRows = [...this.cards.values()].map(card => {
      const swimmer = card.swimmer;
      const laps = lapsBySwimmer.get(swimmer.id) || [];
      const best = laps.length > 0 ? formatTime(Math.min(...laps.map(l => l.splitDurationMs))) : '--';
      let paceStr = '--';
      if (laps.length > 0) {
        const paceData = computeSustainablePace(laps.map(l => l.splitDurationMs / 1000));
        if (paceData.sustainablePace !== null && paceData.sustainablePace !== undefined) {
          paceStr = `${paceData.sustainablePace.toFixed(2)}s`;
        }
      }
      return `
        <tr>
          <td><strong>C${swimmer.lane ?? '-'}</strong></td>
          <td>
            <button type="button" class="swimmer-drilldown-btn" data-swimmer-id="${swimmer.id}">
              ${this._escapeHtml(swimmer.name)}
            </button>
          </td>
          <td>${laps.length}</td>
          <td>${best}</td>
          <td>${paceStr}</td>
        </tr>
      `;
    }).join('');

    contentEl.innerHTML = `
      <div class="stats-summary-grid">
        <div class="metric-box">
          <div class="metric-label">Nadadores</div>
          <div class="metric-value">${totalSwimmers}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">En Curso</div>
          <div class="metric-value">${runningSwimmers}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Total Vueltas</div>
          <div class="metric-value">${totalLaps}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Mejor Pase</div>
          <div class="metric-value">${bestSplitMs !== null ? formatTime(bestSplitMs) : '--'}</div>
        </div>
      </div>

      <div class="stats-actions">
        <button type="button" id="btn-export-csv-summary" class="btn-secondary">CSV resumen (por sesión)</button>
        <button type="button" id="btn-export-csv-detail" class="btn-secondary">CSV detallado (por pase)</button>
      </div>

      <div class="modal-section-title" style="margin-top: var(--space-3);">Resumen por Nadador</div>
      <div class="laps-table-wrapper" style="max-height: 260px;">
        <table class="laps-table">
          <thead>
            <tr>
              <th>Carril</th>
              <th>Nombre</th>
              <th>Vueltas</th>
              <th>Mejor Pase</th>
              <th>Ritmo (Moda)</th>
            </tr>
          </thead>
          <tbody>
            ${swimmerRows.length > 0 ? swimmerRows : '<tr><td colspan="5" style="text-align:center; padding:12px; color:var(--text-muted);">No hay datos registrados aún</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    const btnSummary = document.getElementById('btn-export-csv-summary');
    if (btnSummary) btnSummary.addEventListener('click', () => this.exportCsv('summary'));

    const btnDetail = document.getElementById('btn-export-csv-detail');
    if (btnDetail) btnDetail.addEventListener('click', () => this.exportCsv('detail'));

    const drilldownBtns = contentEl.querySelectorAll('.swimmer-drilldown-btn');
    drilldownBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const swimmerId = btn.dataset.swimmerId;
        if (swimmerId) this.showSwimmerDrillDown(swimmerId);
      });
    });

    this.globalStatsModalEl.classList.add('open');
    if (typeof this.globalStatsModalEl.setAttribute === 'function') {
      this.globalStatsModalEl.setAttribute('aria-hidden', 'false');
    }
  }

  /**
   * Download swimmer profiles and recorded laps as a CSV file.
   * @param {'summary'|'detail'} [mode='summary']
   */
  async exportCsv(mode = 'summary') {
    const entries = [];
    for (const card of this.cards.values()) {
      const swimmer = card.swimmer;
      const persistedLaps = (repository && typeof repository.getLaps === 'function')
        ? await repository.getLaps(swimmer.id)
        : [];
      const laps = persistedLaps.length >= card.laps.length ? persistedLaps : card.laps;
      entries.push({ swimmer, laps });
    }

    const rows = mode === 'detail' ? buildDetailRows(entries) : buildSummaryRows(entries);
    const csv = rowsToCsv(rows);

    if (typeof document !== 'undefined' && typeof document.createElement === 'function' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `swimcoach-${mode === 'detail' ? 'detalle' : 'resumen'}-${localDate(Date.now())}.csv`;
      link.style.display = 'none';
      if (document.body && typeof document.body.appendChild === 'function') {
        document.body.appendChild(link);
        if (typeof link.click === 'function') link.click();
        if (typeof link.remove === 'function') link.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return csv;
  }

  /**
   * Closes global statistics modal
   */
  closeGlobalStats() {
    if (!this.globalStatsModalEl) return;
    this.globalStatsModalEl.classList.remove('open');
    if (typeof this.globalStatsModalEl.setAttribute === 'function') {
      this.globalStatsModalEl.setAttribute('aria-hidden', 'true');
    }
  }

  _handleKeyDown(e) {
    if (e.key === 'Escape') this._toggleHeaderMenu(false);
    if (e.key === 'Escape' && this.globalStatsModalEl && this.globalStatsModalEl.classList.contains('open')) {
      this.closeGlobalStats();
    }
  }

  /**
   * Escape special HTML characters to prevent XSS
   * @param {string} str
   * @returns {string}
   */
  _escapeHtml(str) {
    return escapeHtml(str);
  }

  /**
   * Shows detailed historical drill-down for an individual swimmer
   * @param {string} swimmerId
   */
  async showSwimmerDrillDown(swimmerId) {
    if (!this.globalStatsModalEl) return;
    const contentEl = document.getElementById('global-stats-content');
    if (!contentEl) return;

    let swimmer = this.cards.get(swimmerId)?.swimmer;
    if (!swimmer && repository && typeof repository.getSwimmer === 'function') {
      try {
        swimmer = await repository.getSwimmer(swimmerId);
      } catch (_) {}
    }

    let allLaps = [];
    if (repository && typeof repository.getLaps === 'function') {
      try {
        allLaps = await repository.getLaps(swimmerId);
      } catch (_) {}
    }
    if ((!allLaps || allLaps.length === 0) && this.cards.has(swimmerId)) {
      allLaps = this.cards.get(swimmerId).laps || [];
    }

    // Accumulators for current month and current year
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();

    const monthLaps = allLaps.filter(l => {
      if (!l.timestamp) return false;
      const d = new Date(l.timestamp);
      return !isNaN(d.getTime()) && d.getFullYear() === curYear && d.getMonth() === curMonth;
    });

    const yearLaps = allLaps.filter(l => {
      if (!l.timestamp) return false;
      const d = new Date(l.timestamp);
      return !isNaN(d.getTime()) && d.getFullYear() === curYear;
    });

    // Partition laps into training sessions
    const sessions = partitionLapsIntoSessions(allLaps);
    const recentSessions = sessions.slice(-20).reverse();

    let sessionsHTML = '';
    if (recentSessions.length > 0) {
      let globalMin = Infinity;
      let globalMax = -Infinity;
      for (const session of recentSessions) {
        for (const lap of session) {
          const sec = lap.splitDurationMs / 1000;
          if (sec < globalMin) globalMin = sec;
          if (sec > globalMax) globalMax = sec;
        }
      }
      if (globalMin === Infinity) {
        globalMin = 0;
        globalMax = 0;
      }

      const baselineVal = swimmer?.baseline100mSeconds ? Number(swimmer.baseline100mSeconds) : undefined;
      sessionsHTML = recentSessions.map((session, sIdx) => {
        return renderSessionCardHTML(session, {
          fallbackLabel: `Sesión ${sessions.length - sIdx}`,
          baseline: baselineVal,
          globalMin,
          globalMax
        });
      }).join('');
    } else {
      sessionsHTML = `
        <div class="empty-state-notice" style="text-align:center; padding: 24px; color: var(--text-muted); font-size: var(--font-sm);">
          Sin sesiones de entrenamiento registradas aún para este nadador.
        </div>
      `;
    }

    const swimmerName = swimmer ? this._escapeHtml(swimmer.name) : 'Nadador';
    const swimmerLane = swimmer?.lane != null ? `C${swimmer.lane}` : 'C-';
    const baselineText = swimmer?.baseline100mSeconds
      ? `${Number(swimmer.baseline100mSeconds).toFixed(1)}s`
      : 'Sin configurar';

    contentEl.innerHTML = `
      <div class="drilldown-nav">
        <button type="button" id="btn-drilldown-back" class="btn-secondary btn-drilldown-back">
          ← Volver a Estadísticas Globales
        </button>
      </div>

      <div class="drilldown-header">
        <div class="drilldown-swimmer-name">
          <span class="card-lane-badge">${swimmerLane}</span>
          <span>${swimmerName}</span>
        </div>
        <div style="font-size: var(--font-xs); color: var(--text-muted);">
          Tiempo base 100m: <strong>${baselineText}</strong>
        </div>
      </div>

      <div class="modal-section-title">Acumulados de Rendimiento</div>
      <div class="stats-summary-grid">
        <div class="metric-box">
          <div class="metric-label">Pases Este Mes</div>
          <div class="metric-value">${monthLaps.length}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Pases Este Año</div>
          <div class="metric-value">${yearLaps.length}</div>
        </div>
      </div>

      <div class="modal-section-title" style="margin-top: var(--space-3);">Historial de Sesiones de Entrenamiento</div>
      <div class="drilldown-sessions-stack">
        ${sessionsHTML}
      </div>
    `;

    bindSessionCardActions(contentEl, recentSessions, {
      onTag: async (session, tag) => {
        await repository.updateLapsTag(session.map(l => l.id), tag);
        await this.showSwimmerDrillDown(swimmerId);
      },
      onDelete: async (session) => {
        const ids = session.map(l => l.id);
        await repository.deleteLaps(ids);
        const card = this.cards.get(swimmerId);
        if (card) await card.handleSessionDeleted(ids);
        await this.showSwimmerDrillDown(swimmerId);
      }
    });

    const backBtn = contentEl.querySelector('#btn-drilldown-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.showGlobalStats());
    }

    this.globalStatsModalEl.classList.add('open');
    if (typeof this.globalStatsModalEl.setAttribute === 'function') {
      this.globalStatsModalEl.setAttribute('aria-hidden', 'false');
    }
  }

  /**
   * Multi-Group Heats: Concurrently starts (via Promise.all) all IDLE or STOPPED cards with matching groupId
   * @param {number} groupId
   * @param {string} [sourceSwimmerId]
   */
  async handleGroupStart(groupId, sourceSwimmerId) {
    if (!groupId) return;
    const targetCards = [];
    for (const card of this.cards.values()) {
      if (card.groupId === groupId &&
          (card.timerState.state === TIMER_STATES.IDLE || card.timerState.state === TIMER_STATES.STOPPED)) {
        targetCards.push(card);
      }
    }
    await Promise.all(targetCards.map(c => c.handleStart({ isGroupTriggered: true })));
  }

  /**
   * Master Control: Start all timers simultaneously
   */
  async handleMasterStart() {
    const promises = [];
    for (const card of this.cards.values()) {
      if (card.timerState.state === TIMER_STATES.IDLE || card.timerState.state === TIMER_STATES.STOPPED) {
        promises.push(card.handleStart({ isGroupTriggered: true }));
      } else if (card.timerState.state === TIMER_STATES.PAUSED) {
        promises.push(card.handleResume());
      }
    }
    await Promise.all(promises);
  }

  /**
   * Master Control: Stop all running or paused timers
   */
  async handleMasterStop() {
    const promises = [];
    for (const card of this.cards.values()) {
      if (card.timerState.state === TIMER_STATES.RUNNING || card.timerState.state === TIMER_STATES.PAUSED) {
        promises.push(card.handleStop());
      }
    }
    await Promise.all(promises);
  }

  /**
   * Nueva serie: limpia los tableros (timers a 00:00.00) previa confirmación.
   * Los cronómetros en curso solo se tocan si el usuario lo elige explícitamente,
   * y en ese caso se guarda su tramo pendiente antes de limpiar. Nunca borra pases guardados.
   */
  async handleNewSeries() {
    const { finished, inProgress } = classifyForNewSeries(this.cards.values());
    const choice = await openNewSeriesDialog({
      finishedCount: finished.length,
      inProgressNames: inProgress.map(c => c.swimmer?.name || 'Sin nombre')
    });
    if (choice === NEW_SERIES_CHOICE.CANCEL) return;
    await runNewSeries(this.cards.values(), { includeInProgress: choice === NEW_SERIES_CHOICE.ALL });
  }

  _toggleHeaderMenu(forceOpen) {
    if (typeof document === 'undefined' || typeof document.getElementById !== 'function') return;
    const menu = document.getElementById('header-menu');
    const trigger = document.getElementById('btn-header-menu');
    if (!menu || !trigger) return;
    const open = typeof forceOpen === 'boolean' ? forceOpen : menu.hidden;
    menu.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
  }

  /**
   * Save (create or update) swimmer profile
   * @param {Object} swimmerData
   */
  async handleSaveSwimmer(swimmerData) {
    const isNew = !swimmerData.id;
    if (!isNew) {
      const existing = await repository.getSwimmer(swimmerData.id);
      if (existing) {
        swimmerData = { ...existing, ...swimmerData };
      }
    }
    await repository.saveSwimmer(swimmerData);

    if (isNew) {
      // Initialize IDLE timer state for new swimmer
      await timerEngine.reset(swimmerData.id);
    }

    // Refresh swimmer grid
    await this.loadSwimmers();
  }

  /**
   * Delete swimmer profile and cascade remove timer & laps
   * @param {string} swimmerId
   */
  async handleDeleteSwimmer(swimmerId) {
    await repository.deleteSwimmer(swimmerId);
    const card = this.cards.get(swimmerId);
    if (card) card.destroy();
    this.cards.delete(swimmerId);
    if (this.cards.size === 0) {
      this._renderEmptyState();
    }
  }

  _renderEmptyState() {
    if (!this.gridEl) return;
    this.gridEl.innerHTML = `
      <div class="empty-state">
        <h2 class="empty-state-title">No hay nadadores en la serie</h2>
        <p style="margin-bottom: var(--space-4);">Añade nadadores para comenzar a registrar tiempos de vuelta y ritmos sostenibles.</p>
        <button id="btn-empty-add" class="btn-master btn-start-all" style="display:inline-flex;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Añadir Primer Nadador
        </button>
      </div>
    `;

    const addBtn = document.getElementById('btn-empty-add');
    if (addBtn) {
      addBtn.addEventListener('click', () => modalManager.open());
    }
  }
}

// Automatically bootstrap when DOM is ready
export const app = new AppCoordinator();
export { telemetryService };

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }
}

export default app;
