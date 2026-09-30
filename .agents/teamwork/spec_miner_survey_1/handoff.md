# Specification Mining Report: SwimCoach Tracker PWA

## 1. Observation

### Authoritative Document Review
From `/home/pablito/emprende/swimcoach_tracker/ORIGINAL_REQUEST.md`:
- Lines 11: "Build a local-first Progressive Web App (PWA) proof-of-concept for swimming coaches to track multiple swimmers' lap times simultaneously. The app must automatically calculate sustainable paces (mode), training zones (75-90% of best times), and provide visual statistics (boxplots) without losing data if offline."
- Lines 18-20 (R1): "The main interface must display individual 'cards' (cuadrados) for each swimmer. Each card must prominently display the current time, and have large, easily tappable buttons for 'Lap' (Pase) and 'Start/Stop'. It should support running multiple timers simultaneously."
- Lines 21-22 (R2): "The app must automatically calculate the swimmer's training zones (e.g., 75%, 80%, 90% of a baseline 100m time) and determine the 'sustainable pace' (the mode/median of their laps, discarding outliers). It must also visualize a swimmer's lap history using a boxplot graph."
- Lines 24-25 (R3): "The app must save all timing data and events locally in the browser immediately as they occur (using IndexedDB or similar robust local storage). The data must survive accidental page reloads, browser closures, or loss of internet connection."
- Lines 29-36 (Acceptance Criteria):
  - "A test script or an agentic tester can start timers for two different swimmers, record 3 laps for each, and verify the times are recorded."
  - "After recording laps, the page can be hard-reloaded, and all previously recorded laps and active timer states are fully restored from local storage."
  - "Given a baseline 100m time of 60 seconds, the app correctly displays the 75% training zone as 80 seconds (60 / 0.75)."
  - "Given lap times of [45s, 45s, 46s, 60s (outlier)], the sustainable pace calculation correctly identifies ~45s rather than a skewed simple average."
  - "The boxplot visualization renders correctly when fed a history of lap times."

