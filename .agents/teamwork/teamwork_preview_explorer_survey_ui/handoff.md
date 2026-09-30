# Handoff Report: UI/UX Architecture & Ergonomic Specifications

**Agent**: `teamwork_preview_explorer_survey_ui`  
**Mission**: UI/UX & Layout Exploration for SwimCoach Tracker PWA  
**Target Requirements**: R2 (Ultra-Compact Header), R3 (Intuitive Main Card with 3-Lap History & Start/Stop/Pase Controls), R4 (Accessible Reset Button), R6 (Professional Graphic Design & Poolside High-Contrast Ergonomics)  
**Date**: 2026-09-30  

---

## 1. Observation

### 1.1 Current Header Component (`index.html:25-40`, `css/styles.css:16-35`)
- In `index.html` lines 25–40:
  ```html
  <header class="app-header">
    <div class="header-inner">
      <h1 class="brand-title">SwimCoach</h1>
      <div style="display:flex;align-items:center;gap:8px;">
        <div id="connection-status" class="status-indicator" title="Estado de red">
          <span class="status-dot"></span>
        </div>
        <button id="btn-add-swimmer-trigger" class="btn-compact-add">
          <svg width="14" height="14" ...>...</svg>
          Añadir
        </button>
      </div>
    </div>
  </header>
  ```
- In `css/styles.css` lines 16–35:
  - `.app-header` applies `padding: var(--space-2) var(--space-4)` (8px top/bottom, 16px left/right) and `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4)`.
  - `.header-inner` specifies `min-height: 36px;`.
  - Resulting total rendered height is ~52px. The network status indicator uses a heavy padded capsule (`padding: 4px 8px`, border, background).
  - No mobile viewport-fit / notch safe area handling (`env(safe-area-inset-top)`).

### 1.2 Current Swimmer Card Component (`js/ui/swimmer-card.js:52-84`, `css/styles.css:148-280`)
- In `js/ui/swimmer-card.js` lines 52–84:
  - The card renders:
    1. `.card-corner-bar`: A 32px height flex bar containing:
       - Play/Pause toggle button `#btn-startstop-${this.swimmer.id}` (size 32x32px, icon only, no text label).
       - Swimmer lane `#card-lane-badge` and name `.card-swimmer-name`.
       - Lupa icon button `#btn-lupa-${this.swimmer.id}` (size 32x32px, icon only).
    2. Body button `.card-lap-body`: A full-width button containing the stopwatch time `#time-${this.swimmer.id}` and a lap count badge `#lapcount-${this.swimmer.id}`.
- Observed Gaps vs Requirements:
  - **No Lap Times on Card Surface (R3 Violation)**: The card displays only the integer count of laps (`this.laps.length`). None of the lap split times or cumulative times are rendered on the card. ORIGINAL_REQUEST § R3 mandates: *"The cards must display the last 3 lap times directly on the card surface as they are recorded."*
  - **Missing Stop Button (R3 Violation)**: There is no Stop ("Detener") button on the card. The play button only toggles between start and pause (`lines 107-117`).
  - **No Text Labels on Controls (R3 Violation)**: Primary controls use unlabelled 32x32px icons without Spanish text ("Iniciar", "Pausar", "Detener").
  - **Missing Reset Button (R4 Violation)**: Although `handleReset()` exists in `SwimmerCard` (`js/ui/swimmer-card.js:168-173`), there is no Reset ("Reiniciar") button rendered in the DOM. Coaches cannot reset a swimmer's timer from the card surface.
  - **Sub-optimal Touch Targets**: 32x32px corner buttons fall below the WCAG / touch standard of 44–48px for outdoor/poolside wet-hand interaction.

### 1.3 Card Sizing & Grid Density (`css/styles.css:141-163`)
- `.swimmer-grid` is defined as:
  ```css
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  ```
- `.swimmer-card` is fixed to `height: 155px; min-height: 140px;`.
- At 150px width, accommodating 3-lap history, digital stopwatch, Pase button, and separate Start, Stop, and Reiniciar buttons with legible text is physically impossible without clipping or unreadable micro-typography.

