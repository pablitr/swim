# Task Assignment: Milestone 2 Worker (UI/UX Overhaul, Cards & High-Contrast Design)

**Assigned Agent**: worker_m2
**Role**: UI/UX & Component Implementation Worker
**Authoritative Request**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/ORIGINAL_REQUEST.md` (MUST read first)
**Project Document**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/orchestrator_2/PROJECT.md`
**UI/UX Explorer Report**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_ui/handoff.md` (Detailed DOM specs, ASCII wireframe, and CSS tokens)
**Performance Explorer Report**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_perf/handoff.md` (DOM caching & CSS containment)
**Project Root**: `/home/pablito/emprende/swimcoach_tracker`
**Working Directory**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m2`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Write Ownership (Exclusive to this Worker)
You exclusively own:
- `index.html` (header refactor)
- `css/variables.css` (high contrast poolside tokens)
- `css/styles.css` (compact header, card styling, containment, button ergonomics)
- `js/ui/swimmer-card.js` (3-lap history, Start/Stop/Pase/Reiniciar buttons, DOM caching)
- `tests/unit/swimmer_card.test.js` (update assertions to match new card structure)
- `tests/unit/math_challenge.test.js` (update Spanish string assertion on line 271 and Gaussian precision tolerance)

Do NOT modify `manifest.json`, `js/storage/`, or `js/timing/ticker.js` (completed in M1).

## Detailed Objectives

### 1. Ultra-Compact Header (Requirement R2)
- In `index.html`: Update `<header class="app-header">` to use a 40px fixed bar layout with inline brand icon, `<h1>SwimCoach</h1>`, status dot `#connection-status`, and compact action button `#btn-add-swimmer-trigger` ("Añadir").
- In `css/styles.css`: Set `.app-header` height to 40px, sticky positioning, minimal padding (`env(safe-area-inset-top, 0px) var(--space-3) 0 var(--space-3)`).

### 2. High-Contrast Poolside Theme & CSS Optimization (Requirements R5 & R6)
- In `css/variables.css`: Implement the outdoor/poolside high-contrast tokens specified in Section 3.4 of the UI/UX Explorer Report:
  - `--bg-app: #070d18;`, `--bg-surface: #0e172a;`, `--bg-surface-elevated: #162238;`
  - High-contrast borders: `--border-subtle: #24385a;`, `--border-default: #3b537d;`, `--border-strong: #38bdf8;`
  - High-legibility amber text: `--color-lap-text: #060b14;` (dark text on amber Pase button gives > 11:1 contrast ratio, meeting WCAG AAA).
  - Touch targets: `--touch-target-min: 44px;`, `--touch-target-large: 50px;`
  - Grid card min width: `--grid-card-min-width: 280px;`
- In `css/styles.css`:
  - Update `.swimmer-grid` to `grid-template-columns: repeat(auto-fit, minmax(var(--grid-card-min-width, 280px), 1fr));`.
  - Add CSS containment to `.swimmer-card`: `contain: layout paint;`.
  - Add `contain: strict;` to `.stopwatch-time` and `.card-recent-laps`.
  - REMOVE all `text-shadow: 0 0 12px ...` and `text-shadow: 0 0 8px ...` from `.stopwatch-time` and cards. Use crisp, high-contrast text color (`#10b981`, `#38bdf8`, `#ffffff`) without Gaussian blur.
  - Style the 3-row recent laps container `.card-recent-laps` with fixed row heights (`min-height: 72px`), tabular numbers, and placeholder styling for empty rows to guarantee zero CLS.
  - Style the large Pase button (`min-height: 48px`, full width) and the 3-button toolbar (`.card-actions-toolbar` with `display: flex; gap: 8px;`).

