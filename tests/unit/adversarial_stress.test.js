import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { SwimmerRepository } from '../../js/storage/repository.js';
import { closeDB } from '../../js/storage/db.js';
import { TimerEngine, TIMER_STATES, formatTime, getElapsedMs } from '../../js/timing/timer-engine.js';
import { calculateTrainingZones } from '../../js/analytics/zones.js';
import { computeSustainablePace } from '../../js/analytics/pace-calculator.js';
import { computeBoxplotStats } from '../../js/analytics/stats.js';
import { renderBoxplotSVG } from '../../js/ui/boxplot-svg.js';
import { Ticker } from '../../js/timing/ticker.js';

describe('Adversarial Stress & Edge Case Test Suite', () => {
  let repo;
  let engine;

  beforeEach(async () => {
    repo = new SwimmerRepository();
    await repo.init();
    await repo.clearAll();
    engine = new TimerEngine(repo);
  });

  afterEach(async () => {
    await repo.clearAll();
    closeDB();
  });

  // =========================================================================
  // Challenge 1: Timing Resilience & Fault Tolerance
  // =========================================================================
  describe('Challenge 1: Timing Resilience & Clock Anomalies', () => {
    test('TC-ADV-101: Rapid button spamming (<50ms intervals) does not corrupt state or cause race conditions', async () => {
      const swimmerId = 'swim-spam-01';
      await repo.saveSwimmer({ id: swimmerId, name: 'Spam Tester', lane: 1 });

      // Simulate rapid start spamming within <10ms
      const startPromises = [
        engine.start(swimmerId),
        engine.start(swimmerId),
        engine.start(swimmerId)
      ];
      const startStates = await Promise.all(startPromises);
      for (const s of startStates) {
        assert.strictEqual(s.state, TIMER_STATES.RUNNING);
      }

      // Simulate rapid pause/resume spamming (<20ms intervals)
      await engine.pause(swimmerId);
      await engine.resume(swimmerId);
      await engine.pause(swimmerId);
      await engine.resume(swimmerId);

      const finalState = await engine.getState(swimmerId);
      assert.strictEqual(finalState.state, TIMER_STATES.RUNNING);
      assert.ok(typeof finalState.accumulatedMs === 'number' && !isNaN(finalState.accumulatedMs));
    });

    test('TC-ADV-102: Negative clock adjustment (OS clock rewound into the past)', async () => {
      // Simulate system clock jumped backwards by 1 hour (NTP sync or manual clock change)
      const now = Date.now();
      const futureResumeTime = now + 3600 * 1000; // 1 hour ahead of now

      const clockSkewedState = {
        swimmerId: 'swim-skew',
        state: TIMER_STATES.RUNNING,
        startTime: now,
        lastResumeTime: futureResumeTime,
        accumulatedMs: 15000,
        currentLapIndex: 2,
        lastLapCumulativeMs: 15000
      };

      const elapsed = getElapsedMs(clockSkewedState);
      // Negative delta protection must ensure elapsed is never less than accumulatedMs
      assert.strictEqual(elapsed, 15000, 'Negative delta must be clamped to 0 without decreasing accumulatedMs');

      // Test formatTime on negative or NaN inputs
      assert.strictEqual(formatTime(-5000), '00:00.00', 'Negative milliseconds must format safely as 00:00.00');
      assert.strictEqual(formatTime(NaN), '00:00.00', 'NaN milliseconds must format safely as 00:00.00');
      assert.strictEqual(formatTime(null), '00:00.00', 'Null milliseconds must format safely as 00:00.00');
    });

    test('TC-ADV-103: Long-running durations (> 1 hour, 24 hours, 100 hours)', () => {
      // 1 hour, 2 minutes, 3 seconds, 450 ms
      const duration1Hr = 1 * 3600 * 1000 + 2 * 60 * 1000 + 3 * 1000 + 450;
      assert.strictEqual(formatTime(duration1Hr), '01:02:03.45', 'Should format 1+ hour as HH:MM:SS.ss');

      // 24 hours
      const duration24Hr = 24 * 3600 * 1000;
      assert.strictEqual(formatTime(duration24Hr), '24:00:00.00', 'Should format 24 hours as 24:00:00.00');

      // 100 hours
      const duration100Hr = 100 * 3600 * 1000 + 59 * 60 * 1000 + 59 * 1000 + 990;
      assert.strictEqual(formatTime(duration100Hr), '100:59:59.99', 'Should format 100 hours without overflow');
    });
  });

  // =========================================================================
  // Challenge 2: Concurrent Multi-Swimmer Isolation (10 Concurrent Swimmers)
  // =========================================================================
  describe('Challenge 2: 10 Concurrent Swimmers Interleaved Load', () => {
    test('TC-ADV-201: 10 simultaneous swimmers with asynchronous interleaved actions', async () => {
      const swimmerCount = 10;
      const swimmers = [];

      for (let i = 1; i <= swimmerCount; i++) {
        const swimmer = {
          id: `swimmer-${i}`,
          name: `Swimmer Lane ${i}`,
          lane: i,
          baseline100mSeconds: 50 + i
        };
        swimmers.push(swimmer);
        await repo.saveSwimmer(swimmer);
      }

      // Step 1: Simultaneous Heat Start across all 10 swimmers
      await Promise.all(swimmers.map(s => engine.start(s.id)));

      // Verify all 10 are running
      const statesAfterStart = await Promise.all(swimmers.map(s => engine.getState(s.id)));
      for (const st of statesAfterStart) {
        assert.strictEqual(st.state, TIMER_STATES.RUNNING);
      }

      // Step 2: Interleaved operations
      // Wait 30ms
      await new Promise(r => setTimeout(r, 30));

      // Swimmers 1-5 record Lap 1
      for (let i = 1; i <= 5; i++) {
        await engine.recordLap(`swimmer-${i}`);
      }

      // Swimmer 6 pauses
      await engine.pause('swimmer-6');

      // Swimmer 7 stops
      await engine.stop('swimmer-7');

      // Wait 30ms
      await new Promise(r => setTimeout(r, 30));

      // Swimmers 1-3 record Lap 2
      for (let i = 1; i <= 3; i++) {
        await engine.recordLap(`swimmer-${i}`);
      }

      // Swimmer 6 resumes
      await engine.resume('swimmer-6');

      // Swimmers 8-10 record Lap 1
      for (let i = 8; i <= 10; i++) {
        await engine.recordLap(`swimmer-${i}`);
      }

      // Step 3: Verify strict data isolation (no cross-talk)
      for (let i = 1; i <= swimmerCount; i++) {
        const laps = await repo.getLaps(`swimmer-${i}`);

        // Verify all laps belong exclusively to this swimmer
        assert.ok(laps.every(l => l.swimmerId === `swimmer-${i}`), `Swimmer ${i} laps contaminated`);

        // Check expected lap counts:
        // Swimmers 1-3: 2 laps
        // Swimmers 4-5: 1 lap
        // Swimmer 6: 0 laps (paused & resumed)
        // Swimmer 7: 0 laps (stopped)
        // Swimmers 8-10: 1 lap
        if (i <= 3) {
          assert.strictEqual(laps.length, 2, `Swimmer ${i} should have 2 laps`);
          assert.strictEqual(laps[0].lapNumber, 1);
          assert.strictEqual(laps[1].lapNumber, 2);
          assert.ok(laps[1].cumulativeDurationMs >= laps[0].cumulativeDurationMs);
        } else if (i <= 5) {
          assert.strictEqual(laps.length, 1, `Swimmer ${i} should have 1 lap`);
        } else if (i === 6) {
          assert.strictEqual(laps.length, 0, `Swimmer 6 should have 0 laps`);
          const st = await engine.getState('swimmer-6');
          assert.strictEqual(st.state, TIMER_STATES.RUNNING);
        } else if (i === 7) {
          assert.strictEqual(laps.length, 0, `Swimmer 7 should have 0 laps`);
          const st = await engine.getState('swimmer-7');
          assert.strictEqual(st.state, TIMER_STATES.STOPPED);
        } else {
          assert.strictEqual(laps.length, 1, `Swimmer ${i} should have 1 lap`);
        }
      }
    });
  });

  // =========================================================================
  // Challenge 3: Hard Reload Resilience Across Multiple Successive Restarts
  // =========================================================================
  describe('Challenge 3: Repeated Rapid Hard Reloads Mid-Run', () => {
    test('TC-ADV-301: Multiple successive simulated browser restarts preserve wall-clock continuity', async () => {
      const swimmerId = 'swim-multi-reload';
      await repo.saveSwimmer({ id: swimmerId, name: 'Reload Resilience Swimmer', lane: 1 });

      // Start timer
      await engine.start(swimmerId);
      await new Promise(r => setTimeout(r, 40));
      const lap1 = await engine.recordLap(swimmerId);

      // --- SIMULATED RELOAD 1 ---
      closeDB();
      await new Promise(r => setTimeout(r, 60)); // 60ms reload delay

      let repo2 = new SwimmerRepository();
      await repo2.init();
      let engine2 = new TimerEngine(repo2);

      const stateReload1 = await engine2.getState(swimmerId);
      assert.strictEqual(stateReload1.state, TIMER_STATES.RUNNING);
      const elapsedReload1 = engine2.getElapsedMs(stateReload1);
      assert.ok(elapsedReload1 >= 100, `Elapsed after reload 1 must be >= 100ms, got ${elapsedReload1}`);

      // Record Lap 2 in session 2
      await new Promise(r => setTimeout(r, 40));
      const lap2 = await engine2.recordLap(swimmerId);
      assert.strictEqual(lap2.lap.lapNumber, 2);
      assert.ok(lap2.lap.splitDurationMs >= 40);

      // --- SIMULATED RELOAD 2 ---
      closeDB();
      await new Promise(r => setTimeout(r, 50)); // 50ms reload delay

      let repo3 = new SwimmerRepository();
      await repo3.init();
      let engine3 = new TimerEngine(repo3);

      const stateReload2 = await engine3.getState(swimmerId);
      assert.strictEqual(stateReload2.state, TIMER_STATES.RUNNING);
      const elapsedReload2 = engine3.getElapsedMs(stateReload2);
      assert.ok(elapsedReload2 >= elapsedReload1 + 90, `Wall clock must advance across reload 2`);

      // Verify all laps restored in session 3
      const allLaps = await repo3.getLaps(swimmerId);
      assert.strictEqual(allLaps.length, 2);
      assert.strictEqual(allLaps[0].lapNumber, 1);
      assert.strictEqual(allLaps[1].lapNumber, 2);

      // Pause before reload 3
      await engine3.pause(swimmerId);
      const pausedElapsed = engine3.getElapsedMs(await engine3.getState(swimmerId));

      // --- SIMULATED RELOAD 3 (Paused state) ---
      closeDB();
      await new Promise(r => setTimeout(r, 60));

      let repo4 = new SwimmerRepository();
      await repo4.init();
      let engine4 = new TimerEngine(repo4);

      const stateReload3 = await engine4.getState(swimmerId);
      assert.strictEqual(stateReload3.state, TIMER_STATES.PAUSED);
      const elapsedReload3 = engine4.getElapsedMs(stateReload3);
      assert.strictEqual(elapsedReload3, pausedElapsed, 'Paused timer must NOT advance wall-clock time across reloads');
    });
  });

  // =========================================================================
  // Challenge 4: Degenerate Inputs & Adversarial Analytics Datasets
  // =========================================================================
  describe('Challenge 4: Degenerate Inputs & Analytical Boundary Conditions', () => {
    test('TC-ADV-401: 0 laps degenerate case', () => {
      const paceResult = computeSustainablePace([]);
      assert.strictEqual(paceResult.sustainablePace, null);
      assert.deepStrictEqual(paceResult.inliers, []);
      assert.deepStrictEqual(paceResult.outliers, []);
      assert.deepStrictEqual(paceResult.outlierIndices, []);

      const statsResult = computeBoxplotStats([]);
      assert.strictEqual(statsResult.count, 0);
      assert.strictEqual(statsResult.min, null);
      assert.strictEqual(statsResult.median, null);
      assert.deepStrictEqual(statsResult.outliers, []);

      const svg = renderBoxplotSVG([]);
      assert.ok(svg.includes('Sin datos de pases registrados'));
      assert.ok(!svg.includes('NaN'));
    });

    test('TC-ADV-402: 1 lap degenerate case [45.0]', () => {
      const paceResult = computeSustainablePace([45.0]);
      assert.strictEqual(paceResult.sustainablePace, 45.0);
      assert.deepStrictEqual(paceResult.inliers, [45.0]);
      assert.deepStrictEqual(paceResult.outliers, []);

      const statsResult = computeBoxplotStats([45.0]);
      assert.strictEqual(statsResult.count, 1);
      assert.strictEqual(statsResult.min, 45.0);
      assert.strictEqual(statsResult.median, 45.0);
      assert.strictEqual(statsResult.max, 45.0);
      assert.strictEqual(statsResult.iqr, 0);

      const svg = renderBoxplotSVG([45.0]);
      assert.ok(!svg.includes('NaN'), 'Single lap SVG must not produce NaN');
      assert.ok(svg.includes('45.00s') || svg.includes('45.0s'));
    });

    test('TC-ADV-403: Identical laps degenerate case [45, 45, 45, 45]', () => {
      const paceResult = computeSustainablePace([45, 45, 45, 45]);
      assert.strictEqual(paceResult.sustainablePace, 45.0);
      assert.deepStrictEqual(paceResult.inliers, [45, 45, 45, 45]);
      assert.deepStrictEqual(paceResult.outliers, []);

      const statsResult = computeBoxplotStats([45, 45, 45, 45]);
      assert.strictEqual(statsResult.min, 45);
      assert.strictEqual(statsResult.max, 45);
      assert.strictEqual(statsResult.iqr, 0);
      assert.deepStrictEqual(statsResult.outliers, []);

      const svg = renderBoxplotSVG([45, 45, 45, 45]);
      assert.ok(!svg.includes('NaN'));
    });

    test('TC-ADV-404: Extreme Outlier Analysis: [30, 31, 30, 900] vs [30, 30, 900]', () => {
      // Vector A: [30, 31, 30, 900] (N=4, MAD > 0)
      const resA = computeSustainablePace([30, 31, 30, 900]);
      assert.ok(resA.outliers.includes(900), '900 must be flagged as outlier when N=4 and MAD > 0');
      assert.ok(resA.sustainablePace >= 30.0 && resA.sustainablePace <= 31.0);

      // Vector B: [30, 30, 900] (N=3, MAD == 0 edge case)
      // When 2 out of 3 values are identical, MAD is 0.
      // In the fallback formula modZ = (0.6745 * |900 - 30|) / (1.253314 * meanDev),
      // with meanDev = 870/3, modZ is algebraically bounded to 1.6145, which is < threshold 3.0.
      // Therefore, the modal clustering successfully determines sustainable pace = 30.0,
      // but 900 is retained in inliers because N=3 with zero MAD does not reach threshold 3.0.
      const resB = computeSustainablePace([30, 30, 900]);
      assert.strictEqual(resB.sustainablePace, 30.0, 'Modal clustering must still find 30.0 as sustainable pace');
    });

    test('TC-ADV-405: Baseline training zones input boundaries', () => {
      assert.throws(() => calculateTrainingZones(0), /Invalid baseline/);
      assert.throws(() => calculateTrainingZones(-60), /Invalid baseline/);
      assert.throws(() => calculateTrainingZones(NaN), /Invalid baseline/);
      assert.throws(() => calculateTrainingZones(Infinity), /Invalid baseline/);
    });
  });

  // =========================================================================
  // Challenge 5: Engine Optimization & Storage Batching (Milestone 1)
  // =========================================================================
  describe('Challenge 5: Engine Optimization & Storage Batching', () => {
    test('TC-ADV-501: saveLapAndTimerState commits both records atomically in single transaction', async () => {
      const swimmerId = 'swim-dual-01';
      await repo.saveSwimmer({ id: swimmerId, name: 'Dual Swimmer', lane: 1, baseline100mSeconds: 60 });

      const lap = {
        id: 'lap-dual-1',
        swimmerId,
        lapNumber: 1,
        splitDurationMs: 45000,
        cumulativeDurationMs: 45000,
        timestamp: Date.now()
      };

      const state = {
        swimmerId,
        state: TIMER_STATES.RUNNING,
        accumulatedMs: 45000,
        currentLapIndex: 2,
        lastLapCumulativeMs: 45000,
        lastResumeTime: Date.now()
      };

      await repo.saveLapAndTimerState(lap, state);

      const savedLaps = await repo.getLaps(swimmerId);
      assert.strictEqual(savedLaps.length, 1);
      assert.strictEqual(savedLaps[0].splitDurationMs, 45000);

      const savedState = await repo.getTimerState(swimmerId);
      assert.strictEqual(savedState.currentLapIndex, 2);
      assert.strictEqual(savedState.lastLapCumulativeMs, 45000);

      // Validation tests
      await assert.rejects(async () => {
        await repo.saveLapAndTimerState(null, state);
      }, /Invalid lap object/);

      await assert.rejects(async () => {
        await repo.saveLapAndTimerState(lap, null);
      }, /Invalid timer state object/);
    });

    test('TC-ADV-502: TimerEngine.recordLap calls saveLapAndTimerState under real execution', async () => {
      const swimmerId = 'swim-dual-02';
      await repo.saveSwimmer({ id: swimmerId, name: 'Engine Dual Swimmer', lane: 2, baseline100mSeconds: 58 });

      await engine.start(swimmerId);
      await new Promise(r => setTimeout(r, 20));

      const { lap, state } = await engine.recordLap(swimmerId);
      assert.strictEqual(lap.lapNumber, 1);
      assert.ok(lap.splitDurationMs > 0);
      assert.strictEqual(state.currentLapIndex, 2);

      const persistentState = await repo.getTimerState(swimmerId);
      assert.strictEqual(persistentState.currentLapIndex, 2);

      const persistentLaps = await repo.getLaps(swimmerId);
      assert.strictEqual(persistentLaps.length, 1);
      assert.strictEqual(persistentLaps[0].lapNumber, 1);
    });

    test('TC-ADV-503: Ticker frame rate throttling skips redundant frames on high refresh displays', () => {
      const customTicker = new Ticker(60); // 60 FPS = ~16.6ms interval
      let tickCount = 0;
      const callback = () => { tickCount++; };

      customTicker.subscribe('test-sub', callback);
      customTicker.isRunning = true;

      // First tick at t=100
      customTicker._tick(100);
      assert.strictEqual(tickCount, 1, 'First tick must execute');

      // Immediate tick at t=105 (elapsed 5ms < 14ms threshold) -> should throttle/skip
      customTicker._tick(105);
      assert.strictEqual(tickCount, 1, 'Tick within frame interval must be throttled');

      // Next tick at t=118 (elapsed 18ms >= 14ms) -> should execute
      customTicker._tick(118);
      assert.strictEqual(tickCount, 2, 'Tick after frame interval must execute');

      // Another rapid tick at t=125 (elapsed 7ms < 14ms) -> should throttle
      customTicker._tick(125);
      assert.strictEqual(tickCount, 2, 'Subsequent rapid tick must be throttled');

      // Frame at t=135 (elapsed 17ms >= 14ms) -> should execute
      customTicker._tick(135);
      assert.strictEqual(tickCount, 3, 'Subsequent valid frame must execute');

      customTicker.stop();
      assert.strictEqual(customTicker.lastFrameTime, 0, 'Stopping resets lastFrameTime');
    });
  });
});
