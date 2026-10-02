// Ticker - High-Performance requestAnimationFrame Render Loop
// Drives smooth ~60 FPS UI updates for active running timers with auto start/stop lifecycle.

export class Ticker {
  constructor(targetFps = 60) {
    this.subscribers = new Map();
    this.animationFrameId = null;
    this.isRunning = false;
    this.targetFps = targetFps;
    this.frameInterval = 1000 / targetFps;
    this.lastFrameTime = 0;
    this._tick = this._tick.bind(this);
  }

  /**
   * Set target frame rate (FPS) for rendering throttle
   * @param {number} fps
   */
  setTargetFps(fps) {
    if (typeof fps === 'number' && fps > 0) {
      this.targetFps = fps;
      this.frameInterval = 1000 / fps;
    }
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
    this.lastFrameTime = 0;

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      this.animationFrameId = window.requestAnimationFrame(this._tick);
    }
  }

  /**
   * Stop the render loop
   */
  stop() {
    this.isRunning = false;
    this.lastFrameTime = 0;
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

    const now = typeof timestamp === 'number' ? timestamp : (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
    const elapsed = now - this.lastFrameTime;

    // Throttle subscriber invocations to the target frame interval
    // A small buffer (-2ms) prevents frame-drop jitter on exact 60Hz displays
    if (this.lastFrameTime === 0 || elapsed >= this.frameInterval - 2) {
      this.lastFrameTime = now;

      for (const [id, callback] of this.subscribers.entries()) {
        try {
          callback(now);
        } catch (err) {
          console.error(`[Ticker] Error de suscriptor (${id}):`, err);
        }
      }
    }

    if (this.subscribers.size === 0) {
      this.isRunning = false;
      this.animationFrameId = null;
    } else if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      this.animationFrameId = window.requestAnimationFrame(this._tick);
    }
  }
}

export const ticker = new Ticker(30);
export default ticker;
