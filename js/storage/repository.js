// SwimmerRepository - Domain Persistence Layer
// Implements SwimmerRepository contract with immediate atomic commits to SwimCoachDB.

import {
  openDB,
  closeDB,
  get,
  getAll,
  getAllByIndex,
  put,
  deleteItem,
  clear,
  count,
  STORES
} from './db.js';

export class SwimmerRepository {
  constructor() {
    this.isInitialized = false;
  }

  /**
   * Initialize connection to IndexedDB
   */
  async init() {
    await openDB();
    this.isInitialized = true;
  }

  /**
   * Get all registered swimmers
   * @returns {Promise<Array<Object>>}
   */
  async getSwimmers() {
    return getAll(STORES.SWIMMERS);
  }

  /**
   * Get a single swimmer by ID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getSwimmer(id) {
    if (!id) return null;
    return get(STORES.SWIMMERS, id);
  }

  /**
   * Save or update a swimmer record immediately
   * @param {Object} swimmer - Must have { id, name, ... }
   * @returns {Promise<void>}
   */
  async saveSwimmer(swimmer) {
    if (!swimmer || typeof swimmer !== 'object') {
      throw new Error('Invalid swimmer object provided');
    }
    if (!swimmer.id) {
      swimmer.id = `swimmer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }
    await put(STORES.SWIMMERS, swimmer);
  }

  /**
   * Delete a swimmer and cascade delete their timer state and laps
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteSwimmer(id) {
    if (!id) return;
    // 1. Delete swimmer
    await deleteItem(STORES.SWIMMERS, id);
    // 2. Cascade delete timer state
    await deleteItem(STORES.TIMER_STATES, id);
    // 3. Cascade delete associated laps
    await this.clearLaps(id);
  }

  /**
   * Get persistent timer state for a swimmer
   * @param {string} swimmerId
   * @returns {Promise<Object|null>}
   */
  async getTimerState(swimmerId) {
    if (!swimmerId) return null;
    return get(STORES.TIMER_STATES, swimmerId);
  }

  /**
   * Save or update timer state with immediate atomic persistence
   * @param {Object} state - Must have { swimmerId, status, accumulatedMs, ... }
   * @returns {Promise<void>}
   */
  async saveTimerState(state) {
    if (!state || typeof state !== 'object') {
      throw new Error('Invalid timer state object provided');
    }
    if (!state.swimmerId) {
      throw new Error('Timer state missing swimmerId');
    }
    await put(STORES.TIMER_STATES, state);
  }

  /**
   * Get all persistent timer states (used for hard reload batch recovery)
   * @returns {Promise<Array<Object>>}
   */
  async getAllTimerStates() {
    return getAll(STORES.TIMER_STATES);
  }

  /**
   * Get recorded laps for a swimmer, ordered by lapNumber / timestamp
   * @param {string} swimmerId
   * @returns {Promise<Array<Object>>}
   */
  async getLaps(swimmerId) {
    if (!swimmerId) return [];
    const laps = await getAllByIndex(STORES.LAPS, 'swimmerId', swimmerId);
    // Sort chronologically by timestamp (fallback to lapNumber if timestamps match)
    return laps.sort((a, b) => ((a.timestamp || 0) - (b.timestamp || 0)) || ((a.lapNumber || 0) - (b.lapNumber || 0)));
  }

  /**
   * Save a single lap immediately to IndexedDB
   * @param {Object} lap - Must have { swimmerId, splitMs, cumulativeMs, ... }
   * @returns {Promise<void>}
   */
  async saveLap(lap) {
    if (!lap || typeof lap !== 'object') {
      throw new Error('Invalid lap object provided');
    }
    if (!lap.swimmerId) {
      throw new Error('Lap missing swimmerId');
    }
    if (!lap.id) {
      lap.id = `lap-${lap.swimmerId}-${lap.lapNumber || Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    }
    if (lap.timestamp === undefined) {
      lap.timestamp = Date.now();
    }
    await put(STORES.LAPS, lap);
  }

  /**
   * Delete a single lap by ID
   * @param {string} lapId
   * @returns {Promise<void>}
   */
  async deleteLap(lapId) {
    if (!lapId) return;
    await deleteItem(STORES.LAPS, lapId);
  }

  /**
   * Clear all recorded laps for a specific swimmer
   * @param {string} swimmerId
   * @returns {Promise<void>}
   */
  async clearLaps(swimmerId) {
    if (!swimmerId) return;
    const laps = await getAllByIndex(STORES.LAPS, 'swimmerId', swimmerId);
    for (const lap of laps) {
      if (lap.id) {
        await deleteItem(STORES.LAPS, lap.id);
      }
    }
  }

  /**
   * Get a settings value
   * @param {string} key
   * @returns {Promise<any>}
   */
  async getSetting(key) {
    const record = await get(STORES.SETTINGS, key);
    return record ? record.value : null;
  }

  /**
   * Save a settings value
   * @param {string} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  async saveSetting(key, value) {
    await put(STORES.SETTINGS, { key, value });
  }

  /**
   * Clear all data in all stores (reset app)
   */
  async clearAll() {
    await clear(STORES.SWIMMERS);
    await clear(STORES.SESSIONS);
    await clear(STORES.TIMER_STATES);
    await clear(STORES.LAPS);
    await clear(STORES.SETTINGS);
  }
}

export const repository = new SwimmerRepository();
export default repository;
