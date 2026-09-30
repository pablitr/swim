## 2026-09-30T15:07:19Z
You are worker_m3, the Analytics & Charting Engineer on the SwimCoach Tracker project.
Your working directory is /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m3.
Your parent orchestrator is conversation ID 7ece83a1-3c6b-4e03-99b3-126d8c7c1f08.

Read the user's original request at /home/pablito/emprende/swimcoach_tracker/ORIGINAL_REQUEST.md.
Also read:
- /home/pablito/emprende/swimcoach_tracker/PROJECT.md
- /home/pablito/emprende/swimcoach_tracker/TEST_READY.md
- /home/pablito/emprende/swimcoach_tracker/tests/unit/analytics.test.js

YOUR MISSION:
Implement Milestone 3 (M3: Analytics & Pure SVG Boxplot Engine) in /home/pablito/emprende/swimcoach_tracker.

YOU EXCLUSIVELY OWN:
- `js/analytics/zones.js`
- `js/analytics/pace-calculator.js`
- `js/analytics/stats.js`
- `js/ui/boxplot-svg.js`

TASKS:
1. `js/analytics/zones.js`:
   - `calculateTrainingZones(baseline100mSeconds)`:
     - 75% Zone: `baseline / 0.75` (e.g. 60 / 0.75 = 80.0s).
     - 80% Zone: `baseline / 0.80` (e.g. 60 / 0.80 = 75.0s).
     - 90% Zone: `baseline / 0.90` (e.g. 60 / 0.90 = 66.67s).
     - 100% Target: `baseline / 1.00 = 60.0s`.
     - Reject naive multiplication (`baseline * 0.75 = 45s` is WRONG in swimming velocity physics!).
     - Input validation: reject <= 0, negative, NaN.
2. `js/analytics/pace-calculator.js`:
   - `computeSustainablePace(lapsSeconds)`:
     - Return `{ sustainablePace, inliers, outliers, outlierIndices }`.
     - Outlier detection: Median Absolute Deviation (MAD) modified Z-score ($M_i = 0.6745 \cdot |x_i - \text{median}| / \text{MAD}$), threshold 3.0 (and IQR fence for $N \ge 4$).
     - Given $[45, 45, 46, 60]$, flags 60 as outlier, sustainable pace = ~45.0s (mode/median of inliers), strictly avoiding arithmetic mean 49.0s.
     - Handles degenerate cases: empty array -> null, single lap -> single value, two laps -> median/mean, zero variance $[45, 45, 45, 45]$ -> 45.0s with 0 outliers.
     - Modal clustering on continuous lap times (binning within 0.25-0.5s window).
3. `js/analytics/stats.js`:
   - `computeBoxplotStats(lapsSeconds)`:
     - Calculates Min, Q1, Median, Q3, Max, IQR, Lower Fence, Upper Fence, and Outliers array.
4. `js/ui/boxplot-svg.js`:
   - Pure SVG Boxplot visualizer component (zero external dependencies):
     - Renders responsive `<svg viewBox="0 0 300 80">`.
     - Elements: `<rect>` for IQR box, `<line>` for median, `<line>` whiskers with end caps, `<circle>` for outlier points with data attributes.
     - High-contrast poolside styling tokens matching `css/variables.css`.
5. Verification:
   - Run `node --test tests/unit/analytics.test.js` and ensure all 17 tests pass.