From `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/spec_miner_survey_1/DISPATCH.md`:
- Lines 8-31: Mandates exhaustive mapping of feature inventory, analytics formulas (zones, sustainable pace, boxplot parameters), multi-swimmer timing model (states, split vs cumulative), local-first persistence (IndexedDB schema, hard reload recovery), and edge cases.

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | R1: Multi-Swimmer UI | Swimmer Card (Cuadrado) Grid | Responsive card view displaying individual timer and controls for each active swimmer | List of swimmers in active session | Rendered cards with swimmer name, lane, elapsed time, controls | Fallback to empty state prompting "Add Swimmer" if none exist | ORIGINAL_REQUEST.md § R1 |
| 2 | R1: Multi-Swimmer UI | Prominent Stopwatch Display | High-contrast, large-format digital elapsed time display (MM:SS.ss) | Current elapsed milliseconds | Formatted string (e.g., `01:14.25`) updated at ~30-60 FPS | Displays `00:00.00` when idle/reset | ORIGINAL_REQUEST.md § R1 |
| 3 | R1: Multi-Swimmer UI | Large Tappable Control Buttons | High-visibility touch buttons for Start, Stop, Pause, Resume, Reset | Touch / click events | State transition events triggered immediately | Debounced against multi-tap spam within 300ms | ORIGINAL_REQUEST.md § R1 |
| 4 | R1: Multi-Swimmer UI | Lap Button (Pase) | High-visibility button to record current lap split time without stopping timer | Touch / click event while running | New Lap record created, split time displayed, lap counter incremented | Disabled or inactive when timer is IDLE or STOPPED | ORIGINAL_REQUEST.md § R1 |
| 5 | R1: Multi-Swimmer UI | Simultaneous Multi-Timer Engine | Independent state machines for each swimmer running concurrently | Swimmer IDs, individual user inputs | Multiple concurrently progressing time counters without clock drift | Independent error isolation per swimmer timer | ORIGINAL_REQUEST.md § R1 |
| 6 | R1: Multi-Swimmer UI | Master Heat Controls | Optional batch action buttons ("Start All", "Stop All") for simultaneous heat starts | Single button tap | Broadcasts START or STOP command to all idle or running swimmers | Skips swimmers already in target state | Implicit coaching need |
| 7 | R1: Multi-Swimmer UI | Lap History Feed per Swimmer | Reverse-chronological or chronological table/list of recorded laps with split and total times | Recorded laps from IndexedDB | Table showing: Lap #, Split Time, Cumulative Time, Outlier badge | Empty state "No laps recorded yet" | ORIGINAL_REQUEST.md § R1 |
| 8 | R2: Analytics | Baseline 100m Time Configuration | Swimmer configuration field for baseline 100m time in seconds (e.g., 60.0s) | User input (seconds or MM:SS format) | Stored swimmer baseline profile value | Validation error on $\le 0$ or non-numeric input | ORIGINAL_REQUEST.md § R2 |
| 9 | R2: Analytics | Training Zones Calculation | Computes pace targets at 75%, 80%, and 90% of baseline 100m time | Baseline 100m time $T_{base}$ | Target times: $T_{75\%} = T_{base}/0.75$, $T_{80\%} = T_{base}/0.80$, $T_{90\%} = T_{base}/0.90$ | Displays "Set baseline" if $T_{base}$ is missing | ORIGINAL_REQUEST.md § R2 |
| 10 | R2: Analytics | Outlier Detection | Identifies anomalous lap times (distortions, coach delays, pauses) using MAD or IQR fence | Array of lap split durations | Array of booleans / flagged outlier indices | Flags 0 outliers if sample variance is 0 or $N < 3$ | ORIGINAL_REQUEST.md § R2 |
| 11 | R2: Analytics | Sustainable Pace Calculation | Calculates modal or median pace from non-outlier laps, preventing average skew | Array of lap split durations | Sustainable pace value in seconds (e.g. 45.0s for [45, 45, 46, 60]) | Returns `null` if $N=0$; returns single lap if $N=1$ | ORIGINAL_REQUEST.md § R2 |
| 12 | R2: Analytics | 5-Number Summary (Boxplot Stats) | Calculates Min, Q1 (25th percentile), Median (50th percentile), Q3 (75th percentile), Max | Array of lap split durations | Object: `{min, q1, median, q3, max, iqr, lowerFence, upperFence, outliers}` | Degenerate handling for $N < 4$ (whiskers collapse gracefully) | ORIGINAL_REQUEST.md § R2 |
| 13 | R2: Analytics | Boxplot SVG/Canvas Visualizer | Visual rendering of boxplot with whiskers, interquartile box, median line, and outlier markers | 5-number summary + outlier points | Rendered responsive SVG graphic with time scale axis | "Needs at least 1 lap to visualize" placeholder | ORIGINAL_REQUEST.md § R2 |
| 14 | R2: Analytics | Zone vs Pace Overlay | Visual indicator or badge comparing sustainable pace and lap times to training zones | Calculated sustainable pace and zone thresholds | Zone classification badge (e.g., "In Zone 1 (75%)", "+1.2s above Zone 2") | Hidden if baseline is not set | Implicit coaching need |
| 15 | R3: Persistence | IndexedDB Storage Layer | Persistent object stores for swimmers, sessions, lap records, and active timer states | Application events and entities | Asynchronous atomic writes to IndexedDB | Falls back to localStorage / alerts if IndexedDB is blocked | ORIGINAL_REQUEST.md § R3 |
| 16 | R3: Persistence | Immediate Atomic State Commits | Saves timer transitions and lap records immediately on action (zero buffering) | State transition (Start, Pause, Resume, Stop, Lap) | Confirmed transaction write to IndexedDB | Retries transaction or logs error on failure | ORIGINAL_REQUEST.md § R3 |
| 17 | R3: Persistence | Hard Reload Timer Recovery | Reconstructs active timer elapsed time across browser hard reloads and closures | Persisted `startTime`, `accumulatedMs`, `lastResumeTime`, `state` | Seamlessly running stopwatch displaying exact wall-clock elapsed time | Elapsed time accounts for elapsed wall-clock time if RUNNING | ORIGINAL_REQUEST.md § R3, AC 2 |
| 18 | R3: Persistence | Offline PWA Support | Service Worker caching and web app manifest for complete offline poolside usage | Network requests, install prompt | Cached app shell, standalone window, offline operation | Graceful offline indicator | ORIGINAL_REQUEST.md § R3 |
| 19 | R3: Persistence | Screen Wake Lock Integration | Requests `navigator.wakeLock` to prevent mobile/tablet screen timeout during active timing | Timer state transitions | Active screen wake lock while timers are RUNNING | Fails silently if Wake Lock API unsupported | Implicit coaching need |
| 20 | Swimmer Admin | Swimmer Management | Add, edit, remove swimmers; assign lane numbers and color tags | User inputs (name, baseline, lane) | Updated swimmer database | Prevents duplicate active lanes or empty names | Implicit coaching need |

