// MetricsModal - Panel de Métricas Individuales por Nadador
// Se abre desde la lupa de cada tarjeta. Cierra tocando el overlay o el botón X.

import { formatTime } from '../timing/timer-engine.js';
import { computeSustainablePace } from '../analytics/pace-calculator.js';
import { calculateTrainingZones } from '../analytics/zones.js';
import { renderBoxplot } from './boxplot-svg.js';

class MetricsModal {
  constructor() {
    this.modalEl = null;
    this.titleEl = null;
    this.laneEl = null;
    this.bodyEl = null;
    this.closeBtn = null;
    this.swimmer = null;
    this.laps = [];
    this.callbacks = {};
    this._bound_close = this._close.bind(this);
    this._bound_overlayClick = this._overlayClick.bind(this);
    this._bound_keyDown = this._keyDown.bind(this);
  }

  _init() {
    if (this.modalEl) return;
    this.modalEl = document.getElementById('metrics-modal');
    this.titleEl = document.getElementById('metrics-modal-title');
    this.laneEl = document.getElementById('metrics-modal-lane');
    this.bodyEl = document.getElementById('metrics-modal-body');
    this.closeBtn = document.getElementById('metrics-modal-close');

    if (this.closeBtn) this.closeBtn.addEventListener('click', this._bound_close);
    if (this.modalEl) this.modalEl.addEventListener('click', this._bound_overlayClick);
    document.addEventListener('keydown', this._bound_keyDown);
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

    // --- Métricas rápidas ---
    let metricsHTML = '';
    let paceData = null;
    if (laps.length > 0) {
      const splits = laps.map(l => l.splitDurationMs / 1000);
      paceData = computeSustainablePace(splits);
      const lastLap = laps[laps.length - 1];
      const minSplit = Math.min(...laps.map(l => l.splitDurationMs));
      const paceStr = (paceData.sustainablePace != null)
        ? `${paceData.sustainablePace.toFixed(2)}s`
        : '--';

      metricsHTML = `
        <div class="quick-metrics">
          <div class="metric-box">
            <div class="metric-label">Pases</div>
            <div class="metric-value">${laps.length}</div>
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
    const boxplotHTML = laps.length > 0
      ? `<div class="modal-section-title">Distribución de Pases</div>
         <div class="boxplot-wrapper" id="${boxplotId}"></div>`
      : '';

    // --- Historial de vueltas ---
    let lapsHTML = '';
    if (laps.length > 0) {
      if (paceData) {
        laps.forEach((lap, idx) => { lap.isOutlier = paceData.outlierIndices[idx] || false; });
      }
      const rows = [...laps].reverse().map(lap => `
        <tr class="${lap.isOutlier ? 'outlier' : ''}">
          <td><strong>#${lap.lapNumber}</strong>${lap.isOutlier ? ' <span class="outlier-pill">ATÍPICO</span>' : ''}</td>
          <td>${formatTime(lap.splitDurationMs)}</td>
          <td>${formatTime(lap.cumulativeDurationMs)}</td>
        </tr>`).join('');

      lapsHTML = `
        <div class="modal-section-title">Historial de Pases</div>
        <div class="laps-table-wrapper">
          <table class="laps-table">
            <thead><tr><th>#</th><th>Parcial</th><th>Acumulado</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    } else {
      lapsHTML = `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:16px;">Sin pases registrados aún.</div>`;
    }

    const canReset = typeof this.callbacks.canReset === 'function'
      ? this.callbacks.canReset()
      : laps.length > 0;

    this.bodyEl.innerHTML = zonesHTML + metricsHTML + boxplotHTML + lapsHTML + `
      <div class="modal-actions-bar metrics-actions">
        <button type="button" id="metrics-reset-session" class="btn-secondary btn-danger" ${canReset ? '' : 'disabled'}>
          Borrar sesión
        </button>
        <button type="button" id="metrics-delete-swimmer" class="btn-secondary btn-danger">
          Eliminar nadador
        </button>
      </div>`;

    const resetButton = this.bodyEl.querySelector('#metrics-reset-session');
    if (resetButton) {
      resetButton.addEventListener('click', async () => {
        const swimmerName = this.swimmer?.name || 'este nadador';
        const confirmed = window.confirm(
          `¿Quieres borrar los datos de la sesión de ${swimmerName}? Se eliminarán el cronómetro y los pases; el perfil del nadador se conservará.`
        );
        if (!confirmed || typeof this.callbacks.onReset !== 'function') return;

        try {
          const updatedLaps = await this.callbacks.onReset();
          this.laps = Array.isArray(updatedLaps) ? updatedLaps : [];
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
    if (laps.length > 0) {
      const boxplotEl = document.getElementById(boxplotId);
      if (boxplotEl) {
        const splits = laps.map(l => l.splitDurationMs / 1000);
        renderBoxplot(boxplotEl, splits, { baseline: swimmer.baseline100mSeconds });
      }
    }
  }
}

export const metricsModal = new MetricsModal();
export default metricsModal;
