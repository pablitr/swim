## 2026-09-30T15:07:19Z
You are worker_m2, the Timing & UI Engineer on the SwimCoach Tracker project.
Your working directory is /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m2.
Your parent orchestrator is conversation ID 7ece83a1-3c6b-4e03-99b3-126d8c7c1f08.

Read the user's original request at /home/pablito/emprende/swimcoach_tracker/ORIGINAL_REQUEST.md.
Also read:
- /home/pablito/emprende/swimcoach_tracker/PROJECT.md
- /home/pablito/emprende/swimcoach_tracker/TEST_READY.md
- /home/pablito/emprende/swimcoach_tracker/tests/unit/timing.test.js

YOUR MISSION:
Implement Milestone 2 (M2: Multi-Swimmer Timing Engine & UI) in /home/pablito/emprende/swimcoach_tracker.

YOU EXCLUSIVELY OWN:
- `js/timing/timer-engine.js`
- `js/timing/ticker.js`
- `js/ui/swimmer-card.js`
- `js/ui/modal.js`
- `js/app.js`

TASKS:
1. `js/timing/timer-engine.js`:
   - High-precision, zero-drift timing state machine: `IDLE`, `RUNNING`, `PAUSED`, `STOPPED`.
   - Epoch timestamp arithmetic: `startTime`, `lastResumeTime`, `accumulatedMs`.
   - Methods: `start(swimmerId)`, `pause(swimmerId)`, `resume(swimmerId)`, `stop(swimmerId)`, `reset(swimmerId)`, `recordLap(swimmerId)`.
   - Lap split calculation: split = totalElapsed - lastLapCumulativeMs; cumulative = totalElapsed.
   - Hard reload recovery: When rehydrated from storage, if state is `RUNNING`, elapsed = `accumulatedMs + (Date.now() - lastResumeTime)`. Time continues smoothly with zero drift.
   - Negative delta protection against system clock adjustments.
   - Time formatting: `formatTime(ms)` -> `MM:SS.ss` (or `HH:MM:SS.ss` if >= 1 hour).
   - Commit state changes and laps immediately to `repository.js`.
2. `js/timing/ticker.js`:
   - `requestAnimationFrame` render loop updating all active running timers at ~30-60 FPS.
3. `js/ui/swimmer-card.js`:
   - Component rendering individual swimmer card (cuadrado):
     - Swimmer name, lane badge, baseline 100m time.
     - Prominent, high-contrast digital stopwatch display.
     - Large touch buttons (min 48px): "Lap" (Pase) with 300ms debounce, and "Start/Stop" (or Pause/Resume/Reset).
     - Lap history feed table: Lap #, Split Time, Cumulative Time.
     - Container for analytics/boxplot (hooks up cleanly with M3 component).
4. `js/ui/modal.js`:
   - Add/Edit swimmer dialog: name, lane, baseline 100m time.
5. `js/app.js`:
   - Master coordinator: wires up heat controls (Start All, Stop All, Reset All, Add Swimmer), loads swimmers & timer states from IndexedDB on startup, recovers active timers seamlessly.
6. Verification:
   - Run `node --test tests/unit/timing.test.js` and ensure all 15 tests pass.
