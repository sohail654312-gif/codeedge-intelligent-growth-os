# R4 independent review — G6 OPEN

This is a reviewer checklist, not a PASS verdict. Review exact implementation SHA and database migration before approval.

- [ ] Confirm trusted server identity and revocation checks bind each database transaction to one workspace. Caller-provided workspace ID and untrusted GUC alone are insufficient.
- [ ] Review least-privilege non-owner role, grants, FORCE RLS policies and cross-workspace SELECT/INSERT denial using a disposable PostgreSQL instance.
- [ ] Apply reviewed migration to disposable database; verify workspace PK/FK, indexes, append-only restrictions, supersession lineage, audit integrity and rollback.
- [ ] Verify successful COMMIT, lost acknowledgement, fresh-connection reconciliation, conflicting replay and bounded SQLSTATE 40001 retries under actual PostgreSQL.
- [ ] Verify concurrent identical and conflicting submissions with deterministic barriers, persistence across adapter restart, interruption/recovery and restore rehearsal.
- [ ] Confirm source receipts and fingerprints do not self-attest FACT; evidence remains UNVERIFIED without independent trusted verification.
- [ ] Confirm retention, encryption, backup/restore, monitoring and migration rollback plans with owner-approved operational parameters.
- [ ] Record exact test commands, SHA, CI run, database version, role privileges and redacted evidence. Skips are not PASS.
- [ ] Obtain independent reviewer sign-off. G6 stays OPEN until genuine database proof and independent review.


## R4L implementation available for independent inspection (not reviewer signoff)
- [x] Scoped disposable test implements server-controlled membership fixture, tenant-bound pool factory, separate tenant login roles and owner-pinned FORCE RLS policies. See R4-TENANT-BOUNDARY.md.
- [x] Exact implementation SHA aa35ac6290948e71a56a4551e23dc1bddc7971e8: standard CI run 36876234727 SUCCESS; real PostgreSQL run 36876234555 performed authorized intake, replay, persisted UNVERIFIED evidence and audit, cross-tenant denial and subsequent revocation test.
- [ ] Independently inspect tenant credential provisioning/rotation and actual live auth composition; synthetic fixture is not production identity.
- [ ] Independently test in-flight revocation, concurrent intake, ambiguous COMMIT, recovery and restore, and sign off on production policy and operations. G6 OPEN.


## R4M scoped implementation checkpoint — G6 still OPEN
- [x] Real disposable PostgreSQL 16.15 concurrent identical/conflicting requests, duplicate fingerprint rejection, actual 40001 contention, bounded injected 40001 retries, receipt/evidence/audit FK rollback, workspace-scoped supersession, adapter restart, fresh-connection reconciliation, lost COMMIT acknowledgement injected **after genuine COMMIT**, tenant-role isolation and UNVERIFIED evidence. Implementation SHA bbf05c4203b69e81d38820397252dac81a004718; standard CI 36877106482 SUCCESS; PostgreSQL 36877106603 11/11 PASS, 0 skipped.
- [ ] Distinct reviewer must evaluate real-versus-injected fault scope, deterministic concurrent barriers, actual connection interruption, backup/restore rehearsal, in-flight membership revocation, production credential lifecycle and live identity integration. No G6 signoff implied.

## R4N hardening / reviewer handoff (not G6 acceptance)
- [x] Added persisted receipt workspace/idempotency scope validation and adversarial regression; see commits 71436ddd004e1eda873fbf8366c8127b7ff71ca2 and f9df074cb32f25f65346360451d7601d82e1e056.
- [x] Created docs/architecture/R4N-G6-INDEPENDENT-REVIEW-PACKAGE.md for distinct reviewer to reproduce CI, inspect boundaries and record actual-versus-injected evidence.
- [ ] Recheck exact latest implementation SHA standard CI and genuine disposable PostgreSQL; documentation-only final HEAD may not have PostgreSQL workflow triggered by its path filters.
- [ ] Independently evaluate live identity/credential lifecycle, in-flight revocation, real network interruption, deterministic transaction barriers, operational retention/encryption/backup/restore and owner RPO/RTO decisions. G6 OPEN.
