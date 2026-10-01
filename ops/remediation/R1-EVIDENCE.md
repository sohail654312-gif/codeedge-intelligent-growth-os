# R1 manual implementation evidence

Status: IMPLEMENTED_PENDING_INDEPENDENT_REVIEW. R1 is not independently closed and G1/G2/G4 remain OPEN.

Branch: remediation/r1-truth-authority; draft PR #3. Implementation/test HEAD: 2f87c1033c13689502f01f394b6f969a89f5bb65. Exact-commit GitHub Actions run 36867821180, job 110387672619: completed SUCCESS; Install and Verify steps SUCCESS. The repository package.json wires Verify to typecheck and npm test (build plus the enumerated suites). This record does not assert live auth, attestation, approval, storage or deployment.

Changes: src/domain/truth/validation.ts defaults to rejecting claimed VERIFIED evidence and claimed approved authority without an explicitly supplied trusted context. promoteAssumption requires trusted verification and validates resulting FACT. test/truth.test.mjs adds forged VERIFIED/approval regressions. TrustedTruthContext must be created from authenticated server-side source/approval infrastructure, NEVER from caller payload, AI output or an untrusted callback. Its current shape is a reference contract, not an authentication or non-forgeable capability boundary. R2/R3/R6 must replace or strictly contain this trust injection before production use.

Review needed: independent reviewer must check all call sites, positive/negative trust behavior, source authenticity, approval identity and backward compatibility; verify actual test logs and absence of bypass. No self-certification. No ops/STATE.json or ops/HANDOFF.md modifications. No live effects.
