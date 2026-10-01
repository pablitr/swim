import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'fake-indexeddb/auto';

import { TelemetryService, TELEMETRY_CONFIG, generateUuidV4 } from '../../js/telemetry/telemetry.js';
import { TimerEngine, TIMER_STATES } from '../../js/timing/timer-engine.js';
import { SwimmerRepository } from '../../js/storage/repository.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * Mock localStorage implementation for Node test environment
 */
class MockStorage {
  constructor(initialData = {}) {
    this._store = new Map(Object.entries(initialData));
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

/**
 * Mock fetch factory
 */
function createMockFetch(handler) {
  const calls = [];
  const fn = async (url, options) => {
    calls.push({ url, options });
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

describe('TelemetryService & Supabase Cloud Telemetry Suite', () => {
  let mockStorage;
  let mockFetch;
  let service;

  beforeEach(() => {
    mockStorage = new MockStorage();
    mockFetch = createMockFetch();
    service = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch,
      flushIntervalMs: 50 // Short interval for responsive unit tests
    });
  });

  afterEach(() => {
    if (service) {
      service.destroy();
    }
  });

  test('TC-TEL-01: Generates and persists coach_device_id in localStorage on initial boot', () => {
    assert.equal(mockStorage.getItem(TELEMETRY_CONFIG.STORAGE_KEY), null);

    const deviceId = service.getOrCreateDeviceId();

    // Verify valid UUID v4 format (8-4-4-4-12 hex digits)
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assert.ok(uuidV4Regex.test(deviceId), `Generated ID "${deviceId}" should match UUID v4 format`);

    // Verify persisted into storage
    assert.equal(mockStorage.getItem(TELEMETRY_CONFIG.STORAGE_KEY), deviceId);

    // Verify subsequent calls return identical ID
    assert.equal(service.getOrCreateDeviceId(), deviceId);
  });

  test('TC-TEL-02: Reuses existing coach_device_id across subsequent sessions', () => {
    const preExistingId = 'c0a0c0a0-1234-4567-89ab-cdef01234567';
    mockStorage.setItem(TELEMETRY_CONFIG.STORAGE_KEY, preExistingId);

    const freshService = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch
    });

    const retrievedId = freshService.getOrCreateDeviceId();
    assert.equal(retrievedId, preExistingId);
    assert.equal(mockStorage.getItem(TELEMETRY_CONFIG.STORAGE_KEY), preExistingId);
    freshService.destroy();
  });

  test('TC-TEL-03: Buffers laps in memory without network requests when below 20-lap threshold', () => {
    for (let i = 1; i <= 19; i++) {
      service.enqueueLap({
        id: `lap-swimmer-1-${i}`,
        swimmerId: 'swimmer-1',
        lapNumber: i,
        splitDurationMs: 45000 + i * 100,
        cumulativeDurationMs: i * 45000,
        timestamp: Date.now() + i * 1000
      });
    }

    assert.equal(service.queue.length, 19, 'Queue should hold all 19 laps');
    assert.equal(mockFetch.calls.length, 0, 'No HTTP request should be sent below 20 laps');
  });

  test('TC-TEL-04: Auto-flush triggers immediate bulk POST when queue reaches 20 laps', async () => {
    for (let i = 1; i <= 19; i++) {
      service.enqueueLap({
        id: `lap-${i}`,
        swimmerId: 'swimmer-1',
        lapNumber: i,
        splitDurationMs: 42000,
        cumulativeDurationMs: i * 42000,
        timestamp: 1700000000000 + i * 1000
      });
    }

    assert.equal(service.queue.length, 19);
    assert.equal(mockFetch.calls.length, 0);

    // 20th lap triggers immediate bulk flush
    await service.enqueueLap({
      id: 'lap-20',
      swimmerId: 'swimmer-1',
      lapNumber: 20,
      splitDurationMs: 41500,
      cumulativeDurationMs: 20 * 42000,
      timestamp: 1700000020000
    });

    assert.equal(mockFetch.calls.length, 1, 'Should trigger exactly 1 bulk POST request');
    assert.equal(service.queue.length, 0, 'Queue should be empty after successful flush');

    const request = mockFetch.calls[0];
    const payload = JSON.parse(request.options.body);
    assert.equal(payload.length, 20, 'Payload should contain all 20 laps');
    assert.equal(payload[0].lap_number, 1);
    assert.equal(payload[19].lap_number, 20);
  });

  test('TC-TEL-05: Validates HTTP request headers and payload schema according to Supabase requirements', async () => {
    const testDeviceId = '11111111-2222-4333-8444-555555555555';
    mockStorage.setItem(TELEMETRY_CONFIG.STORAGE_KEY, testDeviceId);

    service.enqueueLap({
      id: 'lap-custom-99',
      swimmerId: 'swimmer-alpha',
      lapNumber: 5,
      splitDurationMs: 43250.7,
      cumulativeDurationMs: 215430.2,
      timestamp: 1700000099000
    });

    await service.flush();

    assert.equal(mockFetch.calls.length, 1);
    const { url, options } = mockFetch.calls[0];

    // Endpoint validation
    assert.equal(url, 'https://iehlfnqzykzxblgxtmjp.supabase.co/rest/v1/laps');
    assert.equal(options.method, 'POST');

    // Headers validation
    assert.equal(options.headers['apikey'], TELEMETRY_CONFIG.API_KEY);
    assert.equal(options.headers['Authorization'], `Bearer ${TELEMETRY_CONFIG.API_KEY}`);
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.headers['Prefer'], 'return=minimal');

    // Payload schema & types validation
    const payload = JSON.parse(options.body);
    assert.equal(Array.isArray(payload), true);
    assert.equal(payload.length, 1);

    const record = payload[0];
    assert.equal(record.id, 'lap-custom-99');
    assert.equal(record.coach_device_id, testDeviceId);
    assert.equal(record.swimmer_id, 'swimmer-alpha');
    assert.equal(typeof record.swimmer_id, 'string');
    assert.equal(record.lap_number, 5);
    assert.equal(Number.isInteger(record.lap_number), true);
    assert.equal(record.split_duration_ms, 43251);
    assert.equal(Number.isInteger(record.split_duration_ms), true);
    assert.equal(record.cumulative_duration_ms, 215430);
    assert.equal(Number.isInteger(record.cumulative_duration_ms), true);
    assert.equal(record.recorded_at, 1700000099000);
    assert.equal(Number.isInteger(record.recorded_at), true);
  });

