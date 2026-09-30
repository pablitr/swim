// App Coordinator - SwimCoach Tracker Master Controller
// Initializes storage, rehydrates running timers on hard reload, and manages global stats.

import { repository } from './storage/repository.js';
import { timerEngine, formatTime, TIMER_STATES } from './timing/timer-engine.js';
import { SwimmerCard } from './ui/swimmer-card.js';
import { modalManager } from './ui/modal.js';
import { computeSustainablePace } from './analytics/pace-calculator.js';

const TIMER_STATE_LABELS_ES = {
  [TIMER_STATES.IDLE]: 'Listo',
  [TIMER_STATES.RUNNING]: 'En curso',
  [TIMER_STATES.PAUSED]: 'Pausado',
  [TIMER_STATES.STOPPED]: 'Detenido'
};

class AppCoordinator {
  constructor() {
    this.cards = new Map();
    this.gridEl = null;
    this.globalStatsModalEl = null;

    this.handleMasterStart = this.handleMasterStart.bind(this);
    this.handleMasterStop = this.handleMasterStop.bind(this);
    this.handleMasterReset = this.handleMasterReset.bind(this);
    this.handleSaveSwimmer = this.handleSaveSwimmer.bind(this);
    this.handleDeleteSwimmer = this.handleDeleteSwimmer.bind(this);
    this.showGlobalStats = this.showGlobalStats.bind(this);
    this.closeGlobalStats = this.closeGlobalStats.bind(this);
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

    // 2. Wire up Header & Global Controls
    const btnStartAll = document.getElementById('btn-master-start');
    const btnStopAll = document.getElementById('btn-master-stop');
    const btnResetAll = document.getElementById('btn-master-reset');
    const btnAddTrigger = document.getElementById('btn-add-swimmer-trigger');
    const btnGlobalStats = document.getElementById('btn-global-stats');
    const btnCloseGlobalStats = document.getElementById('global-stats-close-btn');

    if (btnStartAll) btnStartAll.addEventListener('click', this.handleMasterStart);
    if (btnStopAll) btnStopAll.addEventListener('click', this.handleMasterStop);
    if (btnResetAll) btnResetAll.addEventListener('click', this.handleMasterReset);
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

      const laps = await repository.getLaps(swimmer.id);

      const card = new SwimmerCard({
        swimmer,
        timerState,
        laps,
        callbacks: {
          onEdit: (swimmerData) => modalManager.open(swimmerData),
          onDelete: (swimmerId) => this.handleDeleteSwimmer(swimmerId),
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
  showGlobalStats() {
    if (!this.globalStatsModalEl) return;
    const contentEl = document.getElementById('global-stats-content');
    if (!contentEl) return;

    const totalSwimmers = this.cards.size;
    const runningSwimmers = [...this.cards.values()].filter(c => c.timerState.state === TIMER_STATES.RUNNING).length;
    const allLaps = [...this.cards.values()].flatMap(c => c.laps);
    const totalLaps = allLaps.length;

    let bestSplitMs = null;
    if (allLaps.length > 0) {
      bestSplitMs = Math.min(...allLaps.map(l => l.splitDurationMs));
    }

    const swimmerRows = [...this.cards.values()].map(card => {
      const swimmer = card.swimmer;
      const laps = card.laps;
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
          <td>${card._escapeHtml(swimmer.name)}</td>
          <td><span class="status-indicator">${TIMER_STATE_LABELS_ES[card.timerState.state] || card.timerState.state}</span></td>
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
        <button type="button" id="btn-export-csv" class="btn-secondary">Descargar CSV de la serie</button>
      </div>

      <div class="modal-section-title" style="margin-top: var(--space-3);">Resumen por Nadador</div>
      <div class="laps-table-wrapper" style="max-height: 260px;">
        <table class="laps-table">
          <thead>
            <tr>
              <th>Carril</th>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Vueltas</th>
              <th>Mejor Pase</th>
              <th>Ritmo (Moda)</th>
            </tr>
          </thead>
          <tbody>
            ${swimmerRows.length > 0 ? swimmerRows : '<tr><td colspan="6" style="text-align:center; padding:12px; color:var(--text-muted);">No hay datos registrados aún</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    const exportButton = document.getElementById('btn-export-csv');
    if (exportButton) exportButton.addEventListener('click', () => this.exportCsv());

    this.globalStatsModalEl.classList.add('open');
    if (typeof this.globalStatsModalEl.setAttribute === 'function') {
      this.globalStatsModalEl.setAttribute('aria-hidden', 'false');
    }
  }

  /** Download swimmer profiles, current timer state, and recorded laps as a CSV file. */
  exportCsv() {
    const rows = [[
      'ID Nadador', 'Nadador', 'Carril', 'Base 100 m (s)', 'Estado',
      'Tiempo actual', 'Tiempo actual (ms)', 'Pase', 'Parcial (ms)',
      'Acumulado (ms)', 'Fecha del pase'
    ]];

    for (const card of this.cards.values()) {
      const swimmer = card.swimmer;
      const timer = card.timerState;
      const elapsedMs = timerEngine.getElapsedMs(timer);
      const profileAndTimer = [
        swimmer.id,
        swimmer.name,
        swimmer.lane ?? '',
        swimmer.baseline100mSeconds ?? swimmer.baseline100m ?? '',
        TIMER_STATE_LABELS_ES[timer.state] || timer.state,
        formatTime(elapsedMs),
        Math.round(elapsedMs)
      ];

      if (card.laps.length === 0) {
        rows.push([...profileAndTimer, '', '', '', '']);
        continue;
      }

      for (const lap of card.laps) {
        const timestamp = lap.timestamp ? new Date(lap.timestamp).toISOString() : '';
        rows.push([
          ...profileAndTimer,
          lap.lapNumber,
          lap.splitDurationMs,
          lap.cumulativeDurationMs,
          timestamp
        ]);
      }
    }

    const csvEscape = (value) => {
      let cell = String(value ?? '');
      if (/^[=+@-]/.test(cell)) cell = `'${cell}`;
      return `"${cell.replace(/"/g, '""')}"`;
    };
    const csv = `\uFEFF${rows.map(row => row.map(csvEscape).join(';')).join('\r\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `swimcoach-dataset-${new Date().toISOString().slice(0, 10)}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    if (e.key === 'Escape' && this.globalStatsModalEl && this.globalStatsModalEl.classList.contains('open')) {
      this.closeGlobalStats();
    }
  }

  /**
   * Master Control: Start all timers simultaneously
   */
  async handleMasterStart() {
    const promises = [];
    for (const card of this.cards.values()) {
      if (card.timerState.state === TIMER_STATES.IDLE || card.timerState.state === TIMER_STATES.STOPPED) {
        promises.push(card.handleStart());
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
   * Master Control: Reset all timers to 00:00.00
   */
  async handleMasterReset() {
    if (this.cards.size === 0) return;
    const confirmed = confirm('¿Reiniciar todos los cronómetros de esta serie a cero?');
    if (!confirmed) return;

    const promises = [];
    for (const card of this.cards.values()) {
      promises.push(card.handleReset());
    }
    await Promise.all(promises);
  }

  /**
   * Save (create or update) swimmer profile
   * @param {Object} swimmerData
   */
  async handleSaveSwimmer(swimmerData) {
    const isNew = !swimmerData.id;
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

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }
}

export default app;
