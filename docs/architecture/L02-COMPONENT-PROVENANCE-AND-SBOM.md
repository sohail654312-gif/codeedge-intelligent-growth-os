# L-02 — Component provenance, licenses and reproducible SBOM

**Status:** IMPLEMENTED_PENDING_INDEPENDENT_REVIEW for lockfile inventory and generated SBOM only. Owner/legal adoption and external-code provenance decisions remain OPEN. This page is not an attribution/license clearance, deployed security audit or authorization to copy code from other repositories.

## Sources and ownership
- CIGO's first-party TypeScript implementation is maintained solely in `sohail654312-gif/codeedge-intelligent-growth-os`. The Product Constitution permits the MVP, Business OS, website, finance-suite, beautifypk-redesign and Preflow.demo repositories as **read-only architecture references**. Do not import/copy any code, art, trademarks or third-party packages from them without separately documenting exact source commit/file, rights and owner approval.
- External npm dependencies are identified from committed `package.json` and npm lockfile v3, not estimated from a README. At the checked-in baseline, direct dev dependency declarations are `pg@8.16.3` and `typescript@^5.9.2`; installed locked TypeScript version is `5.9.3`. `pg` is the disposable PostgreSQL/reference adapter/test dependency, not a claim of a deployed production Postgres connection.
- Locked direct and transitive packages have currently declared license identifiers MIT, ISC or Apache-2.0, as represented by *lockfile metadata*. These are **publisher/registry declarations**, not a legal review of actual tarballs, nested code, notices or third-party assets. The owner must review adoption obligations, notices and redistribution independently.

## CI reproducible package evidence
- `npm ci --ignore-scripts` starts from the committed package-lock; CI runs `npm run security:provenance`, which verifies manifest/lock parity, lockfile v3, package path identity, npm registry resolved URL, sha512 SRI and a recognized declared license for **every locked package**. An unknown license/location/missing SRI fails closed and requires review rather than silently passing.
- CI generates a **CycloneDX JSON SBOM** from the actual installed dependency set using `npm sbom --sbom-format cyclonedx`, then checks its root identity and inclusion of each locked name/version using `scripts/check-sbom.mjs`. The SBOM is uploaded as the run artifact `cigo-cyclonedx-sbom` with 7-day retention; retrieve from the exact GitHub Actions run. It is not permanently hosted, signed, or an attestation to deployed production bytes.
- Adversarial `test/provenance.test.mjs` covers manifest drift, unknown license, non-npm distribution, absent/wrong integrity, malformed version and missing SBOM package entries. `npm audit --audit-level=high --ignore-scripts` remains a **separate** advisory check; an empty audit finding is not license clearance.

## Required component adoption register (open until owner review)

| Component class | Exact identity evidence | Provenance / license classification | Review status |
|---|---|---|---|
| CIGO-authored source (`src/`, tests and architecture docs) | This repository and reviewed Git SHAs | First-party claim pending independent originality/source review; Constitution governs ecosystem scope | OWNER_REVIEW_REQUIRED |
| `pg` direct npm dev dependency and locked `pg` transitive graph | `package.json`, lock v3 and exact-run CycloneDX artifact | Declared MIT/ISC labels per package lock; runtime/test usage and notices must be reviewed | DECLARED_NOT_LEGALLY_APPROVED |
| TypeScript direct npm dev dependency | Locked `typescript@5.9.3` | Declared Apache-2.0 per lock; internal build-time tooling | DECLARED_NOT_LEGALLY_APPROVED |
| GitHub Actions used by CI | `actions/checkout@v4`, `actions/setup-node@v4`, `actions/upload-artifact@v4` in workflow | Third-party/first-party GitHub-hosted action implementations, **not included in npm SBOM**; review pinning, upstream license and change control | OPEN_ACTION_PINNING_REVIEW |
| PostgreSQL 16 test service | R4 disposable PostgreSQL workflow | Container image and underlying OS packages **not included** in npm SBOM; inspect/pin image digest, source/license and image scan for production-stage use | OPEN_IMAGE_REVIEW |
| Referenced Codeedge repositories and external design/pattern sources | Product Constitution reference list | READ-ONLY; **no license or code-copy clearance inferred from access** | OWNER_APPROVAL_REQUIRED_BEFORE_ADOPTION |
| Production services, adapters, fonts, videos and marketing assets | Not inventoried/deployed by this CIGO reference package | Out of current npm/code SBOM scope | NOT_ASSESSED |

## Update and acceptance policy
Any new/changed npm dependency must update manifest and lock together, regenerate exact-run SBOM, pass lock/SRI/license metadata checks, record reason and owner adoption/notice review, and receive distinct independent security review before production. Changed GitHub Actions or container images require a separate provenance assessment. Provenance assertions are limited to **metadata and scope actually examined**: this package does not prove absence of copied code, package integrity against the registry at current runtime, legal compatibility, vulnerability freedom, or deployable production readiness. L-02 original LOW finding remains pending independent and owner legal/source decisions. All production gates G1–G8 OPEN.