  test('TC-TEL-06: Periodic 60-second timer triggers flush for sub-20 lap batches, and avoids empty calls', async () => {
    // Service configured with 30ms interval for fast testing
    const timerService = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch,
      flushIntervalMs: 30
    });

    timerService.startTimer();

    // 1. With empty queue, timer tick should NOT invoke fetch
    await new Promise(r => setTimeout(r, 70));
    assert.equal(mockFetch.calls.length, 0, 'Empty queue must not trigger HTTP request on timer tick');

    // 2. Add 3 laps (< 20 batch size)
    for (let i = 1; i <= 3; i++) {
      timerService.enqueueLap({
        id: `timer-lap-${i}`,
        swimmerId: 'swimmer-timer',
        lapNumber: i,
        splitDurationMs: 40000,
        cumulativeDurationMs: i * 40000,
        timestamp: Date.now()
      });
    }

    assert.equal(timerService.queue.length, 3);
    assert.equal(mockFetch.calls.length, 0);

    // Wait for timer tick to trigger flush
    await new Promise(r => setTimeout(r, 70));

    assert.equal(mockFetch.calls.length, 1, 'Periodic timer should flush sub-20 lap batch');
    assert.equal(timerService.queue.length, 0, 'Queue should be drained after timer flush');

    // 3. Subsequent timer tick with queue empty still does not call fetch
    await new Promise(r => setTimeout(r, 70));
    assert.equal(mockFetch.calls.length, 1, 'Subsequent timer tick with empty queue does not send request');

    timerService.destroy();
  });

  test('TC-TEL-07: Network error resilience: retains batch in queue on fetch rejection or HTTP 500 without crashing', async () => {
    let shouldFail = true;
    const failingFetch = createMockFetch(async (url, options) => {
      if (shouldFail) {
        throw new Error('Network offline: Failed to fetch');
      }
      return { ok: true, status: 201, json: async () => [] };
    });

    const resilientService = new TelemetryService({
      storage: mockStorage,
      fetchFn: failingFetch
    });

    // Enqueue 20 laps (20th triggers flush, which is awaited)
    for (let i = 1; i <= 20; i++) {
      await resilientService.enqueueLap({
        id: `fail-lap-${i}`,
        swimmerId: 'swimmer-offline',
        lapNumber: i,
        splitDurationMs: 45000,
        cumulativeDurationMs: i * 45000,
        timestamp: 1700000000000 + i * 1000
      });
    }

    assert.equal(failingFetch.calls.length >= 1, true, 'At least 1 network attempt was made');
    assert.equal(resilientService.queue.length, 20, 'Uncommitted batch must be retained in queue');
    assert.equal(resilientService.queue[0].id, 'fail-lap-1', 'Chronological order must be preserved');

    // Simulate network recovery
    shouldFail = false;
    await resilientService.flush();

    assert.equal(resilientService.queue.length, 0, 'Queue drained successfully upon network recovery');
    const successfulCall = failingFetch.calls[failingFetch.calls.length - 1];
    const payload = JSON.parse(successfulCall.options.body);
    assert.equal(payload.length, 20);

    resilientService.destroy();
  });

  test('TC-TEL-08: Append-only invariant verification: local lap deletion via repository.deleteLap issues 0 HTTP requests', async () => {
    // 1. Static code check: telemetry service source code must not contain DELETE or PATCH methods
    const telemetryCode = fs.readFileSync(path.join(PROJECT_ROOT, 'js/telemetry/telemetry.js'), 'utf8');
    assert.equal(telemetryCode.includes("method: 'DELETE'"), false, 'Must not define HTTP DELETE');
    assert.equal(telemetryCode.includes("method: 'PATCH'"), false, 'Must not define HTTP PATCH');
    assert.equal(telemetryCode.includes('deleteLap'), false, 'TelemetryService must not have remote delete method');

    // 2. Runtime behavioral check: Wire repository & timerEngine with observer
    const repo = new SwimmerRepository();
    await repo.init();
    const engine = new TimerEngine(repo);

    const observerService = new TelemetryService({
      storage: mockStorage,
      fetchFn: mockFetch
    });

    // Attach observer
    const unsubscribe = engine.onLap(lap => {
      observerService.enqueueLap(lap);
    });

    // Start timer and record lap
    await engine.start('swimmer-audit');
    const { lap } = await engine.recordLap('swimmer-audit');

    assert.equal(observerService.queue.length, 1);
    assert.equal(mockFetch.calls.length, 0);

    // Now delete lap locally from IndexedDB via repository
    await repo.deleteLap(lap.id);

    // Verify zero network requests were dispatched
    assert.equal(mockFetch.calls.length, 0, 'Local lap deletion must never trigger any remote network request');
    assert.equal(observerService.queue.length, 1, 'Cloud telemetry queue remains an append-only historical log');

    unsubscribe();
    observerService.destroy();
  });
});
