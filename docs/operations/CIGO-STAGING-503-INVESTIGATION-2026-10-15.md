# CIGO protected authenticated staging: October 15, 2026 investigation

**Status: HOSTED HTTP 503 ROOT CAUSE NOT VERIFIED.** This is an evidence-backed engineering note, not a production or security acceptance.

## CIGO checkpoint

- Parent draft: PR #13, `885074623fa9e942abad7c5358b359c319a38ab1`.
- Previous CIGO hosted Preview: `dpl_7XTWTVZTF4gmHKpTvgULVhPX842k`, Vercel project `codeedge-business-os-test` (shared test infrastructure), READY.
- Previous CIGO published app source: `8be7d7df254c9aa07a7cc2b81484d265538270fd`.
- Previous protected synthetic acceptance: provider sign-in and owned-workspace authorization succeeded, final `GET /api/staging/snapshot?workspace=...` returned HTTP **503**, not 200. Error cause did not survive in the Hobby-plan runtime-log retention window.
- PR #13 adds sanitized stage/resource and upstream HTTP status diagnostics; green CIGO and disposable-PG workflows verify the source/tests, **not the hosted fix**.

## Upstream endpoint verification

- Business OS `main` is **not** the authoritative upstream for this read adapter.
- Read-only inspection of the untouched Business OS `integration/cigo-read-v1` branch finds `src/app/api/internal/cigo/v1/read/route.ts` and `src/server/cigo/contract.ts`.
- The route implements `GET /api/internal/cigo/v1/read` with trusted service-credential authorization; contract `codeedge-business-os-read-model:v1`.
- The contract declares exactly eight resource kinds: business_profile, service, lead, customer, crm_activity, booking, inbox_summary, finance_summary.
- Vercel deployment `dpl_GHfrUwitNPm8xxB2E268R8uS1nw4` is READY on the intended Business OS integration branch at `6341238c1f5c85153073e0d1bdcc3b6a6c2c6213`. READY confirms build/deploy only; HTTP 200 for authorized requests was **not** reverified this session.
- Branch-scoped restricted CIGO reader variables exist in the shared project's Preview metadata; values were not inspected, copied or disclosed. Their continued validity and actual tenant grants are **not verified**.

## CIGO-only engineering in this child branch

1. Confirm the tenant reader's `baseUrl` origin exactly matches the independently configured protected Business OS transport origin before a real hosted snapshot. A mismatch now fails closed with fixed `SERVER_CONFIGURATION` diagnostic; URLs/credentials are not logged.
2. Record fixed `CIGO_STAGING_UPSTREAM_MEDIA_FAILURE category=non_json` if upstream answers HTTP 200 with a non-JSON body (for example, a Vercel protection login document). Never read or log the body.
3. Keep the caller response generic and private/no-store. Preserve strict authorization, receipts, immutable evidence, tenant-scoped RLS, no Demo fallback and no effects.
4. Tests exercise matching/mismatched origins, synthetic secret-bearing configuration, 200+HTML, and fixed diagnostic categorization.

## Hosting constraint

Attempted to create an isolated Git-connected Vercel project named `cigo-staging-test` in team `team_a8T8lqP82nDRhkKg9qn0oiu7`. Vercel returned **403 forbidden: no permission to create project**. No project was created, no shared project configuration altered, and no alias or protection changed.

## Exact remaining owner action and acceptance

The Vercel team owner/administrator must authorize creating an **isolated protected CIGO preview project** (or explicitly approve a CIGO-only protected test deployment on already-shared Preview infrastructure with unchanged settings). An authorized deploy operator must install/read private **server-side only** staging configuration through Vercel protected secrets or a private function artifact, not Git. No secrets should be pasted into chats or committed to the public repository.

Then, on the exact deployed CIGO commit and inside Vercel's live log retention window:

1. Check safe health and unauthenticated API denial.
2. Sign in as authorized **synthetic** tenant A and obtain its current permitted workspace from verified provider session/membership.
3. Request an authenticated snapshot (HTTP **200** required) and verify projected dashboard, source provenance, bounded coverage, and no secrets in response.
4. Probe synthetic tenant B cross-scope, revoked/expired sessions, outage, and source unavailability; assert fail closed, never Demo fallback.
5. Investigate only sanitized `CIGO_STAGING_*` error markers and upstream status/media categories. Resolve the actual marked issue in CIGO if owned there. If the upstream deployment/auth is wrong, escalate minimal isolated upstream proposal without modifying Business OS.
6. Record deployment ID, Git commit, statuses, redacted evidence and two successful exact-head GitHub Actions workflows.

All 18 independent review findings and production G1–G8 are still OPEN. No release, merge or effects are authorized.
