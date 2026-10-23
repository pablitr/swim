// New Series Dialog - SwimCoach Tracker
// Diálogo propio (reemplaza confirm()) con resumen y opciones según haya cronómetros en curso.

import { escapeHtml } from './session-card.js';

/** Elecciones posibles devueltas por el diálogo. */
export const NEW_SERIES_CHOICE = Object.freeze({
  CANCEL: 'cancel',
  FINISHED_ONLY: 'finished-only',
  ALL: 'all'
});

/**
 * Construye el contenido del diálogo (puro, testeable).
 * @param {{ finishedCount: number, inProgressNames: string[] }} summary
 * @returns {{ html: string, actions: Array<{ choice: string, label: string, variant: string }> }}
 */
export function buildNewSeriesContent({ finishedCount, inProgressNames }) {
  const inProgressCount = inProgressNames.length;
  const plural = (n, one, many) => (n === 1 ? one : many);

  if (finishedCount === 0 && inProgressCount === 0) {
    return {
      html: '<p class="new-series-text">Todos los tableros ya están en cero.</p>',
      actions: [{ choice: NEW_SERIES_CHOICE.CANCEL, label: 'Cerrar', variant: 'secondary' }]
    };
  }

  const savedNote = '<p class="new-series-note">Los tiempos ya registrados quedan guardados en el historial.</p>';

  if (inProgressCount === 0) {
    return {
      html: `<p class="new-series-text">Se ${plural(finishedCount, 'limpiará', 'limpiarán')} <strong>${finishedCount} ${plural(finishedCount, 'tablero', 'tableros')}</strong>.</p>${savedNote}`,
      actions: [
        { choice: NEW_SERIES_CHOICE.CANCEL, label: 'Cancelar', variant: 'secondary' },
        { choice: NEW_SERIES_CHOICE.ALL, label: 'Limpiar tableros', variant: 'primary' }
      ]
    };
  }

  const names = inProgressNames.map(n => `<li>${escapeHtml(n)}</li>`).join('');
  const warning = `
    <div class="new-series-warning" role="alert">
      <strong>${inProgressCount} ${plural(inProgressCount, 'cronómetro sigue', 'cronómetros siguen')} en curso:</strong>
      <ul class="new-series-names">${names}</ul>
    </div>`;

  const actions = [{ choice: NEW_SERIES_CHOICE.CANCEL, label: 'Cancelar', variant: 'secondary' }];
  if (finishedCount > 0) {
    actions.push({
      choice: NEW_SERIES_CHOICE.FINISHED_ONLY,
      label: `Limpiar solo ${plural(finishedCount, 'el terminado', `los ${finishedCount} terminados`)}`,
      variant: 'secondary'
    });
  }
  actions.push({ choice: NEW_SERIES_CHOICE.ALL, label: 'Detener, guardar y limpiar todo', variant: 'danger' });

  const intro = finishedCount > 0
    ? `<p class="new-series-text"><strong>${finishedCount} ${plural(finishedCount, 'tablero terminado', 'tableros terminados')}</strong> para limpiar.</p>`
    : '';

  return { html: `${intro}${warning}${savedNote}`, actions };
}

/**
 * Abre el diálogo y resuelve con la elección del usuario.
 * @param {{ finishedCount: number, inProgressNames: string[] }} summary
 * @returns {Promise<string>} Uno de NEW_SERIES_CHOICE
 */
export function openNewSeriesDialog(summary) {
  const modalEl = document.getElementById('new-series-modal');
  const bodyEl = document.getElementById('new-series-body');
  const actionsEl = document.getElementById('new-series-actions');
  if (!modalEl || !bodyEl || !actionsEl) return Promise.resolve(NEW_SERIES_CHOICE.CANCEL);

  const { html, actions } = buildNewSeriesContent(summary);
  bodyEl.innerHTML = html;
  actionsEl.innerHTML = actions.map(a => {
    const cls = a.variant === 'primary' ? 'btn-master btn-start-all'
      : a.variant === 'danger' ? 'btn-secondary btn-danger'
      : 'btn-secondary';
    return `<button type="button" class="${cls}" data-choice="${a.choice}">${escapeHtml(a.label)}</button>`;
  }).join('');

  return new Promise(resolve => {
    const close = (choice) => {
      modalEl.classList.remove('open');
      modalEl.setAttribute('aria-hidden', 'true');
      modalEl.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
      resolve(choice);
    };
    const onClick = (e) => {
      if (e.target === modalEl) return close(NEW_SERIES_CHOICE.CANCEL);
      const btn = e.target.closest?.('[data-choice]');
      if (btn) close(btn.dataset.choice);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close(NEW_SERIES_CHOICE.CANCEL);
    };

    modalEl.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    modalEl.classList.add('open');
    modalEl.setAttribute('aria-hidden', 'false');
    actionsEl.querySelector('[data-choice="cancel"]')?.focus();
  });
}
