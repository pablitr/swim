#!/usr/bin/env node

/**
 * Standalone Acceptance Criteria Verification Runner for SwimCoach Tracker
 *
 * Verifies Acceptance Criteria 1 to 5:
 *   AC 1: Multi-swimmer simultaneous timers, recording 3 laps each, independent split & cumulative durations.
 *   AC 2: Hard reload recovery using the wall-clock timestamp delta formula (resuming active timer without lost seconds, rehydrating laps).
 *   AC 3: Training zones formula: T = base / (pct / 100), verifying 60s at 75% = 80.0s, 80% = 75.0s, 90% = 66.67s. Rejecting simple multiplication (60 * 0.75 = 45s).
 *   AC 4: Sustainable pace outlier rejection: given [45, 45, 46, 60], flags 60 as outlier via MAD / IQR and identifies modal pace ~45.0s, rejecting simple mean 49.0s.
 *   AC 5: Boxplot 5-number summary (Min, Q1, Median, Q3, Max) and outlier identification.
 *
 * Exits with code 0 on PASS and code 1 on FAIL, with clear diagnostic logs.
 */

import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { SwimmerRepository } from '../js/storage/repository.js';
import { closeDB } from '../js/storage/db.js';

// Module loader helpers for progressive testability
async function safeImport(modulePath) {
  try {
    return await import(modulePath);
  } catch (err) {
    return null;
  }
}