---

## Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | Training Zones | Baseline time is zero, negative, or empty | Input rejected by validation; zones display placeholder `--:--` without `NaN` or `Infinity`. |
| 2 | Training Zones | Baseline time 60s at 75% zone | Calculated strictly as $60 / 0.75 = 80.0\text{s}$. Must NOT calculate $60 \times 0.75 = 45\text{s}$. |
| 3 | Training Zones | High baseline time (e.g. 180s / 3 minutes) | Target pace formatted correctly as MM:SS (e.g. $180 / 0.75 = 240\text{s} = 04:00.0$). |
| 4 | Sustainable Pace | Zero laps recorded ($N=0$) | Sustainable pace is `null`; UI displays "No laps yet". |
| 5 | Sustainable Pace | Single lap recorded ($N=1$, e.g. [45.2s]) | Sustainable pace equals the single lap time (45.2s); outlier filtering is bypassed. |
| 6 | Sustainable Pace | Two laps recorded ($N=2$, e.g. [44.0s, 46.0s]) | Sustainable pace is the mean/median (45.0s); outlier detection requires $N \ge 3$. |
| 7 | Sustainable Pace | Outlier array `[45s, 45s, 46s, 60s]` | Outlier 60s is detected via MAD / IQR; sustainable pace yields modal/median value ~45s. |
| 8 | Sustainable Pace | Identical laps `[45s, 45s, 45s, 45s]` | IQR = 0, MAD = 0; algorithm detects zero variance, flags NO outliers, returns 45.0s. |
| 9 | Sustainable Pace | Multimodal distribution (e.g. `[45s, 45s, 50s, 50s]`) | Clusters identify bimodal pacing; returns median (47.5s) or lowest modal cluster. |
| 10 | Boxplot Visualization | Zero laps ($N=0$) | Empty graphic with helpful message: "Complete laps to see distribution boxplot". |
| 11 | Boxplot Visualization | Single lap ($N=1$) | Single vertical point/line at $x = \text{lapTime}$; no box or whiskers rendered. |
| 12 | Boxplot Visualization | Identical laps ($N \ge 3$, all 45.0s) | Q1 = Median = Q3 = Min = Max = 45.0s. Whiskers and box collapse into a single vertical bar at 45.0s. |
| 13 | Boxplot Visualization | Extreme outlier (e.g. 300s due to bathroom break) | Upper fence isolates 300s as outlier dot; box and whiskers remain focused on the normal cluster (40-50s) with proper scale. |
| 14 | Lap Recording | Rapid double-tap on "Lap" button (< 300ms) | Button debounced; ignores subsequent tap to prevent accidental 0.1s spurious laps. |
| 15 | Lap Recording | Split vs Cumulative time calculation | Lap split is correctly calculated as $\text{TotalElapsed} - \text{PreviousTotalElapsed}$, while cumulative time is preserved. |
| 16 | Hard Reload Recovery | Hard reload while timer is RUNNING | State restored from IndexedDB; elapsed time resumes from $\text{accumulatedMs} + (\text{now} - \text{lastResumeTime})$ without time loss or drift. |
| 17 | Hard Reload Recovery | Hard reload while timer is PAUSED | State restored as PAUSED; elapsed time displays exact $\text{accumulatedMs}$. |
| 18 | Hard Reload Recovery | Hard reload while timer is STOPPED | State restored as STOPPED; all lap records and final times intact. |
| 19 | Browser Throttling | Tab moved to background or device sleeps | Wall-clock delta calculation ensures that upon returning to foreground, elapsed time is exact (not delayed by throttled timers). |
| 20 | System Clock Change | Device clock shifted during session | Timer calculations detect negative deltas or use monotonic performance counters where available to avoid negative lap times. |

