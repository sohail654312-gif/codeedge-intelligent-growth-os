# CIGO V1 isolated staging — deployment attempt and synthetic HTTP fallback

**Date:** 2026-11-06 · **Target:** CI-passing source candidate `81928e24fd1ec7b703a41d39be8e628a8fcfd9dc`, draft PR #21. **No public hosted CIGO service deployed.**

## Hosting attempts on the existing connected accounts

- **Vercel team `codeedge`:** isolated project creation returned 403 forbidden. No shared `codeedge-business-os-test` project, alias, environmental secret or protection setting changed.
- **Render `My Workspace`:** explicit free Node service on exact CIGO PR #21 branch, disabled server-only configuration `{"enabled":false}`, auto-deploy off, returned HTTP 402 requiring payment information. No service created or card added.
- **Railway personal workspace:** isolated private `cigo-v1-staging` project creation (with `staging` initial environment, no PR deploys) returned `Free plan resource provision limit exceeded`. No project/service created and existing unrelated Railway projects not modified.
- No other user's app, customer data, provider account, production database, credentials or domains were changed.

The owner has authorized a **staging** deployment, not a production release or billing upgrade. The above failures are platform/account blockers, not CI failures. Do not move CIGO into an unrelated Business OS/Growth Starter project or remove security barriers to force hosting.

## Local isolated acceptance via GitHub Actions

The additive CI test `test/staging-host-smoke.test.mjs` starts the exact CIGO Node host on loopback with **synthetic-only** environment values, and verifies:

1. Explicit disabled mode: liveness 200 with `authenticatedSnapshotVerified:false`, staging shell/API health 503, protected and Demo paths 404, no-store headers, method denial.
2. Synthetically well-formed server configuration: staging shell 200 and anonymous snapshot 401, read-only method denial, no Demo file exposure. No provider/DB network calls are made.
3. Malformed reader/cursor configuration: staging shell/API 503 and no private marker reflection; listener liveness does not imply authenticated acceptance.

Run after `npm run test:staging` builds static files and compiled server imports. The mandatory 270 engine, 8 preview, 31 staging, 15 closure, and 14+7+8 PostgreSQL test-count requirements are unchanged. This **is not** proof of a deployed public host, real identity or tenant A authenticated HTTP 200.

## External acceptance required

Use a permitted **isolated and protected CIGO staging host** with owner-managed private server config (never secrets in chat/Git), unchanged read-only Business OS integration, and synthetic provider sessions. Verify exact commit, protected unauthenticated denial, tenant A HTTP 200, tenant B cross-scope denial, revoked/expired users, RLS, receipts, source outage, no effects, rollback and safe monitoring. Preserve G1–G8 open until independent review and measured acceptance.

**Evidence for this child smoke-test increment:** see the draft PR targeting PR #21 for the exact source SHA and current workflow results. No historical CI run is inherited by a newer commit.
