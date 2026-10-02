# M-04 reproducible CI and M-05 governance — bounded implementation evidence (2026-10-02)

## Scope / authority
Initial PR #6 HEAD `4a59ca1e5bfcb7446a5a8645816224d8af681f14`, matching branch HEAD at preflight; main base `4aa62846bff8a6fe550879f12f19f7fc8e6edfb0`. PR draft/unmerged, no submitted reviews. CIGO writable automations Builder/Verifier/Steward/remediation disabled; independent read-only watch enabled, untouched. One manual writer. All R0–R9/P1/M-01/M-02/M-03/L-02 source preserved. No STATE/HANDOFF changes. H-03 effect authorization BLOCKED and production G1–G8 OPEN.

Original independent Parts 1–7 audit M-04 asks reviewed lockfile, enforced npm ci, pinned/tested Node/TypeScript, caching keyed to lock, install metadata and dependency update process; M-05 asks verified protected-main PR/check policy plus security scans and code assurance. The source audit is owner Library `CIGO_Parts_1_to_7_Independent_Audit_2026-10-01.md`; the older `ops/remediation/ORIGINAL-AUDIT-FINDING-RECONCILIATION-2026-10-02.md` is a historic checkpoint rather than up-to-date closure.

## Already implemented and preserved
- Committed npm lockfile v3, `npm ci --ignore-scripts`, private manifest and exact lockfile inventory.
- High-severity `npm audit`, manifest/root/provenance/license-declaration/SRI checks and installed CycloneDX generation with exact name/version 15/15 inventory validation.
- Original L-02 adoption and owner legal/source review remain independent from generated metadata. npm SBOM excludes Actions/container/OS/runtime assets.

## M-04 bounded changes
- `package.json` and `package-lock.json`: TypeScript declaration is now exact `5.9.3`, matching the preexisting locked installed version; `pg` remains exact `8.16.3`. Existing dependency graph remains intact.
- `.github/workflows/ci.yml` and `.github/workflows/r4-postgres.yml`: immutable upstream source-checked action commits:
  - `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683` (v4.2.2, `action.yml` successfully fetched by SHA).
  - `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020` (v4.4.0, `action.yml` fetched).
  - `actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02` (v4.6.2, `action.yml` fetched).
  - Both workflows pin Node `24.21.0`, previously observed in reference CI `36978353985`/`36978353983`. Ubuntu runner label pinned to `ubuntu-24.04` (host image revision still hosted/mutable). Checkout credential persistence disabled; npm cache keyed to `package-lock.json` (cache is not a replacement for npm ci/integrity).
  - Both workflows require the tracked lockfile, print Node/npm versions, install via `npm ci --ignore-scripts`, check provenance and high-severity advisories.
  - Removed R4's obsolete missing-lockfile generation/artifact fallback, previously unreachable after npm ci.
  - R4 runs on **every PR** and push to main (no paths filter), plus manual dispatch; require it as a protected-main status check through owner configuration.
