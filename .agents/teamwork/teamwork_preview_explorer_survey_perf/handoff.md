# Performance Profiling & Root Cause Diagnosis Report

## 1. Observation

### 1.1 Ticker Render Loop & Uncached DOM Queries on Hot Path
- **File**: `js/timing/ticker.js` (lines 54–56, 74–90)
  ```javascript
  74:   _tick(timestamp) {
  75:     if (!this.isRunning) return;
  76: 
  77:     for (const [id, callback] of this.subscribers.entries()) {
  78:       try {
  79:         callback(timestamp);
  80:       } catch (err) {
  81:         console.error(`[Ticker] Subscriber error (${id}):`, err);
  82:       }
  83:     }
  84: 
  85:     if (this.subscribers.size > 0 && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
  86:       this.animationFrameId = window.requestAnimationFrame(this._tick);
  87:     } else {
  88:       this.isRunning = false;
  89:       this.animationFrameId = null;
  90:     }
  91:   }
  ```
  `Ticker` runs an unthrottled `requestAnimationFrame` loop at the device refresh rate (60Hz, 90Hz, 120Hz on iOS ProMotion or modern Android screens).

- **File**: `js/ui/swimmer-card.js` (lines 193–199)
  ```javascript
  193:   updateTimeDisplay() {
  194:     if (!this.element) return;
  195:     const timeEl = this.element.querySelector(`#time-${this.swimmer.id}`);
  196:     if (timeEl) {
  197:       timeEl.textContent = formatTime(timerEngine.getElapsedMs(this.timerState));
  198:     }
  199:   }
  ```
  On every single frame tick (up to 120 times/sec per active swimmer):
  - Line 195 executes `this.element.querySelector('#time-' + this.swimmer.id)` without caching the DOM element reference.
  - Line 197 executes `timeEl.textContent = formatTime(...)` unconditionally on every frame, with no dirty-checking to see if the formatted string has changed.

### 1.2 Severe CSS Paint & Rasterization Penalty: `text-shadow` Blur on Fast Mutating Text
- **File**: `css/styles.css` (lines 281–301)
  ```css
  281: .stopwatch-time {
  282:   font-family: var(--font-mono);
  283:   font-size: 1.55rem;
  284:   font-weight: 900;
  285:   letter-spacing: 0.02em;
  286:   font-variant-numeric: tabular-nums;
  287:   color: var(--text-primary);
  288:   line-height: 1;
  289:   text-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
  290: }
  291: 
  292: .swimmer-card.running .stopwatch-time {
  293:   color: #a7f3d0;
  294:   text-shadow: 0 0 12px var(--color-start-glow);
  295: }
  296: 
  297: .swimmer-card.paused .stopwatch-time {
  298:   color: #fde68a;
  299:   text-shadow: 0 0 10px var(--color-lap-glow);
  300: }
  ```
  - **File**: `css/styles.css` (lines 164–172)
  ```css
  164: .swimmer-card.running {
  165:   border-color: var(--color-start);
  166:   box-shadow: 0 0 12px var(--color-start-glow);
  167: }
  168: 
  169: .swimmer-card.paused {
  170:   border-color: var(--color-lap);
  171:   box-shadow: 0 0 12px var(--color-lap-glow);
  172: }
  ```
  `text-shadow: 0 0 12px ...` with a 12px blur radius is attached directly to the rapid-mutating `.stopwatch-time` element.
  Because the text changes constantly (centiseconds), font glyph raster caches cannot be reused. The GPU/CPU rasterizer must recalculate a multi-pass Gaussian blur on every single centisecond text change across all active cards.

### 1.3 IndexedDB Double Transaction and Immediate Flush Contention on Lap Taps
- **File**: `js/timing/timer-engine.js` (lines 292–294)
  ```javascript
  292:     await this.repository.saveLap(lap);
  293:     await this.repository.saveTimerState(state);
  294: 
  295:     return {
  ```
- **File**: `js/storage/repository.js` (lines 100, 141)
  ```javascript
  100:     await put(STORES.TIMER_STATES, state);
  ...
  141:     await put(STORES.LAPS, lap);
  ```
- **File**: `js/storage/db.js` (lines 298–319)
  ```javascript
  298:     const tx = db.transaction(storeName, 'readwrite');
  299:     const store = tx.objectStore(storeName);
  300:     const request = store.put(value);
  ...
  316:     if (typeof tx.commit === 'function') {
  317:       tx.commit();
  318:     }
  ```
  When recording a lap:
  1. `saveLap` opens an isolated `readwrite` transaction on `laps`, issues `put(lap)`, calls `tx.commit()`, and awaits completion.
  2. `saveTimerState` opens a second isolated `readwrite` transaction on `timer_states`, issues `put(state)`, calls `tx.commit()`, and awaits completion.
  This forces two back-to-back synchronous disk/WAL flushes on the browser's storage engine for every single lap tap.

### 1.4 DOM Churn and Missing Layout Containment
- **File**: `js/ui/swimmer-card.js` (lines 217, 220):
  `ssBtn.innerHTML = ICON_PAUSE;` and `ssBtn.innerHTML = ICON_PLAY;` invoke HTML string parsing and DOM reconstruction on timer button taps.
- **File**: `css/styles.css` (lines 148–162):
  `.swimmer-card` has no CSS layout/paint containment (`contain: layout paint` or `content-visibility`). Style and text mutations trigger layout recalcs that propagate up into `.swimmer-grid`.
- **File**: `js/app.js` (lines 88–93):
  `loadSwimmers()` completely destroys all swimmer cards (`card.destroy()`) and innerHTML is cleared, rebuilding all DOM nodes from scratch even if only 1 swimmer's profile was touched.

### 1.5 UX Bloat Caused by Removed On-Card Lap Feed
- In `ORIGINAL_REQUEST.md` (lines 101–108):
  - Requirement R3: "The cards must display the last 3 lap times directly on the card surface as they are recorded."
  - Requirement R4: "Add a clearly visible 'Reset' (Reiniciar) button for each swimmer's timer on their card..."
- In `js/ui/swimmer-card.js` (lines 75–83):
  The previous UI refactor removed all lap history and reset controls from the card surface.
  To view a recorded split, coaches were forced to tap the magnifying glass icon (`btn-corner-lupa`), opening a heavy modal dialog (`js/ui/metrics-modal.js`) which parses HTML strings, renders an SVG boxplot via `innerHTML`, and requires an overlay click to close. This creates severe UX friction and perceived sluggishness.

### 1.6 Current Test Infrastructure & Test Output
- Running `npm run verify` (`node tests/verify_acceptance.js`):
  Output: `Passed: 5 / 5 Acceptance Criteria. ALL ACCEPTANCE CRITERIA PASSED!`
- Running `npm test` (`node --test tests/unit/*.test.js`):
  Output: 96 passed, 5 failed.
  Failing tests:
  - 4 failures in `tests/unit/swimmer_card.test.js` (lines 159, 181, 214, 231) because the previous refactor removed `updateMetrics()` and `updateBoxplot()` from `swimmer-card.js`.
  - 1 failure in `tests/unit/math_challenge.test.js` (line 144: Gaussian distribution test expected 45.1 vs 45.05 produced by modal clustering window radius).

---

## 2. Logic Chain

1. **Vsync Multiplication Factor (Observation 1.1)**:
   A standard swimming heat has 6 to 10 active swimmers timing simultaneously.
   At 60Hz display refresh: $8 \times 60 = 480$ iterations/sec.
   At 120Hz display refresh (iPad Pro, iPhone, modern Android): $8 \times 120 = 960$ iterations/sec.
   In each iteration:
   - `this.element.querySelector` traverses the card's DOM tree.
   - `timerEngine.getElapsedMs` reads `Date.now()`.
   - `formatTime` performs modulo, division, and string padding.
   - `timeEl.textContent` writes to the DOM without verifying if the text changed.

2. **Rasterization Bottleneck from `text-shadow` (Observation 1.2)**:
   Because the centisecond digits change every 10–20ms, text glyph bitmaps cannot be cached by the GPU raster cache.
   Every text update forces the browser rasterizer to compute a 12px blur radius Gaussian convolution around the changing characters.
   With 8 cards updating at 60–120Hz, the browser executes between 480 and 960 Gaussian blur convolution passes every single second.
   On mobile poolside devices (under sunlight with thermal heat), this saturates the GPU rasterizer, causing thermal throttling, frame rate collapse, and battery drain.

3. **Disk I/O Serial Bottleneck on Split Taps (Observation 1.3)**:
   In `timer-engine.js:recordLap`, `await saveLap(lap)` followed by `await saveTimerState(state)` creates two separate, sequential IndexedDB readwrite transactions, each issuing `tx.commit()`.
   When a coach records split times for multiple swimmers finishing a 50m/100m split within 1–2 seconds, the storage subsystem must perform 8 to 16 sequential transaction roundtrips and disk flushes, causing the main JS thread and IndexedDB queue to stall.

4. **DOM Paint Invalidation Propagation (Observation 1.4)**:
   Without CSS `contain: layout paint;` on `.swimmer-card`, whenever `textContent` updates or buttons are tapped, the browser cannot guarantee that neighboring elements in `.swimmer-grid` are unaffected. It therefore recalculates layout for the grid.

5. **Cognitive and Architectural UX Bloat (Observation 1.5)**:
   Stripping the last 3 laps and reset button from the card surface forces the coach into a repetitive cycle of opening and closing heavy modals. The modal re-generates its entire innerHTML and re-renders SVG boxplots on every tap, resulting in perceived sluggishness and high memory GC churn.

---

## 3. Caveats

- **Device Hardware Variation**:
  Physical GPU rasterization overhead varies by GPU chipset and screen PPI. The `text-shadow` Gaussian blur is particularly punishing on high-DPI mobile screens (Apple Retina 3x scale) compared to desktop monitors.
- **Node vs Browser IDB Implementation**:
  Unit tests execute in Node.js using `fake-indexeddb`, which executes in-memory and does not incur physical flash storage sync latency. The sequential transaction bottleneck is much more severe in real WebKit/Blink IndexedDB engines where `tx.commit()` flushes to SQLite WAL.
- **Visual Smoothness vs Frame Rate**:
  The human visual persistence of vision is ~20–30Hz. A digital stopwatch displaying centiseconds does not require 60Hz or 120Hz updates; throttling visual ticks to ~30 FPS (33ms) or 60 FPS (16ms) provides imperceptible visual difference while cutting CPU/GPU load by 50% to 75%.

---

## 4. Conclusion

The root causes of the slowness and bloat in SwimCoach Tracker are:
1. **Unthrottled 60–120Hz render loop** executing uncached DOM `querySelector` calls and unconditional `textContent` mutations without dirty checking.
2. **Expensive CSS `text-shadow` (12px blur)** on mutating `.stopwatch-time` text, forcing hundreds of continuous Gaussian blur rasterizations per second.
3. **Sequential double IndexedDB transactions** with immediate `tx.commit()` on every lap tap (`saveLap` then `saveTimerState`).
4. **Lack of CSS layout containment** (`contain: layout paint`), propagating text invalidations across `.swimmer-grid`.
5. **UX and architectural bloat** caused by removing on-card lap previews and reset buttons, forcing repetitive modal openings and heavy innerHTML/SVG reconstructions.

### Recommended Architectural Refactor Plan for Implementation Worker

#### Phase 1: Render Loop & DOM Optimization
1. **Cache DOM Node References in `SwimmerCard`**:
   - Cache `this.timeEl`, `this.lapCountEl`, `this.lapHistoryEl`, `this.btnStartStop`, `this.btnReset` during `render()` / `mount()`.
   - Never call `querySelector` inside `updateTimeDisplay()` or hot ticker loops.
2. **TextContent Dirty-Checking**:
   - Store `this.lastFormattedTime`.
   - Only assign `this.timeEl.textContent = formatted` when `this.lastFormattedTime !== formatted`.
3. **Throttle Ticker Frame Rate**:
   - In `js/timing/ticker.js`, enforce a target frame rate (e.g. 30 FPS / ~33ms, or 60 FPS maximum) by comparing `timestamp - lastFrameTime < targetInterval`.
   - Skip redundant execution frames. Note: Wall-clock timing accuracy is 100% preserved because elapsed time is computed from `Date.now() - lastResumeTime`.
4. **Eliminate SVG `innerHTML` Parsing on State Changes**:
   - Pre-render both Play and Pause SVG icons inside the button and toggle visibility via CSS class, or update SVG attributes directly instead of destroying/re-parsing innerHTML.

#### Phase 2: CSS & GPU Rasterization Optimization
1. **Remove Text-Shadow from Stopwatch Display**:
   - In `css/styles.css`, remove `text-shadow: 0 0 12px var(--color-start-glow)` and `text-shadow: 0 0 8px ...` from `.stopwatch-time`.
   - Use crisp, high-contrast text color (`#10b981` or `#38bdf8`) on dark background (`#000000`), achieving WCAG AAA contrast without rasterizer blur.
2. **Apply CSS Layout Containment**:
   - Add `contain: layout paint;` to `.swimmer-card`.
   - Add `contain: strict;` to `.stopwatch-time` and `.card-recent-laps`.
   - Add `will-change: transform;` to `.card-lap-body:active`.
3. **Simplify Overlay Backdrop**:
   - Replace `backdrop-filter: blur(4px)` with solid semi-transparent background `rgba(6, 11, 20, 0.90)` to avoid compositing pass stalls.

#### Phase 3: Storage Layer Batching
1. **Atomic Dual-Write for Laps**:
   - In `js/storage/repository.js`, add `saveLapAndTimerState(lap, state)`.
   - Use a single IndexedDB transaction covering `[STORES.LAPS, STORES.TIMER_STATES]` with a single `commit()` to cut storage latency in half.
2. **Batch Master Controls**:
   - Add `saveAllTimerStates(states)` in `repository.js` to commit batch start/stop/reset operations in one transaction.

#### Phase 4: UI Redesign (Requirements R1–R4 & Acceptance Criteria)
1. **Restore Last 3 Lap Times on Card Surface (R3)**:
   - Add a compact 3-row slot on the card surface (`.card-recent-laps`) showing the last 3 splits:
     e.g. `V3: 45.20s | V2: 44.80s | V1: 45.10s`.
   - Update these 3 slots incrementally on `handleLap()` without full re-render.
2. **Add Clearly Visible "Reiniciar" Button (R4)**:
   - Add a dedicated reset button (`btn-corner-reset` or card action button) with clear Spanish label/icon.
3. **100% Spanish Translation (R1)**:
   - Ensure all strings in `index.html`, `js/ui/swimmer-card.js`, `js/ui/modal.js`, `js/ui/metrics-modal.js`, and `js/app.js` are in Spanish.
4. **Fix SwimmerCard Unit Tests**:
   - Update `tests/unit/swimmer_card.test.js` to match the new card structure and ensure all unit tests pass cleanly.

---

## 5. Verification Method

To independently verify these findings and confirm resolution:

1. **Verify Acceptance Criteria Gate**:
   ```bash
   node tests/verify_acceptance.js
   ```
   *Expected*: Passes 5/5 acceptance criteria.

2. **Verify Unit Test Suite**:
   ```bash
   node --test tests/unit/*.test.js
   ```
   *Expected*: 100% test pass rate after implementation updates.

3. **Inspect DOM Query Elimination in Hot Path**:
   Inspect `js/ui/swimmer-card.js` line in `updateTimeDisplay`.
   *Condition*: Ensure no `querySelector` or `getElementById` calls occur inside `updateTimeDisplay()`. Element must be referenced via cached property.

4. **Inspect CSS Rasterization Properties**:
   Inspect `css/styles.css` around `.stopwatch-time`.
   *Condition*: `text-shadow` must NOT be present on `.stopwatch-time`. `.swimmer-card` must contain `contain: layout paint;`.

5. **Profile Storage Transactions**:
   Verify `recordLap` executes a single transaction write rather than two sequential transactions.
