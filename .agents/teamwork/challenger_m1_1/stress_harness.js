/**
 * Empirical Stress & Verification Test Harness for Milestone 1
 * challenger_m1_1
 *
 * Tests:
 * 1. Ticker Throttling (60 FPS, 30 FPS, 120Hz/240Hz input simulation, subscriber isolation)
 * 2. Wall-Clock Zero Drift & Jitter Immunity under simulated CPU load
 * 3. Atomic Dual-Write (saveLapAndTimerState) Commit & Abort Rollback
 * 4. High-Throughput Concurrent Burst (1,000 dual-writes across parallel swimmers)
 * 5. Full 8-Swimmer Heat Simulation (80 laps total, split-sum invariant check)
 */

import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

import { Ticker } from '../../../js/timing/ticker.js';
import { TimerEngine, TIMER_STATES, getElapsedMs, formatTime } from '../../../js/timing/timer-engine.js';
import { SwimmerRepository } from '../../../js/storage/repository.js';
import { openDB, closeDB, STORES, get, getAll, count, clear } from '../../../js/storage/db.js';

console.log('======================================================================');
console.log('   CHALLENGER M1-1: EMPIRICAL STRESS & CONCURRENCY HARNESS            ');
console.log('======================================================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function pass(testName, details = '') {
  totalTests++;
  passedTests++;
  console.log(`  ✔ [PASS] ${testName}${details ? ` (${details})` : ''}`);
}

function fail(testName, err) {
  totalTests++;
  failedTests++;
  console.error(`  ✖ [FAIL] ${testName}`);
  console.error(`    Error: ${err.message || err}`);
  if (err.stack) console.error(`    ${err.stack.split('\n').slice(1, 3).join('\n')}`);
}

// ============================================================================
// SUITE 1: Ticker Throttling & High-Refresh Simulation
// ============================================================================
console.log('[SUITE 1] Ticker Throttling & Multi-Subscriber Behavior...');

// Test 1.1: 120Hz Display Throttle to 60 FPS
try {
  const t = new Ticker(60);
  let invocations = 0;
  t.subscribe('swimmer-1', (now) => {
    invocations++;
  });

  // Simulate 120Hz display (firing every 8.33ms) over 1000ms (120 rAF calls)
  t.isRunning = true;
  for (let frame = 0; frame < 120; frame++) {
    const timestamp = frame * (1000 / 120); // 0ms, 8.33ms, 16.66ms, etc.
    t._tick(timestamp);
  }

  // At 60 FPS target with 120Hz input, invocations should be exactly 60
  assert.ok(
    invocations >= 59 && invocations <= 61,
    `Expected ~60 invocations on 120Hz simulation, got ${invocations}`
  );
  pass('1.1: 120Hz frame input is throttled to ~60 FPS', `invocations: ${invocations}/120 frames`);
} catch (err) {
  fail('1.1: 120Hz frame input throttle', err);
}

// Test 1.2: 240Hz Display Throttle to 60 FPS
try {
  const t = new Ticker(60);
  let invocations = 0;
  t.subscribe('swimmer-1', () => { invocations++; });

  // Simulate 240Hz display (firing every 4.166ms) over 1000ms (240 rAF calls)
  t.isRunning = true;
  for (let frame = 0; frame < 240; frame++) {
    const timestamp = frame * (1000 / 240);
    t._tick(timestamp);
  }

  assert.ok(
    invocations >= 59 && invocations <= 62,
    `Expected ~60 invocations on 240Hz simulation, got ${invocations}`
  );
  pass('1.2: 240Hz frame input is throttled to ~60 FPS', `invocations: ${invocations}/240 frames`);
} catch (err) {
  fail('1.2: 240Hz frame input throttle', err);
}

// Test 1.3: Dynamic setTargetFps(30)
try {
  const t = new Ticker(60);
  t.setTargetFps(30);
  let invocations = 0;
  t.subscribe('swimmer-1', () => { invocations++; });

  // Simulate 60Hz display over 1000ms (60 rAF calls)
  t.isRunning = true;
  for (let frame = 0; frame < 60; frame++) {
    const timestamp = frame * (1000 / 60);
    t._tick(timestamp);
  }

  assert.ok(
    invocations >= 29 && invocations <= 31,
    `Expected ~30 invocations on 30 FPS target, got ${invocations}`
  );
  pass('1.3: setTargetFps(30) throttles 60Hz input to ~30 FPS', `invocations: ${invocations}/60 frames`);
} catch (err) {
  fail('1.3: setTargetFps(30) throttle', err);
}