---

## 2. Logic Chain

### 2.1 Pacing & Intensity Physics (Training Zones)
1. **Observation**: ORIGINAL_REQUEST.md lines 21-22 and 34 state: "training zones (e.g., 75%, 80%, 90% of a baseline 100m time)" and "Given a baseline 100m time of 60 seconds, the app correctly displays the 75% training zone as 80 seconds (60 / 0.75)."
2. **Inference**: In swimming, physiological exercise intensity is proportional to swimming velocity ($V = D / T$).
   - A swimmer at 100% effort swimming 100m in $T_{100\%} = 60\text{s}$ has velocity $V_{100\%} = 100 / 60 \approx 1.667\text{ m/s}$.
   - At 75% intensity, the target velocity is $V_{75\%} = 0.75 \times V_{100\%} = 0.75 \times (100 / 60) = 1.25\text{ m/s}$.
   - The time required to swim 100m at this velocity is $T_{75\%} = 100 / V_{75\%} = 100 / (0.75 \times (100 / 60)) = 60 / 0.75 = 80.0\text{ seconds}$.
   - Similarly:
     - 80% Training Zone: $T_{80\%} = \frac{T_{base}}{0.80} = \frac{60}{0.80} = 75.0\text{ seconds}$.
     - 90% Training Zone: $T_{90\%} = \frac{T_{base}}{0.90} = \frac{60}{0.90} \approx 66.67\text{ seconds}$.
     - 100% Target: $T_{100\%} = \frac{T_{base}}{1.00} = 60.0\text{ seconds}$.
3. **Requirement for Implementation**: The codebase must implement the reciprocal velocity division formula `baselineTime / (percentage / 100)`. Any attempt to multiply `baselineTime * (percentage / 100)` must be rejected by test suites.

### 2.2 Sustainable Pace & Outlier Rejection Algorithm
1. **Observation**: ORIGINAL_REQUEST.md lines 22 and 35 state: "determine the 'sustainable pace' (the mode/median of their laps, discarding outliers)" and "Given lap times of [45s, 45s, 46s, 60s (outlier)], the sustainable pace calculation correctly identifies ~45s rather than a skewed simple average."
2. **Analysis of the Data Point**:
   - Lap set: $[45, 45, 46, 60]$.
   - Simple arithmetic mean: $(45 + 45 + 46 + 60) / 4 = 196 / 4 = 49.0\text{s}$. This fails the requirement by +4.0s.
   - Median: $(45 + 46) / 2 = 45.5\text{s}$.
   - Mode: $45.0\text{s}$ (frequency = 2, while 46s has 1, 60s has 1).
