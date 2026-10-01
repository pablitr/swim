// TimerEngine - Zero-Drift Wall-Clock Timing State Machine
// Implements high-precision epoch arithmetic and hard reload recovery without clock drift.

import { repository as defaultRepository } from '../storage/repository.js';

export const TIMER_STATES = Object.freeze({
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  STOPPED: 'STOPPED'
});

/**
 * Format milliseconds into MM:SS.ss (or HH:MM:SS.ss for >= 1 hour)
 * @param {number} ms - Milliseconds to format
 * @returns {string} Formatted digital stopwatch string
 */
export function formatTime(ms) {
  if (ms === null || ms === undefined || isNaN(ms) || ms < 0) {
    ms = 0;
  }
  const totalMs = Math.floor(ms);
  const centis = Math.floor((totalMs % 1000) / 10);
  const totalSeconds = Math.floor(totalMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad = (n, len = 2) => String(n).padStart(len, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}.${pad(centis)}`;
}

/**
 * Calculate current elapsed milliseconds with negative delta protection and zero drift
 * @param {Object|null} state - SwimmerTimerState
 * @returns {number} Current elapsed milliseconds
 */
export function getElapsedMs(state) {
  if (!state || typeof state !== 'object' || state.state === TIMER_STATES.IDLE) {
    return 0;
  }

  const accumulatedMs = Math.max(0, Number(state.accumulatedMs) || 0);

  if (state.state === TIMER_STATES.PAUSED || state.state === TIMER_STATES.STOPPED) {
    return accumulatedMs;
  }

  if (state.state === TIMER_STATES.RUNNING) {
    const lastResume = (state.lastResumeTime !== null && state.lastResumeTime !== undefined)
      ? Number(state.lastResumeTime)
      : (Number(state.startTime) || Date.now());
    const now = Date.now();
    // Negative delta protection against system clock modifications
    const delta = Math.max(0, now - lastResume);
    return accumulatedMs + delta;
  }

  return accumulatedMs;
}

export class TimerEngine {
  constructor(repository = defaultRepository) {
    this.repository = repository;
    this._lapListeners = new Set();
  }

  /**
   * Register a listener for recorded laps
   * @param {Function} listener - Callback invoked with the recorded lap object
   * @returns {Function} Unsubscribe function
   */
  onLap(listener) {
    if (typeof listener === 'function') {
      this._lapListeners.add(listener);
    }
    return () => this._lapListeners.delete(listener);
  }

  /**
   * Initialize or replace storage repository
   * @param {Object} [repository]
   */
  async init(repository) {
    if (repository) {
      this.repository = repository;
    }
    if (this.repository && !this.repository.isInitialized && typeof this.repository.init === 'function') {
      await this.repository.init();
    }
    return this;
  }

  /**
   * Start a timer for a swimmer
   * @param {string} swimmerId
   * @returns {Promise<Object>} Updated timer state
   */
  async start(swimmerId) {
    if (!swimmerId) throw new Error('swimmerId is required to start timer');
    let state = await this.repository.getTimerState(swimmerId);

    const now = Date.now();
    if (!state) {
      state = {
        swimmerId,
        state: TIMER_STATES.RUNNING,
        startTime: now,
        lastResumeTime: now,
        accumulatedMs: 0,
        currentLapIndex: 1,
        lastLapCumulativeMs: 0
      };
    } else if (state.state === TIMER_STATES.RUNNING) {
      return state;
    } else if (state.state === TIMER_STATES.PAUSED) {
      return this.resume(swimmerId);
    } else {
      // Starting from IDLE or STOPPED resets accumulated and starts fresh
      state.state = TIMER_STATES.RUNNING;
      state.startTime = now;
      state.lastResumeTime = now;
      state.accumulatedMs = 0;
      state.currentLapIndex = 1;
      state.lastLapCumulativeMs = 0;
    }

    await this.repository.saveTimerState(state);
    return state;
  }

  /**
   * Pause a running timer and commit accumulated milliseconds
   * @param {string} swimmerId
   * @returns {Promise<Object>} Updated timer state
   */
  async pause(swimmerId) {
    if (!swimmerId) throw new Error('swimmerId is required to pause timer');
    let state = await this.repository.getTimerState(swimmerId);
    if (!state) {
      state = {
        swimmerId,
        state: TIMER_STATES.IDLE,
        startTime: null,
        lastResumeTime: null,
        accumulatedMs: 0,
        currentLapIndex: 1,
        lastLapCumulativeMs: 0
      };
      await this.repository.saveTimerState(state);
      return state;
    }

    if (state.state === TIMER_STATES.PAUSED) {
      return state;
    }

    if (state.state === TIMER_STATES.RUNNING) {
      const now = Date.now();
      const lastResume = (state.lastResumeTime !== null && state.lastResumeTime !== undefined)
        ? state.lastResumeTime
        : (state.startTime || now);
      const delta = Math.max(0, now - lastResume);
      state.accumulatedMs = (state.accumulatedMs || 0) + delta;
      state.lastResumeTime = null;
      state.state = TIMER_STATES.PAUSED;
      await this.repository.saveTimerState(state);
    }

    return state;
  }

  /**
   * Resume a paused timer without losing accumulated milliseconds
   * @param {string} swimmerId
   * @returns {Promise<Object>} Updated timer state
   */
  async resume(swimmerId) {
    if (!swimmerId) throw new Error('swimmerId is required to resume timer');
    let state = await this.repository.getTimerState(swimmerId);

    const now = Date.now();
    if (!state) {
      return this.start(swimmerId);
    }

    if (state.state === TIMER_STATES.RUNNING) {
      return state;
    }

    if (state.state === TIMER_STATES.PAUSED) {
      state.state = TIMER_STATES.RUNNING;
      state.lastResumeTime = now;
      if (!state.startTime) {
        state.startTime = now;
      }
      await this.repository.saveTimerState(state);
      return state;
    }

    // If IDLE or STOPPED, start fresh
    return this.start(swimmerId);
  }

  /**
   * Stop a running or paused timer, fixing final elapsed duration
   * @param {string} swimmerId
   * @returns {Promise<Object>} Updated timer state
   */
  async stop(swimmerId) {
    if (!swimmerId) throw new Error('swimmerId is required to stop timer');
    let state = await this.repository.getTimerState(swimmerId);
    if (!state) {
      state = {
        swimmerId,
        state: TIMER_STATES.STOPPED,
        startTime: null,
        lastResumeTime: null,
        accumulatedMs: 0,
        currentLapIndex: 1,
        lastLapCumulativeMs: 0
      };
      await this.repository.saveTimerState(state);
      return state;
    }

    if (state.state === TIMER_STATES.STOPPED) {
      return state;
    }

    if (state.state === TIMER_STATES.RUNNING) {
      const now = Date.now();
      const lastResume = (state.lastResumeTime !== null && state.lastResumeTime !== undefined)
        ? state.lastResumeTime
        : (state.startTime || now);
      const delta = Math.max(0, now - lastResume);
      state.accumulatedMs = (state.accumulatedMs || 0) + delta;
    }

    state.state = TIMER_STATES.STOPPED;
    state.lastResumeTime = null;
    await this.repository.saveTimerState(state);
    return state;
  }

  /**
   * Reset timer back to IDLE state and 0 elapsed milliseconds
   * @param {string} swimmerId
   * @returns {Promise<Object>} Updated timer state
   */
  async reset(swimmerId) {
    if (!swimmerId) throw new Error('swimmerId is required to reset timer');
    let state = await this.repository.getTimerState(swimmerId);
    if (!state) {
      state = { swimmerId };
    }

    state.state = TIMER_STATES.IDLE;
    state.startTime = null;
    state.lastResumeTime = null;
    state.accumulatedMs = 0;
    state.currentLapIndex = 1;
    state.lastLapCumulativeMs = 0;

    await this.repository.saveTimerState(state);
    return state;
  }

  /**
   * Record a lap split: split = totalElapsed - lastLapCumulativeMs; cumulative = totalElapsed
   * @param {string} swimmerId
   * @returns {Promise<{ lap: Object, state: Object }>}
   */
  async recordLap(swimmerId) {
    if (!swimmerId) throw new Error('swimmerId is required to record lap');
    const state = await this.repository.getTimerState(swimmerId);

    if (!state || state.state === TIMER_STATES.IDLE || state.state === TIMER_STATES.STOPPED) {
      throw new Error(`Cannot record lap: timer is ${state ? state.state : 'IDLE'}`);
    }

    const currentCumulativeMs = this.getElapsedMs(state);
    const lastLapCumulativeMs = state.lastLapCumulativeMs || 0;
    const splitDurationMs = Math.max(0, currentCumulativeMs - lastLapCumulativeMs);
    const lapNumber = state.currentLapIndex || 1;
    const now = Date.now();

    const lap = {
      id: `lap-${swimmerId}-${lapNumber}-${now}-${Math.random().toString(36).slice(2, 6)}`,
      swimmerId,
      lapNumber,
      splitDurationMs,
      cumulativeDurationMs: currentCumulativeMs,
      timestamp: now
    };

    state.currentLapIndex = lapNumber + 1;
    state.lastLapCumulativeMs = currentCumulativeMs;

    if (typeof this.repository.saveLapAndTimerState === 'function') {
      await this.repository.saveLapAndTimerState(lap, state);
    } else {
      await this.repository.saveLap(lap);
      await this.repository.saveTimerState(state);
    }

    for (const listener of this._lapListeners) {
      try {
        listener(lap);
      } catch (err) {
        console.warn('[TimerEngine] Lap listener error:', err);
      }
    }

    return {
      lap,
      state,
      // Compatibility aliases
      id: lap.id,
      swimmerId: lap.swimmerId,
      lapNumber: lap.lapNumber,
      splitDurationMs: lap.splitDurationMs,
      cumulativeDurationMs: lap.cumulativeDurationMs,
      timestamp: lap.timestamp
    };
  }

  /**
   * Get current elapsed milliseconds for a timer state
   * @param {Object} state
   * @returns {number}
   */
  getElapsedMs(state) {
    return getElapsedMs(state);
  }

  /**
   * Format milliseconds to MM:SS.ss (or HH:MM:SS.ss)
   * @param {number} ms
   * @returns {string}
   */
  formatTime(ms) {
    return formatTime(ms);
  }

  /**
   * Get current timer state for a swimmer
   * @param {string} swimmerId
   * @returns {Promise<Object>}
   */
  async getState(swimmerId) {
    const state = await this.repository.getTimerState(swimmerId);
    if (!state) {
      return {
        swimmerId,
        state: TIMER_STATES.IDLE,
        startTime: null,
        lastResumeTime: null,
        accumulatedMs: 0,
        currentLapIndex: 1,
        lastLapCumulativeMs: 0
      };
    }
    return state;
  }

  /**
   * Get all timer states across all swimmers
   * @returns {Promise<Array<Object>>}
   */
  async getAllStates() {
    return this.repository.getAllTimerStates();
  }
}

export const timerEngine = new TimerEngine(defaultRepository);
export default timerEngine;
