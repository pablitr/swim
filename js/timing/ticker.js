// Ticker - High-Performance requestAnimationFrame Render Loop
// Drives smooth ~60 FPS UI updates for active running timers with auto start/stop lifecycle.

export class Ticker {
  constructor() {
    this.subscribers = new Map();
    this.animationFrameId = null;
    this.isRunning = false;
    this._tick = this._tick.bind(this);
  }

  /**
   * Subscribe a callback to the render loop
   * @param {string} id - Unique identifier for subscriber
   * @param {Function} callback - Function called on each animation frame
   */
  subscribe(id, callback) {
    if (typeof callback !== 'function') return;
    this.subscribers.set(id, callback);

    if (!this.isRunning && this.subscribers.size > 0) {
      this.start();
    }
  }

  /**
   * Unsubscribe a callback from the render loop
   * @param {string} id
   */
  unsubscribe(id) {
    this.subscribers.delete(id);

    if (this.subscribers.size === 0 && this.isRunning) {
      this.stop();
    }
  }

  /**
   * Check if an ID is subscribed
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this.subscribers.has(id);
  }

  /**
   * Start the render loop
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      this.animationFrameId = window.requestAnimationFrame(this._tick);
    }
  }

  /**
   * Stop the render loop
   */
  stop() {
    this.isRunning = false;
    if (this.animationFrameId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
      window.cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Internal tick callback
   * @private
   */
  _tick(timestamp) {
    if (!this.isRunning) return;

    for (const [id, callback] of this.subscribers.entries()) {
      try {
        callback(timestamp);
      } catch (err) {
        console.error(`[Ticker] Subscriber error (${id}):`, err);
      }
    }

    if (this.subscribers.size > 0 && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      this.animationFrameId = window.requestAnimationFrame(this._tick);
    } else {
      this.isRunning = false;
      this.animationFrameId = null;
    }
  }
}

export const ticker = new Ticker();
export default ticker;