3. **Outlier Filtering Strategy**:
   - For small sample sizes typical in swim sets ($N \in [3, 20]$), standard IQR fences with Tukey hinges ($UF = Q3 + 1.5 \times IQR$) can sometimes retain moderate outliers if $N \le 4$.
   - **Median Absolute Deviation (MAD)** method:
     $$\text{Median}(X) = 45.5$$
     $$\text{Absolute Deviations} = [|45 - 45.5|, |45 - 45.5|, |46 - 45.5|, |60 - 45.5|] = [0.5, 0.5, 0.5, 14.5]$$
     $$\text{MAD} = \text{Median}([0.5, 0.5, 0.5, 14.5]) = 0.5$$
     Modified Z-score:
     $$M_i = \frac{0.6745 \times |x_i - \text{Median}|}{\text{MAD}}$$
     - For $x = 45$: $M_{45} = \frac{0.6745 \times 0.5}{0.5} = 0.6745 < 3.0$ (inlier).
     - For $x = 46$: $M_{46} = \frac{0.6745 \times 0.5}{0.5} = 0.6745 < 3.0$ (inlier).
     - For $x = 60$: $M_{60} = \frac{0.6745 \times 14.5}{0.5} = 19.56 \gg 3.0$ (extreme outlier!).
   - Rejection leaves $[45, 45, 46]$.
   - Mode on cleaned set is $45\text{s}$. Median of cleaned set is $45\text{s}$.
4. **Discretization / Modal Binning for Continuous Stopwatch Data**:
   - Since stopwatch times may have small millisecond variations (e.g., $45.12\text{s}, 45.24\text{s}$), raw values should be rounded or binned to the nearest $0.5\text{s}$ (or $0.25\text{s}$) to evaluate modal frequency clusters.
   - If a modal cluster exists with frequency $> 1$, its center or mean represents the sustainable pace. If all frequencies are 1, fallback to the median of the inliers.

### 2.3 5-Number Summary & Boxplot Visualization
1. **Observation**: ORIGINAL_REQUEST.md lines 22-23 and 36 state: "visualize a swimmer's lap history using a boxplot graph" and "The boxplot visualization renders correctly when fed a history of lap times."
2. **Quantile Calculation Protocol**:
   - Given sorted non-empty lap array $X = [x_0, x_1, \dots, x_{N-1}]$:
   - Median ($Q2$ / 50th percentile): middle value if $N$ is odd, mean of two middle values if $N$ is even.
   - $Q1$ (25th percentile) and $Q3$ (75th percentile) computed via standard percentile interpolation (Method 7 / Tukey hinges).
   - $IQR = Q3 - Q1$.
   - Lower Fence: $LF = Q1 - 1.5 \times IQR$.
   - Upper Fence: $UF = Q3 + 1.5 \times IQR$.
   - Whiskers:
     - Whisker Min: $\min(x_i \mid x_i \ge LF)$.
     - Whisker Max: $\max(x_i \mid x_i \le UF)$.
   - Outliers: Any $x_i < LF$ or $x_i > UF$, rendered as distinct SVG circles.
3. **SVG Rendering Layout**:
   - Horizontal boxplot coordinate mapping:
     - SVG width: $W = 100\%$, viewBox `0 0 300 80`.
     - Time scale mapped linearly from $(\text{Whisker Min} - \Delta)$ to $(\text{Max Outlier} + \Delta)$.
     - Box: `<rect>` from $Q1$ to $Q3$.
     - Median: `<line>` across the box height.
     - Whiskers: horizontal lines from $Q1 \to \text{Whisker Min}$ and $Q3 \to \text{Whisker Max}$, with vertical end caps.
     - Outliers: `<circle>` elements with hover/touch tooltips displaying lap number and split time.

### 2.4 Multi-Swimmer Timing Engine & State Machine
1. **Observation**: ORIGINAL_REQUEST.md lines 18-20 require individual cards (cuadrados), current time display, large tappable buttons ("Lap", "Start/Stop"), and simultaneous multi-timer support.
2. **State Machine Specification**:
   - `IDLE`: Stopwatch at `00:00.00`. Laps list empty or reset. Start button active.
   - `RUNNING`: Timer actively incrementing. Buttons available: "Lap" (records split), "Pause" or "Stop".
   - `PAUSED`: Timer frozen at `accumulatedMs`. Buttons: "Resume", "Reset", "Stop".
   - `STOPPED`: Timer finished. Laps locked. Buttons: "Reset", "Start New Session".
