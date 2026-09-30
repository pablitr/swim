# Task Assignment: UI/UX, Component Ergonomics & Design Overhaul (Survey)

**Assigned Agent**: teamwork_preview_explorer_survey_ui
**Role**: UI/UX & Layout Explorer
**Authoritative Request**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/ORIGINAL_REQUEST.md` (MUST read first)
**Project Root**: `/home/pablito/emprende/swimcoach_tracker`
**Working Directory**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_ui`

## Objective
Map the UI/UX architecture and plan the visual and ergonomic overhaul for SwimCoach Tracker PWA.
Analyze:
1. R2 - Ultra-Compact Header: Current header layout in `index.html` and `css/styles.css`. How to minimize vertical space so swimmer cards are immediately prominent.
2. R3 - Intuitive Main Card with Lap History: How swimmer cards are currently built in `js/ui/swimmer-card.js`. How to display the last 3 lap times directly on the card surface in an intuitive, clean layout, with distinct and clear Start, Stop, and Pase (Lap) buttons.
3. R4 - Accessible Reset Button: Placement and styling of a dedicated "Reiniciar" button on each card that resets the timer to zero cleanly.
4. R6 - Professional Graphic Design with outdoor/poolside high contrast: Review `css/variables.css` and `css/styles.css`. Propose a modernized, high-contrast poolside color palette (WCAG AAA/AA for glare resistance), typography, touch target ergonomics (min 44-48px), and layout density.
5. Modal & Global Stats integration: Ensure modal interaction (`js/ui/modal.js`) remains clean and fast.

## Output
Write your findings to:
`/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_ui/handoff.md`
Provide:
- Current component structure and gaps vs R2, R3, R4, R6.
- Proposed HTML/CSS structure, class names, and layout geometry.
- Proposed color palette tokens and high-contrast styling specifications.
- Concrete recommendations for the implementation worker.


## 2026-09-30T19:54:13Z
You are assigned as the UI/UX Explorer for the SwimCoach Tracker project.
Your working directory is: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_ui
Your dispatch details and instructions are at: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_ui/DISPATCH.md
Read /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/ORIGINAL_REQUEST.md first.

Map out the UI/UX architecture and design specifications for:
- R2: Ultra-Compact Header
- R3: Intuitive Main Card with 3-lap history & clear Start, Stop, Pase buttons
- R4: Accessible Reset (Reiniciar) button on each swimmer card
- R6: Professional Graphic Design with outdoor/poolside high contrast (tokens, typography, layout)
When complete, write your full report to /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/teamwork_preview_explorer_survey_ui/handoff.md and notify your parent via send_message.
