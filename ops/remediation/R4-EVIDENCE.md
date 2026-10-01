# R4 — durable evidence remediation evidence

Status: IMPLEMENTED_PENDING_VERIFICATION (bounded foundation only). G6 remains OPEN.

Dependency base: R3 commit e7dc89af44bed60e46cec811cdd008fd686432f7; R0–R3 are stacked draft PRs and require dependency-order review. CIGO scheduled automations checked disabled before writing. No ops/STATE.json or ops/HANDOFF.md changes.

Changes: docs/architecture/sql/R4-REFERENCE-MIGRATION.sql (NOT applied); src/evidence/durable-intake.ts (transactional persistence port, canonical request digest, fail-closed postcondition); test/r4-durable-intake.test.mjs (replay, conflict, tenant mismatch, uncertain commit); package.json test wiring. Existing InMemoryEvidenceLedger remains unchanged and UNVERIFIED. The test store is a process-local fake, not durability proof.

Architecture: database implementation must perform SERIALIZABLE or equivalently concurrency-safe single-transaction insert of intake request, immutable observations and audit event, enforce workspace-scoped uniqueness and idempotency conflict on race, commit before returning receipt, and implement lookup after ambiguous acknowledgment loss. Schema has FORCE RLS and no permissive policy; production tenant policy and trusted R2 composition are intentionally NOT installed. SQL is a review-only migration. No live DB, credentials, encryption/retention configuration, migration/restore, actual cross-process concurrency or production receipt authenticity verified. A caller-supplied context or callback is not proof of identity. No provider calls or production effects.

Acceptance still required: real least-privilege Postgres adapter; scoped RLS policies based on authenticated server identity; atomic audit writes and immutable privilege tests; concurrent conflicting idempotency transactions; restart/restore tests; encryption and retention decisions; R3 receipt integration; independent review. Do not mark G6 closed on green reference CI.
