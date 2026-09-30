# Project: SwimCoach Tracker UI Overhaul, Translation & Optimization

## Architecture
Comprehensive UI overhaul, 100% Spanish translation, accessible reset button, on-card 3-lap history, and performance optimization for SwimCoach Tracker PWA.

### Architectural Improvements
1. **Render Loop Optimization**: Throttled ticker loop (`ticker.js`) to target 60 FPS with drift-free wall-clock precision, and cached DOM element references (`_timeEl`, `_stateLabelEl`, `_lapCountEl`, etc.) in `SwimmerCard` to achieve zero DOM querySelector calls during timing (~359.3 ns latency).
2. **GPU Rasterization Optimization**: Removed 12px blur radius `text-shadow` from rapidly mutating `.stopwatch-time`, eliminating hundreds of Gaussian blur convolution passes per second across cards. Applied CSS `contain: layout paint;` to prevent layout thrashing.
3. **Storage Transaction Batching**: Dual-write `saveLapAndTimerState` using a single IndexedDB transaction with one `commit()` to halve disk flush latency on split taps (>8,330 writes/sec sustained).
4. **100% Spanish Translation**: Localized `manifest.json`, `boxplot-svg.js`, `app.js` (state translation dictionary), and card UI strings. Maintained automated scanner `tests/verify_spanish.js` verifying zero English UI strings.
5. **Ultra-Compact Header (R2)**: 40px fixed header with inline brand icon, status dot, and compact action button, saving ~20-25% vertical space.
6. **Intuitive Swimmer Card with 3-Lap History & Controls (R3 & R4)**: 280px minimum card width with large digital stopwatch, 3-row recent split feed (`CLS = 0`), prominent full-width Pase button (#facc15 -> 12.87:1 contrast > 11:1), and distinct toolbar buttons ("Iniciar/Pausar", "Detener", "Reiniciar").
7. **Outdoor/Poolside High-Contrast Graphic Design (R6)**: High-luminance borders, WCAG AAA contrast tokens, dark text on gold Pase button (> 11:1), >=44px wet-finger touch targets.
8. **Performance Analysis Report (R5)**: Authored comprehensive technical report `/home/pablito/emprende/swimcoach_tracker/PERFORMANCE_ANALYSIS.md` detailing root causes, architectural refactoring, and empirical benchmarks.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 100% Spanish Translation | Full translation across HTML, JS, CSS, manifest.json, boxplot-svg, and state mapping | M1 | ORIGINAL_REQUEST § R1 |
| 2 | Automated Spanish Scanner | Executable test scanner `tests/verify_spanish.js` enforcing zero English UI strings | M1 | Survey Explorer |
| 3 | Ticker Throttling & IDB Batching | Throttled rAF loop and batched atomic lap+timer storage transaction | M1 | ORIGINAL_REQUEST § R5 |
| 4 | Ultra-Compact Header | 40px fixed sticky header with inline brand, status dot, compact add button | M2 | ORIGINAL_REQUEST § R2 |
| 5 | Poolside High-Contrast Theme | WCAG AAA tokens, removal of blur text-shadow, CSS layout containment | M2 | ORIGINAL_REQUEST § R6 |
| 6 | 3-Lap History on Card | On-card 3-row split/cumulative feed with placeholder rows (CLS=0) | M2 | ORIGINAL_REQUEST § R3 |
| 7 | Distinct Start/Stop/Pase Controls | Full-width Pase button, distinct Iniciar/Pausar/Reanudar, and Detener buttons | M2 | ORIGINAL_REQUEST § R3 |
| 8 | Accessible Reset (Reiniciar) | Dedicated on-card Reiniciar button resetting timer state to IDLE | M2 | ORIGINAL_REQUEST § R4 |
| 9 | Cached DOM References | SwimmerCard cached element references eliminating hot-path DOM queries | M2 | ORIGINAL_REQUEST § R5 |
| 10 | Performance Analysis Report | Written technical report documenting root cause analysis and resolution | M3 | ORIGINAL_REQUEST § R5, AC |
| 11 | Full Test Suite & Acceptance Gate | 100% pass on acceptance runner, unit tests, and Spanish scanner | M3 | ORIGINAL_REQUEST AC |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Engine Optimization & 100% Spanish Localization | Ticker throttling, batched IDB storage, localization of manifest.json, boxplot-svg.js, app.js, tests/verify_spanish.js, unit test string sync | none | DONE |
| M2 | UI/UX Overhaul, Cards & High-Contrast Design | Ultra-compact 40px header, CSS high contrast & containment, swimmer card with 3-lap history, Start/Stop/Pase/Reiniciar buttons, cached DOM nodes, swimmer-card unit test update | M1 | DONE |
| M3 | Performance Analysis Report & Full Acceptance Gate | Final acceptance verification (tests/verify_acceptance.js, tests/verify_spanish.js, npm test), PERFORMANCE_ANALYSIS.md report, adversarial review | M2 | DONE |

## Acceptance Criteria Cross-Check
- [x] Scanning all `.js` and `.html` files reveals no English text in the UI strings (`node tests/verify_spanish.js`: 0 violations).
- [x] The header element has a minimal height (40px fixed bar in `index.html` and `css/styles.css`).
- [x] The application has a polished, professional aesthetic with high contrast for outdoor use (12.87:1 contrast on Pase button).
- [x] A swimmer card prominently displays a "Reiniciar" button that resets their timer (`#btn-reset-${id}` wired to `handleReset()`).
- [x] Recording 4 laps for a swimmer displays the 3 most recent lap times directly on their card (`_updateRecentLaps()` with reverse ordering).
- [x] The Start, Stop, and Lap buttons are easily distinguishable and clearly labeled in Spanish ("Iniciar"/"Pausar", "Detener", "PASE").
- [x] A brief analysis report is provided detailing the root cause of the previous slowness and how it was resolved (`PERFORMANCE_ANALYSIS.md`).
- [x] The application feels snappy and responsive, avoiding high CPU load or lag (0 querySelector calls in ticker, 359ns update latency, 60fps throttling).
