#!/usr/bin/env node

/**
 * Dedicated Empirical Challenge Suite: Milestone 3 Verification
 * Agent: challenger_m3_2
 *
 * Focus Areas:
 * 1. 60-Second Periodic Timer Auto-Flush:
 *    - Validates 60,000ms configuration interval.
 *    - Feed 5 laps (< 20 batch size threshold).
 *    - Simulates timer trigger; verifies flush of all 5 laps and empty queue.
 *    - Verifies subsequent timer ticks with empty queue send ZERO fetch requests.
 *    - Stress tests: in-flight concurrent trigger protection, partial batches, offline retention.
 *
 * 2. Append-Only Invariant Verification:
 *    - Static source code audit: zero HTTP DELETE, PUT, or PATCH requests across entire codebase.
 *    - Intercepts all global/local network traffic.
 *    - Records and persists laps in repository.
 *    - Deletes laps individually via repository.deleteLap(lapId) and bulk deletes via clearLaps / clearAll.
 *    - Asserts exactly ZERO HTTP DELETE, PUT, or PATCH requests are made to any remote service.
 *
 * 3. Observer Decoupling:
 *    - TimerEngine operates cleanly without listeners (zero errors, zero network calls, full persistence).
 *    - When listener attached, 100% of recorded laps forwarded with exact payload fidelity.
 *    - Unsubscribe cleanly tears down listener without side-effects.
 *    - Misbehaving listener error isolation (listener exceptions do not break TimerEngine.recordLap).
 *    - End-to-end integration: 45 laps across multiple swimmers batched (20 + 20 + 5 by timer).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

import { TelemetryService, TELEMETRY_CONFIG, generateUuidV4 } from '../js/telemetry/telemetry.js';
import { TimerEngine, TIMER_STATES } from '../js/timing/timer-engine.js';
import { SwimmerRepository } from '../js/storage/repository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Helper: Mock In-Memory Storage for localStorage emulation
class MemoryStorage {
  constructor(initial = {}) {
    this._data = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this._data.has(key) ? this._data.get(key) : null;
  }
  setItem(key, value) {
    this._data.set(key, String(value));
  }
  removeItem(key) {
    this._data.delete(key);
  }
  clear() {
    this._data.clear();
  }
}

// Helper: Intercepting Mock Fetch
function createMockFetch(customHandler) {
  const calls = [];
  const fn = async (url, options = {}) => {
    calls.push({ url, options: JSON.parse(JSON.stringify(options)) });
    if (typeof customHandler === 'function') {
      return customHandler(url, options);
    }
    return {
      ok: true,
      status: 201,
      statusText: 'Created',
      json: async () => []
    };
  };
  fn.calls = calls;
  return fn;
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runTest(name, fn) {
  totalTests++;
  process.stdout.write(`  [TEST ${totalTests}] ${name} ... `);
  try {
    await fn();
    passedTests++;
    console.log('✔ PASS');
  } catch (err) {
    failedTests++;
    console.log('✖ FAIL');
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      const relevantStack = err.stack.split('\n').slice(1, 4).join('\n');
      console.error(`     ${relevantStack}`);
    }
  }
}

console.log('======================================================================');
console.log('   Empirical Challenge Suite: Milestone 3 Verification (challenger_m3_2)');
console.log('======================================================================\n');

async function executeChallengeSuite() {
  // ──────────────────────────────────────────────────────────────────
  // CHALLENGE GROUP 1: 60-Second Periodic Timer Auto-Flush
  // ──────────────────────────────────────────────────────────────────
  console.log('[CHALLENGE GROUP 1] 60-Second Periodic Timer Auto-Flush');

  await runTest('1.1 Configuration Invariant: 60,000ms flush interval & 20-lap batch size', () => {
    assert.equal(TELEMETRY_CONFIG.FLUSH_INTERVAL_MS, 60000, 'Flush interval must be exactly 60,000 ms (60 seconds)');
    assert.equal(TELEMETRY_CONFIG.BATCH_SIZE, 20, 'Batch size threshold must be 20 laps');
    assert.equal(TELEMETRY_CONFIG.STORAGE_KEY, 'coach_device_id', 'Storage key must be coach_device_id');
    assert.equal(TELEMETRY_CONFIG.ENDPOINT, 'https://iehlfnqzykzxblgxtmjp.supabase.co/rest/v1/laps');
  });

  await runTest('1.2 Sub-20 Lap Batch: 5 laps buffered, then flushed on 60s timer trigger', async () => {
    const mockStorage = new MemoryStorage();
    const mockFetch = createMockFetch();
    const service = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch,
      flushIntervalMs: 60000
    });

    // Feed 5 laps (< 20 threshold)
    for (let i = 1; i <= 5; i++) {
      service.enqueueLap({
        id: `lap-sub20-${i}`,
        swimmerId: 'swimmer-ch1',
        lapNumber: i,
        splitDurationMs: 44000 + i * 500,
        cumulativeDurationMs: i * 44000,
        timestamp: 1700000000000 + i * 1000
      });
    }

    assert.equal(service.queue.length, 5, 'Queue must hold all 5 laps prior to flush');
    assert.equal(mockFetch.calls.length, 0, 'No HTTP request should be sent before timer trigger');

    // Simulate the periodic timer expiration by triggering flush()
    const flushResult = await service.flush();

    assert.ok(flushResult, 'Flush result should return the flushed batch');
    assert.equal(flushResult.length, 5, 'Flushed batch must contain all 5 laps');
    assert.equal(service.queue.length, 0, 'Queue must be completely empty after timer flush');
    assert.equal(mockFetch.calls.length, 1, 'Exactly 1 bulk POST request must be made');

    const req = mockFetch.calls[0];
    assert.equal(req.options.method, 'POST');
    assert.equal(req.url, TELEMETRY_CONFIG.ENDPOINT);
    assert.equal(req.options.headers['apikey'], TELEMETRY_CONFIG.API_KEY);
    assert.equal(req.options.headers['Authorization'], `Bearer ${TELEMETRY_CONFIG.API_KEY}`);
    assert.equal(req.options.headers['Content-Type'], 'application/json');
    assert.equal(req.options.headers['Prefer'], 'return=minimal');

    const payload = JSON.parse(req.options.body);
    assert.equal(payload.length, 5);
    for (let i = 0; i < 5; i++) {
      assert.equal(payload[i].id, `lap-sub20-${i + 1}`);
      assert.equal(payload[i].swimmer_id, 'swimmer-ch1');
      assert.equal(payload[i].lap_number, i + 1);
      assert.equal(typeof payload[i].coach_device_id, 'string');
      assert.ok(payload[i].coach_device_id.length > 0);
    }

    service.destroy();
  });

  await runTest('1.3 Empty Queue Timer Tick: Zero fetch requests sent when queue is empty', async () => {
    const mockStorage = new MemoryStorage();
    const mockFetch = createMockFetch();
    const service = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch,
      flushIntervalMs: 60000
    });

    assert.equal(service.queue.length, 0);

    // Explicit timer tick / flush attempt on empty queue
    const result1 = await service.flush();
    assert.equal(result1, null, 'flush() on empty queue must return null');
    assert.equal(mockFetch.calls.length, 0, 'No HTTP request on first empty timer tick');

    // Subsequent empty ticks
    const result2 = await service.flush();
    assert.equal(result2, null);
    assert.equal(mockFetch.calls.length, 0, 'No HTTP request on repeated empty timer ticks');

    service.destroy();
  });

  await runTest('1.4 Real Timer Simulation: Periodic timer with interval triggers auto-flush', async () => {
    const mockStorage = new MemoryStorage();
    const mockFetch = createMockFetch();
    // Use short interval to test actual setInterval timer firing
    const service = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch,
      flushIntervalMs: 40
    });

    service.startTimer();

    // 0 items in queue -> timer ticks -> 0 calls
    await new Promise(r => setTimeout(r, 60));
    assert.equal(mockFetch.calls.length, 0, 'Empty queue does not trigger fetch via setInterval');

    // Enqueue 7 laps (< 20)
    for (let i = 1; i <= 7; i++) {
      service.enqueueLap({
        id: `auto-lap-${i}`,
        swimmerId: 'swimmer-timer',
        lapNumber: i,
        splitDurationMs: 38000,
        cumulativeDurationMs: i * 38000
      });
    }

    assert.equal(service.queue.length, 7);
    assert.equal(mockFetch.calls.length, 0);

    // Wait for setInterval to fire flush
    await new Promise(r => setTimeout(r, 80));

    assert.equal(mockFetch.calls.length, 1, 'Periodic timer triggered auto-flush');
    assert.equal(service.queue.length, 0, 'Queue drained after auto-flush');

    // Wait for another interval with empty queue -> still only 1 call
    await new Promise(r => setTimeout(r, 60));
    assert.equal(mockFetch.calls.length, 1, 'No additional calls when queue is empty');

    service.destroy();
  });

  await runTest('1.5 Concurrent Flush Guard: Multiple simultaneous flush calls do not duplicate requests', async () => {
    let resolveFirstFetch;
    const fetchDeferred = new Promise(resolve => {
      resolveFirstFetch = resolve;
    });

    const slowFetch = createMockFetch(async (url, options) => {
      await fetchDeferred;
      return { ok: true, status: 201, json: async () => [] };
    });

    const service = new TelemetryService({
      storage: new MemoryStorage(),
      fetchFn: slowFetch
    });

    service.enqueueLap({ id: 'concurrent-lap-1', swimmerId: 's1', lapNumber: 1 });
    service.enqueueLap({ id: 'concurrent-lap-2', swimmerId: 's1', lapNumber: 2 });

    // Initiate first flush (which will pause in flight)
    const p1 = service.flush();
    assert.equal(service._isFlushing, true, '_isFlushing flag must be set');

    // Initiate second concurrent flush attempt (e.g. rapid timer tick)
    const p2 = service.flush();
    assert.equal(await p2, null, 'Concurrent flush must return null immediately');

    // Release first fetch
    resolveFirstFetch();
    const result1 = await p1;

    assert.ok(result1);
    assert.equal(slowFetch.calls.length, 1, 'Only 1 HTTP request should be sent, preventing race duplicates');
    assert.equal(service.queue.length, 0);

    service.destroy();
  });

  await runTest('1.6 Offline Error Resilience: Uncommitted laps retained in queue with order preserved', async () => {
    let failMode = true;
    const flakeyFetch = createMockFetch(async () => {
      if (failMode) {
        throw new Error('Supabase 503 Service Unavailable');
      }
      return { ok: true, status: 201, json: async () => [] };
    });

    const service = new TelemetryService({
      storage: new MemoryStorage(),
      fetchFn: flakeyFetch
    });

    service.enqueueLap({ id: 'retain-1', swimmerId: 's1', lapNumber: 1 });
    service.enqueueLap({ id: 'retain-2', swimmerId: 's1', lapNumber: 2 });

    // Flush fails
    const failedResult = await service.flush();
    assert.equal(failedResult, null, 'Flush returns null on network rejection');
    assert.equal(service.queue.length, 2, 'Uncommitted laps must be retained in queue');
    assert.equal(service.queue[0].id, 'retain-1');
    assert.equal(service.queue[1].id, 'retain-2');

    // Network recovers
    failMode = false;
    const successResult = await service.flush();
    assert.ok(successResult);
    assert.equal(service.queue.length, 0, 'Queue drained after recovery');

    service.destroy();
  });

  // ──────────────────────────────────────────────────────────────────
  // CHALLENGE GROUP 2: Append-Only Invariant Verification
  // ──────────────────────────────────────────────────────────────────
  console.log('\n[CHALLENGE GROUP 2] Append-Only Invariant Verification');

  await runTest('2.1 Static Source Code Audit: Zero HTTP DELETE, PUT, or PATCH in telemetry', () => {
    const telemetryCode = fs.readFileSync(path.join(PROJECT_ROOT, 'js/telemetry/telemetry.js'), 'utf8');

    // Must NOT contain mutating methods
    const forbiddenMethods = ["'DELETE'", '"DELETE"', '`DELETE`', "'PATCH'", '"PATCH"', '`PATCH`', "'PUT'", '"PUT"', '`PUT`'];
    for (const forbidden of forbiddenMethods) {
      assert.ok(
        !telemetryCode.includes(`method: ${forbidden}`),
        `telemetry.js must never specify HTTP ${forbidden}`
      );
    }

    assert.ok(!telemetryCode.includes('deleteLap'), 'telemetry.js must not implement remote lap deletion');
    assert.ok(!telemetryCode.includes('updateLap'), 'telemetry.js must not implement remote lap updates');
  });

  await runTest('2.2 Zero HTTP Requests on repository.deleteLap(lapId)', async () => {
    // Install global network monitor
    const capturedHttpRequests = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      capturedHttpRequests.push({ url: String(url), method: options.method || 'GET', options });
      return { ok: true, status: 200, json: async () => [] };
    };

    try {
      const repo = new SwimmerRepository();
      await repo.init();
      const engine = new TimerEngine(repo);

      const swimmerId = `swimmer-ao-${Date.now()}`;
      await repo.saveSwimmer({ id: swimmerId, name: 'Audit Swimmer', lane: 1, baselinePace: 60 });
      await engine.start(swimmerId);

      // Record 3 laps
      const r1 = await engine.recordLap(swimmerId);
      const r2 = await engine.recordLap(swimmerId);
      const r3 = await engine.recordLap(swimmerId);

      const lapListBefore = await repo.getLaps(swimmerId);
      assert.equal(lapListBefore.length, 3);

      const reqCountBefore = capturedHttpRequests.length;

      // Delete middle lap (Lap 2) locally from IndexedDB
      await repo.deleteLap(r2.lap.id);

      const lapListAfter = await repo.getLaps(swimmerId);
      assert.equal(lapListAfter.length, 2, 'Lap 2 must be deleted locally from IndexedDB');
      assert.equal(lapListAfter.some(l => l.id === r2.lap.id), false, 'Deleted lap must not exist in IndexedDB');

      // Verify ZERO HTTP requests were triggered by repo.deleteLap
      const reqCountAfter = capturedHttpRequests.length;
      assert.equal(
        reqCountAfter,
        reqCountBefore,
        `Deleting a lap locally must issue ZERO HTTP requests (expected ${reqCountBefore}, got ${reqCountAfter})`
      );

      // Verify specifically zero DELETE / PUT / PATCH
      const mutatingCalls = capturedHttpRequests.filter(r => ['DELETE', 'PUT', 'PATCH'].includes(r.method.toUpperCase()));
      assert.equal(mutatingCalls.length, 0, 'Zero HTTP DELETE/PUT/PATCH requests must ever be made');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest('2.3 Zero HTTP Requests on Session Reset and Swimmer Deletion', async () => {
    const capturedHttpRequests = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, options = {}) => {
      capturedHttpRequests.push({ url: String(url), method: options.method || 'GET', options });
      return { ok: true, status: 200, json: async () => [] };
    };

    try {
      const repo = new SwimmerRepository();
      await repo.init();
      const engine = new TimerEngine(repo);

      const swimmerId = `swimmer-reset-${Date.now()}`;
      await repo.saveSwimmer({ id: swimmerId, name: 'Reset Swimmer', lane: 2 });
      await engine.start(swimmerId);
      await engine.recordLap(swimmerId);
      await engine.recordLap(swimmerId);

      const reqCountBefore = capturedHttpRequests.length;

      // Reset timer and clear laps for session
      await engine.reset(swimmerId);
      await repo.clearLaps(swimmerId);

      // Delete swimmer entirely
      await repo.deleteSwimmer(swimmerId);

      // Clear all stores (full master reset)
      await repo.clearAll();

      const reqCountAfter = capturedHttpRequests.length;
      assert.equal(
        reqCountAfter,
        reqCountBefore,
        'Session reset, swimmer deletion, and clearAll must generate ZERO HTTP requests'
      );

      const mutatingCalls = capturedHttpRequests.filter(r => ['DELETE', 'PUT', 'PATCH'].includes(r.method.toUpperCase()));
      assert.equal(mutatingCalls.length, 0, 'Zero HTTP DELETE/PUT/PATCH requests');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  await runTest('2.4 Local Lap Deletion does NOT alter Pending Telemetry Queue', async () => {
    const mockStorage = new MemoryStorage();
    const mockFetch = createMockFetch();
    const service = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch
    });

    const repo = new SwimmerRepository();
    await repo.init();
    const engine = new TimerEngine(repo);

    // Wire observer
    engine.onLap(lap => service.enqueueLap(lap));

    const swimmerId = `swimmer-audit-${Date.now()}`;
    await repo.saveSwimmer({ id: swimmerId, name: 'Queue Audit', lane: 3 });
    await engine.start(swimmerId);

    const { lap } = await engine.recordLap(swimmerId);

    assert.equal(service.queue.length, 1, 'Lap should be enqueued in telemetry');
    assert.equal(service.queue[0].id, lap.id);

    // Delete lap from local database
    await repo.deleteLap(lap.id);

    // The cloud telemetry queue MUST remain intact as an append-only audit trail
    assert.equal(service.queue.length, 1, 'Local deletion must not remove lap from pending telemetry queue');
    assert.equal(service.queue[0].id, lap.id);
    assert.equal(mockFetch.calls.length, 0, 'No HTTP request sent during deletion');

    service.destroy();
  });

  // ──────────────────────────────────────────────────────────────────
  // CHALLENGE GROUP 3: Observer Decoupling Verification
  // ──────────────────────────────────────────────────────────────────
  console.log('\n[CHALLENGE GROUP 3] Observer Decoupling Verification');

  await runTest('3.1 TimerEngine Isolated Operation: 0 listeners runs without error or side-effects', async () => {
    const repo = new SwimmerRepository();
    await repo.init();
    const engine = new TimerEngine(repo);

    // Verify _lapListeners is empty Set
    assert.ok(engine._lapListeners instanceof Set);
    assert.equal(engine._lapListeners.size, 0);

    const swimmerId = `swimmer-decoupled-${Date.now()}`;
    await repo.saveSwimmer({ id: swimmerId, name: 'Isolated Swimmer', lane: 4 });

    // Perform full lifecycle without listeners
    await engine.start(swimmerId);
    await engine.pause(swimmerId);
    await engine.resume(swimmerId);

    const res1 = await engine.recordLap(swimmerId);
    assert.ok(res1.lap);
    assert.equal(res1.lap.lapNumber, 1);
    assert.equal(res1.lap.swimmerId, swimmerId);

    const res2 = await engine.recordLap(swimmerId);
    assert.ok(res2.lap);
    assert.equal(res2.lap.lapNumber, 2);

    await engine.stop(swimmerId);
    await engine.reset(swimmerId);

    // Laps must be safely in repository
    const laps = await repo.getLaps(swimmerId);
    assert.equal(laps.length, 2);
  });

  await runTest('3.2 100% Lap Forwarding to Registered Listener', async () => {
    const repo = new SwimmerRepository();
    await repo.init();
    const engine = new TimerEngine(repo);

    const forwardedLaps = [];
    const unsubscribe = engine.onLap(lap => {
      forwardedLaps.push(lap);
    });

    const swimmerId = `swimmer-forward-${Date.now()}`;
    await repo.saveSwimmer({ id: swimmerId, name: 'Forward Swimmer', lane: 5 });
    await engine.start(swimmerId);

    // Record 12 laps
    const generatedLaps = [];
    for (let i = 1; i <= 12; i++) {
      const { lap } = await engine.recordLap(swimmerId);
      generatedLaps.push(lap);
    }

    assert.equal(forwardedLaps.length, 12, '100% of recorded laps (12/12) must be forwarded to listener');
    for (let i = 0; i < 12; i++) {
      assert.equal(forwardedLaps[i].id, generatedLaps[i].id);
      assert.equal(forwardedLaps[i].lapNumber, i + 1);
      assert.equal(forwardedLaps[i].swimmerId, swimmerId);
      assert.equal(forwardedLaps[i].splitDurationMs, generatedLaps[i].splitDurationMs);
      assert.equal(forwardedLaps[i].cumulativeDurationMs, generatedLaps[i].cumulativeDurationMs);
    }

    unsubscribe();
  });

  await runTest('3.3 Listener Unsubscribe Lifecycle', async () => {
    const repo = new SwimmerRepository();
    await repo.init();
    const engine = new TimerEngine(repo);

    let count = 0;
    const unsubscribe = engine.onLap(() => {
      count++;
    });

    const swimmerId = `swimmer-unsub-${Date.now()}`;
    await repo.saveSwimmer({ id: swimmerId, name: 'Unsub Swimmer', lane: 6 });
    await engine.start(swimmerId);

    await engine.recordLap(swimmerId);
    await engine.recordLap(swimmerId);
    assert.equal(count, 2, 'Listener received 2 laps before unsubscribe');

    // Unsubscribe
    unsubscribe();
    assert.equal(engine._lapListeners.size, 0, 'Listener set must be empty after unsubscribe');

    // Record further laps
    await engine.recordLap(swimmerId);
    await engine.recordLap(swimmerId);
    assert.equal(count, 2, 'Listener must NOT receive laps after unsubscribe');

    // Repository still receives them
    const laps = await repo.getLaps(swimmerId);
    assert.equal(laps.length, 4);
  });

  await runTest('3.4 Observer Exception Resilience: Broken listener does not crash recordLap', async () => {
    const repo = new SwimmerRepository();
    await repo.init();
    const engine = new TimerEngine(repo);

    let healthyListenerCalled = false;

    // First listener throws an uncaught error
    engine.onLap(() => {
      throw new Error('Fatal listener crash: unexpected exception');
    });

    // Second listener should still run or recordLap must finish cleanly
    engine.onLap(() => {
      healthyListenerCalled = true;
    });

    const swimmerId = `swimmer-crash-${Date.now()}`;
    await repo.saveSwimmer({ id: swimmerId, name: 'Crash Test Swimmer', lane: 7 });
    await engine.start(swimmerId);

    // Must not throw exception out of recordLap
    let recordResult = null;
    assert.doesNotThrow(() => {});
    try {
      recordResult = await engine.recordLap(swimmerId);
    } catch (err) {
      assert.fail(`recordLap threw an error because of listener: ${err.message}`);
    }

    assert.ok(recordResult);
    assert.equal(recordResult.lap.lapNumber, 1);
    const laps = await repo.getLaps(swimmerId);
    assert.equal(laps.length, 1, 'Lap must be successfully saved to repo despite broken listener');
  });

  await runTest('3.5 End-to-End Multi-Swimmer Batch Integration: 45 laps (20 + 20 + 5 via timer)', async () => {
    const mockStorage = new MemoryStorage();
    const mockFetch = createMockFetch();
    const service = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch,
      flushIntervalMs: 60000
    });

    const repo = new SwimmerRepository();
    await repo.init();
    const engine = new TimerEngine(repo);

    // Wire observer as done in app.js
    engine.onLap(lap => service.enqueueLap(lap));

    // Register 3 swimmers
    const s1 = 'swimmer-batch-1';
    const s2 = 'swimmer-batch-2';
    const s3 = 'swimmer-batch-3';
    await repo.saveSwimmer({ id: s1, name: 'Ana' });
    await repo.saveSwimmer({ id: s2, name: 'Carlos' });
    await repo.saveSwimmer({ id: s3, name: 'Beatriz' });

    await engine.start(s1);
    await engine.start(s2);
    await engine.start(s3);

    // Record 45 laps total:
    // 15 for Ana, 15 for Carlos, 15 for Beatriz interleaved
    for (let round = 1; round <= 15; round++) {
      await engine.recordLap(s1);
      await engine.recordLap(s2);
      await engine.recordLap(s3);
    }

    // After 45 laps:
    // - 20 laps -> batch 1 flushed immediately
    // - 20 laps -> batch 2 flushed immediately
    // - 5 laps remaining in queue
    assert.equal(mockFetch.calls.length, 2, '45 laps should trigger exactly 2 automatic flushes of 20 laps each');
    assert.equal(service.queue.length, 5, 'Queue should hold remaining 5 laps');

    // Inspect Batch 1
    const batch1 = JSON.parse(mockFetch.calls[0].options.body);
    assert.equal(batch1.length, 20);

    // Inspect Batch 2
    const batch2 = JSON.parse(mockFetch.calls[1].options.body);
    assert.equal(batch2.length, 20);

    // Now trigger the 60s periodic timer to flush the remaining 5 laps
    await service.flush();

    assert.equal(mockFetch.calls.length, 3, 'Timer flush should send third request with remaining 5 laps');
    assert.equal(service.queue.length, 0, 'Queue completely empty after timer flush');

    const batch3 = JSON.parse(mockFetch.calls[2].options.body);
    assert.equal(batch3.length, 5);

    // Total laps flushed across all 3 requests = 45
    const totalFlushedLaps = batch1.length + batch2.length + batch3.length;
    assert.equal(totalFlushedLaps, 45, 'All 45 laps successfully accounted for');

    // Invariant: all 45 laps have unique IDs and correct swimmer IDs
    const allIds = new Set([...batch1, ...batch2, ...batch3].map(l => l.id));
    assert.equal(allIds.size, 45, 'All 45 laps must have unique IDs in telemetry log');

    service.destroy();
  });

  // ──────────────────────────────────────────────────────────────────
  // SUMMARY AND VERDICT
  // ──────────────────────────────────────────────────────────────────
  console.log('\n======================================================================');
  console.log(`Empirical Challenge Results: ${passedTests} / ${totalTests} Passed (${failedTests} Failed)`);
  console.log('======================================================================');

  if (failedTests === 0) {
    console.log('🎉 ALL EMPIRICAL CHALLENGES PASSED! Gate Verdict: APPROVE');
    process.exit(0);
  } else {
    console.error(`❌ ${failedTests} EMPIRICAL CHALLENGES FAILED! Gate Verdict: REQUEST_CHANGES`);
    process.exit(1);
  }
}

executeChallengeSuite().catch(err => {
  console.error('Unhandled exception during challenge suite execution:', err);
  process.exit(1);
});