3. **Split vs Cumulative Semantics**:
   - Let $T_{\text{elapsed}}$ be total elapsed time since timer start (excluding paused periods).
   - When Lap $k$ is tapped at $T_{\text{elapsed}}^{(k)}$:
     - Cumulative time: $T_{\text{cum}}^{(k)} = T_{\text{elapsed}}^{(k)}$.
     - Split time: $\Delta T^{(k)} = T_{\text{elapsed}}^{(k)} - T_{\text{elapsed}}^{(k-1)}$ (where $T_{\text{elapsed}}^{(0)} = 0$).
     - The lap split time $\Delta T^{(k)}$ is what represents the swimmer's pace for that lap and feeds into analytics and boxplots.

### 2.5 Local-First Persistence & Hard Reload Recovery
1. **Observation**: ORIGINAL_REQUEST.md lines 24-25 and 31 state: "The app must save all timing data and events locally in the browser immediately as they occur (using IndexedDB or similar robust local storage). The data must survive accidental page reloads, browser closures, or loss of internet connection."
2. **Clock Drift Prevention across Reloads**:
   - **Naive (Anti-Pattern)**: Incrementing a JavaScript counter variable via `setInterval(..., 100)`. On reload, `setInterval` is lost, or elapsed time drifts if tab is backgrounded.
   - **Correct Wall-Clock Protocol**:
     - Maintain state:
       - `state`: `'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED'`
       - `startTime`: Unix epoch timestamp (`Date.now()`) when timer initially started.
       - `lastResumeTime`: Unix epoch timestamp when last transitioned to `RUNNING`.
       - `accumulatedMs`: Accumulated elapsed time up to `lastResumeTime`.
     - While `RUNNING`:
       $$\text{currentElapsedMs} = \text{accumulatedMs} + (\text{Date.now()} - \text{lastResumeTime})$$
     - When `PAUSED`:
       $$\text{accumulatedMs} \gets \text{accumulatedMs} + (\text{Date.now()} - \text{lastResumeTime})$$
       $$\text{state} \gets \text{'PAUSED'}$$
     - Hard Reload Recovery Logic:
       - On page load, read `timer_states` store from IndexedDB.
       - If `state === 'RUNNING'`:
         - The timer was running when page reloaded!
         - Elapsed time is immediately recalculated using `accumulatedMs + (Date.now() - lastResumeTime)`.
         - The UI timer loop resumes updating. No seconds are lost, no drift occurs even if reload took 10 seconds or 2 hours.
       - If `state === 'PAUSED'`:
         - UI displays `accumulatedMs`.
       - All laps are immediately queried from `laps` store and restored to UI table and analytics.

---

## 3. Data Models

