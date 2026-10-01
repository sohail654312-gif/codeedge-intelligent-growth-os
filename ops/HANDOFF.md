# CIGO Manual System — Authoritative Handoff Mirror

All scheduled CIGO automations are disabled by owner instruction. Manual, sequential execution only; do not re-enable them without explicit owner instruction. STATE.json is authoritative; this document mirrors it.

## Verified completion
- Part 1 completed and frozen (see ops/evidence/CIGO-P1-COMPLETION.md).
- CIGO-P2-BLOCK1 verified: Builder `2e6e5bbd0a1b8b360ced264962709b32aaf44b89`, merge `8737d7cda8d633bcad24d8f96ba4623ec274d159`, independent PASS verdict commit `a35e226cdcf9bc67532ca98ccf56503c561cb97a`, evidence `ops/evidence/CIGO-P2-BLOCK1.md`. CI run `36829631494` job `110263031147` success on exact merge SHA. Typecheck, build, Part1 truth and Part2 integration-evidence wired; LOCAL_RUN NOT_RUN. No live adapter proof.

## Current task: CIGO-P2-BLOCK2 — Evidence Intake and Provenance Ledger
Status READY_FOR_EXECUTOR; attempt_count 0. Implement only in CIGO repository: tenant-scoped intake of validated SourceReader results; append-only provenance ledger, deterministic fingerprint dedupe, supersession, source/version/observation and ingestion timestamps; preserve partial/error/freshness status and quarantine invalid evidence. Never promote incomplete/invalid observations to verified FACT. In-memory deterministic demo and regression tests for idempotency, replay, version/value change, tenant isolation, error propagation. Architecture documentation and package.json test wiring. Business OS owns operational truth; no direct provider SDK, protected reference repo writes, or sensitive action without approval.

## Manual acceptance
Builder commit -> exact-SHA CI typecheck/build/all test suites -> independent exact-SHA verifier verdict -> evidence -> STATE first -> HANDOFF mirror. No scheduled background work. Block2 and remainder of ten-part programme are not yet complete.
