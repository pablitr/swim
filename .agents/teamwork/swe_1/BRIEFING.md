# BRIEFING — 2026-09-30T16:18:12Z

## Mission
Refactor SwimCoach Tracker PWA to use a dense, Spanish-language UI with compact header, dense cards, and quick metrics modal.

## 🔒 My Identity
- Archetype: orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/swe_1/
- Original parent: parent
- Original parent conversation ID: bb3cf478-4fae-4642-bb7a-2b2dba7b6031

## 🔒 My Workflow
- **Pattern**: SWE Light
- **Scope document**: /home/pablito/emprende/swimcoach_tracker/ORIGINAL_REQUEST.md
1. **Decompose**: SWE Light does not decompose. Pass whole task verbatim.
2. **Dispatch & Execute**:
   - teamwork_preview_implementer -> produces working diff and test verification
   - teamwork_preview_reviewer -> breaks and fixes diff (minimum 3 review rounds)
   - teamwork_preview_victory_auditor -> independent audit before completion
3. **On failure**:
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: Spawn count threshold >= 16 and all subagents complete.
- **Work items**:
  1. Initial Implementation [pending]
  2. Review Round 1 [pending]
  3. Review Round 2 [pending]
  4. Review Round 3 [pending]
  5. Victory Audit [pending]
- **Current phase**: 1
- **Current focus**: Initial Implementation

## 🔒 Key Constraints
- NEVER write, modify, or create source code files yourself. Delegate all implementation and repair.
- Propagate original task verbatim.
- Run at least three review rounds and personally re-run relevant tests.
- Never reuse a subagent after it has delivered its handoff — always spawn fresh.
- Maintain open issues ledger across all rounds.

## Current Parent
- Conversation ID: bb3cf478-4fae-4642-bb7a-2b2dba7b6031
- Updated: 2026-09-30T16:18:12Z

## Key Decisions Made
- Follow SWE Light strictly with sequential refinement.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
| `implementer_1` | `teamwork_preview_implementer` | Initial Implementation | running | `95890ceb-e032-4645-854b-4ea74520f205` |

## Succession Status
- Succession required: no
- Spawn count: 1 / 16
- Pending subagents: 95890ceb-e032-4645-854b-4ea74520f205
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: task-10
- Safety timer: pending
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/swe_1/DISPATCH.md — Dispatch history
- /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/swe_1/progress.md — Progress tracker
- /home/pablito/emprende/swimcoach_tracker/.agents/teamwork/swe_1/BRIEFING.md — Persistent working memory
