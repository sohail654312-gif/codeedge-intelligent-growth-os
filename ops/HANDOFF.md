# CIGO Automation Handoff

## Current State

- CURRENT_MAJOR_PART: 1 — Foundation, Product Boundary & Business Truth Architecture
- CURRENT_BLOCK: Canonical Domain Model + Business Truth Architecture
- CURRENT_TASK_ID: CIGO-P1-BLOCK2
- ATTEMPT_COUNT: 0
- STATUS: READY_FOR_PLANNER
- LOCK: NONE
- PLANNER_DECISION: Pending
- NEXT_ACTION: Planner must prepare one substantial, self-contained implementation task for the current Part 1 block.
- NEXT_PROMPT: Pending
- EXECUTOR_RESULT: None yet
- COMPLETION_EVIDENCE: None yet
- BLOCKERS: None
- DEFERRED_BACKLOG: None
- REPOSITORY_STATUS: Writable canonical CIGO repo

## Workflow Rule

GitHub is the authoritative machine-to-machine handoff. Planner writes the next task here and in `ops/STATE.json`. Executor reads the latest state before acting and writes execution result/evidence back. Reviewer audits the same state plus repository evidence.

Google Docs may be used as a human-readable mirror only and must never block execution.
