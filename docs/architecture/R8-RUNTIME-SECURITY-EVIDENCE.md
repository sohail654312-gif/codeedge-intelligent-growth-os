# R8 / G7 — scoped runtime and CI security hardening

Exact tested implementation SHA `c7014c9b51b2d142a428661f427a6e584d8d563f`. The bounded `src/security/safe-event.ts` accepts only allowlisted security codes, stages, modes, canonical UTC timestamps and opaque 8–64 character correlation IDs. It projects a fixed event schema, never spreads arbitrary input, excludes tenant identifiers, payloads, provider URLs, credentials and raw exception text, and records zero effects. Its injected sink is a **contract**, not deployed telemetry. Adversarial `test/r8-runtime-security.test.mjs` verifies redaction, malformed identifiers and code denial, integrity severity and zero effects.

`.github/workflows/ci.yml` now requires `npm ci --ignore-scripts`, `npm run verify` and `npm run security:dependencies` (`npm audit --audit-level=high --ignore-scripts`). Standard run 36892593972 SUCCESS, 166/166 tests PASS, 0 FAIL, 0 SKIP, audit reported zero vulnerabilities. Existing disposable PostgreSQL run 36892594117 SUCCESS, 12/12 PASS, 0 FAIL, 0 SKIP; not R8 deployment proof.

## Remaining G7 acceptance
- Integrate sink with secured logging/alerting, retention, access controls, tamper resistance and alert delivery; demonstrate real redaction at all ingress/egress and incident response.
- Review runtime threat model, request-size/rate/timeout controls, credential rotation and key management, SSRF/injection, operational monitoring and dependency/Actions pinning; advisory audit alone does not prove supply-chain security.
- Prove isolated staging deployment, rollback rehearsal, restore/RPO/RTO, abuse/load tests, tenant isolation and independent review. Do not enable production or represent this as G7 closure. G1–G8 remain OPEN until independent acceptance.
