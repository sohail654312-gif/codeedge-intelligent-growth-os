# CIGO Automation Handoff

## Current State

- CURRENT_MAJOR_PART: 1 — Foundation, Product Boundary & Business Truth Architecture
- CURRENT_BLOCK: Canonical Domain Model + Business Truth Architecture
- CURRENT_TASK_ID: CIGO-P1-BLOCK2
- ATTEMPT_COUNT: 0
- STATUS: READY_FOR_EXECUTOR
- LOCK: NONE
- PLANNER_DECISION: Proceed with one substantial combined architecture + executable TypeScript truth-kernel + deterministic-test block. Use Business OS as the primary operational-boundary reference and MVP as the secondary tenancy/security/testing reference; do not use other repos unless a concrete dependency emerges.
- NEXT_ACTION: Executor should implement CIGO-P1-BLOCK2 completely in the CIGO repository, verify all invariants, commit evidence, and return COMPLETE_FOR_PLANNER only on passing tests/typecheck.
- EXECUTOR_RESULT: None yet
- COMPLETION_EVIDENCE: None yet
- BLOCKERS: None
- DEFERRED_BACKLOG: None
- REPOSITORY_STATUS: Writable canonical CIGO repo

## NEXT_PROMPT

The authoritative full prompt is stored in `ops/STATE.json` under `next_prompt`.

Summary: Build the Part 1 Canonical Domain Model + Business Truth Architecture as both architecture documentation and a minimal executable TypeScript truth kernel, with deterministic tests for provenance, tenancy, ownership, lineage, authority, assumptions, supersession, provider neutrality, and protected-system boundaries.

## Workflow Rule

GitHub is the authoritative machine-to-machine handoff. Planner writes the next task into `ops/STATE.json`. Executor reads that exact state before acting and writes execution result/evidence back. Reviewer audits the same state plus repository evidence.

Google Docs may be used as a human-readable mirror only and must never block execution.
