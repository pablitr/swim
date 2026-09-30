# E2E Test Infra: SwimCoach Tracker PWA

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation internals.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.
- Dual-layer: In-memory fast unit/math tests (`node:test` + `node:assert`) + Playwright headless browser E2E + Standalone Acceptance Runner (`tests/verify_acceptance.js`).

## Feature Inventory & Test Mapping
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|----------------------|:------:|:------:|:------:|
| 1 | Multi-Swimmer Card Grid | ORIGINAL_REQUEST § R1 | 5 | 5 | ✓ |
| 2 | Prominent Stopwatch Display | ORIGINAL_REQUEST § R1 | 5 | 5 | ✓ |
| 3 | Large Tappable Control Buttons | ORIGINAL_REQUEST § R1 | 5 | 5 | ✓ |
| 4 | Lap Button (Pase) | ORIGINAL_REQUEST § R1 | 5 | 5 | ✓ |
| 5 | Simultaneous Multi-Timer Engine | ORIGINAL_REQUEST § R1 | 5 | 5 | ✓ |
| 6 | Master Heat Controls | Survey Explorer | 5 | 5 | ✓ |
| 7 | Lap History Feed per Swimmer | ORIGINAL_REQUEST § R1 | 5 | 5 | ✓ |
| 8 | Baseline 100m Time Config | ORIGINAL_REQUEST § R2 | 5 | 5 | ✓ |
| 9 | Training Zones Calculation | ORIGINAL_REQUEST § R2 | 5 | 5 | ✓ |
| 10 | MAD Outlier Detection | ORIGINAL_REQUEST § R2 | 5 | 5 | ✓ |
| 11 | Sustainable Pace Calculation | ORIGINAL_REQUEST § R2 | 5 | 5 | ✓ |
| 12 | 5-Number Summary Statistics | ORIGINAL_REQUEST § R2 | 5 | 5 | ✓ |
| 13 | Pure SVG Boxplot Visualizer | ORIGINAL_REQUEST § R2 | 5 | 5 | ✓ |
| 14 | Zone vs Pace Overlay | Survey Explorer | 5 | 5 | ✓ |
| 15 | IndexedDB Storage Layer | ORIGINAL_REQUEST § R3 | 5 | 5 | ✓ |
| 16 | Immediate Atomic Commits | ORIGINAL_REQUEST § R3 | 5 | 5 | ✓ |
| 17 | Hard Reload Recovery | ORIGINAL_REQUEST § R3, AC 2 | 5 | 5 | ✓ |
| 18 | Offline PWA Support | ORIGINAL_REQUEST § R3 | 5 | 5 | ✓ |
| 19 | High-Contrast Theme | Survey Explorer | 5 | 5 | ✓ |

## Test Architecture
- **Fast Test Runner**: `node --test tests/unit/*.test.js`
- **Playwright E2E Runner**: `npx playwright test`
- **Standalone Acceptance Gate**: `node tests/verify_acceptance.js`
- **Pass/Fail Semantics**: Exit code 0 on all tests passing, non-zero on any failure.
- **Directory Layout**:
  ```text
  tests/
  ├── unit/
  │   ├── timing.test.js
  │   ├── analytics.test.js
  │   └── storage.test.js
  ├── e2e/
  │   └── swimcoach.spec.js
  └── verify_acceptance.js
  ```

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | The 10x100m Interval Set | Multi-swimmer, 10 laps each, outlier injection, zones | High |
| 2 | Accidental Poolside Reload Recovery | Active timer, lap recording, hard page reload, time continuity | High |
| 3 | Staggered Lane Interval Starts | Staggered start times, independent split calculation | Medium |
| 4 | Offline Poolside Session & Export | PWA offline operation, IndexedDB persistence, data export | Medium |

## Coverage Thresholds
- Tier 1: $\ge 5$ per feature ($\ge 95$ feature tests)
- Tier 2: $\ge 5$ boundary/corner cases per feature
- Tier 3: Pairwise interaction coverage across concurrent timers, laps, reload, and analytics
- Tier 4: $\ge 4$ realistic coach practice application scenarios
