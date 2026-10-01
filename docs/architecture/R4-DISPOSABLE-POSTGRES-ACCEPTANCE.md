# R4 disposable PostgreSQL acceptance (G6 OPEN)

The reference migration is NOT production deployment authorization. Provision a separately approved disposable database, never a customer or shared production instance. Record its identity and owner approval out of band. Use separate migration owner and application roles; the application role must be neither superuser nor BYPASSRLS nor table owner. Do not use caller-controlled session variables as proof of workspace identity. An authenticated server gateway must verify membership, expiry, revocation, action permission and source scope, then bind database access to the authorized tenant through a reviewed trusted mechanism. Until that exists, reference migration remains fail-closed with no permissive grants/policies.

## Test prerequisites

- Explicit disposable database and confirmation CIGO_R4_DISPOSABLE_TEST_CONFIRM=I_CONFIRM_DISPOSABLE_ONLY; CIGO_R4_DISPOSABLE_DATABASE_URL has no default.
- Reviewed migration applied by separate owner; least-privilege application role and non-secret PostgreSQL version recorded.
- Install reviewed PostgreSQL driver in disposable runner (the current repository has no pg dependency); never commit credentials.
- Execute npm run typecheck, npm run build, npm test, npm run test:postgres; record skipped cases as NOT RUN.
- Before enabling authorized writes, independently review transaction-scoped identity binding and tenant RLS. Do not weaken RLS to make a test pass.
- Exercise concurrent same/conflicting replay, atomic audit rollback, immutable history, cross-workspace denial, restart, backup and restore with exact run evidence.

## Operational gates

Owner must approve retention, encryption/key management, RPO/RTO, backup cadence, monitoring thresholds, pool capacity, incident rollback and migration deployment. No values are assumed here. A green CI run verifies scoped repository behavior only, not live durability, independent review or production readiness.
