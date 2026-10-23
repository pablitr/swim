import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { SwimmerCard } from '../../js/ui/swimmer-card.js';
import { timerEngine, TIMER_STATES } from '../../js/timing/timer-engine.js';
import { repository } from '../../js/storage/repository.js';
import { classifyForNewSeries, runNewSeries, getPendingMs } from '../../js/timing/new-series.js';
import { buildNewSeriesContent, NEW_SERIES_CHOICE } from '../../js/ui/new-series-dialog.js';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

function makeCard(id, name = id) {
  return new SwimmerCard({ swimmer: { id, name, lane: 1 } });
}

describe('Nueva serie — clasificación pura', () => {
  const st = (state, accumulatedMs = 0, lastLapCumulativeMs = 0) => ({
    timerState: { state, accumulatedMs, lastLapCumulativeMs, lastResumeTime: Date.now(), startTime: Date.now() }
  });

  test('IDLE → idle, STOPPED → finished, RUNNING → inProgress', () => {
    const r = classifyForNewSeries([st(TIMER_STATES.IDLE), st(TIMER_STATES.STOPPED, 5000, 5000), st(TIMER_STATES.RUNNING)]);
    assert.equal(r.idle.length, 1);
    assert.equal(r.finished.length, 1);
    assert.equal(r.inProgress.length, 1);
  });

  test('PAUSADO tras Pase+Pausa (sin pendiente) → finished', () => {
    const r = classifyForNewSeries([st(TIMER_STATES.PAUSED, 30000, 30000)]);
    assert.equal(r.finished.length, 1);
  });

  test('PAUSADO con tiempo sin registrar → inProgress', () => {
    const r = classifyForNewSeries([st(TIMER_STATES.PAUSED, 30000, 20000)]);
    assert.equal(r.inProgress.length, 1);
    assert.equal(getPendingMs({ state: TIMER_STATES.PAUSED, accumulatedMs: 30000, lastLapCumulativeMs: 20000 }), 10000);
  });
});

describe('Nueva serie — contenido del diálogo', () => {
  test('todo en cero → solo "Cerrar"', () => {
    const c = buildNewSeriesContent({ finishedCount: 0, inProgressNames: [] });
    assert.deepEqual(c.actions.map(a => a.choice), [NEW_SERIES_CHOICE.CANCEL]);
  });

  test('solo terminados → Cancelar + Limpiar', () => {
    const c = buildNewSeriesContent({ finishedCount: 3, inProgressNames: [] });
    assert.deepEqual(c.actions.map(a => a.choice), [NEW_SERIES_CHOICE.CANCEL, NEW_SERIES_CHOICE.ALL]);
    assert.match(c.html, /3 tableros/);
  });

  test('mixto → ofrece limpiar solo terminados y lista nombres escapados', () => {
    const c = buildNewSeriesContent({ finishedCount: 2, inProgressNames: ['Ana', '<b>X</b>'] });
    assert.deepEqual(c.actions.map(a => a.choice),
      [NEW_SERIES_CHOICE.CANCEL, NEW_SERIES_CHOICE.FINISHED_ONLY, NEW_SERIES_CHOICE.ALL]);
    assert.match(c.html, /2 cronómetros siguen/);
    assert.ok(c.html.includes('&lt;b&gt;X&lt;/b&gt;'));
    assert.ok(!c.html.includes('<b>X</b>'));
  });

  test('solo en curso → no ofrece "solo terminados"', () => {
    const c = buildNewSeriesContent({ finishedCount: 0, inProgressNames: ['Ana'] });
    assert.ok(!c.actions.some(a => a.choice === NEW_SERIES_CHOICE.FINISHED_ONLY));
  });
});

describe('Nueva serie — integración con SwimmerCard + IndexedDB', () => {
  let originalDocument;

  beforeEach(async () => {
    originalDocument = globalThis.document;
    globalThis.document = { createElement: () => ({}), getElementById: () => null };
    await repository.init();
    await repository.clearAll();
    await timerEngine.init(repository);
  });

  afterEach(() => {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  });

  async function setupMixed() {
    const stopped = makeCard('s-stopped', 'Detenido');
    await stopped.handleStart();
    await wait(30);
    await stopped.handleLap();
    await stopped.handleStop();

    const running = makeCard('s-running', 'Corriendo');
    await running.handleStart();
    await wait(30);
    await running.handleLap();
    await wait(30);

    const pausedPending = makeCard('s-paused', 'Pausado');
    await pausedPending.handleStart();
    await wait(30);
    await pausedPending.handlePause();

    const idle = makeCard('s-idle', 'Reposo');
    return { stopped, running, pausedPending, idle, all: [stopped, running, pausedPending, idle] };
  }

  test('por defecto limpia solo terminados; los en curso no se tocan', async () => {
    const { stopped, running, pausedPending, all } = await setupMixed();
    const lapsBefore = (await repository.getLaps(stopped.swimmer.id)).length;

    const res = await runNewSeries(all, { includeInProgress: false });

    assert.deepEqual(res, { reset: 1, skipped: 2 });
    assert.equal(stopped.timerState.state, TIMER_STATES.IDLE);
    assert.equal(stopped.laps.length, 0, 'vista limpia');
    assert.equal((await repository.getLaps(stopped.swimmer.id)).length, lapsBefore, 'historial intacto');
    assert.equal(running.timerState.state, TIMER_STATES.RUNNING);
    assert.equal(pausedPending.timerState.state, TIMER_STATES.PAUSED);
  });

  test('"Detener, guardar y limpiar todo" registra tramos pendientes antes de limpiar', async () => {
    const { running, pausedPending, all } = await setupMixed();
    const runningLapsBefore = (await repository.getLaps(running.swimmer.id)).length;

    const res = await runNewSeries(all, { includeInProgress: true });

    assert.deepEqual(res, { reset: 3, skipped: 0 });
    for (const c of all) assert.equal(c.timerState.state, TIMER_STATES.IDLE);

    assert.equal((await repository.getLaps(running.swimmer.id)).length, runningLapsBefore + 1,
      'corriendo: se guardó el tramo pendiente');
    const pausedLaps = await repository.getLaps(pausedPending.swimmer.id);
    assert.equal(pausedLaps.length, 1, 'pausado: se guardó el tramo sin registrar');
    assert.ok(pausedLaps[0].splitDurationMs >= 25);
  });

  test('tras limpiar, el próximo pase vuelve a V1 (nueva serie para el particionador)', async () => {
    const { stopped, all } = await setupMixed();
    await runNewSeries(all);
    await stopped.handleStart();
    await wait(20);
    await stopped.handleLap();
    const laps = await repository.getLaps(stopped.swimmer.id);
    assert.equal(laps.at(-1).lapNumber, 1);
  });
});