```typescript
// Swimmer profile
interface Swimmer {
  id: string; // UUID or nano-id
  name: string; // e.g., "Michael P."
  lane: number; // e.g., 1, 2, 3...
  baseline100mSeconds: number; // e.g., 60.0
  colorTag?: string; // Hex color for card border/badge
  createdAt: number; // Epoch timestamp
}

// Timing Session
interface Session {
  id: string;
  name: string; // e.g. "Morning Interval Set 10x100"
  date: string; // ISO date string
  swimmerIds: string[];
  status: 'active' | 'completed';
  createdAt: number;
}

// Timer State (Atomic store for instant reload recovery)
interface SwimmerTimerState {
  swimmerId: string;
  sessionId: string;
  state: 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED';
  startTime: number | null; // Epoch timestamp
  lastResumeTime: number | null; // Epoch timestamp
  accumulatedMs: number; // Milliseconds accumulated prior to lastResumeTime
  currentLapIndex: number; // Next lap number (1-based)
  lastLapCumulativeMs: number; // Cumulative ms at previous lap trigger
  updatedAt: number; // Epoch timestamp
}

// Lap Record
interface Lap {
  id: string; // UUID or auto-increment
  sessionId: string;
  swimmerId: string;
  lapNumber: number; // 1, 2, 3...
  splitDurationMs: number; // Duration of this specific lap in ms
  cumulativeDurationMs: number; // Total elapsed time at lap trigger
  timestamp: number; // Epoch timestamp when recorded
  isOutlier?: boolean; // Flagged by analytics engine
}

// Analytics Summary
interface SwimmerAnalytics {
  swimmerId: string;
  baseline100mSeconds: number;
  zones: {
    zone75: number; // baseline / 0.75 (seconds)
    zone80: number; // baseline / 0.80 (seconds)
    zone90: number; // baseline / 0.90 (seconds)
    zone100: number; // baseline / 1.00 (seconds)
  };
  sustainablePaceSeconds: number | null; // Mode / Median of filtered laps
  boxplot: {
    count: number;
    min: number;
    q1: number;
    median: number;
    q3: number;
    max: number;
    iqr: number;
    lowerFence: number;
    upperFence: number;
    outliers: number[];
  };
}
```

### IndexedDB Schema Design
- Database Name: `SwimCoachTrackerDB`
- Version: `1`
- Object Stores:
  1. `swimmers`: `keyPath: 'id'`
     - Indexes: `lane`, `name`
  2. `sessions`: `keyPath: 'id'`
     - Indexes: `status`, `createdAt`
  3. `timer_states`: `keyPath: 'swimmerId'`
     - Indexes: `sessionId`, `state`
  4. `laps`: `keyPath: 'id'`
     - Indexes: `[sessionId+swimmerId]`, `swimmerId`, `timestamp`

---

## 4. Acceptance Criteria Mapping & Test Matrix

| Acceptance Criterion | Verification Procedure | Expected Outcome | Pass/Fail Condition |
|---|---|---|---|
| **AC 1.1**: Multi-swimmer simultaneous timing | Launch app, display cards for Swimmer A (Lane 1) and Swimmer B (Lane 2). Tap "Start" on both. | Both timers run concurrently, updating elapsed time independently without interfering. | Pass if both timers progress simultaneously with independent timestamps. |
| **AC 1.2**: 3 Laps recorded per swimmer | While timers are running, tap "Lap" 3 times on Swimmer A, then 3 times on Swimmer B. | Lap history displays 3 distinct split times for Swimmer A and 3 distinct split times for Swimmer B. | Pass if each swimmer has exactly 3 laps with split duration and cumulative elapsed time recorded. |
| **AC 2.1**: Hard reload recovery of active timer | Start Swimmer A timer. Allow it to run for ~3.5 seconds. Perform a hard browser reload (`location.reload(true)` / Cmd+Shift+R). | App initializes, checks IndexedDB, identifies Swimmer A as `RUNNING`, computes elapsed time including reload duration, resumes active tick. | Pass if stopwatch displays $\ge 3.5\text{s}$ and continues ticking smoothly without reset. |
| **AC 2.2**: Hard reload recovery of lap history | Record laps $[45.0\text{s}, 45.2\text{s}, 46.1\text{s}]$ for Swimmer A. Reload the page. | Lap table immediately displays all 3 laps with correct split values. | Pass if 100% of recorded laps are visible after hard reload. |
| **AC 3.1**: Training zone calculation accuracy | Input baseline 100m time = `60` seconds. Observe 75% zone display. | Display shows `80.0s` (or `01:20.0`). $60 / 0.75 = 80.0$. | Pass if calculated value equals $80.0\text{s} \pm 0.01\text{s}$. Must NOT equal 45s. |
| **AC 3.2**: Training zone 80% & 90% | Same baseline 60s. Check 80% and 90% zones. | 80% zone displays `75.0s` ($60 / 0.80$). 90% zone displays `66.7s` ($60 / 0.90$). | Pass if 80% is 75s and 90% is 66.67s. |
| **AC 3.3**: Sustainable pace outlier rejection | Feed lap times: `[45, 45, 46, 60]`. | Analytics engine flags `60` as an outlier; sustainable pace identifies modal/median value `45.0s`. | Pass if result is $\approx 45.0\text{s}$ (between 45.0s and 45.5s) and NOT the simple mean 49.0s. |
| **AC 3.4**: Boxplot rendering | Provide lap times history `[42, 44, 45, 45, 46, 48, 60]`. | Boxplot SVG renders with whiskers, Q1, median, Q3, and upper outlier marker at 60. | Pass if SVG contains elements for box, median line, whiskers, and outlier circle. |

