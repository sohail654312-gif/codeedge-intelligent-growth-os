# CIGO Automation Handoff

## Current State

- CURRENT_MAJOR_PART: 2 — Data Access, Integration & Evidence Layer
- CURRENT_BLOCK: Operational Read Contracts + Evidence Ingestion Boundary
- CURRENT_TASK_ID: CIGO-P2-BLOCK1
- ATTEMPT_COUNT: 1
- STATUS: READY_FOR_EXECUTOR
- LOCK: HELD — BUILDER_C — optimistic STATE blob-SHA mutex — 25-minute lease
- PLANNER_DECISION: Supervisor reconciled repository evidence after Executor attempt 1. Preserve the committed read contracts and continue only the remaining Part 2 Block 1 work.
- NEXT_ACTION: Executor should perform continuation attempt 2 from commit `bcce5e9f49e94da4a2ab63a00b3fe41712cca968`, complete the remaining integration/evidence kernel, docs, tests and evidence, then write STATE first.
- EXECUTOR_RESULT: Attempt 1 partially completed `src/integration/contracts.ts` but failed to persist the attempt/result into STATE.
- BLOCKERS: None
- REPOSITORY_STATUS: Writable canonical CIGO repo

## Preserved Attempt 1 Evidence

- `src/integration/contracts.ts`
- commit: `bcce5e9f49e94da4a2ab63a00b3fe41712cca968`
- This is a real execution attempt and must not be reset to attempt 0 or re-created blindly.

## Continuation Attempt 2

The authoritative continuation prompt is stored in `ops/STATE.json` under `next_prompt`.

Remaining scope includes:
- SourceReader contract + in-memory adapter
- evidence normalization/fingerprinting/validation
- integration exports
- architecture docs
- deterministic Part 2 tests
- package/test wiring if needed
- completion evidence

## Hardened State Rule

`ops/STATE.json` is authoritative for workflow control and must be updated FIRST. After a successful STATE update, re-fetch and verify it before updating this HANDOFF mirror.

If a STATE write fails, HANDOFF must not be changed.

## Builder Mutex Protocol

- `ops/STATE.json` blob-SHA optimistic concurrency is the shared mutex for Builders A/B/C.
- A fresh lock under 25 minutes must never be overwritten; other builders exit without competing.
- A SHA conflict requires re-fetching STATE, checking the latest lock/committed evidence, and retrying only when safe.
- Lock acquisition or reconciliation failure alone does **not** consume a task execution attempt.
- Attempt count increments only when a real implementation execution attempt begins.
- Stale locks may be taken over only after inspecting intervening commits and reconciling committed reality.

Protected/reference repositories remain read-only. Google Docs remains optional mirror-only context.
