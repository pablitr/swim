# Original User Request

## Initial Request — 2026-09-30T14:30:02Z

# Teamwork Project Prompt — Draft

> Status: Step 4-6 — Drafting Requirements and Acceptance Criteria
> Goal: Craft prompt → get user approval → delegate to teamwork_preview
> Requested team: [none — teamwork routes from the description]

Build a local-first Progressive Web App (PWA) proof-of-concept for swimming coaches to track multiple swimmers' lap times simultaneously. The app must automatically calculate sustainable paces (mode), training zones (75-90% of best times), and provide visual statistics (boxplots) without losing data if offline.

Working directory: /home/pablito/emprende/swimcoach_tracker
Integrity mode: development

## Requirements

### R1. Multi-swimmer Timing Interface
The main interface must display individual "cards" (cuadrados) for each swimmer. Each card must prominently display the current time, and have large, easily tappable buttons for "Lap" (Pase) and "Start/Stop". It should support running multiple timers simultaneously.

### R2. Automated Analytics and Zones
The app must automatically calculate the swimmer's training zones (e.g., 75%, 80%, 90% of a baseline 100m time) and determine the "sustainable pace" (the mode/median of their laps, discarding outliers). It must also visualize a swimmer's lap history using a boxplot graph.

### R3. Local-First Persistence
The app must save all timing data and events locally in the browser immediately as they occur (using IndexedDB or similar robust local storage). The data must survive accidental page reloads, browser closures, or loss of internet connection.

## Acceptance Criteria

### Core Functionality and Persistence
- [ ] A test script or an agentic tester can start timers for two different swimmers, record 3 laps for each, and verify the times are recorded.
- [ ] After recording laps, the page can be hard-reloaded, and all previously recorded laps and active timer states are fully restored from local storage.

### Analytics Accuracy
- [ ] Given a baseline 100m time of 60 seconds, the app correctly displays the 75% training zone as 80 seconds (60 / 0.75).
- [ ] Given lap times of [45s, 45s, 46s, 60s (outlier)], the sustainable pace calculation correctly identifies ~45s rather than a skewed simple average.
- [ ] The boxplot visualization renders correctly when fed a history of lap times.
