// SwimmerCard - High-Contrast Multi-Swimmer Stopwatch UI Component
// Features large poolside touch targets, 300ms lap debounce, real-time ticker integration, and M3 analytics hook.

import { timerEngine, formatTime, TIMER_STATES } from '../timing/timer-engine.js';
import { ticker } from '../timing/ticker.js';
import { repository } from '../storage/repository.js';
import { computeSustainablePace } from '../analytics/pace-calculator.js';
import { calculateTrainingZones } from '../analytics/zones.js';
import { renderBoxplot } from './boxplot-svg.js';

export class SwimmerCard {
  /**
   * @param {Object} options
   * @param {Object} options.swimmer - Swimmer profile { id, name, lane, baseline100mSeconds }
   * @param {Object} [options.timerState] - Initial timer state
   * @param {Array<Object>} [options.laps] - Initial recorded laps
   * @param {Object} [options.callbacks] - Callbacks { onEdit, onDelete, onClearLaps, onTimerChange }
   */
  constructor({ swimmer, timerState, laps = [], callbacks = {} }) {
    this.swimmer = swimmer;
    this.timerState = timerState || {
      swimmerId: swimmer.id,
      state: TIMER_STATES.IDLE,
      startTime: null,
      lastResumeTime: null,
      accumulatedMs: 0,
      currentLapIndex: 1,
      lastLapCumulativeMs: 0
    };
    this.laps = [...laps];
    this.callbacks = callbacks;
    this.lastLapTapTime = 0;
    this.element = null;

    this.render = this.render.bind(this);
    this.updateTimeDisplay = this.updateTimeDisplay.bind(this);
    this.handleStart = this.handleStart.bind(this);
    this.handlePause = this.handlePause.bind(this);
    this.handleResume = this.handleResume.bind(this);
    this.handleStop = this.handleStop.bind(this);
    this.handleReset = this.handleReset.bind(this);
    this.handleLap = this.handleLap.bind(this);
  }

  /**
   * Build card DOM element
   * @returns {HTMLElement}
   */
  render() {
    const card = document.createElement('div');
    card.className = `swimmer-card ${this._getCardStateClass()}`;
    card.id = `card-${this.swimmer.id}`;
    card.dataset.swimmerId = this.swimmer.id;

    // Calculate baseline zones if available
    const baseline = Number(this.swimmer.baseline100mSeconds);
    const hasBaseline = !isNaN(baseline) && baseline > 0 && Number.isFinite(baseline);
    let zone75 = null;
    let zone80 = null;
    let zone90 = null;
    if (hasBaseline) {
      try {
        const zones = calculateTrainingZones(baseline);
        zone75 = zones.zone75.toFixed(1);
        zone80 = zones.zone80.toFixed(1);
        zone90 = zones.zone90.toFixed(1);
      } catch {
        zone75 = null;
        zone80 = null;
        zone90 = null;
      }
    }

    card.innerHTML = `
      <div class="card-header">
        <div class="swimmer-meta">
          <span class="lane-tag">Lane ${this.swimmer.lane ?? '-'}</span>
          <h3 class="swimmer-name" title="${this._escapeHtml(this.swimmer.name)}">${this._escapeHtml(this.swimmer.name)}</h3>
        </div>
        <div class="card-menu">
          <button class="btn-icon btn-edit-swimmer" title="Edit swimmer" aria-label="Edit swimmer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"/>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
            </svg>
          </button>
          <button class="btn-icon btn-delete-swimmer" title="Delete swimmer" aria-label="Delete swimmer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="zones-preview">
        ${hasBaseline && zone75 && zone80 && zone90 ? `
          <span class="zone-item"><span class="zone-label">Base:</span> <span class="zone-val">${baseline.toFixed(1)}s</span></span>
          <span class="zone-item"><span class="zone-label">75%:</span> <span class="zone-val">${zone75}s</span></span>
          <span class="zone-item"><span class="zone-label">80%:</span> <span class="zone-val">${zone80}s</span></span>
          <span class="zone-item"><span class="zone-label">90%:</span> <span class="zone-val">${zone90}s</span></span>
        ` : `
          <span style="color: var(--text-muted); font-size: var(--font-xs);">No baseline 100m set (edit to add)</span>
        `}
      </div>

      <div class="stopwatch-display-wrapper">
        <div class="stopwatch-time" id="time-${this.swimmer.id}">00:00.00</div>
        <div class="stopwatch-status-tag" id="status-${this.swimmer.id}">${this.timerState.state}</div>
      </div>

      <div class="quick-metrics">
        <div class="metric-box">
          <div class="metric-label">Laps</div>
          <div class="metric-value" id="metric-laps-${this.swimmer.id}">${this.laps.length}</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Last Split</div>
          <div class="metric-value" id="metric-last-${this.swimmer.id}">--</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Best Split</div>
          <div class="metric-value" id="metric-best-${this.swimmer.id}">--</div>
        </div>
        <div class="metric-box">
          <div class="metric-label">Pace (Mode)</div>
          <div class="metric-value" id="metric-pace-${this.swimmer.id}">--</div>
        </div>
      </div>

      <div class="card-controls">
        <button class="btn-touch btn-touch-start btn-main-action" id="btn-main-${this.swimmer.id}"></button>
        <button class="btn-touch btn-touch-lap" id="btn-lap-${this.swimmer.id}">Lap (Pase)</button>
      </div>

      <div class="card-secondary-controls">
        <button class="btn-secondary btn-secondary-stop" id="btn-stop-${this.swimmer.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <rect x="5" y="5" width="14" height="14" rx="2"/>
          </svg>
          Stop
        </button>
        <button class="btn-secondary btn-secondary-reset" id="btn-reset-${this.swimmer.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          Reset
        </button>
        <button class="btn-secondary btn-secondary-clear" id="btn-clear-${this.swimmer.id}">
          Clear Laps
        </button>
      </div>

      <div class="card-details-panel">
        <div class="laps-table-wrapper">
          <table class="laps-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Split</th>
                <th>Cumulative</th>
              </tr>
            </thead>
            <tbody id="laps-body-${this.swimmer.id}"></tbody>
          </table>
        </div>
        <div class="boxplot-wrapper" id="boxplot-${this.swimmer.id}">
          <span style="color: var(--text-muted); font-size: 11px;">Analytics & Boxplot</span>
        </div>
      </div>
    `;

    this.element = card;
    this._bindEvents();
    this.updateUI();

    // If already running on mount (e.g. reload recovery), register with ticker immediately
    if (this.timerState.state === TIMER_STATES.RUNNING) {
      ticker.subscribe(`swimmer-${this.swimmer.id}`, this.updateTimeDisplay);
    }

    return card;
  }

