# CIGO Automation Handoff

## Current State

- CURRENT_MAJOR_PART: 2 — Data Access, Integration & Evidence Layer
- CURRENT_BLOCK: Operational Read Contracts + Evidence Ingestion Boundary
- CURRENT_TASK_ID: CIGO-P2-BLOCK1
- ATTEMPT_COUNT: 0
- STATUS: READY_FOR_EXECUTOR
- LOCK: NONE
- PLANNER_DECISION: Part 1 is complete. Begin Part 2 with provider-neutral, read-only operational data-access contracts and a deterministic evidence-ingestion kernel before any live adapter is attempted.
- NEXT_ACTION: Executor should implement CIGO-P2-BLOCK1 completely, preserve Part 1 invariants, verify existing + new tests, and record evidence.
- EXECUTOR_RESULT: None yet
- BLOCKERS: None
- REPOSITORY_STATUS: Writable

## Part 1 Closure

Part 1 is repository-backed and complete: Product Constitution, Capability Ownership Matrix, Canonical Domain Model, Business Truth Architecture, passing typecheck/build, 9/9 deterministic truth tests, and completion evidence.

## NEXT_PROMPT

The authoritative full execution prompt is stored in ops/STATE.json under next_prompt. Part 2 Block 1 implements the read-only integration/evidence boundary with source-reader contracts, workspace enforcement, source references, cursor/freshness/partial-result semantics, deterministic evidence normalization/fingerprinting, an in-memory demo adapter, tests, docs and completion evidence.

## Workflow Rule

ops/STATE.json is authoritative. Executor may run only when state is READY_FOR_EXECUTOR. Protected/reference repositories remain read-only.