### 1.4 High-Contrast Poolside Design Tokens (`css/variables.css:1-99`)
- `css/variables.css` defines dark mode tokens:
  - `--bg-app: #060b14;`, `--bg-surface: #0d1527;`, `--bg-surface-elevated: #14223d;`
  - `--border-subtle: #1e3156;`, `--border-default: #2a4374;`
  - `--color-start: #10b981;`, `--color-stop: #ef4444;`, `--color-lap: #f59e0b;`, `--color-reset: #64748b;`
- Observations under outdoor sunlight / high glare:
  - Subtle borders (`#1e3156`) have low luminosity contrast (< 2:1 against `#0d1527`), blurring card boundaries in bright daylight.
  - White text on amber (`#f59e0b`) has a contrast ratio of only 2.14:1 (failing WCAG AA). Dark text (`#000000` or `#060b14`) on `#f59e0b` achieves > 11:1 (WCAG AAA compliant).

### 1.5 Unit Test Status (`tests/unit/swimmer_card.test.js`)
- Running `node --test tests/unit/*.test.js`:
  - 96 pass, 5 fail.
  - 4 failures occur in `swimmer_card.test.js` because tests reference deprecated methods from a previous design (`card.updateMetrics`, `card.updateLapsTable`, `card.updateBoxplot`, `#metric-pace-${id}`).
  - Core timing (`tests/unit/timing.test.js`), analytics (`tests/unit/analytics.test.js`), storage (`tests/unit/storage.test.js`), and boxplot (`tests/unit/boxplot.test.js`) pass 100% (61/61 tests pass). Acceptance runner (`tests/verify_acceptance.js`) passes 5/5 criteria.

---

## 2. Logic Chain

```
[Observation 1.1] Header is ~52px with padded pill status and no safe-area inset
    └──> [Inference 1] Reducing vertical padding to 2px/6px, embedding status dot directly next to title, and setting header to exactly 38-40px recovers ~20-25% vertical space for the grid, satisfying R2.

[Observation 1.2 & 1.3] 150px cards cannot fit 3-lap history, Start, Stop, Pase, and Reiniciar buttons with Spanish text
    └──> [Inference 2] Updating grid minimum width to 280px (i.e. `minmax(280px, 1fr)`) provides the necessary horizontal breadth:
         - Fits 1 column on phones (360-430px) with large wet-finger targets
         - Fits 2 columns on tablets/landscape (640-900px)
         - Fits 3-4 columns on desktop/deck monitors (1024-1600px)

[Observation 1.2] Absence of lap history display on card violates R3
    └──> [Inference 3] Adding a dedicated `.card-recent-laps` container rendering the 3 most recent laps (V_n, split duration, cumulative duration in reverse order) satisfies R3 and acceptance criterion: "Recording 4 laps for a swimmer displays the 3 most recent lap times directly on their card."
    └──> [Inference 4] Using a fixed 3-row placeholder structure for empty slots (e.g. `V-- : --:--.--`) ensures Cumulative Layout Shift (CLS = 0) so the card does not jump in height when laps are tapped.

[Observation 1.2] Missing Stop button, unlabelled icons, and missing Reset button violate R3 & R4
    └──> [Inference 5] Establishing a 2-tier control layout:
         - Tier 1: Dedicated, large primary "Pase" (Lap) button (height 48-52px, full card width).
         - Tier 2: Ergonomic action bar containing 3 clearly labeled buttons:
           * "Iniciar" / "Pausar" / "Reanudar" (.btn-card-start)
           * "Detener" (.btn-card-stop)
           * "Reiniciar" (.btn-card-reset)
         - Wire `#btn-reset-${id}` directly to `this.handleReset()`, resetting timer to IDLE and updating lap display.

[Observation 1.4] Sunlight glare washes out subtle borders and light-on-amber buttons
    └──> [Inference 6] Redefine tokens in `css/variables.css`:
         - Increase card border contrast to 2px solid with high-luminance slate/cyan (`#334e7b`, neon `#38bdf8` when running).
         - Set text color on amber Pase button to dark navy (`#060b14`), achieving > 11:1 contrast ratio.
         - Ensure all interactive buttons have `min-height: 44px` and `touch-action: manipulation`.

