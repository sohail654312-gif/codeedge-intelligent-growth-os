# CIGO Automation Handoff

## Recovery Model

**SINGLE_WRITER_RECOVERY:** one Builder owns implementation; Verifier is independent and verdict-only; Steward owns STATE/HANDOFF/evidence; External Viewer read-only. All scheduled pipeline roles remain enabled. No three-builder lock or pre-write mutex. Repository commits are implementation evidence, not by themselves proof of block verification.

## Current Work (mirrors authoritative STATE)

- Part 2: Data Access, Integration & Evidence Layer
- Task: `CIGO-P2-BLOCK1` — Operational Read Contracts + Evidence Ingestion Boundary
- Status: `READY_FOR_EXECUTOR`
- STATE attempt count: 1 (Steward to reconcile actual attempts based on committed evidence and verdicts; never reset or double-count)
- Last prior pointer: `bcce5e9f49e94da4a2ab63a00b3fe41712cca968` (NOT Part 2 completion)
- Latest committed implementation: `b4cf5cef3cca2adfa2d4ac65b090ba7fde90e1c7`
- Part 2 Verifier verdict for this SHA: **not committed**
- Latest CI: run `36813595514` **success**, but the existing `package.json` `npm test` executes **Part 1 tests only**; this is NOT Part 2 acceptance.

## Preserved files and exact implementation commits

- `src/integration/contracts.ts`: `bcce5e9f49e94da4a2ab63a00b3fe41712cca968`
- `src/integration/source-reader.ts`: `8eaa3041b581537b4f9a0274c5d84b05c8a89e2d`
- `src/evidence/normalize.ts`: `5ba1032c0f7ae4e53f31a04a5f17002783b67d62`
- `src/evidence/validation.ts`: `b4cf5cef3cca2adfa2d4ac65b090ba7fde90e1c7`

## Next Builder — finish only missing scope

- `src/integration/in-memory-source-reader.ts`: workspace-scoped demo adapter using the same SourceReader contract and validation.
- `src/evidence/fingerprint.ts`: canonical, stable fingerprint; changes to observation value/version produce new identity.
- `src/integration/index.ts`: exports.
- `docs/architecture/DATA-ACCESS-EVIDENCE-BOUNDARY.md`, `docs/architecture/INTEGRATION-CONTRACTS.md`.
- `test/integration-evidence.test.mjs`: deterministic regression cases for missing workspace/source reference, cross-workspace rejection, stable/changed fingerprints, PARTIAL/errors, demo/live parity and ownership boundaries.
- `package.json`: wire `npm test` to execute BOTH existing `test/truth.test.mjs` and new Part 2 tests.
- Typecheck, build, both suites; commit the actual results. Preserve source ownership, provider neutrality, server-derived workspace authority, human approval and safe failure. No protected-repository writes.

## Verification and Advancement Gates

1. Builder commits code/docs/tests/package.json only. Re-read repository at run start and don't re-create committed work.
2. Confirm exact final Builder SHA on GitHub Actions, check `Verify` job for `npm run verify`, with `npm test` running both suites; distinguish CI evidence from local command execution.
3. Verifier inspects exact final Builder SHA and commits `ops/review/CIGO-P2-BLOCK1-verdict.md` containing PASS or FAIL, relevant file/line findings, exact CI/job/command evidence, NOT_RUN where not executed. No PASS if required proof absent.
4. Steward consumes a **new committed verdict for that exact SHA** only. On PASS create `ops/evidence/CIGO-P2-BLOCK1.md`, STATE-first mark verified and scope next coherent block; after re-fetch/verification mirror HANDOFF. On FAIL preserve commits, update attempted work/next brief bounded by three-attempt rule.
5. Passive inspection and GitHub write failures are not implementation attempts. No false 100% completion. If STATE write fails, never edit HANDOFF.

## Scope Boundary

Only `sohail654312-gif/codeedge-intelligent-growth-os` is writable. MVP, Business OS, website, finance-suite and other reference repos are strictly read-only. Business OS owns operational truth/provider execution; CIGO owns authorized intelligence evidence/decision support. Google Docs optional mirror only.
