# M-03 — Knowledge asOf semantics (scoped correction)

`queryBusinessKnowledge` selects CURRENT against the latest stored revision across the available memory ledger; HISTORY returns all recorded revisions. The `asOf` input is an **evidence freshness reference instant only**, not a snapshot cutoff or an assertion that a memory revision was known at that time. The result explicitly returns `asOfSemantics: "EVIDENCE_FRESHNESS_ONLY"`. A revision created after `asOf` is not hidden; it receives the `REVISION_POSTDATES_AS_OF` limitation. Evidence observed after `asOf` is separately marked freshness `UNKNOWN`.

Therefore an early asOf cannot be used to reconstruct an historical state, and neither current nor history results prove historical knowledge or FACT verification. For an actual historical snapshot, future work needs trusted recorded-at ordering, versioned provenance, durable revision filtering and a separately specified API. Existing tenant checks, evidence uncertainty and bounded pagination remain unchanged.

Evidence: `test/knowledge-view.test.mjs` exercises prior and superseded revisions against an earlier asOf and the explicit result discriminator. This is only the original M-03 semantic clarity correction; G2/G6 production trust/durability remain OPEN, no historical reconstruction or production effects are claimed.
