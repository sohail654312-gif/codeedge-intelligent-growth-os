# R4N security hardening and independent G6 handoff — REVIEW REQUEST, NOT SIGNOFF

## Scope and trust boundary
Review draft PR #6 on remediation/r4-durable-evidence. Protected main and unrelated projects remain unchanged. Owner-pinned synthetic tenant login roles are disposable fixtures, not production identity. Application role is non-owner, NOBYPASSRLS, SELECT/INSERT only; FORCE RLS on three tables. No caller-controlled GUC is used as identity. The production server-side membership resolver and live tenant credential lifecycle are NOT integrated or approved.

## Reproduce without production resources
Run npm ci --ignore-scripts && npm run verify. The pull-request PostgreSQL workflow provisions PostgreSQL 16 in an ephemeral service database cigo_r4_disposable_ci, checks disposable identity and applies docs/architecture/sql/R4-REFERENCE-MIGRATION.sql and R4-DISPOSABLE-TENANT-ROLES.sql as owner. It requires CIGO_R4_DISPOSABLE_TEST_CONFIRM=I_CONFIRM_DISPOSABLE_ONLY and CIGO_R4_REQUIRE_POSTGRES_TESTS=true; npm run test:postgres cannot silently skip in that workflow. Do not point at a customer or production database. Check actual checkout SHA, job logs, count, skips and PostgreSQL server version.

## Reviewer adversarial matrix
1. Attempt to forge request actor/membership, revoked or expired membership, source-system permissions and cross-workspace records; separately assess in-flight revocation race.
2. Attempt SQL access as tenant A to tenant B across all three tables, including forged INSERT, SELECT, UPDATE, DELETE, TRUNCATE, SET ROLE, session reuse and pooled concurrency; inspect grants and owner role.
3. Inspect receipt JSON scope integrity, malformed receipts, fingerprint uniqueness, immutable UNVERIFIED state, workspace-bound supersedes FK and audit append-only privileges.
4. Exercise identical/conflicting concurrent idempotency and real SQLSTATE 40001, bound retry exhaustion, failed evidence/audit inserts, ambiguous COMMIT fresh-connection reconciliation, restart and connection interruption. Separate native faults from wrapper-injected faults.
5. Confirm package-lock integrity, npm ci, zero skipped required tests, explicit workflow path triggers and whether documentation-only changes trigger required checks.
6. Obtain approved encryption/retention/backup/RPO/RTO and a real restore/rollback rehearsal in authorized disposable/staging infrastructure. Review live identity, tenant credential provisioning/rotation/revocation, migration upgrade/rollback, monitoring and incident response.

## Prior implementation evidence, not R4N final acceptance
R4L implementation aa35ac6290948e71a56a4551e23dc1bddc7971e8, standard CI 36876234727 SUCCESS, PostgreSQL 36876234555 SUCCESS. R4M implementation bbf05c4203b69e81d38820397252dac81a004718, standard CI 36877106482 SUCCESS and PostgreSQL 36877106603 PostgreSQL 16.15, 11/11 PASS, 0 SKIP. R4N adds fail-closed receipt scope validation and regression in commits 71436ddd004e1eda873fbf8366c8127b7ff71ca2 and f9df074cb32f25f65346360451d7601d82e1e056. Fetch latest exact-head CI before issuing verdict; these earlier green runs do not cover new changes.

## Decision protocol
Produce an independently authored PASS (scoped), FAIL or BLOCKED with exact implementation SHA, tests, run/job logs, privilege/RLS review, actual-versus-injected recovery proof and severity-ranked findings. Record unresolved owner/external actions explicitly. Do not self-certify G6, merge PR #6, authorize production, or advance R5. All G1–G8 production gates remain OPEN unless separately accepted.
