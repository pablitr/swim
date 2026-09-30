# Task Dispatch: Requirements & Specification Mining

## Identity
- Role: Requirements Analyst & Spec Miner
- Working directory: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/spec_miner_survey_1

## Objective
Read `/home/pablito/emprende/swimcoach_tracker/ORIGINAL_REQUEST.md` and exhaustively map every functional requirement, edge case, mathematical formula, acceptance criterion, and user-facing behavior needed for the SwimCoach Tracker PWA.

## Scope Boundaries
- Do NOT write source code for the app.
- Provide comprehensive analysis of requirements, data structures, calculation formulas, and UI specifications.

## Inputs
- `/home/pablito/emprende/swimcoach_tracker/ORIGINAL_REQUEST.md`

## Required Outputs
Write your detailed report to `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/spec_miner_survey_1/handoff.md` covering:
1. Feature Inventory: Complete enumeration of every feature (R1, R2, R3, acceptance criteria, plus implicit swim coaching needs).
2. Analytics Formulas:
   - Training zones: exact formula for 75%, 80%, 90% given baseline 100m time (e.g. baseline / percentage -> 60 / 0.75 = 80s).
   - Sustainable pace calculation: mode / median definition, outlier rejection algorithm (e.g. IQR or MAD or frequency clustering), handling cases like [45, 45, 46, 60].
   - Boxplot parameters: Min, Q1 (25th percentile), Median (50th percentile), Q3 (75th percentile), Max, and outlier identification.
3. Multi-swimmer Timing Model:
   - Data model for Swimmer, Session, Lap.
   - States: Idle, Running, Paused, Stopped.
   - Lap recording semantics (split time vs cumulative elapsed time).
4. Local-First Persistence Model:
   - IndexedDB schema, stores, indexes.
   - Surviving hard reloads: what exact state must be persisted immediately on tick/lap/start/stop.
5. Edge Cases & Constraints.


## 2026-09-30T14:33:41Z
Received from orchestrator (7ece83a1-3c6b-4e03-99b3-126d8c7c1f08):
You are spec_miner_survey_1, working on the SwimCoach Tracker project.
Your working directory is /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/spec_miner_survey_1.
Your parent orchestrator is conversation ID 7ece83a1-3c6b-4e03-99b3-126d8c7c1f08.

Read the user's original request at /home/pablito/emprende/swimcoach_tracker/ORIGINAL_REQUEST.md.

YOUR MISSION:
Exhaustively map all specifications, functional requirements, formulas, data schemas, and edge cases for the SwimCoach Tracker PWA.

Analyze and document:
1. Feature Inventory:
   - R1: Multi-swimmer Timing Interface (cuadrados/cards, large tappable buttons, simultaneous timers, current time display, lap recording, pause/resume/stop/reset).
   - R2: Automated Analytics & Zones (75%, 80%, 90% of baseline 100m time; exact formula: e.g. baseline_time / percentage -> 60 / 0.75 = 80s).
   - Sustainable pace calculation: mode / median of laps with outlier filtering (e.g. IQR or MAD or frequency clustering; handle [45s, 45s, 46s, 60s] yielding ~45s).
   - Boxplot visualization: 5-number summary (Min, Q1, Median, Q3, Max) and outlier markers.
   - R3: Local-First Persistence: IndexedDB schema, immediate atomic storage on every state transition and lap, full survival of hard reloads / browser closures.
2. Acceptance Criteria Mapping:
   - Multi-swimmer timing + 3 laps recorded each.
   - Hard reload recovery of active timer states and lap history.
   - Analytics verification (60s baseline -> 80s at 75%; [45, 45, 46, 60] -> ~45s mode; boxplot rendered).
3. Data Models: Swimmer, Timer, Lap, Session, Analytics.
4. Edge cases: Zero laps, single lap, identical laps, extreme outliers, pause/resume duration tracking, timestamp reconstruction.

Deliver your detailed findings in /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/spec_miner_survey_1/handoff.md.
When finished, notify the orchestrator via send_message.
