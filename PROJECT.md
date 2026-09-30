# Project: SwimCoach Tracker PWA

## Architecture
Local-first Progressive Web App (PWA) proof-of-concept for swimming coaches to track multiple swimmers' lap times simultaneously, calculate sustainable paces (mode), training zones (75-90% of best times), and provide visual statistics (boxplots) without losing data if offline.

### Key Architectural Pillars
1. **Zero-Build Vanilla ES Modules + HTML5 + CSS3**: Instant local execution, zero build overhead, high determinism, seamless testability.
2. **Precision Wall-Clock Timing Engine**: Zero clock drift using monotonic epoch timestamps (`startTime`, `lastResumeTime`, `accumulatedMs`) with seamless hard reload recovery (`accumulatedMs + (Date.now() - lastResumeTime)`).
3. **Local-First IndexedDB Storage**: Immediate atomic writes on every state transition and lap tap to `SwimCoachDB` (stores: `swimmers`, `sessions`, `timer_states`, `laps`).
4. **Physiological Velocity Training Zones**: Exact reciprocal velocity formula $T_{\text{zone}} = T_{\text{base}} / (\text{pct} / 100)$ (e.g. $60 / 0.75 = 80.0\text{s}$).
5. **Robust Sustainable Pace & Outlier Rejection**: Median Absolute Deviation (MAD) modified Z-score filtering to eliminate skewed laps (e.g. $[45, 45, 46, 60] \implies 45.0\text{s}$).
6. **Pure SVG Boxplot Visualizer**: Zero external CDN/JS dependencies, responsive SVG rendering 5-number summary (Min, Q1, Median, Q3, Max) and outlier markers.
7. **Offline PWA Shell**: Service Worker (`sw.js`) implementing cache-first strategy for static assets and Web App Manifest (`manifest.json`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Multi-Swimmer Card Grid | Responsive cards (cuadrados) for each active swimmer | M2 | ORIGINAL_REQUEST § R1 |
| 2 | Prominent Stopwatch Display | High-contrast digital time display (MM:SS.ss) | M2 | ORIGINAL_REQUEST § R1 |
| 3 | Large Tappable Control Buttons | High-visibility buttons for Start, Stop, Pause, Resume, Reset | M2 | ORIGINAL_REQUEST § R1 |
| 4 | Lap Button (Pase) | Record split and cumulative times without stopping | M2 | ORIGINAL_REQUEST § R1 |
| 5 | Simultaneous Multi-Timer Engine | Independent concurrent state machines with zero drift | M2 | ORIGINAL_REQUEST § R1 |
| 6 | Master Heat Controls | Batch Start All / Stop All for simultaneous heat starts | M2 | Survey Explorer |
| 7 | Lap History Feed per Swimmer | Table showing Lap #, Split Time, Cumulative Time, Outlier badge | M2 | ORIGINAL_REQUEST § R1 |
| 8 | Baseline 100m Time Config | Per-swimmer baseline time setting in seconds | M3 | ORIGINAL_REQUEST § R2 |
| 9 | Training Zones Calculation | Reciprocal velocity formula for 75%, 80%, 90% ($T = T_{\text{base}} / \text{pct}$) | M3 | ORIGINAL_REQUEST § R2 |
| 10 | MAD Outlier Detection | Median Absolute Deviation to detect aberrant laps | M3 | ORIGINAL_REQUEST § R2 |
| 11 | Sustainable Pace Calculation | Modal/median pace from inliers (e.g. [45,45,46,60] -> 45s) | M3 | ORIGINAL_REQUEST § R2 |
| 12 | 5-Number Summary Statistics | Min, Q1, Median, Q3, Max, and Tukey fences | M3 | ORIGINAL_REQUEST § R2 |
| 13 | Pure SVG Boxplot Visualizer | Visual rendering of boxplot with whiskers and outlier dots | M3 | ORIGINAL_REQUEST § R2 |
| 14 | Zone vs Pace Overlay | Visual comparison of sustainable pace to target zones | M3 | ORIGINAL_REQUEST § R2 |
| 15 | IndexedDB Storage Layer | Persistent object stores for swimmers, laps, timer states | M1 | ORIGINAL_REQUEST § R3 |
| 16 | Immediate Atomic Commits | Non-blocking immediate transaction on every user action | M1 | ORIGINAL_REQUEST § R3 |
| 17 | Hard Reload Recovery | Wall-clock reconstruction restoring running timers & laps | M2 | ORIGINAL_REQUEST § R3, AC 2 |
| 18 | Offline PWA Support | Service Worker cache-first caching + Web Manifest | M1 | ORIGINAL_REQUEST § R3 |
| 19 | High-Contrast Theme | Outdoor poolside responsive layout (WCAG AA contrast) | M1 | Survey Explorer |
| 20 | Acceptance Verification Script | Single-command verification runner (`tests/verify_acceptance.js`) | E2E Track | Survey Explorer |
| 21 | 4-Tier Test Suite | Feature, Boundary, Cross-Feature, and Real-World tiers | E2E Track | Survey Explorer |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | PWA Shell & Storage Engine | HTML5/CSS3 layout, PWA shell (manifest, sw.js), IndexedDB storage engine (`db.js`, `repository.js`) | none | DONE |
| M2 | Multi-Swimmer Timing Engine & UI | Concurrent zero-drift timers, Swimmer Cards, Start/Stop/Lap controls, hard reload recovery | M1 | DONE |
| M3 | Analytics & SVG Boxplot Engine | Training zones (75%, 80%, 90%), MAD outlier filtering, sustainable pace, pure SVG boxplot | M1 | DONE |
| M4 | E2E Acceptance Verification | Pass 100% of E2E test suite (Tiers 1-4) and `tests/verify_acceptance.js` | M2, M3, E2E Track | DONE |
| M5 | Adversarial Coverage Hardening | Tier 5 adversarial testing and white-box coverage hardening | M4 | DONE |




## Interface Contracts

### 1. Storage Layer (`js/storage/repository.js`)
```typescript
interface SwimmerRepository {
  init(): Promise<void>;
  getSwimmers(): Promise<Swimmer[]>;
  saveSwimmer(swimmer: Swimmer): Promise<void>;
  deleteSwimmer(id: string): Promise<void>;
  
  getTimerState(swimmerId: string): Promise<SwimmerTimerState | null>;
  saveTimerState(state: SwimmerTimerState): Promise<void>;
  
  getLaps(swimmerId: string): Promise<Lap[]>;
  saveLap(lap: Lap): Promise<void>;
  clearLaps(swimmerId: string): Promise<void>;
}
```

### 2. Timing Engine (`js/timing/timer-engine.js`)
```typescript
interface TimerEngine {
  start(swimmerId: string): Promise<SwimmerTimerState>;
  pause(swimmerId: string): Promise<SwimmerTimerState>;
  resume(swimmerId: string): Promise<SwimmerTimerState>;
  stop(swimmerId: string): Promise<SwimmerTimerState>;
  reset(swimmerId: string): Promise<SwimmerTimerState>;
  recordLap(swimmerId: string): Promise<{ lap: Lap; state: SwimmerTimerState }>;
  
  getElapsedMs(state: SwimmerTimerState): number;
  formatTime(ms: number): string; // "MM:SS.ss"
}
```

### 3. Analytics Engine (`js/analytics/`)
```typescript
// zones.js
function calculateTrainingZones(baseline100mSeconds: number): {
  zone75: number; // baseline / 0.75
  zone80: number; // baseline / 0.80
  zone90: number; // baseline / 0.90
  zone100: number; // baseline / 1.00
};

// pace-calculator.js
function computeSustainablePace(lapsSeconds: number[]): {
  sustainablePace: number | null; // Mode / Median of inliers
  inliers: number[];
  outliers: number[];
  outlierIndices: boolean[];
};

// stats.js
function computeBoxplotStats(lapsSeconds: number[]): {
  count: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  iqr: number;
  lowerFence: number;
  upperFence: number;
  outliers: number[];
};
```

## Code Layout
```text
/home/pablito/emprende/swimcoach_tracker/
├── index.html                  # Main SPA entry point
├── manifest.json               # Web App Manifest
├── sw.js                       # Service Worker for offline caching
├── css/
│   ├── reset.css               # CSS reset
│   ├── variables.css           # Theme tokens (poolside high contrast)
│   └── styles.css              # Swimmer grid layout, large touch buttons, cards
├── js/
│   ├── app.js                  # Main app coordinator & event binder
│   ├── storage/
│   │   ├── db.js               # IndexedDB raw promisified wrapper
│   │   └── repository.js       # Swimmer & Lap domain persistence
│   ├── timing/
│   │   ├── timer-engine.js     # Drift-free timing math & state transitions
│   │   └── ticker.js           # UI render loop (requestAnimationFrame)
│   ├── analytics/
│   │   ├── zones.js            # Baseline pace and zone calculator (75%, 80%, 90%)
│   │   ├── stats.js            # Five-number summary (Min, Q1, Median, Q3, Max, IQR)
│   │   └── pace-calculator.js  # Sustainable pace with MAD outlier rejection
│   └── ui/
│       ├── swimmer-card.js     # Swimmer timer card with Lap/Stop buttons
│       ├── boxplot-svg.js      # Pure SVG Boxplot visualizer component
│       └── modal.js            # Swimmer settings & analytics modal
├── icons/                      # App icons
└── tests/                      # Verification test suites
    ├── unit/
    │   ├── timing.test.js      # Unit tests for timer math & reload recovery
    │   ├── analytics.test.js   # Unit tests for zones, sustainable pace & stats
    │   └── storage.test.js     # Storage engine tests
    ├── e2e/
    │   └── swimcoach.spec.js   # Playwright browser E2E tests
    └── verify_acceptance.js    # Single-command acceptance test runner
```
