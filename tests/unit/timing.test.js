import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { SwimmerRepository } from '../../js/storage/repository.js';
import { closeDB } from '../../js/storage/db.js';

// Dynamic import for progressive testability (Milestone 2 dependency)
let timerModule = null;
try {
  timerModule = await import('../../js/timing/timer-engine.js');
} catch (err) {
  // Module pending Milestone 2 implementation
}

describe('Timing Engine Unit Tests', () => {
  let repo;
  let engine;

  beforeEach(async () => {
    repo = new SwimmerRepository();
    await repo.init();
    await repo.clearAll();

    if (timerModule) {
      if (typeof timerModule.TimerEngine === 'function') {
        engine = new timerModule.TimerEngine(repo);
      } else if (timerModule.timerEngine) {
        engine = timerModule.timerEngine;
        if (typeof engine.init === 'function') await engine.init(repo);
      } else {
        engine = timerModule;
      }
    }
  });

  afterEach(async () => {
    await repo.clearAll();
    closeDB();
  });

  function getHelper(t) {
    if (!timerModule) {
      t.skip('Pending Milestone 2 implementation (js/timing/timer-engine.js)');
      return null;
    }
    return engine;
  }

  // ==========================================
  // Group 1: State Machine Transitions
  // ==========================================
  describe('State Machine Transitions', () => {
    test('TC-T1-101: start() transitions timer from IDLE to RUNNING', async (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      const swimmerId = 'swim-t1';
      await repo.saveSwimmer({ id: swimmerId, name: 'Timer Swimmer 1', lane: 1, baseline100mSeconds: 60 });

      const before = Date.now();
      const state = await eng.start(swimmerId);
      const after = Date.now();

      assert.strictEqual(state.state, 'RUNNING');
      assert.ok(state.startTime >= before && state.startTime <= after, 'startTime must be current timestamp');
      assert.ok(state.lastResumeTime >= before && state.lastResumeTime <= after, 'lastResumeTime must be current timestamp');
      assert.strictEqual(state.accumulatedMs, 0, 'accumulatedMs must be 0 initially');

      // Verify persisted to storage
      const persisted = await repo.getTimerState(swimmerId);
      assert.strictEqual(persisted.state, 'RUNNING');
    });

    test('TC-T1-102: pause() transitions from RUNNING to PAUSED and updates accumulatedMs', async (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      const swimmerId = 'swim-t2';
      await repo.saveSwimmer({ id: swimmerId, name: 'Timer Swimmer 2', lane: 2, baseline100mSeconds: 60 });
      await eng.start(swimmerId);

      // Simulate timer running for 500ms
      await new Promise(r => setTimeout(r, 60));

      const pausedState = await eng.pause(swimmerId);
      assert.strictEqual(pausedState.state, 'PAUSED');
      assert.ok(pausedState.accumulatedMs >= 50, `accumulatedMs must be >= 50ms, got ${pausedState.accumulatedMs}`);
      assert.strictEqual(pausedState.lastResumeTime, null, 'lastResumeTime must be null when paused');

      // Double pause should remain PAUSED
      const pauseAgain = await eng.pause(swimmerId);
      assert.strictEqual(pauseAgain.state, 'PAUSED');
    });

    test('TC-T1-103: resume() transitions from PAUSED back to RUNNING without losing accumulatedMs', async (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      const swimmerId = 'swim-t3';
      await repo.saveSwimmer({ id: swimmerId, name: 'Timer Swimmer 3', lane: 3, baseline100mSeconds: 60 });
      await eng.start(swimmerId);
      await new Promise(r => setTimeout(r, 50));
      const paused = await eng.pause(swimmerId);
      const accumulatedBefore = paused.accumulatedMs;

      // Resume
      const beforeResume = Date.now();
      const resumedState = await eng.resume(swimmerId);
      assert.strictEqual(resumedState.state, 'RUNNING');
      assert.strictEqual(resumedState.accumulatedMs, accumulatedBefore, 'accumulatedMs must remain intact upon resume');
      assert.ok(resumedState.lastResumeTime >= beforeResume, 'lastResumeTime should be set to resume epoch');
    });

    test('TC-T1-104: stop() transitions timer to STOPPED', async (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      const swimmerId = 'swim-t4';
      await repo.saveSwimmer({ id: swimmerId, name: 'Timer Swimmer 4', lane: 4, baseline100mSeconds: 60 });
      await eng.start(swimmerId);
      await new Promise(r => setTimeout(r, 50));

      const stopped = await eng.stop(swimmerId);
      assert.strictEqual(stopped.state, 'STOPPED');
      assert.ok(stopped.accumulatedMs >= 50);

      // Can also stop from PAUSED
      await eng.start(swimmerId);
      await eng.pause(swimmerId);
      const stoppedFromPaused = await eng.stop(swimmerId);
      assert.strictEqual(stoppedFromPaused.state, 'STOPPED');
    });

    test('TC-T1-105: reset() transitions timer back to IDLE and clears elapsed time', async (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      const swimmerId = 'swim-t5';
      await repo.saveSwimmer({ id: swimmerId, name: 'Timer Swimmer 5', lane: 5, baseline100mSeconds: 60 });
      await eng.start(swimmerId);
      await eng.stop(swimmerId);

      const resetState = await eng.reset(swimmerId);
      assert.strictEqual(resetState.state, 'IDLE');
      assert.strictEqual(resetState.accumulatedMs, 0);
      assert.strictEqual(resetState.startTime, null);
      assert.strictEqual(resetState.lastResumeTime, null);
    });
  });

  // ==========================================
  // Group 2: Elapsed Time Math & Precision Formatting
  // ==========================================
  describe('Elapsed Time Math & Formatting', () => {
    test('TC-T1-106: getElapsedMs() returns 0 for IDLE or null state', (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      assert.strictEqual(eng.getElapsedMs({ state: 'IDLE', accumulatedMs: 0 }), 0);
      assert.strictEqual(eng.getElapsedMs(null), 0);
    });

    test('TC-T1-107: getElapsedMs() on RUNNING computes accumulatedMs + delta', (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      const now = Date.now();
      const state = {
        state: 'RUNNING',
        accumulatedMs: 10000,
        lastResumeTime: now - 3500
      };

      const elapsed = eng.getElapsedMs(state);
      assert.ok(elapsed >= 13500 && elapsed <= 13550, `Expected ~13500ms, got ${elapsed}`);
    });

    test('TC-T1-108: getElapsedMs() on PAUSED returns exact accumulatedMs without drift', (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      const state = {
        state: 'PAUSED',
        accumulatedMs: 45230,
        lastResumeTime: null
      };

      assert.strictEqual(eng.getElapsedMs(state), 45230);
    });

    test('TC-T1-109: formatTime formats milliseconds as MM:SS.ss', (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      assert.strictEqual(eng.formatTime(0), '00:00.00');
      assert.strictEqual(eng.formatTime(500), '00:00.50');
      assert.strictEqual(eng.formatTime(15250), '00:15.25');
      assert.strictEqual(eng.formatTime(60000), '01:00.00');
      assert.strictEqual(eng.formatTime(65430), '01:05.43');
      assert.strictEqual(eng.formatTime(125890), '02:05.89');
    });

    test('TC-T2-103: formatTime handles long duration (> 1 hour)', (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      const fourHoursMs = 4 * 3600 * 1000 + 125000 + 450;
      const formatted = eng.formatTime(fourHoursMs);
      assert.ok(formatted.includes('02:05.45') || formatted.includes('04:02:05.45'),
        `Formatted string should accurately represent hours and minutes: ${formatted}`);
    });

    test('TC-T2-104: Negative delta protection prevents negative elapsed interval', (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      // Simulate system clock shifted 10 seconds into the past
      const futureTimestamp = Date.now() + 10000;
      const state = {
        state: 'RUNNING',
        accumulatedMs: 5000,
        lastResumeTime: futureTimestamp
      };

      const elapsed = eng.getElapsedMs(state);
      assert.ok(elapsed >= 5000, `Elapsed must not be less than accumulatedMs 5000, got ${elapsed}`);
    });
  });

  // ==========================================
  // Group 3: Lap Recording & Splits
  // ==========================================
  describe('Lap Recording & Splits Calculation', () => {
    test('TC-T1-201: recordLap() creates Lap 1 with splitDurationMs === cumulativeDurationMs', async (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      const swimmerId = 'swim-lap-101';
      await repo.saveSwimmer({ id: swimmerId, name: 'Lap Swimmer', lane: 1, baseline100mSeconds: 60 });
      await eng.start(swimmerId);
      await new Promise(r => setTimeout(r, 60));

      const { lap, state } = await eng.recordLap(swimmerId);
      assert.strictEqual(lap.lapNumber, 1);
      assert.strictEqual(lap.splitDurationMs, lap.cumulativeDurationMs, 'Lap 1 split must equal cumulative');
      assert.ok(lap.splitDurationMs >= 50);
      assert.strictEqual(state.currentLapIndex, 2);
    });

    test('TC-T1-202: Subsequent laps calculate splitDurationMs as incremental delta', async (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      const swimmerId = 'swim-lap-102';
      await repo.saveSwimmer({ id: swimmerId, name: 'Split Swimmer', lane: 2, baseline100mSeconds: 60 });
      await eng.start(swimmerId);

      await new Promise(r => setTimeout(r, 50));
      const res1 = await eng.recordLap(swimmerId);

      await new Promise(r => setTimeout(r, 50));
      const res2 = await eng.recordLap(swimmerId);

      assert.strictEqual(res2.lap.lapNumber, 2);
      assert.strictEqual(
        res2.lap.splitDurationMs,
        res2.lap.cumulativeDurationMs - res1.lap.cumulativeDurationMs,
        'Lap 2 split must be delta between cumulative times'
      );
    });

    test('TC-T1-205: recordLap() on IDLE or STOPPED state throws error or is ignored', async (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      const swimmerId = 'swim-lap-idle';
      await repo.saveSwimmer({ id: swimmerId, name: 'Idle Swimmer', lane: 3, baseline100mSeconds: 60 });

      // In IDLE state, recording lap should throw or return null/error
      await assert.rejects(async () => {
        await eng.recordLap(swimmerId);
      }, /Cannot record lap/);
    });
  });

  // ==========================================
  // Group 4: Hard Reload Recovery Arithmetic
  // ==========================================
  describe('Hard Reload Recovery Wall-Clock Arithmetic', () => {
    test('TC-T1-405: Hard reload recovery preserves running timer without lost seconds', async (t) => {
      const eng = getHelper(t);
      if (!eng) return;

      const swimmerId = 'swim-reload-rec';
      // Simulate persisted state from before reload:
      // Swimmer had run 4000ms previously, resumed 3000ms ago. Total real elapsed = 7000ms.
      const now = Date.now();
      const simulatedPersistedState = {
        swimmerId,
        state: 'RUNNING',
        startTime: now - 8000,
        lastResumeTime: now - 3000,
        accumulatedMs: 4000,
        currentLapIndex: 2,
        lastLapCumulativeMs: 4000
      };
      await repo.saveTimerState(simulatedPersistedState);

      // Rehydrate state
      const rehydratedState = await repo.getTimerState(swimmerId);
      const calculatedElapsed = eng.getElapsedMs(rehydratedState);

      // Must be ~7000ms (within 50ms tolerance of execution time)
      assert.ok(
        calculatedElapsed >= 6950 && calculatedElapsed <= 7100,
        `Expected ~7000ms elapsed, got ${calculatedElapsed}ms`
      );
    });
  });
});
