// SwimmerCard - Tarjeta Densa de Cronómetro para Pileta
// UI compacta: cuerpo = botón Pase, esquina izq = Start/Pausa, esquina der = Lupa de métricas.

import { timerEngine, formatTime, TIMER_STATES } from '../timing/timer-engine.js';
import { ticker } from '../timing/ticker.js';
import { repository } from '../storage/repository.js';
import { metricsModal } from './metrics-modal.js';

// SVG icons
const ICON_PLAY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const ICON_PAUSE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const ICON_LUPA = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;

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
   * Construye el elemento DOM de la tarjeta densa.
   * @returns {HTMLElement}
   */
  render() {
    const card = document.createElement('div');
    card.className = `swimmer-card ${this._getCardStateClass()}`;
    card.id = `card-${this.swimmer.id}`;
    card.dataset.swimmerId = this.swimmer.id;

    card.innerHTML = `
      <!-- Barra superior: Start/Pausa | Nombre/Carril | Lupa -->
      <div class="card-corner-bar">
        <button class="btn-card-corner btn-corner-start" id="btn-startstop-${this.swimmer.id}" aria-label="Iniciar / Pausar">
          ${ICON_PLAY}
        </button>

        <div class="card-swimmer-info">
          <span class="card-lane-badge">C${this.swimmer.lane ?? '-'}</span>
          <h3 class="card-swimmer-name" title="${this._escapeHtml(this.swimmer.name)}">${this._escapeHtml(this.swimmer.name)}</h3>
        </div>

        <button class="btn-card-corner btn-corner-lupa" id="btn-lupa-${this.swimmer.id}" aria-label="Ver métricas">
          ${ICON_LUPA}
        </button>
      </div>

      <!-- Cuerpo principal = Botón de PASE gigante -->
      <button class="card-lap-body" id="btn-lap-${this.swimmer.id}" aria-label="Registrar pase">
        <div class="stopwatch-time" id="time-${this.swimmer.id}">00:00.00</div>
        <div class="lap-indicator">
          <span class="lap-text">PASE</span>
          <span class="lap-badge" id="lapcount-${this.swimmer.id}">${this.laps.length}</span>
        </div>
      </button>
    `;

    this.element = card;
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
    const startStopBtn = this.element.querySelector(`#btn-startstop-${this.swimmer.id}`);
    const lapBtn = this.element.querySelector(`#btn-lap-${this.swimmer.id}`);
    const lupaBtn = this.element.querySelector(`#btn-lupa-${this.swimmer.id}`);

    // Start / Pausa / Reanudar
    startStopBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.timerState.state === TIMER_STATES.IDLE || this.timerState.state === TIMER_STATES.STOPPED) {
        await this.handleStart();
      } else if (this.timerState.state === TIMER_STATES.RUNNING) {
        await this.handlePause();
      } else if (this.timerState.state === TIMER_STATES.PAUSED) {
        await this.handleResume();
      }
    });

    // Cuerpo = Pase (con debounce 300ms para evitar doble tap)
    lapBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      const now = Date.now();
      if (now - this.lastLapTapTime < 300) return;
      this.lastLapTapTime = now;
      await this.handleLap();
    });

    // Lupa = abrir modal de métricas
    lupaBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      metricsModal.open(this.swimmer, this.laps);
    });
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
    this.updateUI();
    if (this.callbacks.onTimerChange) this.callbacks.onTimerChange(this.swimmer.id, this.timerState);
  }

  async handleLap() {
    if (this.timerState.state !== TIMER_STATES.RUNNING) return;
    try {
      const { lap, state } = await timerEngine.recordLap(this.swimmer.id);
      this.timerState = state;
      this.laps.push(lap);
      this._updateLapCount();
      if (this.callbacks.onTimerChange) this.callbacks.onTimerChange(this.swimmer.id, this.timerState);
    } catch (err) {
      console.warn(`[SwimmerCard] Error al registrar pase para ${this.swimmer.id}:`, err);
    }
  }

  // ─────────────────────────────────────────────
  // Actualización de UI
  // ─────────────────────────────────────────────

  /** Actualiza solo el tiempo — llamado en cada frame por requestAnimationFrame */
  updateTimeDisplay() {
    if (!this.element) return;
    const timeEl = this.element.querySelector(`#time-${this.swimmer.id}`);
    if (timeEl) {
      timeEl.textContent = formatTime(timerEngine.getElapsedMs(this.timerState));
    }
  }

  /** Actualización completa del estado visual de la tarjeta */
  updateUI() {
    if (!this.element) return;

    // Estado de la tarjeta (borde de color)
    this.element.className = `swimmer-card ${this._getCardStateClass()}`;

    // Tiempo actual
    const timeEl = this.element.querySelector(`#time-${this.swimmer.id}`);
    if (timeEl) timeEl.textContent = formatTime(timerEngine.getElapsedMs(this.timerState));

    // Botón Start/Pausa
    const ssBtn = this.element.querySelector(`#btn-startstop-${this.swimmer.id}`);
    if (ssBtn) {
      if (this.timerState.state === TIMER_STATES.RUNNING) {
        ssBtn.innerHTML = ICON_PAUSE;
        ssBtn.classList.add('is-running');
        ssBtn.title = 'Pausar';
      } else {
        ssBtn.innerHTML = ICON_PLAY;
        ssBtn.classList.remove('is-running');
        ssBtn.title = this.timerState.state === TIMER_STATES.PAUSED ? 'Reanudar' : 'Iniciar';
      }
    }

    // Cuerpo de pase: habilitado solo si corre
    const lapBtn = this.element.querySelector(`#btn-lap-${this.swimmer.id}`);
    if (lapBtn) {
      lapBtn.disabled = this.timerState.state !== TIMER_STATES.RUNNING;
    }

    this._updateLapCount();
  }

  _updateLapCount() {
    const el = this.element && this.element.querySelector(`#lapcount-${this.swimmer.id}`);
    if (el) el.textContent = this.laps.length;
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
