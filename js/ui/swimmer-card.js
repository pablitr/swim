// SwimmerCard - Tarjeta Densa de Cronómetro para Pileta (M2 UI/UX)
// Diseño de alto contraste con historial de 3 pases y controles Iniciar/Pausar/Detener
// y referencias DOM cacheadas en render() para rendimiento a 60fps sin recalculación de layout.

import { timerEngine, formatTime, TIMER_STATES } from '../timing/timer-engine.js';
import { ticker } from '../timing/ticker.js';
import { repository } from '../storage/repository.js';
import { metricsModal } from './metrics-modal.js';

// SVG icons
const ICON_PLAY = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
const ICON_PAUSE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
const ICON_STOP = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`;
const ICON_RESET = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;
const ICON_LAP_PAUSE = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85.83 6.72 2.24L21 7"/><polyline points="21 3 21 7 17 7"/><line x1="10" y1="10" x2="10" y2="15"/><line x1="14" y1="10" x2="14" y2="15"/></svg>`;
const ICON_LUPA = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const ICON_LAP = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

export class SwimmerCard {
  /**
   * @param {Object} options
   * @param {Object} options.swimmer  - { id, name, lane, baseline100mSeconds }
   * @param {Object} [options.timerState]
   * @param {Array}  [options.laps]
   * @param {Object} [options.callbacks] - { onEdit, onDelete, onClearLaps, onTimerChange, onGroupStart }
   * @param {number} [options.groupId] - 0=Sin grupo, 1=Rojo, 2=Azul, 3=Amarillo, 4=Verde
   */
  constructor({ swimmer, timerState, laps = [], callbacks = {}, groupId = 0 }) {
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
    this.groupId = groupId || 0;
    this.lastLapTapTime = 0;
    this.lastLapPauseTapTime = 0;
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
    this._btnLapPauseEl = null;
    this._splitContainerEl = null;
    this._groupBadgeEl = null;
    this._headerEl = null;
    this._btnLupaEl = null;
    this._lastTimeStr = null;

    this.render = this.render.bind(this);
    this.updateTimeDisplay = this.updateTimeDisplay.bind(this);
    this.handleStart = this.handleStart.bind(this);
    this.handlePause = this.handlePause.bind(this);
    this.handleLapPause = this.handleLapPause.bind(this);
    this.handleResume = this.handleResume.bind(this);
    this.handleStop = this.handleStop.bind(this);
    this.handleReset = this.handleReset.bind(this);
    this.handleLap = this.handleLap.bind(this);
    this._updateRecentLaps = this._updateRecentLaps.bind(this);
    this._updateGroupBadge = this._updateGroupBadge.bind(this);
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
      <div class="card-header" id="card-header-${this.swimmer.id}">
        <div class="card-header-meta">
          <div class="card-header-badges">
            <span class="card-lane-badge">C${this.swimmer.lane ?? '-'}</span>
            <span class="card-group-badge" id="group-badge-${this.swimmer.id}" style="display: none;" title="Grupo de serie"></span>
          </div>
          <button class="btn-card-lupa" id="btn-lupa-${this.swimmer.id}" aria-label="Ver métricas completas" title="Ver métricas y gráfico">
            ${ICON_LUPA}
            <span>Métricas</span>
          </button>
        </div>
        <h3 class="card-swimmer-name" title="${escapedName}">${escapedName}</h3>
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
        <div class="btn-card-split-container" id="split-container-${this.swimmer.id}">
          <button class="btn-card-action btn-card-start" id="btn-start-${this.swimmer.id}" aria-label="Iniciar cronómetro">
            ${ICON_PLAY}
            <span class="btn-action-label">Iniciar</span>
          </button>
          <button class="btn-card-action btn-card-lap-pause" id="btn-lap-pause-${this.swimmer.id}" aria-label="Pase y pausa" title="Registrar pase y pausar" style="display: none;">
            ${ICON_LAP_PAUSE}
            <span class="btn-action-label">Pase+Pausa</span>
          </button>
        </div>

        <button class="btn-card-action btn-card-stop" id="btn-stop-${this.swimmer.id}" aria-label="Detener cronómetro" disabled>
          ${ICON_STOP}
          <span class="btn-action-label">Detener</span>
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
    this._btnLapPauseEl = card.querySelector('#btn-lap-pause-' + this.swimmer.id);
    this._splitContainerEl = card.querySelector('#split-container-' + this.swimmer.id);
    this._groupBadgeEl = card.querySelector('#group-badge-' + this.swimmer.id);
    this._headerEl = card.querySelector('#card-header-' + this.swimmer.id) || card.querySelector('.card-header');
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

    // Botón Split: Pase + Pausa
    if (this._btnLapPauseEl) {
      this._btnLapPauseEl.addEventListener('click', async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        await this.handleLapPause();
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

    // Reiniciar cronómetro en la tarjeta
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

    // Tapping .card-header cycles groupId (0 -> 1 -> 2 -> 3 -> 4 -> 0)
    // Safety constraint: strictly disabled if RUNNING or PAUSED. Only allowed when IDLE or STOPPED.
    if (this._headerEl) {
      this._headerEl.addEventListener('click', (e) => {
        if (this.timerState.state === TIMER_STATES.RUNNING || this.timerState.state === TIMER_STATES.PAUSED) {
          return;
        }
        this.groupId = (this.groupId + 1) % 5;
        this._updateGroupBadge();
      });
    }

    // Lupa = abrir modal de métricas
    if (this._btnLupaEl) {
      this._btnLupaEl.addEventListener('click', async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        
        let allLaps = this.laps;
        if (typeof repository !== 'undefined' && typeof repository.getLaps === 'function') {
          allLaps = await repository.getLaps(this.swimmer.id) || this.laps;
        }

        metricsModal.open(this.swimmer, allLaps, {
          onReset: () => this.handleReset({ clearHistorical: false }),
          canReset: () => this.timerState.state !== TIMER_STATES.IDLE || this.laps.length > 0,
          onDelete: this.callbacks.onDelete,
          onEdit: (updatedSwimmer) => {
            this.swimmer = { ...this.swimmer, ...updatedSwimmer };
            this.updateUI();
            if (typeof this.callbacks.onEdit === 'function') {
              this.callbacks.onEdit(this.swimmer);
            }
          },
          onDeleteLap: async (lapId, lapNumber) => {
            this.laps = this.laps.filter(l => (lapId ? l.id !== lapId : String(l.lapNumber) !== String(lapNumber)));
            const lastLap = this.laps.length > 0 ? this.laps[this.laps.length - 1] : null;
            this.timerState.lastLapCumulativeMs = lastLap ? lastLap.cumulativeDurationMs : 0;
            this.updateUI();
            if (this.callbacks.onTimerChange) {
              this.callbacks.onTimerChange(this.swimmer.id, this.timerState);
            }
          }
        });
      });
    }
  }

  // ─────────────────────────────────────────────
  // Handlers de cronómetro
  // ─────────────────────────────────────────────

  async handleStart(options = {}) {
    const isGroupTriggered = Boolean(options && options.isGroupTriggered);
    if (!isGroupTriggered && this.groupId > 0 && typeof this.callbacks.onGroupStart === 'function') {
      await this.callbacks.onGroupStart(this.groupId, this.swimmer.id);
      return;
    }
    
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

  async handleLapPause() {
    if (this.timerState.state !== TIMER_STATES.RUNNING) return;
    const now = Date.now();
    if (now - this.lastLapPauseTapTime < 300) return;
    this.lastLapPauseTapTime = now;
    await this.handleLap();
    await this.handlePause();
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

  async handleReset(options = {}) {
    this.timerState = await timerEngine.reset(this.swimmer.id);
    ticker.unsubscribe(`swimmer-${this.swimmer.id}`);
    if (options && options.clearHistorical && repository && typeof repository.clearLaps === 'function') {
      await repository.clearLaps(this.swimmer.id);
    }
    this.laps = [];
    this._lastTimeStr = '00:00.00';
    if (this._timeEl) this._timeEl.textContent = '00:00.00';
    this.updateUI();
    if (this.callbacks.onTimerChange) this.callbacks.onTimerChange(this.swimmer.id, this.timerState);
    if (options && options.clearHistorical && this.callbacks.onClearLaps) {
      this.callbacks.onClearLaps(this.swimmer.id);
    }
    return this.laps;
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
    const isRunning = this.timerState.state === TIMER_STATES.RUNNING;
    const timeStr = formatTime(timerEngine.getElapsedMs(this.timerState), !isRunning);
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

    this._updateSwimmerInfo();

    // Estado de la tarjeta (borde de color)
    const newClass = `swimmer-card ${this._getCardStateClass()}`.trim();
    if (this.element.className !== newClass) {
      this.element.className = newClass;
    }

    // Tiempo actual con dirty check
    const timeIsRunning = this.timerState.state === TIMER_STATES.RUNNING;
    const timeStr = formatTime(timerEngine.getElapsedMs(this.timerState), !timeIsRunning);
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

    // Grupo de serie
    this._updateGroupBadge();

    // Botón Iniciar / Pausar / Reanudar y Botón Split Pase+Pausa
    const isRunning = this.timerState.state === TIMER_STATES.RUNNING;
    const isPaused = this.timerState.state === TIMER_STATES.PAUSED;

    if (this._splitContainerEl) {
      if (isRunning) {
        this._splitContainerEl.classList.add('is-split');
      } else {
        this._splitContainerEl.classList.remove('is-split');
      }
    }

    if (this._btnLapPauseEl) {
      if (isRunning) {
        this._btnLapPauseEl.style.display = 'inline-flex';
        this._btnLapPauseEl.disabled = false;
      } else {
        this._btnLapPauseEl.style.display = 'none';
        this._btnLapPauseEl.disabled = true;
      }
    }

    if (this._btnStartEl) {
      if (isRunning) {
        this._btnStartEl.innerHTML = `${ICON_PAUSE}<span class="btn-action-label">Pausar</span>`;
        this._btnStartEl.className = 'btn-card-action btn-card-start btn-card-pause is-running';
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
      const canStop = isRunning || isPaused;
      this._btnStopEl.disabled = !canStop;
    }

    // Botón Reiniciar: habilitado si no está en estado IDLE inicial limpio
    if (this._btnResetEl) {
      const hasElapsed = (this.timerState.accumulatedMs || 0) > 0 || (this.timerState.state !== TIMER_STATES.IDLE) || this.laps.length > 0;
      this._btnResetEl.disabled = !hasElapsed;
    }

    // Botón Pase: habilitado solo si el cronómetro está en marcha
    if (this._lapBtnEl) {
      this._lapBtnEl.disabled = !isRunning;
    }

    this._updateLapCount();
    this._updateRecentLaps();
  }

  _updateLapCount() {
    if (this._lapCountEl) {
      const nextLap = Number(this.timerState?.currentLapIndex) || 1;
      this._lapCountEl.textContent = `V${nextLap}`;
    }
  }

  _updateSwimmerInfo() {
    if (!this.element) return;
    const laneBadge = this.element.querySelector('.card-lane-badge');
    if (laneBadge) {
      laneBadge.textContent = `C${this.swimmer.lane ?? '-'}`;
    }
    const nameEl = this.element.querySelector('.card-swimmer-name');
    if (nameEl) {
      nameEl.textContent = this.swimmer.name;
      nameEl.title = this._escapeHtml(this.swimmer.name);
    }
  }

  _updateGroupBadge() {
    if (!this._groupBadgeEl) return;
    const GROUP_CONFIG = [
      { id: 0, text: '' },
      { id: 1, text: '🔴 G1' },
      { id: 2, text: '🔵 G2' },
      { id: 3, text: '🟡 G3' },
      { id: 4, text: '🟢 G4' }
    ];
    const group = GROUP_CONFIG[this.groupId] || GROUP_CONFIG[0];
    
    if (this.groupId > 0) {
      if (this._groupBadgeEl.style.display !== 'inline-flex') this._groupBadgeEl.style.display = 'inline-flex';
      if (this._groupBadgeEl.textContent !== group.text) this._groupBadgeEl.textContent = group.text;
      const expectedClass = `card-group-badge group-${this.groupId}`;
      if (this._groupBadgeEl.className !== expectedClass) this._groupBadgeEl.className = expectedClass;
      
      if (this.element && this.element.dataset && this.element.dataset.groupId !== String(this.groupId)) {
        this.element.dataset.groupId = String(this.groupId);
      }
    } else {
      if (this._groupBadgeEl.style.display !== 'none') this._groupBadgeEl.style.display = 'none';
      if (this._groupBadgeEl.textContent !== '') this._groupBadgeEl.textContent = '';
      if (this._groupBadgeEl.className !== 'card-group-badge') this._groupBadgeEl.className = 'card-group-badge';
      
      if (this.element && this.element.dataset && this.element.dataset.groupId !== undefined) {
        delete this.element.dataset.groupId;
      }
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
    this._btnLapPauseEl = null;
    this._splitContainerEl = null;
    this._groupBadgeEl = null;
    this._headerEl = null;
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