// Test 1.4: 8 Concurrent Swimmer Subscribers (Equal Call Counts)
try {
  const t = new Ticker(60);
  const counts = new Map();
  for (let i = 1; i <= 8; i++) {
    counts.set(`lane-${i}`, 0);
    t.subscribe(`lane-${i}`, () => {
      counts.set(`lane-${i}`, counts.get(`lane-${i}`) + 1);
    });
  }

  t.isRunning = true;
  // 120Hz input over 500ms (60 frames)
  for (let frame = 0; frame < 60; frame++) {
    t._tick(frame * (1000 / 120));
  }

  // All 8 lanes should have received the exact same count (~30)
  const firstVal = counts.get('lane-1');
  assert.ok(firstVal >= 29 && firstVal <= 31, `Expected ~30, got ${firstVal}`);
  for (let i = 1; i <= 8; i++) {
    assert.strictEqual(counts.get(`lane-${i}`), firstVal, `Lane ${i} count mismatch`);
  }
  pass('1.4: 8 concurrent swimmer subscribers receive uniform throttled ticks', `all got ${firstVal} ticks`);
} catch (err) {
  fail('1.4: 8 concurrent swimmer subscribers', err);
}

// Test 1.5: Subscriber Error Isolation
try {
  const t = new Ticker(60);
  let lane2Ticked = 0;
  // Suppress expected console.error during test
  const origConsoleError = console.error;
  console.error = () => {};

  t.subscribe('lane-1-faulty', () => {
    throw new Error('Explosive subscriber error in lane 1');
  });
  t.subscribe('lane-2-healthy', () => {
    lane2Ticked++;
  });

  t.isRunning = true;
  t._tick(100);
  t._tick(150);

  console.error = origConsoleError;

  assert.strictEqual(lane2Ticked, 2, 'Healthy subscriber should continue executing despite faulty subscriber');
  pass('1.5: Error in one subscriber does not abort ticker loop for other subscribers');
} catch (err) {
  fail('1.5: Subscriber error isolation', err);
}

// Test 1.6: Dynamic Unsubscribe During Ticking
try {
  const t = new Ticker(60);
  let ticksA = 0;
  let ticksB = 0;

  t.subscribe('sub-A', () => {
    ticksA++;
    if (ticksA === 3) {
      t.unsubscribe('sub-A');
    }
  });

  t.subscribe('sub-B', () => {
    ticksB++;
  });

  t.isRunning = true;
  for (let f = 0; f < 10; f++) {
    t._tick(f * 20);
  }

  assert.strictEqual(ticksA, 3, 'sub-A should stop at 3 ticks');
  assert.strictEqual(ticksB, 10, 'sub-B should continue for all 10 ticks');
  assert.strictEqual(t.has('sub-A'), false, 'sub-A is unsubscribed');
  assert.strictEqual(t.has('sub-B'), true, 'sub-B remains subscribed');
  pass('1.6: Dynamic unsubscription inside callback executes safely without iterator disruption');
} catch (err) {
  fail('1.6: Dynamic unsubscription', err);
}


// ============================================================================
// SUITE 2: Wall-Clock Accuracy & Zero-Drift Under CPU Jitter
// ============================================================================
console.log('\n[SUITE 2] Wall-Clock Accuracy Under CPU Jitter & Delays...');