---

## 5. Caveats

1. **Browser Background Tab Throttling**:
   - Modern browsers throttle background tab timers to 1 tick per second or pause them completely.
   - *Mitigation*: Our wall-clock timestamp delta formula ($\Delta t = \text{Date.now()} - \text{lastResumeTime}$) is immune to throttling; whenever the coach returns to the tab, the displayed time jumps immediately to the correct wall-clock elapsed time without clock drift.
2. **Screen Sleep / Lock**:
   - On poolside mobile devices, the operating system may sleep the screen after 30 seconds of inactivity.
   - *Mitigation*: The PWA should utilize the Screen Wake Lock API (`navigator.wakeLock.request('screen')`) whenever at least one timer is in the `RUNNING` state.
3. **Quantile Method Sensitivity on Small $N$**:
   - For $N < 4$, percentiles cannot establish a meaningful interquartile range ($IQR$). The boxplot and outlier filter must specify fallback behavior for $N \in \{0, 1, 2, 3\}$.
4. **Debounce on Touch Events**:
   - Wet fingers on poolside touchscreens frequently trigger micro double-taps. A software debounce threshold of 300ms on the "Lap" button is necessary to prevent accidental spurious split records.

---

## 6. Conclusion

The specifications, mathematical formulas, state machine, IndexedDB schema, and acceptance criteria for SwimCoach Tracker PWA have been exhaustively probed and documented:
- **R1 (Multi-swimmer Timing)**: Card grid, independent state machines (`IDLE`, `RUNNING`, `PAUSED`, `STOPPED`), split vs cumulative duration semantics, and touch-optimized controls.
- **R2 (Analytics & Visualization)**: Physiological velocity-based training zone formula ($T_{\text{zone}} = T_{\text{base}} / \text{pct}$), MAD/modal sustainable pace algorithm rejecting outliers like $[45, 45, 46, 60] \implies 45\text{s}$, and 5-number SVG boxplot summary.
- **R3 (Local-First Persistence)**: IndexedDB schema with atomic transactions on all transitions, plus wall-clock epoch timestamping that guarantees 100% data preservation and drift-free stopwatch continuation across hard reloads.

All findings are actionable, unambiguous, and ready for immediate architectural design and test-driven implementation.

---

## 7. Verification Method

To independently verify these specifications:
1. **Mathematical Verification**:
   - Run Node.js or Python to evaluate:
     - `60.0 / 0.75 === 80.0`
     - `60.0 / 0.80 === 75.0`
     - `60.0 / 0.90 === 66.666...`
   - Evaluate outlier rejection on `[45, 45, 46, 60]`:
     - MAD median = 45.5, deviations = [0.5, 0.5, 0.5, 14.5], MAD = 0.5.
     - Outlier filter rejects 60. Mode = 45.
2. **Persistence & Reload Verification**:
   - Inspect `SwimmerTimerState` fields: `startTime`, `lastResumeTime`, `accumulatedMs`, `state`.
   - Calculate elapsed time after simulated 5000ms delay: `accumulatedMs + (Date.now() - lastResumeTime)`. Confirms zero clock drift.
3. **File Inspection**:
   - Review `/home/pablito/emprende/swimcoach_tracker/ORIGINAL_REQUEST.md` lines 1-37.
