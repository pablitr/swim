# Task Assignment: Performance Profiling & Bottleneck Diagnosis (Survey)

**Assigned Agent**: teamwork_preview_explorer_survey_perf
**Role**: Codebase & Performance Explorer
**Authoritative Request**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/ORIGINAL_REQUEST.md` (MUST read first)
**Project Root**: `/home/pablito/emprende/swimcoach_tracker`
**Working Directory**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_perf`

## Objective
Diagnose the root cause of why the SwimCoach Tracker PWA feels slow and bloated (Requirement R5).
Analyze:
1. The timing and ticker render loop (`js/timing/ticker.js`, `js/timing/timer-engine.js`, `js/app.js`).
2. DOM update frequency, query selectors, and reflow triggers in `js/ui/swimmer-card.js` and other UI scripts.
3. Storage write patterns (`js/storage/db.js`, `js/storage/repository.js`) — are there synchronous or excessively frequent IndexedDB transactions during timing?
4. CSS recalculations, animations, layout thrashing, or memory leaks (intervals, uncollected listeners).
5. Existing test infrastructure (`tests/`) and benchmarks.

## Output
Write your findings to:
`/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_perf/handoff.md`
Provide:
- Identified bottlenecks with exact line numbers and root cause explanations.
- Recommended architectural refactor plan to make the app snappy and lightweight with minimal CPU/battery usage.
- Concrete recommendations for the implementation worker.


## 2026-09-30T19:54:13Z
You are assigned as the Performance Explorer for the SwimCoach Tracker project.
Your working directory is: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_perf
Your dispatch details and instructions are at: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_perf/DISPATCH.md
Read /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/ORIGINAL_REQUEST.md first.

Investigate the root cause of why the SwimCoach Tracker PWA feels slow and bloated (Requirement R5).
Analyze timing loops, DOM updates, IndexedDB operations, CSS reflows, and intervals.
When complete, write your full report to /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_perf/handoff.md and notify your parent via send_message.
