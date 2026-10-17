import { formatTime } from '../timing/timer-engine.js';
import { computeSustainablePace } from '../analytics/pace-calculator.js';
import { calculateTrainingZones } from '../analytics/zones.js';
import { renderBoxplot } from './boxplot-svg.js';
import { splitCurrentAndHistoricalSessions } from '../analytics/session-partitioner.js';
import { repository } from '../storage/repository.js';
import { modalManager } from './modal.js';
import { renderSessionMetaHTML, renderSessionCardHTML, bindSessionCardActions } from './session-card.js';

class MetricsModal {
  constructor() {
    this.modalEl = null;
    this.titleEl = null;
    this.laneEl = null;
    this.bodyEl = null;
    this.closeBtn = null;
    this.editBtn = null;
    this.resetBtn = null;
    this.swimmer = null;
    this.laps = [];
    this.callbacks = {};
    this._editBound = false;
    this._resetBound = false;
    this._bound_close = this._close.bind(this);
    this._bound_overlayClick = this._overlayClick.bind(this);
    this._bound_keyDown = this._keyDown.bind(this);
    this._handleEditSwimmer = this._handleEditSwimmer.bind(this);
    this._handleDeleteLap = this._handleDeleteLap.bind(this);
  }

  _init() {
    if (!this.modalEl) {
      this.modalEl = document.getElementById('metrics-modal');
      this.titleEl = document.getElementById('metrics-modal-title');
      this.laneEl = document.getElementById('metrics-modal-lane');
      this.bodyEl = document.getElementById('metrics-modal-body');
      this.closeBtn = document.getElementById('metrics-modal-close');
      this.editBtn = document.getElementById('metrics-modal-edit');
      this.resetBtn = document.getElementById('metrics-modal-reset');

      if (this.closeBtn) this.closeBtn.addEventListener('click', this._bound_close);
      if (this.modalEl) this.modalEl.addEventListener('click', this._bound_overlayClick);
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('keydown', this._bound_keyDown);
      }
    }

    if (!this.editBtn) {
      this.editBtn = document.getElementById('metrics-modal-edit');
    }
    if (this.editBtn && !this._editBound) {
      this.editBtn.addEventListener('click', () => this._handleEditSwimmer());
      this._editBound = true;
    }
    
