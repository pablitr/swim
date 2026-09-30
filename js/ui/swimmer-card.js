// SwimmerCard - Tarjeta Densa de Cronómetro para Pileta (M2 UI/UX)
// Diseño de alto contraste con historial de 3 pases, controles Iniciar/Pausar/Detener/Reiniciar
// y referencias DOM cacheadas en render() para rendimiento a 60fps sin recalculación de layout.

import { timerEngine, formatTime, TIMER_STATES } from '../timing/timer-engine.js';
import { ticker } from '../timing/ticker.js';
import { repository } from '../storage/repository.js';
import { metricsModal } from './metrics-modal.js';

// SVG icons
const ICON_PLAY = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const ICON_PAUSE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const ICON_STOP = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`;
const ICON_RESET = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
const ICON_LUPA = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const ICON_LAP = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

export class SwimmerCard {
  /**
   * @param {Object} options
   * @param {Object} options.swimmer  - { id, name, lane, baseline100mSeconds }
   * @param {Object} [options.timerState]
   * @param {Array}  [options.laps]
   * @param {Object} [options.callbacks] - { onEdit, onDelete, onClearLaps, onTimerChange }
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

    // Elementos DOM cacheados para evitar querySelector en cada frame
    this._timeEl = null;
    this._stateLabelEl = null;
    this._recentLapsListEl = null;
    this._lapBtnEl = null;
    this._lapCountEl = null;
    this._btnStartEl = null;
    this._btnStopEl = null;
    this._btnResetEl = null;
    this._btnLupaEl = null;
    this._lastTimeStr = null;

    this.render = this.render.bind(this);
    this.updateTimeDisplay = this.updateTimeDisplay.bind(this);
    this.handleStart = this.handleStart.bind(this);
    this.handlePause = this.handlePause.bind(this);
    this.handleResume = this.handleResume.bind(this);
    this.handleStop = this.handleStop.bind(this);
    this.handleReset = this.handleReset.bind(this);
    this.handleLap = this.handleLap.bind(this);
    this._updateRecentLaps = this._updateRecentLaps.bind(this);
  }

  /**
   * Construye el elemento DOM de la tarjeta intuitiva con historial y controles.
   * Cachea todas las referencias DOM para evitar consultas en el ticker.
   * @returns {HTMLElement}
   */
  render() {
    const card = document.createElement('div');
    card.className = `swimmer-card ${this._getCardStateClass()}`.trim();
    card.id = `card-${this.swimmer.id}`;
    card.dataset.swimmerId = this.swimmer.id;

    const escapedName = this._escapeHtml(this.swimmer.name);

    card.innerHTML = `
      <!-- 1. Barra de Identificación -->
      <div class="card-header">
        <div class="card-swimmer-info">
          <span class="card-lane-badge">C${this.swimmer.lane ?? '-'}</span>
          <h3 class="card-swimmer-name" title="${escapedName}">${escapedName}</h3>
        </div>
        <button class="btn-card-lupa" id="btn-lupa-${this.swimmer.id}" aria-label="Ver métricas completas" title="Ver métricas y gráfico">
          ${ICON_LUPA}
          <span>Métricas</span>
        </button>
      </div>

      <!-- 2. Cronómetro Principal -->
      <div class="card-timer-section">
        <div class="stopwatch-time" id="time-${this.swimmer.id}">00:00.00</div>
        <div class="timer-state-label" id="state-label-${this.swimmer.id}">LISTO</div>
      </div>

      <!-- 3. Historial de Últimos 3 Pases (Fijo para cero CLS) -->
      <div class="card-recent-laps" id="recent-laps-${this.swimmer.id}">
        <div class="recent-laps-header">Últimos pases</div>
        <div class="recent-laps-list" id="recent-laps-list-${this.swimmer.id}">
          <div class="recent-lap-row placeholder"><span class="lap-num">V-</span><span class="lap-split">--:--.--</span><span class="lap-cum">--:--.--</span></div>
          <div class="recent-lap-row placeholder"><span class="lap-num">V-</span><span class="lap-split">--:--.--</span><span class="lap-cum">--:--.--</span></div>
          <div class="recent-lap-row placeholder"><span class="lap-num">V-</span><span class="lap-split">--:--.--</span><span class="lap-cum">--:--.--</span></div>
        </div>
      </div>

      <!-- 4. Botón Gigante de PASE -->
      <button class="btn-card-lap" id="btn-lap-${this.swimmer.id}" aria-label="Registrar pase de vuelta" disabled>
        ${ICON_LAP}
        <span class="lap-btn-text">PASE</span>
        <span class="lap-btn-counter" id="lapcount-${this.swimmer.id}">V1</span>
      </button>

      <!-- 5. Barra de Controles: Iniciar/Pausar/Reanudar, Detener, Reiniciar -->
      <div class="card-actions-toolbar">
        <button class="btn-card-action btn-card-start" id="btn-start-${this.swimmer.id}" aria-label="Iniciar cronómetro">
          ${ICON_PLAY}
          <span class="btn-action-label">Iniciar</span>
        </button>

        <button class="btn-card-action btn-card-stop" id="btn-stop-${this.swimmer.id}" aria-label="Detener cronómetro" disabled>
          ${ICON_STOP}
          <span class="btn-action-label">Detener</span>
        </button>

        <button class="btn-card-action btn-card-reset" id="btn-reset-${this.swimmer.id}" aria-label="Reiniciar cronómetro" disabled>
          ${ICON_RESET}
          <span class="btn-action-label">Reiniciar</span>
        </button>
      </div>
    `;

    this.element = card;

    // Cacheo de referencias directas a elementos DOM (R5)
    this._timeEl = card.querySelector('#time-' + this.swimmer.id);
    this._stateLabelEl = card.querySelector('#state-label-' + this.swimmer.id);
    this._recentLapsListEl = card.querySelector('#recent-laps-list-' + this.swimmer.id);
    this._lapBtnEl = card.querySelector('#btn-lap-' + this.swimmer.id);
    this._lapCountEl = card.querySelector('#lapcount-' + this.swimmer.id);
    this._btnStartEl = card.querySelector('#btn-start-' + this.swimmer.id);
    this._btnStopEl = card.querySelector('#btn-stop-' + this.swimmer.id);
    this._btnResetEl = card.querySelector('#btn-reset-' + this.swimmer.id);
    this._btnLupaEl = card.querySelector('#btn-lupa-' + this.swimmer.id);

    this._bindEvents();
    this.updateUI();

    // Si ya estaba corriendo al recargar, reconectar al ticker
    if (this.timerState.state === TIMER_STATES.RUNNING) {
      ticker.subscribe(`swimmer-${this.swimmer.id}`, this.updateTimeDisplay);
    }

    return card;
  }

  /**
   * Vincula eventos a los botones de la tarjeta.
   * @private
   */
  _bindEvents() {
    // Iniciar / Pausar / Reanudar
    if (this._btnStartEl) {
      this._btnStartEl.addEventListener('click', async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        if (this.timerState.state === TIMER_STATES.IDLE || this.timerState.state === TIMER_STATES.STOPPED) {
          await this.handleStart();
        } else if (this.timerState.state === TIMER_STATES.RUNNING) {
          await this.handlePause();
        } else if (this.timerState.state === TIMER_STATES.PAUSED) {
          await this.handleResume();
        }
      });
    }

    // Detener
    if (this._btnStopEl) {
      this._btnStopEl.addEventListener('click', async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        await this.handleStop();
      });
    }

    // Reiniciar
    if (this._btnResetEl) {
      this._btnResetEl.addEventListener('click', async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        await this.handleReset();
      });
    }

    // Botón de Pase (con debounce 300ms para evitar doble tap)
    if (this._lapBtnEl) {
      this._lapBtnEl.addEventListener('click', async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        const now = Date.now();
        if (now - this.lastLapTapTime < 300) return;
        this.lastLapTapTime = now;
        await this.handleLap();
      });
    }

    // Lupa = abrir modal de métricas
    if (this._btnLupaEl) {
      this._btnLupaEl.addEventListener('click', (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        metricsModal.open(this.swimmer, this.laps);
      });
    }
  }

  // ─────────────────────────────────────────────
  // Handlers de cronómetro
  // ─────────────────────────────────────────────

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
    try {
      if (repository && typeof repository.clearLaps === 'function') {
        await repository.clearLaps(this.swimmer.id);
      }
    } catch (e) {
      // Non-blocking
    }
    this.laps = [];
    this._lastTimeStr = '00:00.00';
    if (this._timeEl) this._timeEl.textContent = '00:00.00';
    this.updateUI();
    if (this.callbacks.onTimerChange) this.callbacks.onTimerChange(this.swimmer.id, this.timerState);
    if (this.callbacks.onClearLaps) this.callbacks.onClearLaps(this.swimmer.id);
  }

  async handleLap() {
    if (this.timerState.state !== TIMER_STATES.RUNNING) return;
    try {
      const { lap, state } = await timerEngine.recordLap(this.swimmer.id);
      this.timerState = state;
      this.laps.push(lap);
      this._updateLapCount();
      this._updateRecentLaps();
      if (this.callbacks.onTimerChange) this.callbacks.onTimerChange(this.swimmer.id, this.timerState);
    } catch (err) {
      console.warn(`[SwimmerCard] Error al registrar pase para ${this.swimmer.id}:`, err);
    }
  }

  // ─────────────────────────────────────────────
  // Actualización de UI & Render Loop Optimizado
  // ─────────────────────────────────────────────

  /**
   * Actualiza únicamente el display de tiempo.
   * Invocado en cada frame de requestAnimationFrame.
   * Utiliza la referencia DOM cacheada y dirty-checking para cero trabajo innecesario.
   */
  updateTimeDisplay() {
    if (!this._timeEl) return;
    const timeStr = formatTime(timerEngine.getElapsedMs(this.timerState));
    if (this._lastTimeStr !== timeStr) {
      this._timeEl.textContent = timeStr;
      this._lastTimeStr = timeStr;
    }
  }

  /**
   * Renderiza exactamente las últimas 3 vueltas en orden inverso (la más reciente primero).
   * Mantiene siempre 3 filas mediante placeholders para evitar saltos de altura (CLS = 0).
   */
  _updateRecentLaps() {
    const container = this._recentLapsListEl;
    if (!container) return;

    const total = this.laps.length;
    if (total === 0) {
      container.innerHTML = `
        <div class="recent-lap-row placeholder"><span class="lap-num">V-</span><span class="lap-split">--:--.--</span><span class="lap-cum">--:--.--</span></div>
        <div class="recent-lap-row placeholder"><span class="lap-num">V-</span><span class="lap-split">--:--.--</span><span class="lap-cum">--:--.--</span></div>
        <div class="recent-lap-row placeholder"><span class="lap-num">V-</span><span class="lap-split">--:--.--</span><span class="lap-cum">--:--.--</span></div>
      `;
      return;
    }

    // Últimos 3 pases (el más reciente primero)
    const last3 = this.laps.slice(-3).reverse();
    const rows = [];

    for (let i = 0; i < 3; i++) {
      if (i < last3.length) {
        const lap = last3[i];
        rows.push(`
          <div class="recent-lap-row">
            <span class="lap-num">V${lap.lapNumber}</span>
            <span class="lap-split">${formatTime(lap.splitDurationMs)}</span>
            <span class="lap-cum">${formatTime(lap.cumulativeDurationMs)}</span>
          </div>
        `);
      } else {
        rows.push(`
          <div class="recent-lap-row placeholder">
            <span class="lap-num">V-</span>
            <span class="lap-split">--:--.--</span>
            <span class="lap-cum">--:--.--</span>
          </div>
        `);
      }
    }

    container.innerHTML = rows.join('');
  }

  /** Actualización completa del estado visual de la tarjeta */
  updateUI() {
    if (!this.element) return;

    // Estado de la tarjeta (borde de color)
    this.element.className = `swimmer-card ${this._getCardStateClass()}`.trim();

    // Tiempo actual con dirty check
    const timeStr = formatTime(timerEngine.getElapsedMs(this.timerState));
    if (this._timeEl) {
      this._timeEl.textContent = timeStr;
      this._lastTimeStr = timeStr;
    }

    // Etiqueta de estado
    if (this._stateLabelEl) {
      switch (this.timerState.state) {
        case TIMER_STATES.RUNNING:
          this._stateLabelEl.textContent = 'EN MARCHA';
          break;
        case TIMER_STATES.PAUSED:
          this._stateLabelEl.textContent = 'PAUSADO';
          break;
        case TIMER_STATES.STOPPED:
          this._stateLabelEl.textContent = 'DETENIDO';
          break;
        case TIMER_STATES.IDLE:
        default:
          this._stateLabelEl.textContent = 'LISTO';
          break;
      }
    }

    // Botón Iniciar / Pausar / Reanudar
    if (this._btnStartEl) {
      const isRunning = this.timerState.state === TIMER_STATES.RUNNING;
      const isPaused = this.timerState.state === TIMER_STATES.PAUSED;

      if (isRunning) {
        this._btnStartEl.innerHTML = `${ICON_PAUSE}<span class="btn-action-label">Pausar</span>`;
        this._btnStartEl.className = 'btn-card-action btn-card-start is-running';
        if (typeof this._btnStartEl.setAttribute === 'function') {
          this._btnStartEl.setAttribute('aria-label', 'Pausar cronómetro');
        }
        this._btnStartEl.title = 'Pausar';
        this._btnStartEl.disabled = false;
      } else if (isPaused) {
        this._btnStartEl.innerHTML = `${ICON_PLAY}<span class="btn-action-label">Reanudar</span>`;
        this._btnStartEl.className = 'btn-card-action btn-card-start is-paused';
        if (typeof this._btnStartEl.setAttribute === 'function') {
          this._btnStartEl.setAttribute('aria-label', 'Reanudar cronómetro');
        }
        this._btnStartEl.title = 'Reanudar';
        this._btnStartEl.disabled = false;
      } else {
        this._btnStartEl.innerHTML = `${ICON_PLAY}<span class="btn-action-label">Iniciar</span>`;
        this._btnStartEl.className = 'btn-card-action btn-card-start';
        if (typeof this._btnStartEl.setAttribute === 'function') {
          this._btnStartEl.setAttribute('aria-label', 'Iniciar cronómetro');
        }
        this._btnStartEl.title = 'Iniciar';
        this._btnStartEl.disabled = false;
      }
    }

    // Botón Detener: habilitado en RUNNING o PAUSED
    if (this._btnStopEl) {
      const canStop = this.timerState.state === TIMER_STATES.RUNNING || this.timerState.state === TIMER_STATES.PAUSED;
      this._btnStopEl.disabled = !canStop;
    }

    // Botón Reiniciar: habilitado si no está en estado IDLE inicial limpio
    if (this._btnResetEl) {
      const hasElapsed = (this.timerState.accumulatedMs || 0) > 0 || (this.timerState.state !== TIMER_STATES.IDLE) || this.laps.length > 0;
      this._btnResetEl.disabled = !hasElapsed;
    }

    // Botón Pase: habilitado solo si el cronómetro está en marcha
    if (this._lapBtnEl) {
      this._lapBtnEl.disabled = this.timerState.state !== TIMER_STATES.RUNNING;
    }

    this._updateLapCount();
    this._updateRecentLaps();
  }

  _updateLapCount() {
    if (this._lapCountEl) {
      const nextLap = this.laps.length + 1;
      this._lapCountEl.textContent = `V${nextLap}`;
    }
  }

  // ─────────────────────────────────────────────
  // Montaje y destrucción
  // ─────────────────────────────────────────────

  mount(parent) {
    parent.appendChild(this.render());
  }

  destroy() {
    ticker.unsubscribe(`swimmer-${this.swimmer.id}`);
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this._timeEl = null;
    this._stateLabelEl = null;
    this._recentLapsListEl = null;
    this._lapBtnEl = null;
    this._lapCountEl = null;
    this._btnStartEl = null;
    this._btnStopEl = null;
    this._btnResetEl = null;
    this._btnLupaEl = null;
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────

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
