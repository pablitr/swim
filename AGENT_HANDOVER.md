# Agent Handover: SwimCoach Tracker PWA

**Date:** 2026-09-30
**Project:** SwimCoach Tracker
**Directory:** `/home/pablito/emprende/swimcoach_tracker`
**Repository:** `https://github.com/pablitr/swim` (branch: `main`)

## 1. Project Context & Business Logic
- **Purpose:** A Progressive Web App (PWA) for swimming coaches (Masters teams) to track multiple swimmers' lap times simultaneously.
- **Environment:** Designed for poolside use on mobile phones (Android/iOS). Requires high contrast (sunlight readability) and extreme reliability.
- **Core Features:** 
  - Multi-swimmer independent stopwatches.
  - Automatic calculation of sustainable pace (modified Z-score / median absolute deviation to discard outliers).
  - Training zones calculation (75%, 80%, 90% of a baseline 100m time).
  - Visual lap history via pure SVG boxplots.

## 2. Architecture & Tech Stack
- **Stack:** Pure Vanilla JS (ES Modules), HTML5, CSS3. **Zero bundlers** (no Webpack/Vite), zero external dependencies (no D3/React).
- **Persistence:** Local-first architecture using `IndexedDB`. Data survives hard reloads and offline usage. Cloud sync is explicitly deferred.
- **PWA:** `sw.js` implements a cache-first strategy for static assets. Currently on cache version `swimcoach-v2`.

## 3. Current State & Recent Overhauls (M1-M3)
The application just went through a massive multi-agent overhaul (Milestones 1-3):
- **UI/UX:** Fully translated to Spanish. Features an ultra-compact header (~40px), dense 2-column mobile grid, and high-contrast WCAG AAA tokens (12.87:1).
- **Swimmer Cards (`js/ui/swimmer-card.js`):** The entire card body is a giant "Pase" (lap) button. It displays the 3 most recent lap splits directly on the surface. Includes dedicated Start/Pause, Lupa (metrics modal), and Reiniciar (reset) buttons.
- **Performance:** Highly optimized.
  - Ticker uses `requestAnimationFrame` with background auto-sleep.
  - DOM queries are cached (~359ns update latency).
  - Eliminated GPU-heavy `text-shadow` Gaussian blurs.
  - Batched dual-write IndexedDB operations to prevent UI freezing.

## 4. Key Directories & Files
- `index.html`: Main shell, templates for modals (Add Swimmer, Global Stats, Individual Metrics).
- `css/styles.css` & `css/variables.css`: Styling, poolside contrast tokens, layout containment.
- `js/timing/timer-engine.js` & `ticker.js`: Core stopwatch math (uses wall-clock epoch deltas to prevent drift) and render loop.
- `js/storage/`: `db.js` (raw wrapper) and `repository.js` (domain logic).
- `js/analytics/`: `stats.js`, `pace-calculator.js`, `zones.js` (math and logic).
- `js/ui/`: `swimmer-card.js`, `metrics-modal.js`, `boxplot-svg.js`.

## 5. Deferred / Future Work
- **CSV Export:** Explicitly deferred by the user in previous sessions.
- **Cloud Sync (Firebase/Supabase):** Deferred. Focus remains 100% on local robustness (IndexedDB) for the MVP.
- **Agent Note:** If you are picking up this project for new features, strictly maintain the Vanilla JS zero-build constraint and the local-first integrity.