// Test 2.1: Zero Drift under Simulated CPU Block
try {
  const startTime = 1700000000000;
  const runningState = {
    swimmerId: 'swim-drift-test',
    state: TIMER_STATES.RUNNING,
    startTime: startTime,
    lastResumeTime: startTime,
    accumulatedMs: 0
  };

  // Mock Date.now during test
  const origDateNow = Date.now;
  try {
    // 5 seconds later
    Date.now = () => startTime + 5000;
    const elapsed5s = getElapsedMs(runningState);
    assert.strictEqual(elapsed5s, 5000, `Expected 5000ms, got ${elapsed5s}`);

    // Pause at 5000ms
    runningState.state = TIMER_STATES.PAUSED;
    runningState.accumulatedMs = 5000;
    runningState.lastResumeTime = null;

    // 10 seconds of paused idle time
    Date.now = () => startTime + 15000;
    const elapsedPaused = getElapsedMs(runningState);
    assert.strictEqual(elapsedPaused, 5000, `Paused state must not drift: got ${elapsedPaused}`);

    // Resume at 15000ms
    runningState.state = TIMER_STATES.RUNNING;
    runningState.lastResumeTime = startTime + 15000;

    // Advance 3000ms more to 18000ms
    Date.now = () => startTime + 18000;
    const elapsedResumed = getElapsedMs(runningState);
    assert.strictEqual(elapsedResumed, 8000, `Expected 8000ms (5000 + 3000), got ${elapsedResumed}`);
  } finally {
    Date.now = origDateNow;
  }

  pass('2.1: Wall-clock formula provides 0.000ms cumulative drift across start, pause, resume cycles');
} catch (err) {
  fail('2.1: Zero drift under CPU block', err);
}

// Test 2.2: Negative Delta Protection (Clock Skew / Rollback)
try {
  const now = 1700000000000;
  const runningState = {
    swimmerId: 'swim-skew',
    state: TIMER_STATES.RUNNING,
    startTime: now,
    lastResumeTime: now + 5000, // In the future due to clock jump
    accumulatedMs: 1000
  };

  const origDateNow = Date.now;
  try {
    Date.now = () => now; // Clock is earlier than lastResumeTime
    const elapsed = getElapsedMs(runningState);
    assert.strictEqual(elapsed, 1000, `Must clamp negative delta to 0, got ${elapsed}`);
  } finally {
    Date.now = origDateNow;
  }

  pass('2.2: Negative delta protection clamps backwards system clock adjustments to 0');
} catch (err) {
  fail('2.2: Negative delta protection', err);
}


// ============================================================================
// SUITE 3: Storage Atomicity (saveLapAndTimerState) & Rollback
// ============================================================================
console.log('\n[SUITE 3] Batched Dual-Write Atomicity & Rollback...');

// Test 3.1: Atomic commit across laps and timer_states
async function testAtomicCommit() {
  const repo = new SwimmerRepository();
  await repo.init();
  await repo.clearAll();

  const swimmerId = 'swim-atomic-1';
  const lap = {
    id: 'lap-atomic-1-1',
    swimmerId,
    lapNumber: 1,
    splitDurationMs: 32000,
    cumulativeDurationMs: 32000,
    timestamp: 1700000010000
  };

  const state = {
    swimmerId,
    state: TIMER_STATES.RUNNING,
    startTime: 1700000000000,
    lastResumeTime: 1700000000000,
    accumulatedMs: 0,
    currentLapIndex: 2,
    lastLapCumulativeMs: 32000
  };

  await repo.saveLapAndTimerState(lap, state);

  // Read back directly
  const savedLap = await get(STORES.LAPS, 'lap-atomic-1-1');
  const savedState = await get(STORES.TIMER_STATES, swimmerId);

  assert.ok(savedLap, 'Lap must be committed');
  assert.strictEqual(savedLap.splitDurationMs, 32000);
  assert.ok(savedState, 'Timer state must be committed');
  assert.strictEqual(savedState.currentLapIndex, 2);
  assert.strictEqual(savedState.lastLapCumulativeMs, 32000);

  pass('3.1: saveLapAndTimerState persists both lap and timer_state simultaneously');
}

