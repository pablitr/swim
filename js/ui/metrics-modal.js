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
   * @param {Array} laps - Array de vuelas registradas
   */
  open(swimmer, laps = []) {
    this._init();
    if (!this.modalEl) return;

    // Encabezado
    if (this.laneEl) this.laneEl.textContent = `C${swimmer.lane ?? '-'}`;
    if (this.titleEl) this.titleEl.textContent = swimmer.name || 'Nadador';

    // Renderizar contenido
    this._renderBody(swimmer, laps);

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

    this.bodyEl.innerHTML = zonesHTML + metricsHTML + boxplotHTML + lapsHTML;

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
