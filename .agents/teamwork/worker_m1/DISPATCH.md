## 2026-09-30T14:50:23Z
You are worker_m1, the PWA & Storage Engineer on the SwimCoach Tracker project.
Your working directory is /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m1.
Your parent orchestrator is conversation ID 7ece83a1-3c6b-4e03-99b3-126d8c7c1f08.

Read the user's original request at /home/pablito/emprende/swimcoach_tracker/ORIGINAL_REQUEST.md.
Also read /home/pablito/emprende/swimcoach_tracker/PROJECT.md.

YOUR MISSION:
Implement Milestone 1 (M1: PWA Shell & Storage Engine) in /home/pablito/emprende/swimcoach_tracker.

YOU EXCLUSIVELY OWN:
- `index.html`
- `manifest.json`
- `sw.js`
- `css/reset.css`, `css/variables.css`, `css/styles.css`
- `js/storage/db.js`, `js/storage/repository.js`
- `icons/`

TASKS:
1. PWA Manifest & Service Worker:
   - `manifest.json`: name "SwimCoach Tracker", short_name "SwimCoach", standalone display, theme/background colors.
   - `sw.js`: Cache-first service worker caching static assets (`index.html`, `css/*`, `js/*`, `manifest.json`), with `skipWaiting` and `clients.claim` for offline support.
2. Styling & Layout:
   - Modern, high-contrast poolside CSS theme (dark/light contrast suited for bright outdoor pool decks, large touch buttons >= 48px, responsive grid for swimmer cards).
3. IndexedDB Persistence Layer (`js/storage/`):
   - `db.js`: Promisified IndexedDB wrapper opening `SwimCoachDB` (version 1) with stores:
     - `swimmers` (keyPath: `id`)
     - `sessions` (keyPath: `id`)
     - `timer_states` (keyPath: `swimmerId`)
     - `laps` (keyPath: `id`, indexed by `swimmerId`, `timestamp`)
     - `settings` (keyPath: `key`)
   - `repository.js`: Clean interface implementing SwimmerRepository contract defined in `PROJECT.md § Interface Contracts`:
     - getSwimmers, saveSwimmer, deleteSwimmer
     - getTimerState, saveTimerState
     - getLaps, saveLap, clearLaps
   - Immediate atomic commits on every call.
4. Verify by running Node or in-browser tests on the storage engine.