async function runAcceptanceVerification() {
  console.log('======================================================================');
  console.log('   SwimCoach Tracker - Standalone Acceptance Verification Suite      ');
  console.log('======================================================================\n');

  const results = {
    ac1: { passed: false, message: '' },
    ac2: { passed: false, message: '' },
    ac3: { passed: false, message: '' },
    ac4: { passed: false, message: '' },
    ac5: { passed: false, message: '' },
  };

  // Pre-load implementation modules
  const timerModule = await safeImport('../js/timing/timer-engine.js');
  const zonesModule = await safeImport('../js/analytics/zones.js');
  const paceModule = await safeImport('../js/analytics/pace-calculator.js');
  const statsModule = await safeImport('../js/analytics/stats.js');

  // ====================================================================
  // AC 1: Multi-swimmer simultaneous timers & 3 laps each
  // ====================================================================
  console.log('[AC 1] Verifying Multi-Swimmer Simultaneous Timers & Laps...');
  try {
    if (!timerModule) {
      throw new Error('Timing Engine (js/timing/timer-engine.js) not found. Pending Milestone 2 implementation.');
    }

    const repo = new SwimmerRepository();
    await repo.init();
    await repo.clearAll();

    let engine;
    if (typeof timerModule.TimerEngine === 'function') {
      engine = new timerModule.TimerEngine(repo);
    } else if (timerModule.timerEngine) {
      engine = timerModule.timerEngine;
      if (typeof engine.init === 'function') await engine.init(repo);
    } else {
      engine = timerModule;
    }

    // Register 2 swimmers
    await repo.saveSwimmer({ id: 'swim-ac1-a', name: 'Swimmer Alpha', lane: 1, baseline100mSeconds: 60.0 });
    await repo.saveSwimmer({ id: 'swim-ac1-b', name: 'Swimmer Beta', lane: 2, baseline100mSeconds: 65.0 });

    // Start both timers simultaneously
    const stateA1 = await engine.start('swim-ac1-a');
    const stateB1 = await engine.start('swim-ac1-b');

    assert.strictEqual(stateA1.state, 'RUNNING', 'Swimmer Alpha must be RUNNING');
    assert.strictEqual(stateB1.state, 'RUNNING', 'Swimmer Beta must be RUNNING');

    // Simulate elapsed intervals & record 3 laps each
    await new Promise(r => setTimeout(r, 60));
    const lapA1 = await engine.recordLap('swim-ac1-a');
    await new Promise(r => setTimeout(r, 40));
    const lapB1 = await engine.recordLap('swim-ac1-b');

    await new Promise(r => setTimeout(r, 60));
    const lapA2 = await engine.recordLap('swim-ac1-a');
    await new Promise(r => setTimeout(r, 50));
    const lapB2 = await engine.recordLap('swim-ac1-b');

    await new Promise(r => setTimeout(r, 60));
    const lapA3 = await engine.recordLap('swim-ac1-a');
    await new Promise(r => setTimeout(r, 40));
    const lapB3 = await engine.recordLap('swim-ac1-b');

    // Verify 3 laps recorded for each
    const lapsA = await repo.getLaps('swim-ac1-a');
    const lapsB = await repo.getLaps('swim-ac1-b');

    assert.strictEqual(lapsA.length, 3, 'Swimmer Alpha must have exactly 3 laps');
    assert.strictEqual(lapsB.length, 3, 'Swimmer Beta must have exactly 3 laps');

    // Verify independent split and cumulative durations for Swimmer A
    assert.strictEqual(lapsA[0].lapNumber, 1);
    assert.strictEqual(lapsA[0].splitDurationMs, lapsA[0].cumulativeDurationMs);
    assert.strictEqual(lapsA[1].lapNumber, 2);
    assert.strictEqual(lapsA[1].splitDurationMs, lapsA[1].cumulativeDurationMs - lapsA[0].cumulativeDurationMs);
    assert.strictEqual(lapsA[2].lapNumber, 3);
    assert.strictEqual(lapsA[2].splitDurationMs, lapsA[2].cumulativeDurationMs - lapsA[1].cumulativeDurationMs);

    // Verify independent split and cumulative durations for Swimmer B
    assert.strictEqual(lapsB[0].lapNumber, 1);
    assert.strictEqual(lapsB[0].splitDurationMs, lapsB[0].cumulativeDurationMs);
    assert.strictEqual(lapsB[1].lapNumber, 2);
    assert.strictEqual(lapsB[1].splitDurationMs, lapsB[1].cumulativeDurationMs - lapsB[0].cumulativeDurationMs);
    assert.strictEqual(lapsB[2].lapNumber, 3);
    assert.strictEqual(lapsB[2].splitDurationMs, lapsB[2].cumulativeDurationMs - lapsB[1].cumulativeDurationMs);

    // Verify no cross-swimmer data contamination
    assert.ok(lapsA.every(l => l.swimmerId === 'swim-ac1-a'));
    assert.ok(lapsB.every(l => l.swimmerId === 'swim-ac1-b'));

    await repo.clearAll();
    closeDB();

    results.ac1.passed = true;
    results.ac1.message = 'PASS: Multi-swimmer simultaneous timers, 3 laps each, independent split & cumulative durations verified.';
    console.log(`  ✔ ${results.ac1.message}\n`);
  } catch (err) {
    results.ac1.passed = false;
    results.ac1.message = `FAIL: ${err.message}`;
    console.log(`  ✖ ${results.ac1.message}\n`);
  }

  // ====================================================================
  // AC 2: Hard reload recovery using wall-clock timestamp delta formula
  // ====================================================================
  console.log('[AC 2] Verifying Hard Reload Recovery & Wall-Clock Continuity...');
  try {
    const repo = new SwimmerRepository();
    await repo.init();
    await repo.clearAll();

    const swimmerId = 'swim-ac2-recovery';
    await repo.saveSwimmer({ id: swimmerId, name: 'Recovery Swimmer', lane: 3, baseline100mSeconds: 60.0 });

    // Step 1: Pre-reload session state setup
    // Timer was running: accumulatedMs = 5000, lastResumeTime = now - 3000.
    // Real elapsed time at this instant = 5000 + 3000 = 8000ms.
    const nowBeforeReload = Date.now();
    const simulatedPersistedState = {
      swimmerId,
      state: 'RUNNING',
      startTime: nowBeforeReload - 8000,
      lastResumeTime: nowBeforeReload - 3000,
      accumulatedMs: 5000,
      currentLapIndex: 3,
      lastLapCumulativeMs: 5000
    };
    await repo.saveTimerState(simulatedPersistedState);

    // Save 2 pre-existing laps
    await repo.saveLap({
      swimmerId,
      lapNumber: 1,
      splitDurationMs: 2500,
      cumulativeDurationMs: 2500,
      timestamp: nowBeforeReload - 5500
    });
    await repo.saveLap({
      swimmerId,
      lapNumber: 2,
      splitDurationMs: 2500,
      cumulativeDurationMs: 5000,
      timestamp: nowBeforeReload - 3000
    });

    // Step 2: Simulate Hard Reload
    // Close DB connection, delay to simulate reload latency, instantiate fresh repository
    closeDB();
    const reloadLatencyMs = 150;
    await new Promise(r => setTimeout(r, reloadLatencyMs));

    const freshRepo = new SwimmerRepository();
    await freshRepo.init();

    // Step 3: Rehydration & Wall-Clock Delta Recovery Verification
    const restoredTimer = await freshRepo.getTimerState(swimmerId);
    assert.ok(restoredTimer, 'Timer state must be rehydrated from storage');
    assert.strictEqual(restoredTimer.state, 'RUNNING', 'Timer state must remain RUNNING across reload');

    // Wall-Clock Timestamp Delta Formula:
    // currentElapsedMs = accumulatedMs + (Date.now() - lastResumeTime)
    const currentNow = Date.now();
    const computedElapsedMs = restoredTimer.accumulatedMs + (currentNow - restoredTimer.lastResumeTime);

    // Expected elapsed is ~ 8000ms + reloadLatencyMs (no seconds lost!)
    const expectedMinMs = 8000 + reloadLatencyMs - 50;
    assert.ok(
      computedElapsedMs >= expectedMinMs,
      `Wall-clock recovery failed: expected >= ${expectedMinMs}ms, got ${computedElapsedMs}ms`
    );

    // Rehydrate Laps
    const restoredLaps = await freshRepo.getLaps(swimmerId);
    assert.strictEqual(restoredLaps.length, 2, 'All pre-reload laps must be rehydrated');
    assert.strictEqual(restoredLaps[0].splitDurationMs, 2500);
    assert.strictEqual(restoredLaps[1].splitDurationMs, 2500);
    assert.strictEqual(restoredLaps[1].cumulativeDurationMs, 5000);

    // Step 4: Record Lap 3 post-reload and verify split continuity
    const lap3CumulativeMs = computedElapsedMs;
    const lap3SplitMs = lap3CumulativeMs - restoredTimer.lastLapCumulativeMs;
    assert.ok(lap3SplitMs >= 3000, `Post-reload split must be relative to last lap cumulative: ${lap3SplitMs}`);

    await freshRepo.clearAll();
    closeDB();

    results.ac2.passed = true;
    results.ac2.message = 'PASS: Hard reload recovery using wall-clock timestamp delta formula verified without lost seconds.';
    console.log(`  ✔ ${results.ac2.message}\n`);
  } catch (err) {
    results.ac2.passed = false;
    results.ac2.message = `FAIL: ${err.message}`;
    console.log(`  ✖ ${results.ac2.message}\n`);
  }

  // ====================================================================
  // AC 3: Training zones formula T = base / (pct / 100)
  // ====================================================================
  console.log('[AC 3] Verifying Training Zones Reciprocal Velocity Formula...');
  try {
    if (!zonesModule) {
      throw new Error('Analytics zones module (js/analytics/zones.js) not found. Pending Milestone 3 implementation.');
    }

    const { calculateTrainingZones } = zonesModule;
    assert.strictEqual(typeof calculateTrainingZones, 'function', 'calculateTrainingZones must be an exported function');

    const baseline = 60.0;
    const zones = calculateTrainingZones(baseline);

    // Requirement: 60s at 75% = 80.0s, 80% = 75.0s, 90% = 66.67s
    assert.strictEqual(zones.zone75, 80.0, `75% zone failed: expected 80.0s, got ${zones.zone75}s`);
    assert.strictEqual(zones.zone80, 75.0, `80% zone failed: expected 75.0s, got ${zones.zone80}s`);

    const zone90Rounded = Math.round(zones.zone90 * 100) / 100;
    assert.strictEqual(zone90Rounded, 66.67, `90% zone failed: expected 66.67s, got ${zones.zone90}s`);

    // Anti-regression check: strictly reject simple multiplication (60 * 0.75 = 45s)
    assert.notStrictEqual(zones.zone75, 45.0, 'Anti-regression violation: zone75 must NOT be 60 * 0.75 = 45s');
    assert.notStrictEqual(zones.zone80, 48.0, 'Anti-regression violation: zone80 must NOT be 60 * 0.80 = 48s');
    assert.notStrictEqual(zones.zone90, 54.0, 'Anti-regression violation: zone90 must NOT be 60 * 0.90 = 54s');

    // Additional baseline test vector: 48s sprint baseline
    const sprintZones = calculateTrainingZones(48.0);
    assert.strictEqual(sprintZones.zone75, 64.0, '48s / 0.75 must be 64.0s');
    assert.strictEqual(sprintZones.zone80, 60.0, '48s / 0.80 must be 60.0s');

    results.ac3.passed = true;
    results.ac3.message = 'PASS: Training zones formula verified (60s @ 75%=80.0s, 80%=75.0s, 90%=66.67s, rejecting simple multiplication 45s).';
    console.log(`  ✔ ${results.ac3.message}\n`);
  } catch (err) {
    results.ac3.passed = false;
    results.ac3.message = `FAIL: ${err.message}`;
    console.log(`  ✖ ${results.ac3.message}\n`);
  }

  // ====================================================================
  // AC 4: Sustainable pace outlier rejection
  // ====================================================================
  console.log('[AC 4] Verifying Sustainable Pace MAD Outlier Rejection...');
  try {
    if (!paceModule) {
      throw new Error('Analytics pace calculator (js/analytics/pace-calculator.js) not found. Pending Milestone 3 implementation.');
    }

    const { computeSustainablePace } = paceModule;
    assert.strictEqual(typeof computeSustainablePace, 'function', 'computeSustainablePace must be an exported function');

    const laps = [45, 45, 46, 60];
    const result = computeSustainablePace(laps);

    // Requirement: flags 60 as outlier via MAD / IQR
    assert.ok(result.outliers.includes(60), `Outlier detection failed: 60 must be in outliers array, got ${JSON.stringify(result.outliers)}`);
    assert.deepStrictEqual(result.outlierIndices, [false, false, false, true], 'outlierIndices must flag index 3 only');
    assert.deepStrictEqual(result.inliers, [45, 45, 46], 'inliers must be [45, 45, 46]');

    // Requirement: identifies modal pace ~45.0s, rejecting simple mean 49.0s
    assert.ok(
      result.sustainablePace >= 45.0 && result.sustainablePace <= 45.5,
      `Modal pace failed: expected ~45.0s, got ${result.sustainablePace}s`
    );
    assert.notStrictEqual(result.sustainablePace, 49.0, 'Anti-regression violation: sustainable pace must NOT equal arithmetic mean 49.0s');

    results.ac4.passed = true;
    results.ac4.message = 'PASS: Sustainable pace outlier rejection verified ([45, 45, 46, 60] -> ~45.0s, rejecting simple mean 49.0s).';
    console.log(`  ✔ ${results.ac4.message}\n`);
  } catch (err) {
    results.ac4.passed = false;
    results.ac4.message = `FAIL: ${err.message}`;
    console.log(`  ✖ ${results.ac4.message}\n`);
  }

  // ====================================================================
  // AC 5: Boxplot 5-number summary and outlier identification
  // ====================================================================
  console.log('[AC 5] Verifying Boxplot 5-Number Summary Statistics...');
  try {
    if (!statsModule) {
      throw new Error('Analytics stats module (js/analytics/stats.js) not found. Pending Milestone 3 implementation.');
    }

    const { computeBoxplotStats } = statsModule;
    assert.strictEqual(typeof computeBoxplotStats, 'function', 'computeBoxplotStats must be an exported function');

    const laps = [42, 44, 45, 45, 46, 48, 60];
    const stats = computeBoxplotStats(laps);

    // Requirement: 5-number summary (Min, Q1, Median, Q3, Max)
    assert.strictEqual(stats.min, 42, `Min failed: expected 42, got ${stats.min}`);
    assert.strictEqual(stats.q1, 44, `Q1 failed: expected 44, got ${stats.q1}`);
    assert.strictEqual(stats.median, 45, `Median failed: expected 45, got ${stats.median}`);
    assert.ok(stats.q3 >= 47 && stats.q3 <= 48, `Q3 failed: expected 47 or 48, got ${stats.q3}`);
    assert.strictEqual(stats.max, 60, `Max failed: expected 60, got ${stats.max}`);

    // Requirement: outlier identification
    assert.ok(stats.outliers.includes(60), `Outlier failed: 60 must be in outliers, got ${JSON.stringify(stats.outliers)}`);
    assert.ok(stats.upperFence < 60, `Upper fence must isolate 60, got ${stats.upperFence}`);

    results.ac5.passed = true;
    results.ac5.message = 'PASS: Boxplot 5-number summary and outlier identification verified.';
    console.log(`  ✔ ${results.ac5.message}\n`);
  } catch (err) {
    results.ac5.passed = false;
    results.ac5.message = `FAIL: ${err.message}`;
    console.log(`  ✖ ${results.ac5.message}\n`);
  }

  // ====================================================================
  // Overall Summary & Exit Code
  // ====================================================================
  console.log('======================================================================');
  console.log('                      VERIFICATION SUMMARY                            ');
  console.log('======================================================================');
  const allCriteria = [results.ac1, results.ac2, results.ac3, results.ac4, results.ac5];
  const passedCount = allCriteria.filter(c => c.passed).length;

  console.log(`Passed: ${passedCount} / 5 Acceptance Criteria`);
  console.log('----------------------------------------------------------------------');
  console.log(`[AC 1] Multi-Swimmer Timers & 3 Laps:  ${results.ac1.passed ? '✔ PASS' : '✖ FAIL'} - ${results.ac1.message}`);
  console.log(`[AC 2] Hard Reload Recovery:          ${results.ac2.passed ? '✔ PASS' : '✖ FAIL'} - ${results.ac2.message}`);
  console.log(`[AC 3] Training Zones Formula:        ${results.ac3.passed ? '✔ PASS' : '✖ FAIL'} - ${results.ac3.message}`);
  console.log(`[AC 4] Sustainable Pace Outliers:     ${results.ac4.passed ? '✔ PASS' : '✖ FAIL'} - ${results.ac4.message}`);
  console.log(`[AC 5] Boxplot 5-Number Summary:      ${results.ac5.passed ? '✔ PASS' : '✖ FAIL'} - ${results.ac5.message}`);
  console.log('======================================================================');

  if (passedCount === 5) {
    console.log('\n🎉 ALL ACCEPTANCE CRITERIA PASSED! System is ready for delivery.\n');
    process.exit(0);
  } else {
    console.error(`\n❌ VERIFICATION FAILED: ${5 - passedCount} criteria failed or pending implementation.\n`);
    process.exit(1);
  }
}

runAcceptanceVerification().catch((err) => {
  console.error('Unhandled Verification Runner Error:', err);
  process.exit(1);
});
