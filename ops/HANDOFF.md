# CIGO Automation Handoff

## Recovery Mode

CIGO is operating in **SINGLE_WRITER_RECOVERY** mode. The former three-builder mutex/lease protocol is suspended. Do not acquire a pre-write lock and do not restart valid committed work because STATE metadata is stale.

## Current Work

- Major Part: 2 — Data Access, Integration & Evidence Layer
- Block: Operational Read Contracts + Evidence Ingestion Boundary
- Task: CIGO-P2-BLOCK1
- Attempt count: 1 real attempt consumed
- Status: READY_FOR_EXECUTOR
- Preserved implementation: `src/integration/contracts.ts`
- Preserved commit: `bcce5e9f49e94da4a2ab63a00b3fe41712cca968`

## Next Safe Action

Continue as Attempt 2 and implement only the remaining Part 2 Block 1 source-reader/evidence kernel, docs, deterministic tests and evidence. Run typecheck, build, existing Part 1 tests and new Part 2 tests. Commit coherent work, then re-fetch and update `ops/STATE.json` using its latest blob SHA. Mirror this file only after STATE succeeds.

## Durable Rules

Git commits are first-class progress evidence. STATE describes committed reality and must never erase it. No Google Doc is required for execution. Protected/reference repositories remain read-only. Business OS remains the operational system of record; CIGO remains the intelligence/evidence/decision-support layer.

If a code commit succeeds but STATE update later fails, the next run must reconcile the commit and continue rather than repeat it.
