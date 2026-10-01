// Telemetry Service - Write-Only Cloud Telemetry (Supabase)
// Maintains an append-only in-memory batch queue with 20-lap and 60-second auto-flush.

export const TELEMETRY_CONFIG = Object.freeze({
  ENDPOINT: 'https://iehlfnqzykzxblgxtmjp.supabase.co/rest/v1/laps',
  API_KEY: 'sb_publishable_aAJUu4lQ_W5kYsQkGJ6gzA_VaanQO5i',
  BATCH_SIZE: 20,
  FLUSH_INTERVAL_MS: 60000,
  STORAGE_KEY: 'coach_device_id'
});

/**
 * Standard RFC 4122 v4 UUID generator with fallback
 * @returns {string}
 */
export function generateUuidV4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (_) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class TelemetryService {
  /**
   * @param {Object} [options]
   * @param {string} [options.endpoint]
   * @param {string} [options.apiKey]
   * @param {number} [options.batchSize]
   * @param {number} [options.flushIntervalMs]
   * @param {string} [options.storageKey]
   * @param {Function} [options.fetchFn]
   * @param {Object} [options.storage]
   */
  constructor(options = {}) {
    this.endpoint = options.endpoint || TELEMETRY_CONFIG.ENDPOINT;
    this.apiKey = options.apiKey || TELEMETRY_CONFIG.API_KEY;
    this.batchSize = options.batchSize || TELEMETRY_CONFIG.BATCH_SIZE;
    this.flushIntervalMs = options.flushIntervalMs || TELEMETRY_CONFIG.FLUSH_INTERVAL_MS;
    this.storageKey = options.storageKey || TELEMETRY_CONFIG.STORAGE_KEY;
    this.fetchFn = options.fetchFn || null;
    this.storage = options.storage || null;

    this.queue = [];
    this.deviceId = null;
    this.timerId = null;
    this._isFlushing = false;
  }

  /**
   * Initializes the service, generating or retrieving device ID and starting the periodic timer
   * @returns {TelemetryService}
   */
  init() {
    this.getOrCreateDeviceId();
    this.startTimer();
    return this;
  }

  /**
   * Resolves storage backend with safe fallback
   * @returns {Object|null}
   */
  getStorage() {
    if (this.storage) return this.storage;
    if (typeof localStorage !== 'undefined') return localStorage;
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
    return null;
  }

  /**
   * Resolves fetch implementation with safe fallback
   * @returns {Function|null}
   */
  getFetch() {
    if (this.fetchFn) return this.fetchFn;
    if (typeof fetch !== 'undefined') return fetch;
    if (typeof globalThis !== 'undefined' && globalThis.fetch) return globalThis.fetch;
    return null;
  }

  /**
   * Retrieves or creates a persistent UUID v4 device ID
   * @returns {string}
   */
  getOrCreateDeviceId() {
    if (this.deviceId) return this.deviceId;
    const store = this.getStorage();
    try {
      if (store && typeof store.getItem === 'function') {
        const existing = store.getItem(this.storageKey);
        if (existing && typeof existing === 'string' && existing.trim()) {
          this.deviceId = existing.trim();
          return this.deviceId;
        }
      }
    } catch (e) {
      console.warn('[Telemetry] Storage read error:', e);
    }

    const newId = generateUuidV4();

    try {
      if (store && typeof store.setItem === 'function') {
        store.setItem(this.storageKey, newId);
      }
    } catch (e) {
      console.warn('[Telemetry] Storage write error:', e);
    }

    this.deviceId = newId;
    return this.deviceId;
  }

  /**
   * Maps a recorded lap to the Supabase schema and enqueues it.
   * If the queue reaches the batch threshold (20), flushes immediately.
   * @param {Object} lap
   * @returns {Promise<any>|Object|null}
   */
  enqueueLap(lap) {
    if (!lap || typeof lap !== 'object') return null;

    const record = {
      id: String(lap.id || `lap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
      coach_device_id: this.getOrCreateDeviceId(),
      swimmer_id: String(lap.swimmerId || lap.swimmer_id || ''),
      lap_number: Number(lap.lapNumber ?? lap.lap_number ?? 1),
      split_duration_ms: Math.round(Number(lap.splitDurationMs ?? lap.split_duration_ms ?? 0)),
      cumulative_duration_ms: Math.round(Number(lap.cumulativeDurationMs ?? lap.cumulative_duration_ms ?? 0)),
      recorded_at: Number(lap.timestamp ?? lap.recorded_at ?? Date.now())
    };

    this.queue.push(record);

    if (this.queue.length >= this.batchSize) {
      return this.flush();
    }
    return record;
  }

  /**
   * Starts the 60-second periodic background auto-flush timer
   */
  startTimer() {
    if (this.timerId) return;
    this.timerId = setInterval(() => {
      if (this.queue.length > 0) {
        this.flush();
      }
    }, this.flushIntervalMs);

    if (this.timerId && typeof this.timerId.unref === 'function') {
      this.timerId.unref();
    }
  }

  /**
   * Stops the background timer
   */
  stopTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Flushes queued laps to Supabase via bulk POST.
   * On network failure, uncommitted laps are prepended back to the queue for retry.
   * Operates as an append-only log without altering or deleting remote data.
   * @returns {Promise<Array|null>} Succeeded batch or null
   */
  async flush() {
    if (this._isFlushing || this.queue.length === 0) return null;
    const fetchImp = this.getFetch();
    if (!fetchImp) {
      console.warn('[Telemetry] fetch unavailable; holding queue.');
      return null;
    }

    this._isFlushing = true;
    const batch = this.queue.splice(0, this.queue.length);
    let succeeded = false;

    try {
      const response = await fetchImp(this.endpoint, {
        method: 'POST',
        headers: {
          'apikey': this.apiKey,
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(batch)
      });

      if (!response.ok && response.status !== 409) {
        throw new Error(`Supabase POST failed: HTTP ${response.status} ${response.statusText || ''}`.trim());
      }
      succeeded = true;
      return batch;
    } catch (err) {
      console.warn('[Telemetry] Flush network error; retaining batch for retry:', err.message || err);
      // Prepend batch items back to the queue for retry
      this.queue.unshift(...batch);
      return null;
    } finally {
      this._isFlushing = false;
      if (succeeded && this.queue.length >= this.batchSize) {
        this.flush();
      }
    }
  }

  /**
   * Teardown timer and clear state
   */
  destroy() {
    this.stopTimer();
    this.queue = [];
    this.deviceId = null;
    this._isFlushing = false;
  }
}

export const telemetryService = new TelemetryService();
export default telemetryService;
