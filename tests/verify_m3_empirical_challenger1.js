#!/usr/bin/env node

/**
 * Empirical Challenge Suite: Milestone 3 Verification Runner (Challenger 1)
 *
 * Verification Requirements from Dispatch:
 * 1. Queueing and 20-Lap Threshold:
 *    - Feed 19 laps to TelemetryService. Verify 0 network requests and queue length is 19.
 *    - Feed 20th lap. Verify immediate flush is triggered with exact 20-lap array payload.
 * 2. Request Headers and Payload Schema:
 *    - Inspect request headers: apikey, Authorization: Bearer <key>, Content-Type: application/json, Prefer: return=minimal.
 *    - Inspect payload keys: id, coach_device_id, swimmer_id, lap_number, split_duration_ms, cumulative_duration_ms, recorded_at.
 * 3. Offline / Network Failure Resilience & Retry:
 *    - Mock fetch failure (HTTP 503 & Network Error). Verify batch of 20 is restored at head of queue.
 *    - Add 5 more laps (total 25) while offline. Verify all 25 laps are retained.
 *    - Mock fetch recovery (success). Verify all 25 laps flush in correct chronological order.
 * 4. Adversarial Edge Cases:
 *    - Boundary checks (empty queue timer tick, sub-threshold timer auto-flush).
 *    - Multi-swimmer concurrency and device ID stability.
 *    - Strict Append-Only invariant (local lap deletion triggers 0 HTTP requests).
 *    - TimerEngine fault isolation (telemetry errors never break timer engine).
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

// ─────────────────────────────────────────────────────────────
// Test Harness Utilities
// ─────────────────────────────────────────────────────────────

class MockStorage {
  constructor(initial = {}) {
    this._store = new Map(Object.entries(initial));
  }
  getItem(key) {
    return this._store.has(key) ? this._store.get(key) : null;
  }
  setItem(key, val) {
    this._store.set(key, String(val));
  }
  removeItem(key) {
    this._store.delete(key);
  }
  clear() {
    this._store.clear();
  }
}

function createMockFetch(handler) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options, bodyParsed: options && options.body ? JSON.parse(options.body) : null });
    if (typeof handler === 'function') {
      return handler(url, options);
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

let totalChallenges = 0;
let passedChallenges = 0;
let failedChallenges = 0;

async function runChallenge(title, fn) {
  totalChallenges++;
  console.log(`\n------------------------------------------------------------`);
  console.log(`[CHALLENGE ${totalChallenges}] ${title}`);
  console.log(`------------------------------------------------------------`);
  try {
    await fn();
    passedChallenges++;
    console.log(`✔ PASS: ${title}`);
  } catch (err) {
    failedChallenges++;
    console.error(`✖ FAIL: ${title}`);
    console.error(err.stack || err);
  }
}

// ─────────────────────────────────────────────────────────────
// Verification Execution
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log(`============================================================`);
  console.log(`   Empirical Challenger Suite: Milestone 3 Supabase Telemetry`);
  console.log(`============================================================`);

  // =========================================================================
  // Challenge 1: Queueing and 20-Lap Threshold Boundary
  // =========================================================================
  await runChallenge('19 laps queue in memory with 0 requests; 20th lap triggers immediate bulk flush', async () => {
    const mockStorage = new MockStorage();
    const mockFetch = createMockFetch();
    const service = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch,
      flushIntervalMs: 60000
    });

    // Step 1: Feed 19 laps sequentially
    for (let i = 1; i <= 19; i++) {
      const res = service.enqueueLap({
        id: `lap-${i}`,
        swimmerId: 'swimmer-1',
        lapNumber: i,
        splitDurationMs: 32000 + i * 50,
        cumulativeDurationMs: i * 32000,
        timestamp: 1700000000000 + i * 1000
      });
      // enqueueLap returns the queued record when not flushing
      assert.ok(res !== null, `Lap ${i} should return record`);
      assert.equal(service.queue.length, i, `Queue length after lap ${i} must be ${i}`);
      assert.equal(mockFetch.calls.length, 0, `No network requests should be made at ${i} laps`);
    }

    assert.equal(service.queue.length, 19, 'Queue length must be exactly 19 before 20th lap');
    assert.equal(mockFetch.calls.length, 0, 'Zero network calls made with 19 laps');

    // Step 2: Feed the 20th lap
    const flushPromise = service.enqueueLap({
      id: 'lap-20',
      swimmerId: 'swimmer-1',
      lapNumber: 20,
      splitDurationMs: 31800,
      cumulativeDurationMs: 20 * 32000,
      timestamp: 1700000020000
    });

    // 20th lap triggers flush and returns promise
    assert.ok(flushPromise && typeof flushPromise.then === 'function', '20th lap must return flush promise');
    const flushedBatch = await flushPromise;

    assert.equal(mockFetch.calls.length, 1, 'Exactly 1 bulk POST must be dispatched upon reaching 20 laps');
    assert.equal(service.queue.length, 0, 'Queue must be empty following successful 20-lap flush');
    assert.equal(Array.isArray(flushedBatch), true, 'Returned batch must be an array');
    assert.equal(flushedBatch.length, 20, 'Returned batch must contain exactly 20 items');

    const dispatchedPayload = mockFetch.calls[0].bodyParsed;
    assert.equal(Array.isArray(dispatchedPayload), true);
    assert.equal(dispatchedPayload.length, 20, 'Dispatched payload must contain exactly 20 laps');
    assert.equal(dispatchedPayload[0].id, 'lap-1');
    assert.equal(dispatchedPayload[0].lap_number, 1);
    assert.equal(dispatchedPayload[19].id, 'lap-20');
    assert.equal(dispatchedPayload[19].lap_number, 20);

    service.destroy();
  });

  // =========================================================================
  // Challenge 2: Request Headers & Supabase Schema Verification
  // =========================================================================
  await runChallenge('Request headers and payload schema strictly match Supabase laps table specifications', async () => {
    const fixedDeviceId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
    const mockStorage = new MockStorage({
      [TELEMETRY_CONFIG.STORAGE_KEY]: fixedDeviceId
    });
    const mockFetch = createMockFetch();
    const service = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch
    });

    service.enqueueLap({
      id: 'lap-schema-test',
      swimmerId: 'swimmer-omega-42',
      lapNumber: 7,
      splitDurationMs: 45123.6,
      cumulativeDurationMs: 315876.4,
      timestamp: 1700000555123
    });

    await service.flush();

    assert.equal(mockFetch.calls.length, 1);
    const { url, options, bodyParsed } = mockFetch.calls[0];

    // Endpoint URL check
    assert.equal(url, 'https://iehlfnqzykzxblgxtmjp.supabase.co/rest/v1/laps');
    assert.equal(options.method, 'POST');

    // Headers check
    const headers = options.headers;
    assert.equal(headers['apikey'], TELEMETRY_CONFIG.API_KEY, 'apikey header must match publishable key');
    assert.equal(headers['Authorization'], `Bearer ${TELEMETRY_CONFIG.API_KEY}`, 'Authorization header must be Bearer token');
    assert.equal(headers['Content-Type'], 'application/json', 'Content-Type must be application/json');
    assert.equal(headers['Prefer'], 'return=minimal', 'Prefer header must specify return=minimal for write-only efficiency');

    // Schema Check
    assert.equal(Array.isArray(bodyParsed), true);
    assert.equal(bodyParsed.length, 1);
    const record = bodyParsed[0];

    const expectedKeys = [
      'id',
      'coach_device_id',
      'swimmer_id',
      'lap_number',
      'split_duration_ms',
      'cumulative_duration_ms',
      'recorded_at'
    ].sort();

    const actualKeys = Object.keys(record).sort();
    assert.deepEqual(actualKeys, expectedKeys, 'Payload keys must exactly match expected Supabase schema');

    // Data types and integer validation
    assert.equal(typeof record.id, 'string');
    assert.equal(record.id, 'lap-schema-test');

    assert.equal(typeof record.coach_device_id, 'string');
    assert.equal(record.coach_device_id, fixedDeviceId);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert.ok(uuidRegex.test(record.coach_device_id), 'coach_device_id must be valid RFC 4122 v4 UUID');

    assert.equal(typeof record.swimmer_id, 'string');
    assert.equal(record.swimmer_id, 'swimmer-omega-42');

    assert.equal(typeof record.lap_number, 'number');
    assert.equal(Number.isInteger(record.lap_number), true);
    assert.equal(record.lap_number, 7);

    assert.equal(typeof record.split_duration_ms, 'number');
    assert.equal(Number.isInteger(record.split_duration_ms), true);
    assert.equal(record.split_duration_ms, 45124, 'splitDurationMs should be rounded to integer');

    assert.equal(typeof record.cumulative_duration_ms, 'number');
    assert.equal(Number.isInteger(record.cumulative_duration_ms), true);
    assert.equal(record.cumulative_duration_ms, 315876, 'cumulativeDurationMs should be rounded to integer');

    assert.equal(typeof record.recorded_at, 'number');
    assert.equal(Number.isInteger(record.recorded_at), true);
    assert.equal(record.recorded_at, 1700000555123);

    service.destroy();
  });

  // =========================================================================
  // Challenge 3: Offline Network Failure Batch Retention and Chronological Retry
  // =========================================================================
  await runChallenge('Offline network failure (HTTP 503 & Network Error): retains batch, accumulates 5 more laps (total 25), and flushes in chronological order on recovery', async () => {
    let mode = 'fail-503';
    let requestCount = 0;

    const mockStorage = new MockStorage();
    const failingFetch = createMockFetch(async (url, options) => {
      requestCount++;
      if (mode === 'fail-503') {
        return {
          ok: false,
          status: 503,
          statusText: 'Service Unavailable',
          json: async () => ({ error: 'Service Unavailable' })
        };
      }
      if (mode === 'fail-network') {
        throw new Error('TypeError: Failed to fetch (Internet disconnected)');
      }
      return {
        ok: true,
        status: 201,
        statusText: 'Created',
        json: async () => []
      };
    });

    const service = new TelemetryService({
      storage: mockStorage,
      fetchFn: failingFetch
    });

    // 1. Enqueue 20 laps during HTTP 503 outage
    for (let i = 1; i <= 20; i++) {
      await service.enqueueLap({
        id: `fail-batch-${i}`,
        swimmerId: 'swimmer-resilience',
        lapNumber: i,
        splitDurationMs: 35000,
        cumulativeDurationMs: i * 35000,
        timestamp: 1700000000000 + i * 1000
      });
    }

    assert.equal(requestCount, 1, '1 POST attempt should have been made at lap 20');
    assert.equal(service.queue.length, 20, 'Uncommitted batch of 20 laps must be retained in queue after 503');
    assert.equal(service.queue[0].id, 'fail-batch-1', 'Queue head must be first lap');
    assert.equal(service.queue[19].id, 'fail-batch-20', 'Queue tail must be 20th lap');

    // 2. Switch to Network Disconnected error, add 5 more laps (laps 21 to 25)
    mode = 'fail-network';
    for (let i = 21; i <= 25; i++) {
      await service.enqueueLap({
        id: `fail-batch-${i}`,
        swimmerId: 'swimmer-resilience',
        lapNumber: i,
        splitDurationMs: 36000,
        cumulativeDurationMs: i * 35000,
        timestamp: 1700000000000 + i * 1000
      });
    }

    // Since queue >= 20, each addition attempted flush and caught network error, preserving queue
    assert.equal(service.queue.length, 25, 'Queue must now hold all 25 laps');
    assert.equal(service.queue[0].id, 'fail-batch-1', 'Head of queue must still be lap 1');
    assert.equal(service.queue[24].id, 'fail-batch-25', 'Tail of queue must be lap 25');

    // 3. Network Restored: switch mode to success and trigger flush
    mode = 'success';
    const recoveredBatch = await service.flush();

    assert.ok(recoveredBatch !== null, 'Flush must return recovered batch');
    assert.equal(recoveredBatch.length, 25, 'All 25 laps must be flushed in recovery batch');
    assert.equal(service.queue.length, 0, 'Queue must be drained to 0 after recovery flush');

    // Inspect the recovery HTTP request
    const lastCall = failingFetch.calls[failingFetch.calls.length - 1];
    const recoveredPayload = lastCall.bodyParsed;
    assert.equal(recoveredPayload.length, 25, 'Payload must contain all 25 laps');

    // Strict chronological sequence assertion
    for (let idx = 0; idx < 25; idx++) {
      const expectedLapNum = idx + 1;
      assert.equal(
        recoveredPayload[idx].lap_number,
        expectedLapNum,
        `Index ${idx} must have lap_number ${expectedLapNum}`
      );
      assert.equal(
        recoveredPayload[idx].id,
        `fail-batch-${expectedLapNum}`,
        `Index ${idx} must have ID fail-batch-${expectedLapNum}`
      );
    }

    service.destroy();
  });

  // =========================================================================
  // Challenge 4: Periodic 60s Auto-Flush & Idle Invariants
  // =========================================================================
  await runChallenge('Periodic auto-flush timer flushes sub-20 lap batches without spamming empty requests', async () => {
    const mockStorage = new MockStorage();
    const mockFetch = createMockFetch();
    const service = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch,
      flushIntervalMs: 25 // 25ms accelerated timer for empirical test
    });

    service.startTimer();

    // 1. Idle test: empty queue should NOT produce HTTP calls
    await new Promise(r => setTimeout(r, 60));
    assert.equal(mockFetch.calls.length, 0, 'Periodic timer tick on empty queue must never issue HTTP request');

    // 2. Sub-threshold test: add 4 laps (< 20 batch size)
    for (let i = 1; i <= 4; i++) {
      service.enqueueLap({
        id: `timer-sub-${i}`,
        swimmerId: 'swimmer-timer',
        lapNumber: i,
        splitDurationMs: 29000,
        cumulativeDurationMs: i * 29000,
        timestamp: Date.now()
      });
    }

    assert.equal(service.queue.length, 4, '4 laps enqueued in memory');
    assert.equal(mockFetch.calls.length, 0, '0 requests prior to timer tick');

    // Wait for timer tick
    await new Promise(r => setTimeout(r, 60));

    assert.equal(mockFetch.calls.length, 1, 'Periodic timer must trigger flush for sub-20 batch');
    assert.equal(service.queue.length, 0, 'Queue must be drained after periodic flush');
    assert.equal(mockFetch.calls[0].bodyParsed.length, 4, 'Dispatched batch must contain the 4 laps');

    // 3. Subsequent tick with drained queue must NOT trigger another request
    await new Promise(r => setTimeout(r, 60));
    assert.equal(mockFetch.calls.length, 1, 'No extra request made while queue remains empty');

    service.destroy();
  });

  // =========================================================================
  // Challenge 5: Multi-Swimmer Interleaving & Device ID Permanence
  // =========================================================================
  await runChallenge('Multi-swimmer concurrent laps share stable coach_device_id and maintain per-swimmer isolation', async () => {
    const mockStorage = new MockStorage();
    const mockFetch = createMockFetch();
    const service = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch,
      batchSize: 20
    });

    const devId = service.getOrCreateDeviceId();

    // Interleave 10 laps for swimmer A and 10 laps for swimmer B (total 20 laps)
    for (let i = 1; i <= 10; i++) {
      service.enqueueLap({
        id: `lap-swimmer-A-${i}`,
        swimmerId: 'swimmer-A',
        lapNumber: i,
        splitDurationMs: 30000,
        cumulativeDurationMs: i * 30000,
        timestamp: 1700000000000 + i * 2000
      });

      await service.enqueueLap({
        id: `lap-swimmer-B-${i}`,
        swimmerId: 'swimmer-B',
        lapNumber: i,
        splitDurationMs: 31000,
        cumulativeDurationMs: i * 31000,
        timestamp: 1700000000000 + i * 2000 + 500
      });
    }

    assert.equal(mockFetch.calls.length, 1, '20 interleaved laps must trigger 1 flush');
    const batch = mockFetch.calls[0].bodyParsed;
    assert.equal(batch.length, 20);

    // Verify all 20 records share the exact same coach_device_id
    for (const record of batch) {
      assert.equal(record.coach_device_id, devId, 'Every record must carry the coach_device_id');
      assert.ok(['swimmer-A', 'swimmer-B'].includes(record.swimmer_id), 'Record swimmer_id must match');
    }

    // Verify persistence across new instance
    const freshInstance = new TelemetryService({ storage: mockStorage });
    assert.equal(freshInstance.getOrCreateDeviceId(), devId, 'Fresh instance must retrieve same device ID');
    freshInstance.destroy();
    service.destroy();
  });

  // =========================================================================
  // Challenge 6: Strict Append-Only Invariant & Repository Lap Deletion Isolation
  // =========================================================================
  await runChallenge('Strict Append-Only Invariant: repository.deleteLap issues ZERO HTTP calls and telemetry contains no DELETE methods', async () => {
    // 1. Static code audit: verify telemetry.js contains no DELETE / PATCH HTTP calls
    const telemetryCode = fs.readFileSync(path.join(PROJECT_ROOT, 'js/telemetry/telemetry.js'), 'utf8');
    assert.equal(telemetryCode.includes("method: 'DELETE'"), false, 'telemetry.js must not contain DELETE method');
    assert.equal(telemetryCode.includes("method: 'PATCH'"), false, 'telemetry.js must not contain PATCH method');
    assert.equal(telemetryCode.includes('deleteLap'), false, 'telemetry.js must not expose deleteLap method');

    // 2. Behavioral verification: wire real SwimmerRepository and TimerEngine
    const repo = new SwimmerRepository();
    await repo.init();
    const engine = new TimerEngine(repo);

    const mockStorage = new MockStorage();
    const mockFetch = createMockFetch();
    const service = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch
    });

    const unsubscribe = engine.onLap(lap => {
      service.enqueueLap(lap);
    });

    await engine.start('swimmer-append-only');
    const { lap } = await engine.recordLap('swimmer-append-only');

    assert.equal(service.queue.length, 1, 'Lap enqueued in telemetry');
    assert.equal(mockFetch.calls.length, 0, 'No HTTP request yet');

    // Delete lap from IndexedDB
    await repo.deleteLap(lap.id);

    // Check repository: lap deleted locally
    const remainingLaps = await repo.getLaps('swimmer-append-only');
    assert.equal(remainingLaps.length, 0, 'Lap deleted locally from repository');

    // Telemetry MUST retain historical record in append-only fashion with ZERO network delete requests
    assert.equal(mockFetch.calls.length, 0, 'ZERO HTTP requests must be sent on local lap deletion');
    assert.equal(service.queue.length, 1, 'Telemetry queue retains lap in append-only log');

    unsubscribe();
    service.destroy();
  });

  // =========================================================================
  // Challenge 7: TimerEngine Fault Isolation
  // =========================================================================
  await runChallenge('TimerEngine Fault Isolation: telemetry exceptions or failures never disrupt timing engine operations', async () => {
    const repo = new SwimmerRepository();
    await repo.init();
    const engine = new TimerEngine(repo);

    // Register a broken listener that throws deliberately
    engine.onLap(() => {
      throw new Error('Deliberate observer crash');
    });

    await engine.start('swimmer-fault-test');
    
    // recordLap must not throw even if a listener throws
    let recordResult = null;
    await assert.doesNotReject(async () => {
      recordResult = await engine.recordLap('swimmer-fault-test');
    }, 'recordLap must absorb lap listener exceptions cleanly');

    assert.ok(recordResult !== null, 'recordResult should be returned');
    assert.equal(recordResult.lap.lapNumber, 1, 'First lap recorded');

    const state = await repo.getTimerState('swimmer-fault-test');
    assert.equal(state.currentLapIndex, 2, 'TimerEngine state progressed normally to lap 2');
  });

  // =========================================================================
  // Summary
  // =========================================================================
  console.log(`\n============================================================`);
  console.log(`                 CHALLENGE SUITE SUMMARY                    `);
  console.log(`============================================================`);
  console.log(`Total Challenges : ${totalChallenges}`);
  console.log(`Passed           : ${passedChallenges}`);
  console.log(`Failed           : ${failedChallenges}`);
  console.log(`============================================================`);

  if (failedChallenges > 0) {
    console.error(`\n❌ VERDICT: FAIL - ${failedChallenges} challenges failed.`);
    process.exit(1);
  } else {
    console.log(`\n🎉 VERDICT: PASS - All ${passedChallenges} empirical challenges verified!`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
