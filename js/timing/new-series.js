// New Series - SwimCoach Tracker
// Clasifica las tarjetas y limpia los tableros entre series sin perder tiempos.
// Los pases ya registrados en IndexedDB nunca se borran: solo se reinicia el timer_state y la vista.

import { TIMER_STATES, getElapsedMs } from './timer-engine.js';

/** Tiempo mínimo sin registrar (ms) para considerar que un cronómetro pausado tiene un tramo pendiente. */
export const PENDING_THRESHOLD_MS = 10;

/**
 * Milisegundos transcurridos desde el último pase registrado.
 * @param {Object} timerState
 * @returns {number}
 */
export function getPendingMs(timerState) {
  const elapsed = getElapsedMs(timerState);
  const lastLap = Number(timerState?.lastLapCumulativeMs) || 0;
  return Math.max(0, elapsed - lastLap);
}

/**
 * Clasifica las tarjetas para "Nueva serie".
 * - finished: DETENIDO, o PAUSADO sin tiempo pendiente (p. ej. tras Pase+Pausa). Se pueden limpiar sin perder nada.
 * - inProgress: CORRIENDO, o PAUSADO con tiempo sin registrar. Limpiarlos sin guardar perdería ese tramo.
 * - idle: ya en cero; no requieren acción.
 * @param {Iterable<Object>} cards - Objetos con `timerState`
 * @returns {{ finished: Object[], inProgress: Object[], idle: Object[] }}
 */
export function classifyForNewSeries(cards) {
  const result = { finished: [], inProgress: [], idle: [] };
  for (const card of cards) {
    const state = card?.timerState?.state ?? TIMER_STATES.IDLE;
    if (state === TIMER_STATES.RUNNING) {
      result.inProgress.push(card);
    } else if (state === TIMER_STATES.PAUSED) {
      if (getPendingMs(card.timerState) >= PENDING_THRESHOLD_MS) {
        result.inProgress.push(card);
      } else {
        result.finished.push(card);
      }
    } else if (state === TIMER_STATES.STOPPED) {
      result.finished.push(card);
    } else {
      result.idle.push(card);
    }
  }
  return result;
}

/**
 * Ejecuta "Nueva serie" sobre las tarjetas.
 * Re-clasifica en el momento de ejecutar (el estado pudo cambiar mientras el diálogo estaba abierto).
 * @param {Iterable<Object>} cards - SwimmerCard (requiere handleReset y, para inProgress, saveAndStop)
 * @param {Object} [options]
 * @param {boolean} [options.includeInProgress=false] - Si es true, guarda el tramo pendiente y detiene antes de limpiar.
 * @returns {Promise<{ reset: number, skipped: number }>}
 */
export async function runNewSeries(cards, { includeInProgress = false } = {}) {
  const { finished, inProgress } = classifyForNewSeries(cards);

  const tasks = finished.map(card => card.handleReset());
  if (includeInProgress) {
    for (const card of inProgress) {
      tasks.push((async () => {
        await card.saveAndStop();
        await card.handleReset();
      })());
    }
  }
  await Promise.all(tasks);

  return {
    reset: finished.length + (includeInProgress ? inProgress.length : 0),
    skipped: includeInProgress ? 0 : inProgress.length
  };
}
