# Part9 Block1 — cross-part security/tenant conformance baseline and production-gap register

## Verified reference scope (not production assertions)

This baseline expands deterministic tests across real Part2 source reader and evidence intake, Part3 memory FACT gate, Part4–6 intelligence/recommendation/draft, Part7 unverified Copilot/review, and Part8 DENY_UNVERIFIED intent/dispatch preview/denial lifecycle. The cross-part test suite `test/part9-security-conformance.test.mjs` is included in `npm test`. Representative acceptance: cross-workspace attempts fail/return no foreign rows; foreign seed values do not leak through reader error messages; caller-provided reviewer attestation cannot promote Part2 UNVERIFIED evidence into Part3 FACT; unverified analysis is not an authorized action; forged approval, policies and fake provider effects fail closed; DEMO/SANDBOX/PRODUCTION all return identical denied, non-effect results; core analysis/recommendation/planning/copilot/action files do not import provider SDKs or directly invoke fetch. Test results apply only to these in-memory contracts and fixtures.

## Production gaps — not implemented or verified

| Gate | Current status | Required separate evidence before production acceptance |
|---|---|---|
| G1 Trusted identity/workspace | Context is a caller-supplied type, NOT authenticated | Server-derived session, membership, RBAC/least privilege, MFA where applicable, revocation, tenant/RLS proofs |
| G2 Source and FACT authenticity | Fingerprints structurally correlate caller-supplied observations; Part3 FACT blocked | Independent authorized source verification, reviewer attestation, dispute/revocation and immutable provenance audit |
| G3 Live read integration | SourceReader and Business OS references are in-memory | Versioned least-privilege live Business OS read model, credentials/cursor isolation, retries/rate-limit/partial failure and tenant tests |
| G4 Approval/policy | Review request and preflight deny ALL effects | Actual policy evaluator, identity-bound human authorization and expiry/revocation, no self-approval |
| G5 Operational effects | Preview and denied lifecycle are pure functions | Business OS-owned provider-neutral authorized domain service and replaceable adapters; Demo/Sandbox parity before any live effect |
| G6 Durable evidence/audit/idempotency | In-memory replay/denial summary only; NOT_DURABLE | Transactional tenant-isolated storage, encryption, retention, migration/restore/concurrency, idempotency and non-forgeable audit |
| G7 Runtime/security/operations | Exact-SHA CI only | Security threat model, redaction, abuse/rate limiting, observability, alerting, rollback drills, staging and independently verified deployment |
| G8 End-to-end commercial pilot | No live client execution/Business OS deployment | Controlled synthetic Demo/Sandbox, one-workspace pilot signoff, owner approval of cost, service and risk policies |

Scope notes: Business OS remains the operational system of record and execution owner; protected repositories remain read-only. No live provider calls, protected changes, customer data or deployment. Part9 Block1 passing CI proves a **cross-part reference security baseline**, not external independent security audit, penetration testing, real source authenticity, production tenant isolation or readiness.

The next coherent Part9 block after a scoped PASS is a bounded **tenant/security threat and abuse-case evaluation matrix** grounded in the above gaps. Scheduled CIGO Builder, Verifier, Steward and External Viewer automations remain disabled.