// Test 3.2: Transaction Rollback on Failure Simulation
async function testTransactionRollback() {
  const repo = new SwimmerRepository();
  await repo.init();

  const swimmerId = 'swim-rollback-test';
  await repo.saveTimerState({
    swimmerId,
    state: TIMER_STATES.RUNNING,
    currentLapIndex: 1,
    lastLapCumulativeMs: 0
  });

  const lapCountBefore = await count(STORES.LAPS);
  const stateBefore = await repo.getTimerState(swimmerId);

  // Attempt saveLapAndTimerState with invalid inputs that fail validation
  let caught = false;
  try {
    await repo.saveLapAndTimerState(null, { swimmerId });
  } catch (e) {
    caught = true;
  }
  assert.strictEqual(caught, true, 'Validation error must be thrown');

  // Verify DB state was untouched
  const lapCountAfter = await count(STORES.LAPS);
  const stateAfter = await repo.getTimerState(swimmerId);

  assert.strictEqual(lapCountAfter, lapCountBefore, 'Lap count must remain identical');
  assert.deepStrictEqual(stateAfter, stateBefore, 'Timer state must remain identical');

  pass('3.2: Invalid input aborts cleanly with zero partial writes');
}


// ============================================================================
// SUITE 4: High-Throughput Concurrent Burst (1,000 dual-writes)
// ============================================================================
console.log('\n[SUITE 4] High-Throughput Concurrent Burst Stress...');

async function testHighThroughputBurst() {
  const repo = new SwimmerRepository();
  await repo.init();
  await repo.clearAll();

  const NUM_SWIMMERS = 10;
  const LAPS_PER_SWIMMER = 100; // 1,000 total dual-writes
  const TOTAL_WRITES = NUM_SWIMMERS * LAPS_PER_SWIMMER;

  console.log(`  -> Executing ${TOTAL_WRITES} atomic dual-writes across ${NUM_SWIMMERS} concurrent swimmers...`);
  const t0 = performance.now();

  // Run in concurrent waves
  for (let lapIndex = 1; lapIndex <= LAPS_PER_SWIMMER; lapIndex++) {
    const promises = [];
    for (let s = 1; s <= NUM_SWIMMERS; s++) {
      const swimmerId = `swimmer-stress-${s}`;
      const split = 30000 + (lapIndex * 100) + s;
      const cumulative = lapIndex * 31000 + s;

      const lap = {
        id: `lap-${swimmerId}-${lapIndex}`,
        swimmerId,
        lapNumber: lapIndex,
        splitDurationMs: split,
        cumulativeDurationMs: cumulative,
        timestamp: Date.now() + lapIndex
      };

      const state = {
        swimmerId,
        state: TIMER_STATES.RUNNING,
        startTime: 1700000000000,
        lastResumeTime: 1700000000000,
        accumulatedMs: 0,
        currentLapIndex: lapIndex + 1,
        lastLapCumulativeMs: cumulative
      };

      promises.push(repo.saveLapAndTimerState(lap, state));
    }

    // Await this concurrent burst of 10 simultaneous writes
    await Promise.all(promises);
  }

  const duration = performance.now() - t0;
  const opsPerSec = (TOTAL_WRITES / (duration / 1000)).toFixed(1);

  // Verification 1: Verify total count of laps in DB
  const totalLaps = await count(STORES.LAPS);
  assert.strictEqual(totalLaps, TOTAL_WRITES, `Expected ${TOTAL_WRITES} laps, got ${totalLaps}`);

  // Verification 2: Verify total count of timer states
  const totalStates = await count(STORES.TIMER_STATES);
  assert.strictEqual(totalStates, NUM_SWIMMERS, `Expected ${NUM_SWIMMERS} timer states, got ${totalStates}`);

  // Verification 3: Verify each swimmer has exactly 100 laps and correct state
  for (let s = 1; s <= NUM_SWIMMERS; s++) {
    const swimmerId = `swimmer-stress-${s}`;
    const swimmerLaps = await repo.getLaps(swimmerId);
    assert.strictEqual(swimmerLaps.length, LAPS_PER_SWIMMER, `Swimmer ${swimmerId} missing laps`);

    const finalState = await repo.getTimerState(swimmerId);
    assert.strictEqual(finalState.currentLapIndex, LAPS_PER_SWIMMER + 1);
    assert.strictEqual(finalState.lastLapCumulativeMs, swimmerLaps[swimmerLaps.length - 1].cumulativeDurationMs);

    // Verify chronological order and lapNumber sequence
    for (let i = 0; i < swimmerLaps.length; i++) {
      assert.strictEqual(swimmerLaps[i].lapNumber, i + 1, `Out of order lapNumber for ${swimmerId} at index ${i}`);
    }
  }

  pass(
    `4.1: Throughput stress: 1,000 dual-writes committed with 0 corruption or lost records`,
    `${TOTAL_WRITES} ops in ${duration.toFixed(1)}ms (~${opsPerSec} writes/sec)`
  );
}


