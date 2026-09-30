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


## Follow-up — 2026-09-30T16:16:18Z

# Teamwork Project Prompt — UI Refactor

> Status: Launched
> Requested team: Small focused team

This is a single self-contained UI refactor; keep it small and focused. Refactor the existing SwimCoach Tracker PWA to use a dense, Spanish-language UI optimized for seeing multiple swimmers on screen without scrolling, moving heavy metrics to a pop-up modal.

Working directory: /home/pablito/emprende/swimcoach_tracker
Integrity mode: development

## Requirements

### R1. UI en Español y Encabezado Compacto
Translate all UI text in `index.html` and `swimmer-card.js` to Spanish. Hide or remove the master controls (Start All / Stop All). Make the header much smaller to save vertical space. Place a "Ver Estadísticas Globales" button at the very bottom of the page.

### R2. Tarjetas Densas (Dense Cards)
Redesign the CSS and JS for the swimmer cards so they fit in a denser grid (e.g. 2 columns on mobile). 
- The entire main body of the card must act as a giant "Lap (Pase)" button showing the current time.
- Place a small icon button for Start/Pause in one corner.
- Place a small "Magnifying Glass" (Lupa) icon button in another corner. 
- Remove all inline metrics, tables, and boxplots from the card surface itself.

### R3. Modal de Métricas Ágil
Clicking the magnifying glass (lupa) must open a pop-up modal (overlay) displaying that specific swimmer's metrics (the laps table, sustainable pace, and boxplot). 
- Crucially, clicking anywhere outside the modal's main panel must instantly close it so the coach can quickly return to the stopwatch.

## Acceptance Criteria

### UI Layout & Translation
- [ ] The app loads with all text in Spanish.
- [ ] The header is visually smaller and does not show the master Start/Stop buttons.
- [ ] Multiple swimmer cards render side-by-side in a dense grid (e.g. using `grid-template-columns: repeat(auto-fit, minmax(150px, 1fr))`).

### Card Interactivity & Modals
- [ ] Clicking the main body of a running swimmer card successfully registers a lap.
- [ ] Clicking the Lupa icon opens a modal containing the boxplot and lap history for that swimmer.
- [ ] Clicking the dark overlay outside the modal instantly closes the modal.