    if (!this.resetBtn) {
      this.resetBtn = document.getElementById('metrics-modal-reset');
    }
    if (this.resetBtn && !this._resetBound) {
      this.resetBtn.addEventListener('click', async () => {
        const swimmerName = this.swimmer?.name || 'este nadador';
        const confirmed = window.confirm(
          `¿Quieres reiniciar el cronómetro de ${swimmerName}?`
        );
        if (!confirmed || typeof this.callbacks.onReset !== 'function') return;

        try {
          await this.callbacks.onReset({ clearHistorical: false });
          if (this.swimmer && this.swimmer.id && repository && typeof repository.getLaps === 'function') {
            const persisted = await repository.getLaps(this.swimmer.id);
            if (persisted && persisted.length > 0) {
              this.laps = persisted;
            }
          }
          this._renderBody(this.swimmer, this.laps);
        } catch (err) {
          console.error('[MetricsModal] No se pudo reiniciar:', err);
        }
      });
      this._resetBound = true;
    }
  }

  _handleEditSwimmer() {
    if (!this.swimmer) return;
    modalManager.open(this.swimmer, async (updatedData) => {
      this.swimmer = { ...this.swimmer, ...updatedData };
      if (repository && typeof repository.saveSwimmer === 'function') {
        try {
          await repository.saveSwimmer(this.swimmer);
        } catch (err) {
          console.error('[MetricsModal] Error al guardar nadador:', err);
        }
      }
      if (this.laneEl) this.laneEl.textContent = `C${this.swimmer.lane ?? '-'}`;
      if (this.titleEl) this.titleEl.textContent = this.swimmer.name || 'Nadador';
      this._renderBody(this.swimmer, this.laps);
      if (this.callbacks && typeof this.callbacks.onEdit === 'function') {
        try {
          await this.callbacks.onEdit(this.swimmer);
        } catch (err) {
          console.error('[MetricsModal] Error en callback onEdit:', err);
        }
      }
    });
  }

  async _handleDeleteLap(lapId, lapNum) {
    if (!lapId && !lapNum) return;
    if (lapId && repository && typeof repository.deleteLap === 'function') {
      try {
        await repository.deleteLap(lapId);
      } catch (err) {
        console.error('[MetricsModal] Error al borrar pase de IndexedDB:', err);
      }
    }

    // Deliberate gap preservation: remaining laps retain original lap.lapNumber values
    this.laps = this.laps.filter(l => (lapId ? l.id !== lapId : String(l.lapNumber) !== String(lapNum)));

    // If the deleted lap was the latest recorded lap, update timerState.lastLapCumulativeMs
    if (this.swimmer && this.swimmer.id && repository && typeof repository.getTimerState === 'function') {
      try {
        const state = await repository.getTimerState(this.swimmer.id);
        if (state) {
          const updatedCurrent = splitCurrentAndHistoricalSessions(this.laps).currentSession;
          const lastLap = updatedCurrent.length > 0 ? updatedCurrent[updatedCurrent.length - 1] : null;
          state.lastLapCumulativeMs = lastLap ? lastLap.cumulativeDurationMs : 0;
          await repository.saveTimerState(state);
        }
      } catch (_) {}
    }

    if (this.callbacks && typeof this.callbacks.onDeleteLap === 'function') {
      try {
        await this.callbacks.onDeleteLap(lapId, lapNum);
      } catch (err) {
        console.error('[MetricsModal] Error en callback onDeleteLap:', err);
      }
    }

    this._renderBody(this.swimmer, this.laps);
  }

  /**
   * Abre el modal con las métricas del nadador dado.
   * @param {Object} swimmer - { id, name, lane, baseline100mSeconds }
   * @param {Array} laps - Array de vueltas registradas
   * @param {Object} [callbacks] - Sesión y acciones de perfil
   */
  open(swimmer, laps = [], callbacks = {}) {
    this._init();
    if (!this.modalEl) return;

    this.swimmer = swimmer;
    this.laps = [...laps];
    this.callbacks = callbacks;

    // Encabezado
    if (this.laneEl) this.laneEl.textContent = `C${swimmer.lane ?? '-'}`;
    if (this.titleEl) this.titleEl.textContent = swimmer.name || 'Nadador';

    // Renderizar contenido
    this._renderBody(swimmer, this.laps);

    this.modalEl.classList.add('open');
    this.modalEl.setAttribute('aria-hidden', 'false');
  }

  _close() {
    if (!this.modalEl) return;
    this.modalEl.classList.remove('open');
    this.modalEl.setAttribute('aria-hidden', 'true');
  }

  _overlayClick(e) {
    // Solo cierra si el click fue directamente sobre el overlay (fondo oscuro),
    // no sobre el panel interior (.modal-dialog)
    if (e.target === this.modalEl) this._close();
  }

  _keyDown(e) {
    if (e.key === 'Escape') this._close();
  }

  _renderBody(swimmer, laps) {
    if (!this.bodyEl) return;

    const baseline = Number(swimmer.baseline100mSeconds);
    const hasBaseline = !isNaN(baseline) && baseline > 0;

    // --- Zonas de entrenamiento ---
    let zonesHTML = '';
    if (hasBaseline) {
      try {
        const z = calculateTrainingZones(baseline);
        zonesHTML = `
          <div class="modal-section-title">Zonas de Entrenamiento (Base: ${baseline.toFixed(1)}s)</div>
          <div class="zones-preview">
            <span class="zone-item"><span class="zone-label">75%:</span> <span class="zone-val">${z.zone75.toFixed(1)}s</span></span>
            <span class="zone-item"><span class="zone-label">80%:</span> <span class="zone-val">${z.zone80.toFixed(1)}s</span></span>
            <span class="zone-item"><span class="zone-label">90%:</span> <span class="zone-val">${z.zone90.toFixed(1)}s</span></span>
            <span class="zone-item"><span class="zone-label">100%:</span> <span class="zone-val">${baseline.toFixed(1)}s</span></span>
          </div>`;
      } catch (_) { /* sin baseline */ }
    } else {
      zonesHTML = `<div style="color:var(--text-muted);font-size:12px;">Sin tiempo base de 100m configurado.</div>`;
    }

    const { currentSession, previousSessions } = splitCurrentAndHistoricalSessions(laps);

    // --- Métricas rápidas ---
    let metricsHTML = '';
    let paceData = null;
    if (currentSession.length > 0) {
      const splits = currentSession.map(l => l.splitDurationMs / 1000);
      paceData = computeSustainablePace(splits);
      const lastLap = currentSession[currentSession.length - 1];
      const minSplit = Math.min(...currentSession.map(l => l.splitDurationMs));
      const paceStr = (paceData.sustainablePace != null)
        ? `${paceData.sustainablePace.toFixed(2)}s`
        : '--';

      metricsHTML = `
        <div class="modal-section-title">Serie actual</div>
        <div class="current-session-meta">${renderSessionMetaHTML(currentSession, { fallbackLabel: 'Serie actual' })}</div>
        <div class="quick-metrics">
          <div class="metric-box">
            <div class="metric-label">Pases</div>
            <div class="metric-value">${currentSession.length}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Último</div>
            <div class="metric-value">${formatTime(lastLap.splitDurationMs)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Mejor</div>
            <div class="metric-value">${formatTime(minSplit)}</div>
          </div>
          <div class="metric-box">
            <div class="metric-label">Ritmo (Moda)</div>
            <div class="metric-value">${paceStr}</div>
          </div>
        </div>`;
    }

    // --- Boxplot ---
    const boxplotId = `metrics-boxplot-${swimmer.id}`;
    const boxplotHTML = currentSession.length > 0
      ? `<div class="modal-section-title">Distribución de Pases</div>
         <div class="boxplot-wrapper" id="${boxplotId}"></div>`
      : '';

    // --- Historial de vueltas (Serie Actual) ---
    let lapsHTML = '';
    if (currentSession.length > 0) {
      if (paceData) {
        currentSession.forEach((lap, idx) => { lap.isOutlier = paceData.outlierIndices[idx] || false; });
      }
      const rows = [...currentSession].reverse().map(lap => `
        <tr class="${lap.isOutlier ? 'outlier' : ''}">
          <td><strong>#${lap.lapNumber}</strong>${lap.isOutlier ? ' <span class="outlier-pill">ATÍPICO</span>' : ''}</td>
          <td>${formatTime(lap.splitDurationMs)}</td>
          <td>${formatTime(lap.cumulativeDurationMs)}</td>
          <td style="text-align: right; width: 36px;">
            <button type="button" class="btn-icon btn-lap-delete" data-lap-id="${lap.id || ''}" data-lap-number="${lap.lapNumber}" aria-label="Eliminar pase #${lap.lapNumber}" title="Eliminar pase #${lap.lapNumber}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </td>
        </tr>`).join('');

      lapsHTML = `
        <div class="modal-section-title">Historial de Pases</div>
        <div class="laps-table-wrapper">
          <table class="laps-table">
            <thead><tr><th>#</th><th>Parcial</th><th>Acumulado</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    } else {
      lapsHTML = `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">Sin pases registrados aún.</div>`;
    }

    // --- Series Anteriores ---
    let previousSessionsSectionHTML = '';
    if (previousSessions.length > 0) {
      let globalMin = Infinity;
      let globalMax = -Infinity;
      for (const session of [currentSession, ...previousSessions]) {
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

      const baselineVal = hasBaseline ? baseline : undefined;
      const previousSessionsCardsHTML = previousSessions.map((session, pIdx) => {
        return renderSessionCardHTML(session, {
          fallbackLabel: `Serie ${previousSessions.length - pIdx}`,
          baseline: baselineVal,
          globalMin,
          globalMax
        });
      }).join('');

      previousSessionsSectionHTML = `
        <div class="modal-section-title">Series Anteriores (${previousSessions.length})</div>
        <div class="drilldown-sessions-stack">
          ${previousSessionsCardsHTML}
        </div>`;
    }

    const canReset = typeof this.callbacks.canReset === 'function'
      ? this.callbacks.canReset()
      : laps.length > 0;

    this.bodyEl.innerHTML = zonesHTML + metricsHTML + boxplotHTML + lapsHTML + previousSessionsSectionHTML + `
      <div class="modal-actions-bar metrics-actions">
        <button type="button" id="metrics-reset-session" class="btn-secondary btn-danger" ${canReset ? '' : 'disabled'}>
          Borrar todo el historial
        </button>
        <button type="button" id="metrics-delete-swimmer" class="btn-secondary btn-danger">
          Eliminar nadador
        </button>
      </div>`;

    const activeSessions = [currentSession, ...previousSessions].filter(s => s && s.length > 0);
    bindSessionCardActions(this.bodyEl, activeSessions, {
      onTag: async (session, tag) => {
        const ids = (session || []).map(l => l.id).filter(Boolean);
        if (repository && typeof repository.updateLapsTag === 'function') {
          await repository.updateLapsTag(ids, tag);
        }
        const idSet = new Set(ids);
        for (const lap of this.laps) {
          if (idSet.has(lap.id)) {
            if (tag) {
              lap.sessionTag = tag;
            } else {
              delete lap.sessionTag;
            }
          }
        }
        this._renderBody(this.swimmer, this.laps);
      },
      onDelete: async (session) => {
        const ids = (session || []).map(l => l.id).filter(Boolean);
        if (repository && typeof repository.deleteLaps === 'function') {
          await repository.deleteLaps(ids);
        }
        const idSet = new Set(ids);
        this.laps = this.laps.filter(l => !idSet.has(l.id));
        if (typeof this.callbacks.onDeleteSession === 'function') {
          await this.callbacks.onDeleteSession(ids);
        }
        this._renderBody(this.swimmer, this.laps);
      }
    });

    const deleteLapBtns = this.bodyEl.querySelectorAll('.btn-lap-delete');
    deleteLapBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (e && e.stopPropagation) e.stopPropagation();
        const lapId = btn.dataset.lapId;
        const lapNum = btn.dataset.lapNumber;
        await this._handleDeleteLap(lapId, lapNum);
      });
    });

    const resetButton = this.bodyEl.querySelector('#metrics-reset-session');
    if (resetButton) {
      resetButton.addEventListener('click', async () => {
        const swimmerName = this.swimmer?.name || 'este nadador';
        const confirmed = window.confirm(
          `¿Borrar TODO el historial de pases de ${swimmerName}? Se eliminarán el cronómetro y todos los pases; el perfil del nadador se conservará.`
        );
        if (!confirmed || typeof this.callbacks.onReset !== 'function') return;

        try {
          await this.callbacks.onReset({ clearHistorical: true });
          this.laps = [];
          this._renderBody(this.swimmer, this.laps);
        } catch (err) {
          console.error('[MetricsModal] No se pudo borrar la sesión:', err);
          window.alert('No se pudieron borrar todos los datos de la sesión. Comprueba el almacenamiento y vuelve a intentarlo.');
        }
      });
    }

    const deleteButton = this.bodyEl.querySelector('#metrics-delete-swimmer');
    if (deleteButton) {
      deleteButton.addEventListener('click', async () => {
        if (typeof this.callbacks.onDelete !== 'function') return;
        const swimmerName = this.swimmer?.name || 'este nadador';
        const confirmed = window.confirm(
          `¿Eliminar el perfil de ${swimmerName}? También se borrarán su cronómetro y todo su historial de pases. Esta acción no se puede deshacer.`
        );
        if (!confirmed) return;

        try {
          await this.callbacks.onDelete(this.swimmer.id);
          this._close();
        } catch (err) {
          console.error('[MetricsModal] No se pudo eliminar el nadador:', err);
        }
      });
    }

    // Renderizar boxplot SVG ahora que el DOM existe
    if (currentSession.length > 0) {
      const boxplotEl = document.getElementById(boxplotId);
      if (boxplotEl) {
        const splits = currentSession.map(l => l.splitDurationMs / 1000);
        renderBoxplot(boxplotEl, splits, { baseline: swimmer.baseline100mSeconds });
      }
    }
  }
}

export const metricsModal = new MetricsModal();
export default metricsModal;
