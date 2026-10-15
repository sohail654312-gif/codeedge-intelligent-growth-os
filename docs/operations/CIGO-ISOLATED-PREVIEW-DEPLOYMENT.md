# CIGO-only protected staging Preview: deployment-only Git branch

**Status:** PREPARED, NOT DEPLOYED. Authenticated Vercel HTTP 200 and original HTTP 503 root cause are **not verified**.

## Hard isolation

- Git repository: `sohail654312-gif/codeedge-intelligent-growth-os` (CIGO only).
- Deployment-only branch: `deployment/cigo-protected-staging-preview-20261015`. **Do not merge this branch** into `main` or the normal demo/preview PR stack.
- This branch deliberately uses the reviewed `vercel.staging.json` contents as the root `vercel.json` so a Git-connected **CIGO-only Vercel project** deploys the authenticated read-only staging console instead of the public synthetic Demo.
- Default `main` still uses the original Demo/Sandbox `vercel.json`; no changes to the original MVP, Business OS, Finance Suite, CIGO X, shared Vercel project, production domain or real provider effects.
- Guard: `test/preview-ui.test.mjs` requires this deployment branch's root config to match `vercel.staging.json` exactly, including CSP, staged build output, packaged server modules and 60s function timeout.

## First and only current owner dependency: Vercel create-project permission

The connected Vercel app can list the existing Hobby `codeedge` team and its deployments, but its attempt to create an isolated project returned **403 forbidden**. Do not try arbitrary other teams or weaken the shared Business OS project's configuration.

The team owner should open `https://vercel.com/new`, select the **codeedge** team, and import only `sohail654312-gif/codeedge-intelligent-growth-os` into a new project called `cigo-staging-test`. Ensure project creation permission (including the Vercel-connected integration's `Project: Write` permission) is available. On Hobby, team collaboration/permission settings can differ; if the dashboard works but the API denies access, use the owner-controlled dashboard rather than disabling protection.

**Avoid an accidental `main` deployment:** For the dedicated *staging-only* project, configure its Git Production Branch to the deployment-only branch above or follow an explicit owner-approved protected preview workflow. Keep this project's deployment isolated, with no existing Codeedge production/custom alias. Do not promote/reassign aliases. Use `vercel.staging.json` semantics exactly as represented by root `vercel.json` on this branch.

### Required private server-side setup

The hosted staging handler loads `CIGO_STAGING_SERVER_JSON` from the protected Vercel server environment, or its private `dist/staging-runtime-private.json` includeFiles artifact. These are **two exclusive safe owner-controlled secret delivery methods**; never commit the private file, copy secrets into documentation, browser JavaScript, GitHub Actions public artifacts, screenshots, or chat.

The private synthetic config must identify only authorized test workspaces, current provider verification, restricted PostgreSQL login pools, trusted Business OS integration-preview origin, provider publishable auth key, source-reader credentials and valid protection cookie. The `readerEnv.CIGO_BUSINESS_OS_READERS_JSON` tenant `baseUrl` and `businessOsOrigin` must be the identical HTTPS origin. Use least-privilege scoped secrets and Vercel Deployment Protection; don't bypass it.

The owner and operator must verify the Supabase test project, synthetic users and branch-scoped Business OS reader credentials using existing secure administrative workflows. There is no safe way to synthesize production grant secrets from repository files.

## Authenticated acceptance once the owner provisions the project

1. Verify Preview deployment SHA equals the latest **exact branch commit** and runs the staging build, not the public Demo build. Protection stays enabled.
2. Check safe unauthenticated liveness and API fail-closed/no-store behavior.
3. Use a verified synthetic provider login for tenant A; verify current access, then call `GET /api/staging/snapshot?workspace=<authorized-UUID>`. Require HTTP **200** and a truth/provenance-safe dashboard DTO.
4. Check tenant B cannot read tenant A, revoked and expired sessions fail closed, source failures never silently switch to Demo, and no effect endpoints or private data are exposed.
5. If HTTP 503 persists, immediately inspect fixed `CIGO_STAGING_*` diagnostic markers and upstream HTTP status/media categories **inside the Vercel Hobby runtime-log retention window**. Patch only the verified CIGO defect, test, and redeploy the exact SHA. If underlying upstream grants or protected origin are wrong, request a separate owner-approved upstream change, not an unreviewed change to Business OS.
6. Record deployment ID, exact Git commit, HTTP statuses, non-secret time-scoped logs, CI links, and tenant matrix in CIGO GitHub progress. Complete independent review and G1–G8 gates separately.

**No hosted 503 fix, 200, release, merge or production authorization is claimed by this deployment preparation.**