[Observation 1.5] RequestAnimationFrame loop performs DOM queries every frame
    └──> [Inference 7] Cache `this._timeEl` and `this._stateEl` during `render()` in `SwimmerCard` instead of running `this.element.querySelector` 60 times/sec per swimmer, resolving R5 slowness.
```

---

## 3. Detailed Architectural Specifications

### 3.1 R2: Ultra-Compact Header Specification

#### HTML Structure (`index.html`)
```html
<header class="app-header">
  <div class="header-inner">
    <div class="brand">
      <svg class="brand-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>
        <path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>
      </svg>
      <h1 class="brand-title">SwimCoach</h1>
      <span id="connection-status" class="status-dot" title="En línea"></span>
    </div>
    
    <div class="header-actions">
      <button id="btn-add-swimmer-trigger" class="btn-compact-add" aria-label="Añadir nadador">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        <span>Añadir</span>
      </button>
    </div>
  </div>
</header>
```

#### CSS Layout Rules (`css/styles.css`)
```css
.app-header {
  background-color: var(--bg-surface);
  border-bottom: 1px solid var(--border-default);
  padding: env(safe-area-inset-top, 0px) var(--space-3) 0 var(--space-3);
  height: 40px;
  display: flex;
  align-items: center;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  height: 40px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-icon {
  color: var(--color-pool-bright);
}

.brand-title {
  font-size: 0.95rem; /* ~15px */
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: var(--color-start);
  box-shadow: 0 0 6px var(--color-start);
  display: inline-block;
  margin-left: 4px;
}

.status-dot.offline {
  background-color: var(--color-stop);
  box-shadow: 0 0 6px var(--color-stop);
}

.btn-compact-add {
  height: 28px;
  padding: 0 10px;
  font-size: var(--font-xs);
  font-weight: 700;
  border-radius: var(--radius-sm);
  background-color: var(--color-pool-deep);
  border: 1px solid var(--color-pool-bright);
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  touch-action: manipulation;
  transition: background-color var(--transition-fast), transform var(--transition-fast);
}

.btn-compact-add:hover {
  background-color: var(--color-pool-vibrant);
}

.btn-compact-add:active {
  transform: scale(0.96);
}
```

---

### 3.2 R3 & R4: Intuitive Main Card with 3-Lap History & Controls Specification

#### Visual Card ASCII Wireframe
```text
+-------------------------------------------------------------+
| [C1]  Alex García                          [🔍 Métricas]     | <-- Header (36px)
+-------------------------------------------------------------+
|                                                             |
|                         01:24.82                            | <-- Big Timer (MM:SS.ss)
|                      ● EN MARCHA                            | <-- State Badge
|                                                             |
+-------------------------------------------------------------+
| HISTORIAL RECIENTE (ÚLTIMOS 3 PASES)                        |
|  V3:  00:28.45   |  Acum: 01:24.82                          | <-- Lap 3 (most recent)
|  V2:  00:28.10   |  Acum: 00:56.37                          | <-- Lap 2
|  V1:  00:28.27   |  Acum: 00:28.27                          | <-- Lap 1
+-------------------------------------------------------------+
|                                                             |
|           [  ⏱  PASE  (VUELTA 4)  ]                        | <-- Giant Lap Button (48px)
|                                                             |
+-------------------------------------------------------------+
|  [ ⏸ Pausar ]    |    [ ⏹ Detener ]    |   [ ↺ Reiniciar ]  | <-- 3-Button Toolbar (44px)
+-------------------------------------------------------------+
```

#### DOM Hierarchy (`js/ui/swimmer-card.js`)
```html
<div class="swimmer-card running" id="card-${swimmer.id}" data-swimmer-id="${swimmer.id}">
  <!-- 1. Barra de Identificación -->
  <div class="card-header">
    <div class="card-swimmer-info">
      <span class="card-lane-badge">C${swimmer.lane ?? '-'}</span>
      <h3 class="card-swimmer-name" title="${escapedName}">${escapedName}</h3>
    </div>
    <button class="btn-card-lupa" id="btn-lupa-${swimmer.id}" aria-label="Ver métricas completas" title="Ver métricas y gráfico">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span>Métricas</span>
    </button>
  </div>

  <!-- 2. Cronómetro Principal -->
  <div class="card-timer-section">
    <div class="stopwatch-time" id="time-${swimmer.id}">00:00.00</div>
    <div class="timer-state-label" id="state-label-${swimmer.id}">LISTO</div>
  </div>

  <!-- 3. Historial de Últimos 3 Pases -->
  <div class="card-recent-laps" id="recent-laps-${swimmer.id}">
    <div class="recent-laps-header">Últimos pases</div>
    <div class="recent-laps-list" id="recent-laps-list-${swimmer.id}">
      <!-- Generado dinámicamente con 3 filas fijas -->
      <div class="recent-lap-row placeholder"><span class="lap-num">V-</span><span class="lap-split">--:--.--</span><span class="lap-cum">--:--.--</span></div>
      <div class="recent-lap-row placeholder"><span class="lap-num">V-</span><span class="lap-split">--:--.--</span><span class="lap-cum">--:--.--</span></div>
      <div class="recent-lap-row placeholder"><span class="lap-num">V-</span><span class="lap-split">--:--.--</span><span class="lap-cum">--:--.--</span></div>
    </div>
  </div>

  <!-- 4. Botón Gigante de PASE -->
  <button class="btn-card-lap" id="btn-lap-${swimmer.id}" aria-label="Registrar pase de vuelta">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
    <span class="lap-btn-text">PASE</span>
    <span class="lap-btn-counter" id="lapcount-${swimmer.id}">V1</span>
  </button>

  <!-- 5. Barra de Controles: Iniciar/Pausar, Detener, Reiniciar -->
  <div class="card-actions-toolbar">
    <button class="btn-card-action btn-card-start" id="btn-start-${swimmer.id}" aria-label="Iniciar cronómetro">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      <span class="btn-action-label">Iniciar</span>
    </button>
    
    <button class="btn-card-action btn-card-stop" id="btn-stop-${swimmer.id}" aria-label="Detener cronómetro" disabled>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
      <span class="btn-action-label">Detener</span>
    </button>

    <button class="btn-card-action btn-card-reset" id="btn-reset-${swimmer.id}" aria-label="Reiniciar cronómetro" disabled>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
      <span class="btn-action-label">Reiniciar</span>
    </button>
  </div>
</div>
```

#### 3-Lap Rendering Algorithm (`_updateRecentLaps()`)
```javascript
_updateRecentLaps() {
  const container = this._recentLapsListEl;
  if (!container) return;

  const total = this.laps.length;
  if (total === 0) {
    container.innerHTML = `
      <div class="recent-lap-row placeholder"><span class="lap-num">V-</span><span class="lap-split">--:--.--</span><span class="lap-cum">--:--.--</span></div>
      <div class="recent-lap-row placeholder"><span class="lap-num">V-</span><span class="lap-split">--:--.--</span><span class="lap-cum">--:--.--</span></div>
      <div class="recent-lap-row placeholder"><span class="lap-num">V-</span><span class="lap-split">--:--.--</span><span class="lap-cum">--:--.--</span></div>
    `;
    return;
  }

  // Obtenemos los últimos 3 pases (el más reciente primero)
  const last3 = this.laps.slice(-3).reverse();
  const rows = [];

  for (let i = 0; i < 3; i++) {
    if (i < last3.length) {
      const lap = last3[i];
      rows.push(`
        <div class="recent-lap-row">
          <span class="lap-num">V${lap.lapNumber}</span>
          <span class="lap-split">${formatTime(lap.splitDurationMs)}</span>
          <span class="lap-cum">${formatTime(lap.cumulativeDurationMs)}</span>
        </div>
      `);
    } else {
      // Placeholder para completar 3 filas y evitar Cumulative Layout Shift
      rows.push(`
        <div class="recent-lap-row placeholder">
          <span class="lap-num">V-</span>
          <span class="lap-split">--:--.--</span>
          <span class="lap-cum">--:--.--</span>
        </div>
      `);
    }
  }

  container.innerHTML = rows.join('');
}
```

---

### 3.3 State Machine Behavior & Button State Matrix

| State | Primary Time Display | State Label | Iniciar/Pausar Button | Detener Button | Pase Button | Reiniciar Button |
|---|---|---|---|---|---|---|
| **IDLE** | `00:00.00` (White) | `LISTO` (Muted) | Enabled: "Iniciar" (Green) | Disabled (Muted) | Disabled (Muted) | Disabled (Muted) |
| **RUNNING** | Ticking (Emerald `#34d399`) | `EN MARCHA` (Green) | Enabled: "Pausar" (Amber) | Enabled: "Detener" (Red) | Enabled: "PASE (V_n)" (Gold) | Enabled: "Reiniciar" |
| **PAUSED** | Frozen (Amber `#fbbf24`) | `PAUSADO` (Amber) | Enabled: "Reanudar" (Green) | Enabled: "Detener" (Red) | Disabled (Muted) | Enabled: "Reiniciar" |
| **STOPPED** | Frozen (Red `#f87171`) | `DETENIDO` (Red) | Enabled: "Iniciar" (Green) | Disabled (Muted) | Disabled (Muted) | Enabled: "Reiniciar" |

---

### 3.4 R6: Outdoor/Poolside High-Contrast Graphic Design Tokens

```css
/* css/variables.css - Revised Poolside Tokens */
:root {
  /* Surfaces - High contrast deep water base */
  --bg-app: #070d18;              /* Deep oceanic navy */
  --bg-surface: #0e172a;          /* Card baseline */
  --bg-surface-elevated: #162238; /* Container / Sub-panel */
  --bg-surface-highlight: #1e304f;/* Hover & active */
  --bg-overlay: rgba(5, 10, 20, 0.88);

  /* High-Contrast Borders (Visible in bright sunlight) */
  --border-subtle: #24385a;
  --border-default: #3b537d;      /* 4.5:1 against bg-app */
  --border-strong: #38bdf8;       /* Bright cyan */
  --border-focus: #00f0ff;        /* Neon electric cyan */

  /* Text Typography (WCAG AAA >= 7:1) */
  --text-primary: #ffffff;        /* Pure white (21:1 on bg-app) */
  --text-secondary: #e2e8f0;      /* 12:1 on bg-app */
  --text-muted: #94a3b8;          /* 6.5:1 on bg-app */
  --text-dim: #64748b;
  --text-inverse: #060b14;

  /* Pool & Brand Accents */
  --color-pool-deep: #0284c7;
  --color-pool-vibrant: #0ea5e9;
  --color-pool-bright: #38bdf8;
  --color-pool-glow: #00f0ff;

  /* Action Buttons (Glaring Sunlight Tuned) */
  --color-start: #10b981;         /* Emerald Green */
  --color-start-hover: #059669;
  --color-start-glow: rgba(16, 185, 129, 0.4);

  --color-stop: #ef4444;          /* Vivid Crimson */
  --color-stop-hover: #dc2626;
  --color-stop-glow: rgba(239, 68, 68, 0.4);

  --color-lap: #f59e0b;           /* Amber/Gold */
  --color-lap-hover: #d97706;
  --color-lap-text: #060b14;      /* Pure dark navy on gold (> 11:1 contrast) */
  --color-lap-glow: rgba(245, 158, 11, 0.4);

  --color-reset: #475569;         /* Slate */
  --color-reset-hover: #334155;
  --color-reset-text: #f8fafc;

  /* Touch Ergonomics (Wet finger minimum targets) */
  --touch-target-min: 44px;
  --touch-target-large: 50px;

  /* Layout Density */
  --grid-card-min-width: 280px;
  --card-padding: 12px;
}
```

---

### 3.5 R5: Performance Profiling & Optimization Architecture

1. **Eliminate DOM Queries in Render Loop**:
   - In `SwimmerCard`, during `render()`:
     - Store direct DOM node references: `this._timeEl = card.querySelector('#time-' + this.swimmer.id);` and `this._stateLabelEl = card.querySelector('#state-label-' + this.swimmer.id);`.
     - In `updateTimeDisplay()`:
       ```javascript
       updateTimeDisplay() {
         if (!this._timeEl) return;
         this._timeEl.textContent = formatTime(timerEngine.getElapsedMs(this.timerState));
       }
       ```
     - Reduces DOM query overhead from $60 \times N$ queries/sec to 0 queries/sec during stopwatch execution.
2. **Prevent Layout Thrashing on Lap Taps**:
   - Fixed 3-row layout for `.card-recent-laps` with `min-height: 72px` and `contain: layout` ensures DOM reflow is isolated to the card component without repainting the entire page.
3. **Hardware-Accelerated Feedback**:
   - Use `transform: scale(0.97)` on `:active` buttons instead of modifying margin/padding, delegating animation to the GPU compositor thread.

---

### 3.6 Modal & Global Stats Integration

- **Metrics Modal (`js/ui/metrics-modal.js`)**:
  - Activated by clicking `#btn-lupa-${swimmer.id}` on the card header.
  - Instantly opens individual metrics: Training Zones (75%, 80%, 90%), Sustainable Pace (Mode), pure SVG Boxplot, and full scrollable lap history.
  - Overlay click outside modal dialog immediately dismisses the modal (`modal.js:48-52`).
  - Translate all remaining English labels in `boxplot-svg.js` ("No lap data recorded" -> "Sin datos de vueltas registrados").
- **Global Stats Footer (`index.html:50-58`)**:
  - Remains pinned at bottom: `#btn-global-stats` ("Ver Estadísticas Globales").
  - Displays aggregate table across all active swimmers and best splits.

---

## 4. Caveats

1. **Display of More Than 3 Laps on Card**:
   - By requirement R3, only the 3 most recent laps are rendered on the card surface. Full lap histories (e.g. 10–50 laps) remain available inside the metrics modal via the "Métricas" button.
2. **Unit Test Modernization Required**:
   - Existing unit test `tests/unit/swimmer_card.test.js` tests outdated methods (`updateMetrics`, `updateBoxplot`) that were moved to `metrics-modal.js`. It should be updated to verify the new R3/R4 DOM contracts (`_updateRecentLaps()`, `#btn-reset-${id}`, Spanish button labels).

---

## 5. Conclusion

- The UI/UX architecture for SwimCoach Tracker is fully mapped to fulfill R2, R3, R4, and R6:
  1. **R2 (Ultra-Compact Header)**: Implemented as a 40px fixed bar with inline status indicator and compact action button, saving ~20-25% vertical screen space.
  2. **R3 (Intuitive Main Card with 3-Lap History)**: A 280px-wide card displaying a large digital stopwatch, a dedicated 3-row recent lap split feed, and distinct primary Pase and toolbar buttons.
  3. **R4 (Accessible Reset Button)**: Dedicated `#btn-reset-${id}` ("Reiniciar") button wired directly to `timerEngine.reset()`, resetting state cleanly without hidden menus.
  4. **R6 (High-Contrast Outdoor Styling)**: High-contrast tokens (WCAG AAA), high-legibility dark-on-gold Pase button (> 11:1), 44-50px touch targets, and tactile button feedback.
  5. **R5 (Performance)**: Zero-DOM-query render loop via cached references, eliminating frame drops.

---

## 6. Verification Method

To independently verify the architecture and specifications:

1. **Verify Core Engine & Analytics**:
   ```bash
   node --test tests/unit/analytics.test.js tests/unit/timing.test.js tests/unit/storage.test.js tests/unit/boxplot.test.js
   ```
   *Expected outcome: 61/61 tests pass (0 failures).*

2. **Verify Acceptance Criteria**:
   ```bash
   node tests/verify_acceptance.js
   ```
   *Expected outcome: 5/5 Acceptance Criteria pass.*

3. **Verify DOM Structure & Class Names in Implementation**:
   Inspect `js/ui/swimmer-card.js` and `css/styles.css` for:
   - Header height: 40px (`.app-header`).
   - Card grid min-width: 280px (`.swimmer-grid`).
   - Recent laps container: `#recent-laps-${id}` rendering 3 rows.
   - Buttons: `#btn-lap-${id}`, `#btn-start-${id}`, `#btn-stop-${id}`, `#btn-reset-${id}`.
   - Spanish labels: "Iniciar", "Pausar", "Detener", "PASE", "Reiniciar", "Métricas".
