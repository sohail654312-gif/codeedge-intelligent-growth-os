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
