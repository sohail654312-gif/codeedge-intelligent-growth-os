# R4 — durable evidence remediation evidence

Status: IMPLEMENTED_PENDING_VERIFICATION (bounded foundation only). G6 remains OPEN.

Dependency base: R3 commit e7dc89af44bed60e46cec811cdd008fd686432f7; R0–R3 are stacked draft PRs and require dependency-order review. CIGO scheduled automations checked disabled before writing. No ops/STATE.json or ops/HANDOFF.md changes.

Changes: docs/architecture/sql/R4-REFERENCE-MIGRATION.sql (NOT applied); src/evidence/durable-intake.ts (transactional persistence port, canonical request digest, fail-closed postcondition); test/r4-durable-intake.test.mjs (replay, conflict, tenant mismatch, uncertain commit); package.json test wiring. Existing InMemoryEvidenceLedger remains unchanged and UNVERIFIED. The test store is a process-local fake, not durability proof.

Architecture: database implementation must perform SERIALIZABLE or equivalently concurrency-safe single-transaction insert of intake request, immutable observations and audit event, enforce workspace-scoped uniqueness and idempotency conflict on race, commit before returning receipt, and implement lookup after ambiguous acknowledgment loss. Schema has FORCE RLS and no permissive policy; production tenant policy and trusted R2 composition are intentionally NOT installed. SQL is a review-only migration. No live DB, credentials, encryption/retention configuration, migration/restore, actual cross-process concurrency or production receipt authenticity verified. A caller-supplied context or callback is not proof of identity. No provider calls or production effects.

Acceptance still required: real least-privilege Postgres adapter; scoped RLS policies based on authenticated server identity; atomic audit writes and immutable privilege tests; concurrent conflicting idempotency transactions; restart/restore tests; encryption and retention decisions; R3 receipt integration; independent review. Do not mark G6 closed on green reference CI.

## Consolidation review correction
GitHub main observed 4aa62846bff8a6fe550879f12f19f7fc8e6edfb0; R4 initial exact-head CI run 36868601913 SUCCESS. PRs #2–#6 returned no submitted reviews. Correction commits e5d12695bdb5bebc6efb8ca054b49f1654348aa9 and 2f2b975624af00de5859b46b6d4453b1ac4cc54c reject duplicate observations in one batch and a forged prior replay receipt. Recheck exact final-head CI after this evidence commit. This is an author self-review, not independent signoff.

## Consolidation defect register and next execution brief
- G6 PARTIALLY_IMPLEMENTED: no real PostgreSQL implementation of TransactionalEvidenceStore; migration not applied; no DB-enforced concurrent idempotency, restart/restore or immutable audit proof. Next eligible safe R4 work: implement parameterized PostgreSQL adapter with single transaction, concurrency-safe conflict detection, atomic audit write, and disposable-database integration tests; obtain approval before any migration or credentials.
- G1/G2/G4 PARTIALLY_IMPLEMENTED: trusted identity, source receipt and approval callback interfaces are caller-constructible contracts, not authenticated production roots. Never connect these directly to untrusted request payloads.
- R0 audit reconciliation PENDING: original independent audit source was not retrieved in this session; do not infer verified severity counts.
- R5 NOT_STARTED: defer live Business OS integration until R4 implementation defects are resolved; only provider-neutral read-only design may proceed independently.
- PRs #2–#6 have no submitted review returned by GitHub; preserve stacked dependency order and request separate review. All G1–G8 OPEN.