  /**
   * Bind card event listeners
   * @private
   */
  _bindEvents() {
    const mainBtn = this.element.querySelector(`#btn-main-${this.swimmer.id}`);
    const lapBtn = this.element.querySelector(`#btn-lap-${this.swimmer.id}`);
    const stopBtn = this.element.querySelector(`#btn-stop-${this.swimmer.id}`);
    const resetBtn = this.element.querySelector(`#btn-reset-${this.swimmer.id}`);
    const clearBtn = this.element.querySelector(`#btn-clear-${this.swimmer.id}`);
    const editBtn = this.element.querySelector('.btn-edit-swimmer');
    const deleteBtn = this.element.querySelector('.btn-delete-swimmer');

    // Main action button click (Start / Pause / Resume)
    mainBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (this.timerState.state === TIMER_STATES.IDLE || this.timerState.state === TIMER_STATES.STOPPED) {
        await this.handleStart();
      } else if (this.timerState.state === TIMER_STATES.RUNNING) {
        await this.handlePause();
      } else if (this.timerState.state === TIMER_STATES.PAUSED) {
        await this.handleResume();
      }
    });

    // Lap button with 300ms debounce
    lapBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const now = Date.now();
      if (now - this.lastLapTapTime < 300) {
        return; // 300ms debounce
      }
      this.lastLapTapTime = now;
      await this.handleLap();
    });

    // Secondary controls
    stopBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await this.handleStop();
    });

    resetBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await this.handleReset();
    });

    clearBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (confirm(`Clear all laps for ${this.swimmer.name}?`)) {
        await repository.clearLaps(this.swimmer.id);
        this.laps = [];
        this.updateLapsTable();
        this.updateMetrics();
        this.updateBoxplot();
        if (this.callbacks.onClearLaps) {
          this.callbacks.onClearLaps(this.swimmer.id);
        }
      }
    });

    // Menu edit & delete
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.callbacks.onEdit) {
          this.callbacks.onEdit(this.swimmer);
        }
      });
    }

    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm(`Delete swimmer "${this.swimmer.name}" and all timing data?`)) {
          this.destroy();
          if (this.callbacks.onDelete) {
            this.callbacks.onDelete(this.swimmer.id);
          }
        }
      });
    }
  }

  /**
   * Action handlers
   */
  async handleStart() {
    this.timerState = await timerEngine.start(this.swimmer.id);
    ticker.subscribe(`swimmer-${this.swimmer.id}`, this.updateTimeDisplay);
    this.updateUI();
    if (this.callbacks.onTimerChange) this.callbacks.onTimerChange(this.swimmer.id, this.timerState);
  }

  async handlePause() {
    this.timerState = await timerEngine.pause(this.swimmer.id);
    ticker.unsubscribe(`swimmer-${this.swimmer.id}`);
    this.updateUI();
    if (this.callbacks.onTimerChange) this.callbacks.onTimerChange(this.swimmer.id, this.timerState);
  }

  async handleResume() {
    this.timerState = await timerEngine.resume(this.swimmer.id);
    ticker.subscribe(`swimmer-${this.swimmer.id}`, this.updateTimeDisplay);
    this.updateUI();
    if (this.callbacks.onTimerChange) this.callbacks.onTimerChange(this.swimmer.id, this.timerState);
  }

  async handleStop() {
    this.timerState = await timerEngine.stop(this.swimmer.id);
    ticker.unsubscribe(`swimmer-${this.swimmer.id}`);
    this.updateUI();
    if (this.callbacks.onTimerChange) this.callbacks.onTimerChange(this.swimmer.id, this.timerState);
  }

  async handleReset() {
    this.timerState = await timerEngine.reset(this.swimmer.id);
    ticker.unsubscribe(`swimmer-${this.swimmer.id}`);
    this.updateUI();
    if (this.callbacks.onTimerChange) this.callbacks.onTimerChange(this.swimmer.id, this.timerState);
  }

  async handleLap() {
    if (this.timerState.state !== TIMER_STATES.RUNNING) return;
    try {
      const { lap, state } = await timerEngine.recordLap(this.swimmer.id);
      this.timerState = state;
      this.laps.push(lap);
      this.updateLapsTable();
      this.updateMetrics();
      this.updateBoxplot();
      if (this.callbacks.onTimerChange) this.callbacks.onTimerChange(this.swimmer.id, this.timerState);
    } catch (err) {
      console.warn(`[SwimmerCard] Failed to record lap for ${this.swimmer.id}:`, err);
    }
  }

  /**
   * Fast time display update invoked on each requestAnimationFrame tick
   */
  updateTimeDisplay() {
    if (!this.element) return;
    const timeEl = this.element.querySelector(`#time-${this.swimmer.id}`);
    if (timeEl) {
      const elapsed = timerEngine.getElapsedMs(this.timerState);
      timeEl.textContent = formatTime(elapsed);
    }
  }

  /**
   * Update full UI state based on timerState and laps
   */
  updateUI() {
    if (!this.element) return;

    // 1. Card container class
    this.element.className = `swimmer-card ${this._getCardStateClass()}`;

    // 2. Stopwatch time and status
    const timeEl = this.element.querySelector(`#time-${this.swimmer.id}`);
    const statusEl = this.element.querySelector(`#status-${this.swimmer.id}`);
    if (timeEl) {
      const elapsed = timerEngine.getElapsedMs(this.timerState);
      timeEl.textContent = formatTime(elapsed);
    }
    if (statusEl) {
      statusEl.textContent = this.timerState.state;
    }

    // 3. Main button label & style
    const mainBtn = this.element.querySelector(`#btn-main-${this.swimmer.id}`);
    const lapBtn = this.element.querySelector(`#btn-lap-${this.swimmer.id}`);
    const stopBtn = this.element.querySelector(`#btn-stop-${this.swimmer.id}`);

    if (mainBtn) {
      if (this.timerState.state === TIMER_STATES.RUNNING) {
        mainBtn.textContent = 'Pause';
        mainBtn.style.backgroundColor = 'var(--color-lap)';
        mainBtn.classList.remove('btn-start-all');
      } else if (this.timerState.state === TIMER_STATES.PAUSED) {
        mainBtn.textContent = 'Resume';
        mainBtn.style.backgroundColor = 'var(--color-start)';
        mainBtn.classList.add('btn-start-all');
      } else {
        mainBtn.textContent = 'Start';
        mainBtn.style.backgroundColor = 'var(--color-start)';
        mainBtn.classList.add('btn-start-all');
      }
    }

    // 4. Lap button state (disabled unless RUNNING)
    if (lapBtn) {
      lapBtn.disabled = this.timerState.state !== TIMER_STATES.RUNNING;
    }

    // 5. Stop button state
    if (stopBtn) {
      stopBtn.disabled = this.timerState.state === TIMER_STATES.IDLE || this.timerState.state === TIMER_STATES.STOPPED;
    }

    // 6. Metrics & Laps table
    this.updateMetrics();
    this.updateLapsTable();
    this.updateBoxplot();
  }

  /**
   * Update Quick Metrics row
   */
  updateMetrics() {
    if (!this.element) return;
    const lapsEl = this.element.querySelector(`#metric-laps-${this.swimmer.id}`);
    const lastEl = this.element.querySelector(`#metric-last-${this.swimmer.id}`);
    const bestEl = this.element.querySelector(`#metric-best-${this.swimmer.id}`);
    const paceEl = this.element.querySelector(`#metric-pace-${this.swimmer.id}`);

    if (lapsEl) lapsEl.textContent = this.laps.length;

    if (this.laps.length === 0) {
      if (lastEl) lastEl.textContent = '--';
      if (bestEl) bestEl.textContent = '--';
      if (paceEl) paceEl.textContent = '--';
      return;
    }

    // Compute sustainable pace and outlier flags
    const splitsSeconds = this.laps.map(l => l.splitDurationMs / 1000);
    const paceData = computeSustainablePace(splitsSeconds);
    this.laps.forEach((lap, idx) => {
      lap.isOutlier = paceData.outlierIndices[idx] || false;
    });

    const lastLap = this.laps[this.laps.length - 1];
    if (lastEl) lastEl.textContent = formatTime(lastLap.splitDurationMs);

    const minSplit = Math.min(...this.laps.map(l => l.splitDurationMs));
    if (bestEl) bestEl.textContent = formatTime(minSplit);

    if (paceEl) {
      paceEl.textContent = (paceData.sustainablePace !== null && paceData.sustainablePace !== undefined)
        ? `${paceData.sustainablePace.toFixed(2)}s`
        : '--';
    }
  }

  /**
   * Update Laps feed table
   */
  updateLapsTable() {
    if (!this.element) return;
    const tbody = this.element.querySelector(`#laps-body-${this.swimmer.id}`);
    if (!tbody) return;

    if (this.laps.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-muted); padding:12px;">No laps recorded yet</td></tr>`;
      return;
    }

    // Ensure outlier flags are updated from splits
    const splitsSeconds = this.laps.map(l => l.splitDurationMs / 1000);
    const paceData = computeSustainablePace(splitsSeconds);
    this.laps.forEach((lap, idx) => {
      lap.isOutlier = paceData.outlierIndices[idx] || false;
    });

    // Render in reverse chronological order (newest lap first)
    const reversed = [...this.laps].reverse();
    tbody.innerHTML = reversed.map((lap) => `
      <tr class="${lap.isOutlier ? 'outlier' : ''}">
        <td>
          <strong>#${lap.lapNumber}</strong>
          ${lap.isOutlier ? '<span class="outlier-pill">OUTLIER</span>' : ''}
        </td>
        <td>${formatTime(lap.splitDurationMs)}</td>
        <td>${formatTime(lap.cumulativeDurationMs)}</td>
      </tr>
    `).join('');
  }

  /**
   * Update or hook into M3 boxplot visualizer
   */
  async updateBoxplot() {
    if (!this.element) return;
    const boxplotWrapper = this.element.querySelector(`#boxplot-${this.swimmer.id}`);
    if (!boxplotWrapper) return;

    if (this.laps.length === 0) {
      boxplotWrapper.innerHTML = `<span style="color: var(--text-muted); font-size: 11px;">Record laps to view pace boxplot</span>`;
      return;
    }

    try {
      const splitsSeconds = this.laps.map(l => l.splitDurationMs / 1000);
      renderBoxplot(boxplotWrapper, splitsSeconds, { baseline: this.swimmer.baseline100mSeconds });
      return;
    } catch (e) {
      // Fallback
    }

    // Default container summary
    boxplotWrapper.innerHTML = `<span style="color: var(--text-muted); font-size: 11px;">${this.laps.length} lap${this.laps.length === 1 ? '' : 's'} recorded</span>`;
  }

  /**
   * Mount card to parent container
   * @param {HTMLElement} parent
   */
  mount(parent) {
    const cardEl = this.render();
    parent.appendChild(cardEl);
  }

  /**
   * Clean up ticker subscriptions and DOM elements
   */
  destroy() {
    ticker.unsubscribe(`swimmer-${this.swimmer.id}`);
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }

  _getCardStateClass() {
    if (this.timerState.state === TIMER_STATES.RUNNING) return 'running';
    if (this.timerState.state === TIMER_STATES.PAUSED) return 'paused';
    return '';
  }

  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export default SwimmerCard;