### 3. Swimmer Card with 3-Lap History & Controls (Requirements R3 & R4 & R5 DOM Caching)
- In `js/ui/swimmer-card.js`:
  - **DOM Caching**: During `render()`, cache all element references:
    `this._timeEl = card.querySelector('#time-' + this.swimmer.id);`
    `this._stateLabelEl = card.querySelector('#state-label-' + this.swimmer.id);`
    `this._recentLapsListEl = card.querySelector('#recent-laps-list-' + this.swimmer.id);`
    `this._lapBtnEl = card.querySelector('#btn-lap-' + this.swimmer.id);`
    `this._lapCountEl = card.querySelector('#lapcount-' + this.swimmer.id);`
    `this._btnStartEl = card.querySelector('#btn-start-' + this.swimmer.id);`
    `this._btnStopEl = card.querySelector('#btn-stop-' + this.swimmer.id);`
    `this._btnResetEl = card.querySelector('#btn-reset-' + this.swimmer.id);`
  - In `updateTimeDisplay()`: Use cached `this._timeEl` with textContent dirty-checking (`if (this._lastTimeStr !== timeStr) { this._timeEl.textContent = timeStr; this._lastTimeStr = timeStr; }`). Zero querySelector calls in ticker!
  - **3-Lap History (R3)**: Implement `_updateRecentLaps()` rendering exactly 3 rows. If fewer than 3 laps exist, render placeholder rows (`V- : --:--.-- : --:--.--`) so the card height never shifts. Laps must be shown in reverse order (most recent lap first: e.g. Lap 4, Lap 3, Lap 2). Display Lap Number, Split Time, and Cumulative Time formatted cleanly.
  - **Controls (R3 & R4)**:
    - Primary Lap button: `#btn-lap-${id}` with text "PASE" and current lap index counter (`V4`).
    - Action toolbar with 3 buttons:
      1. Iniciar/Pausar/Reanudar button `#btn-start-${id}` with dynamic Spanish text and icons.
      2. Detener button `#btn-stop-${id}` with Spanish label "Detener".
      3. Reiniciar button `#btn-reset-${id}` with Spanish label "Reiniciar".
    - Wire `#btn-reset-${id}` directly to `handleReset()`: invokes `await timerEngine.reset(this.swimmer.id)`, resets state to IDLE, updates time to `00:00.00`, and clears/updates lap feed.
    - Wire `#btn-stop-${id}` to `handleStop()`.
    - Wire `#btn-lap-${id}` to `handleLap()`.

### 4. Unit Test Updates
- In `tests/unit/swimmer_card.test.js`: Update tests to reflect the new DOM structure (test `#btn-reset-${id}`, `_updateRecentLaps()`, 3-lap feed, `#btn-lap-${id}`, `#btn-start-${id}`, `#btn-stop-${id}`).
- In `tests/unit/math_challenge.test.js`: Update string assertion on line 271 to Spanish (`Sin datos de pases registrados`), and fix the precision assertion on line 147 (`Math.abs(stats.sustainablePace - 45.1) <= 0.1`).

### 5. Verification Commands
- `node tests/verify_spanish.js` -> MUST PASS (0 English UI strings).
- `node tests/verify_acceptance.js` -> MUST PASS (5/5 acceptance criteria).
- `npm test` (`node --test tests/unit/*.test.js`) -> ALL tests MUST PASS cleanly!

## Output
Write your handoff report to:
`/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m2/handoff.md`
Report your exact changes, commands run, test outputs, and notify parent via `send_message`.


## 2026-09-30T20:14:32Z
You are assigned as worker_m2 for Milestone 2 (UI/UX Overhaul, Cards & High-Contrast Design) of the SwimCoach Tracker project.
Your working directory is: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m2
Your dispatch instructions, design specifications, and file boundaries are at: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m2/DISPATCH.md
Read /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/ORIGINAL_REQUEST.md first.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement:
1. Ultra-compact 40px header in index.html and css/styles.css.
2. High-contrast poolside theme tokens in css/variables.css and CSS containment/removal of blur text-shadow in css/styles.css.
3. Intuitive swimmer card with 3-lap history feed (most recent 3 laps), primary Pase button, Start/Stop/Reiniciar buttons, and cached DOM references in js/ui/swimmer-card.js.
4. Update unit tests in tests/unit/swimmer_card.test.js and tests/unit/math_challenge.test.js.
5. Run tests: node tests/verify_spanish.js, node tests/verify_acceptance.js, and npm test (all unit tests).
When done, write your handoff report to /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m2/handoff.md and notify your parent via send_message.
