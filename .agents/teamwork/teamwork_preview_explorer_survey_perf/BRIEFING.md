# BRIEFING — 2026-09-30T17:03:00Z

## Mission
Diagnose the root cause of why the SwimCoach Tracker PWA feels slow and bloated (Requirement R5), covering timing loops, DOM updates, IndexedDB operations, CSS reflows, and intervals.

## 🔒 My Identity
- Archetype: explorer
- Roles: Codebase & Performance Explorer
- Working directory: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_perf
- Original parent: 0c18b464-4819-4415-859d-1b936bda2477
- Milestone: Performance Profiling & Bottleneck Diagnosis (Survey)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Produce a structured analysis report in handoff.md following 5-component format
- No source code or tests in .agents/teamwork/

## Current Parent
- Conversation ID: 0c18b464-4819-4415-859d-1b936bda2477
- Updated: not yet

## Investigation State
- **Explored paths**: `js/timing/ticker.js`, `js/timing/timer-engine.js`, `js/app.js`, `js/ui/swimmer-card.js`, `js/ui/metrics-modal.js`, `js/ui/modal.js`, `js/ui/boxplot-svg.js`, `js/storage/db.js`, `js/storage/repository.js`, `css/styles.css`, `css/variables.css`, `tests/unit/*.test.js`, `tests/verify_acceptance.js`, `tests/verify_math_empirical.js`
- **Key findings**:
  1. Ticker executes at display vsync (60-120Hz) running uncached DOM `querySelector` and unconditional `textContent` mutation for every swimmer card without dirty checking.
  2. CSS `text-shadow` with large blur radius (8-12px) on `.stopwatch-time` forces continuous, heavy Gaussian blur convolutions on every frame during 60-120Hz text mutations, destroying GPU/CPU performance.
  3. Lap recording triggers two sequential IndexedDB transactions (`saveLap` followed by `saveTimerState`), each calling `tx.commit()`, adding double disk/WAL sync latency on every tap.
  4. Swimmer cards lack CSS layout containment (`contain: layout paint;`), propagating layout dirtiness to the grid.
  5. The previous UI refactor stripped recent lap times off the card surface, forcing coaches to constantly open/close a heavy modal just to see recent splits, creating severe UX bloat and perceived lag.
- **Unexplored areas**: None. All target areas analyzed and benchmarked.

## Key Decisions Made
- Formulated an actionable architectural refactoring plan to eliminate unthrottled frame execution, avoid redundant DOM mutations, remove GPU blur rasterization overhead, batch IndexedDB operations, and restore on-card lap previews.
- Documented findings in `handoff.md` and prepared handoff report for parent agent.

## Artifact Index
- DISPATCH.md — Assignment instructions
- BRIEFING.md — Working memory
- progress.md — Liveness heartbeat
- handoff.md — Final investigation report