- `scripts/check-test-summary.mjs`, `test/m04-ci-hardening.test.mjs`: fail if complete test summary absent, below reviewed minimum, contains failures/cancellation/skips, or is duplicated. Workflows use `set -o pipefail` and check captured real unit (minimum 213) and PostgreSQL (minimum 12) summaries. Regression asserts action pins, production CI/PG wiring, postgres digest, guard and advisory/SBOM steps.
- PostgreSQL image: initial tag `postgres:16` resolved in **actual** disposable Actions run `36979054262`, job `110749183006` on Linux/amd64 to registry repo digest `postgres@sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54`, local ImageID `sha256:1b3c642526f8d274b12bdcd93b90aeb7e68a1f59eb20613adb96ed561c01d98c`, running PostgreSQL `16.15 (Debian 16.15-1.pgdg13+2)`. This exact observed digest, not a guessed value, is now pinned as `postgres:16@sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54`. Runtime job re-inspects pulled identity; separate image-vulnerability/source/license and multi-platform review still OPEN. Future updates require evidence-backed digest change and tests.
- First source hardening checkpoint `c3354219ebb1cbc7bd4b0e31b8438ecc1fafdae5`: standard [36979054240](https://github.com/sohail654312-gif/codeedge-intelligent-growth-os/actions/runs/36979054240) job `110749182652` SUCCESS 215/215 zero failed/skipped; R4 [36979054262](https://github.com/sohail654312-gif/codeedge-intelligent-growth-os/actions/runs/36979054262) job `110749183006` SUCCESS 215/215 unit and 12/12 PostgreSQL zero failed/skipped. High-severity audit 0 known; provenance 15 locked packages; CycloneDX 15/15. Source checkpoint SBOM artifact `cigo-cyclonedx-sbom` ID `11214573106`, archived ZIP digest `sha256:d3edfdc9e6f5a091b6abfd10666676621d3a1cef525ec727d4b70bf3d0c2e33f`; this is **intermediate**, not final-SHA artifact. Final source + evidence-only head workflows must be checked separately.

## M-05 scoped status: CI code implemented; settings not proven
Current standard job `verify` and PostgreSQL job `disposable-postgres` are explicit, independent checks on all PRs. Explicit `permissions: contents: read`, immutable action refs, audit, provenance and SBOM inventory checks are checked-in. No repository-connector proof of active `main` ruleset/protection is available. Historic attempt returned 403; this is **UNVERIFIED**, not evidence protections are disabled. M-05 also retains SAST, secret scanning, license/legal review, coverage threshold and artifact attestations/signing OPEN unless separately verified; npm declared-license check is not legal license clearance. There is no active PR review on #6 in preflight.

Owner dashboard actions (do **not** assume they are set):
1. GitHub repository > **Settings > Rules > Rulesets** (or Settings > Branches protection for plan/UI). Create/inspect an **active** branch ruleset targeting `main`.
2. Require pull requests, at least one distinct approving review (prefer CODEOWNERS/review of workflow changes), dismiss stale approvals on new commits, block force pushes/deletions, restrict bypass and direct main pushes.
3. Require checks matching exact GitHub statuses `verify` (CIGO CI) and `disposable-postgres` (R4 disposable PostgreSQL acceptance) from GitHub Actions; prohibit check bypass. Confirm both checks are present on a fresh PR revision and merge is blocked if either fails/missing.
4. Inspect Security/Advanced Security/Code security settings and enable/verify secret scanning/push protection and code scanning (CodeQL or approved SAST) where available; define coverage threshold and independent license/notices/source review. Preserve workflow artifact retention and consider signed provenance/attestation before release.
5. Export dated non-secret settings/ruleset evidence and reviewer identity for distinct audit; if organization/plan does not expose controls, record OWNER_DECISION_REQUIRED rather than claiming enforcement.

## Update process and limits
To update npm dependencies: review necessity/advisories/license/source, edit manifest and lock together, run npm ci, typecheck/build, all tests, audit, provenance, regenerate and compare CycloneDX against locked inventory, inspect the exact-run artifact and obtain separate review. To update Action SHA: verify commit exists on upstream repository and inspect `action.yml`/release; update guarded regression and rerun both workflows. To update container: observe/verify registry digest and platform/release, assess supply chain and vulnerabilities, update pinned reference and guard, rerun disposable PostgreSQL. Cache/Ubuntu labels/registry metadata do not equate to end-to-end bitwise reproducibility. CI itself cannot enforce owner-only branch settings.

**Status:** M-04 IMPLEMENTED_PENDING_INDEPENDENT_REVIEW once final SHA runs pass; M-05 PARTIAL_IMPLEMENTED_OWNER_GOVERNANCE_UNVERIFIED. L-02 legal/source acceptance OPEN; H-03 BLOCKED; G1–G8 OPEN. No merge, deployment or production actions authorized.

## Final source checkpoint
Implementation SHA: `0d45ced3349fa67d3f711f33c1f921f49b6aec3d`.
CIGO CI: run 36979465836, job 110750456127, SUCCESS, 216/216 unit tests, zero fail/skip. Typecheck/build, dependency audit (zero known), 15-package provenance and 15/15 CycloneDX passed.
Disposable PostgreSQL: run 36979465803, job 110750455918, SUCCESS, 216/216 unit and 12/12 real database tests, zero fail/skip. The pinned PostgreSQL 16.15 image registry digest was confirmed in logs: `postgres@sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54`.
Exact source-run SBOM artifact `cigo-cyclonedx-sbom` ID 11215031700, archived ZIP digest `sha256:214d39270a6c6039f85a87e14808426697fc59cd6e6d35fab12e7b3cb7b87863`, expiry 2026-10-09T07:36:52Z subject to GitHub retention. This is not a signed production SBOM.
Intermediate CI 36979197992 failed one new test due to not recognizing YAML `- uses:`; fixed. The first image-pin commit accidentally concatenated a YAML comment and `env:`, preventing PostgreSQL workflow registration; fixed at implementation SHA above. Latest dual-run evidence supersedes those incomplete checkpoints.
M-04 remains IMPLEMENTED_PENDING_INDEPENDENT_REVIEW. M-05 owner-protection and remaining security scans are not established. H-03 BLOCKED, G1–G8 OPEN. Documentation-only successor requires exact-HEAD verification.
