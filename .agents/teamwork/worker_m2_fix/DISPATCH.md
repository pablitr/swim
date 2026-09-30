# Task Assignment: Milestone 2 Remediation Worker (Pase & Action Button Contrast Fix)

**Assigned Agent**: worker_m2_fix
**Role**: Implementation Worker (Remediation)
**Authoritative Request**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/ORIGINAL_REQUEST.md` (MUST read first)
**Project Document**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/orchestrator_2/PROJECT.md`
**Challenger 2 Report**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/challenger_m2_2/handoff.md` (Read mathematical analysis)
**Project Root**: `/home/pablito/emprende/swimcoach_tracker`
**Working Directory**: `/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m2_fix`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Write Ownership (Exclusive to this Worker)
You exclusively own:
- `css/variables.css`
- `css/styles.css`

## Objective & Required Changes
`challenger_m2_2` empirically verified that `--color-lap: #f59e0b` paired with `--color-lap-text: #060b14` yields a contrast ratio of 9.18:1, failing the requirement of > 11:1 for outdoor direct sunlight readability. In addition, `.btn-card-start` white text on `#10b981` yields 2.54:1 (failing WCAG AA).

Implement the following fixes:
1. In `css/variables.css`:
   - Change `--color-lap` to `#facc15` (Yellow 400). This produces relative luminance $L = 0.636$ and a contrast ratio of **12.87:1** against `#060b14`, satisfying the > 11:1 requirement.
   - Change `--color-lap-hover` to `#eab308`.
   - Update comment on line 45 to state: `/* Pure dark navy on bright gold (12.87:1 contrast > 11:1) */`.
2. In `css/styles.css`:
   - For `.btn-card-start`: Set `color: var(--color-lap-text, #060b14);` (or `#060b14`). This elevates Start button contrast on emerald green `#10b981` to **7.54:1** (WCAG AAA compliant).
   - Ensure the SVG stroke/fill inside `.btn-card-start` matches `currentColor` or `#060b14` for crisp visibility.

## Verification Commands
- `node .agents/teamwork/challenger_m2_2/test_contrast_empirical.js` -> MUST PASS with `satisfies11to1: true`!
- `node tests/verify_spanish.js` -> MUST PASS (0 violations).
- `node tests/verify_acceptance.js` -> MUST PASS (5/5 AC).
- `npm test` -> 106/106 unit tests MUST PASS.

## Output
Write your report to:
`/home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m2_fix/handoff.md`
and notify parent via `send_message`.

## 2026-09-30T20:29:20Z
[Message] timestamp=2026-09-30T20:29:20Z sender=0c18b464-4819-4415-859d-1b936bda2477 priority=MESSAGE_PRIORITY_HIGH content=You are assigned as worker_m2_fix for Milestone 2 remediation of the SwimCoach Tracker project.
Your working directory is: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m2_fix
Your dispatch instructions are at: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m2_fix/DISPATCH.md
Read /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/ORIGINAL_REQUEST.md first.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Remediate the contrast ratio issue identified by challenger_m2_2:
1. In css/variables.css, update --color-lap to #facc15 and --color-lap-hover to #eab308 (achieving 12.87:1 contrast > 11:1).
2. In css/styles.css, update .btn-card-start text/icon color to #060b14 (achieving 7.54:1 WCAG AAA).
3. Verify with node .agents/teamwork/challenger_m2_2/test_contrast_empirical.js, node tests/verify_spanish.js, node tests/verify_acceptance.js, and npm test.
When done, write your report to /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/worker_m2_fix/handoff.md and notify your parent via send_message.