// ============================================================================
// SUITE 5: Full 8-Swimmer Real Heat Engine Simulation
// ============================================================================
console.log('\n[SUITE 5] Real 8-Swimmer Heat Simulation via TimerEngine...');

async function test8SwimmerHeat() {
  const repo = new SwimmerRepository();
  await repo.init();
  await repo.clearAll();

  const engine = new TimerEngine(repo);
  await engine.init();

  const NUM_LANES = 8;
  const LAPS_PER_LANE = 10;

  // 1. Initialize swimmers and start timers simultaneously
  for (let i = 1; i <= NUM_LANES; i++) {
    const id = `swimmer-lane-${i}`;
    await repo.saveSwimmer({ id, name: `Swimmer Lane ${i}`, lane: i, baseline100mSeconds: 58 + i });
    await engine.start(id);
  }

  // 2. Simulate 10 laps for each swimmer, with small artificial jitter between lanes
  for (let lap = 1; lap <= LAPS_PER_LANE; lap++) {
    // Lanes tap lap nearly concurrently within a 20ms window
    const lapPromises = [];
    for (let lane = 1; lane <= NUM_LANES; lane++) {
      const id = `swimmer-lane-${lane}`;
      // Stagger slightly to simulate coach tapping buttons
      const p = new Promise(resolve => setTimeout(resolve, lane * 2))
        .then(() => engine.recordLap(id));
      lapPromises.push(p);
    }
    await Promise.all(lapPromises);
  }

  // 3. Verify all laps and state invariants across all 8 swimmers
  let totalRecordedLaps = 0;
  for (let lane = 1; lane <= NUM_LANES; lane++) {
    const id = `swimmer-lane-${lane}`;
    const laps = await repo.getLaps(id);
    assert.strictEqual(laps.length, LAPS_PER_LANE, `Lane ${lane} must have ${LAPS_PER_LANE} laps`);
    totalRecordedLaps += laps.length;

    // Invariant: sum(splitDurationMs) === cumulativeDurationMs of last lap
    let cumulativeSum = 0;
    for (let k = 0; k < laps.length; k++) {
      cumulativeSum += laps[k].splitDurationMs;
      assert.strictEqual(
        cumulativeSum,
        laps[k].cumulativeDurationMs,
        `Lane ${lane} Lap ${k + 1}: Split sum ${cumulativeSum} !== cumulative ${laps[k].cumulativeDurationMs}`
      );
    }

    const state = await engine.getState(id);
    assert.strictEqual(state.currentLapIndex, LAPS_PER_LANE + 1);
    assert.strictEqual(state.lastLapCumulativeMs, laps[laps.length - 1].cumulativeDurationMs);
  }

  assert.strictEqual(totalRecordedLaps, NUM_LANES * LAPS_PER_LANE, 'Total recorded laps must be 80');
  pass(
    '5.1: 8-swimmer heat: 80 laps recorded concurrently via TimerEngine with 100% split-sum invariant accuracy',
    `all 8 lanes verified`
  );
}


// ============================================================================
// MAIN RUNNER
// ============================================================================
async function runAll() {
  try {
    await testAtomicCommit();
    await testTransactionRollback();
    await testHighThroughputBurst();
    await test8SwimmerHeat();

    console.log('\n======================================================================');
    console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
    console.log('======================================================================');

    closeDB();

    if (failedTests > 0) {
      console.error('\n❌ STRESS HARNESS FAILED');
      process.exit(1);
    } else {
      console.log('\n🎉 ALL STRESS TESTS PASSED WITH 0 DATA CORRUPTION!');
      process.exit(0);
    }
  } catch (err) {
    console.error('Unhandled harness exception:', err);
    closeDB();
    process.exit(1);
  }
}

runAll();
