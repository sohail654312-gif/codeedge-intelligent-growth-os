# Part 3 Block 2 — Bounded Memory Retrieval and Knowledge Views

`queryBusinessKnowledge(context, memory, ledger, query)` authorizes reads through both tenant-bound stores before projection. Queries require an explicit `asOf` timestamp and enforce limit 1–100 (default 20), nonnegative integer offset, optional key/kind and CURRENT/HISTORY view. CURRENT chooses latest appended revision by key; HISTORY preserves prior entries and supersession links. Filtering occurs before pagination, and the response includes total and nextOffset when needed. Returned data is cloned.

Every knowledge view references existing evidence fingerprints and includes source, external reference, observedAt, ingestedAt, UNVERIFIED verification and relative freshness. Optional maxEvidenceAgeMs marks older evidence STALE; missing or invalid/future observation timestamps yield explicit limitations. A missing lineage entry yields EVIDENCE_MISSING, never an invented FACT. ASSUMPTION/ANALYSIS remain interpretive and UNVERIFIED. The underlying Part3 Block1 FACT gate stays closed.

This is an in-memory deterministic read model, not a production identity/authorization service, durable store, live Business OS adapter, or claim of independent truth verification. Production gates remain separately tracked.
