# CIGO Part 2 — Data Access and Evidence Boundary

CIGO consumes **authorized, read-only operational projections**, not operational stores. Business OS remains the owner of CRM, bookings, conversations, automation, finance, provider execution and operational audit truth. MVP remains protected. CIGO owns only its normalized evidence, lineage and later intelligence artifacts. Referencing a Business OS record does not transfer ownership.

## Ingestion sequence

1. An authenticated server-side integration supplies `AuthorizedWorkspaceContext` (`workspaceId`, `actorId`, `authorizedAt`). A browser-supplied workspace identifier is not authorization.
2. `SourceReader.read(ReadRequest)` validates actor/context/source/resource/limit and checks its own bound workspace and source before returning a projection.
3. **Each source record** is checked by `validateOperationalRecord` for matching workspace and nonempty source system, external reference, resource kind and observation timestamp. An adapter also rejects source mismatches. Invalid/foreign records are excluded, with generic error codes and `PARTIAL` status. No foreign values/references are returned.
4. Only validated observations reach `normalizeOperationalRecord` and `fingerprintOperationalRecord`. Normalization preserves workspace, source, external reference, optional version, kind, value and observed time; it sorts object keys recursively without reinterpreting the content as verified truth.
5. A fingerprint is `cigo:observation:v1:` plus SHA-256 of the canonical JSON observation with an explicit schema marker. It includes the tenant, source, reference, version (when supplied), kind, value and `observedAt`. Reordering object keys yields the same fingerprint, but a value/version/observation change yields a different fingerprint. It is an **identity/deduplication key, not proof of authenticity or verification**.
6. Later truth promotion uses separate verification and lineage checks. A read result—even `COMPLETE`—is not itself a verified `FACT`, `DECISION` or `ACTION`.

## Completeness and failure

`ReadResult` carries records, `fetchedAt`, `COMPLETE` or `PARTIAL`, non-sensitive `ReadError` codes and an optional page cursor. `PARTIAL` must never be presented as comprehensive evidence. A failed request returns no records and `PARTIAL`; invalid records are quarantined with explicit errors rather than silently treated as valid. Clients preserve errors, freshness and missing-data limitations in analysis. Retryability is explicit; this in-memory adapter uses non-retryable validation errors.

## Demo / sandbox and production parity

`InMemorySourceReader` is a workspace-bound, read-only deterministic demo adapter implementing the same `SourceReader` as a future live, authorized read-model adapter. It snapshots seeds, clones returned records, validates every record and supports bounded cursor pagination (default/max 100). Its clock can be injected for deterministic tests. The input dataset must be JSON-safe. A foreign seed is quarantined; a request for another workspace fails closed. Production adapters must satisfy the same boundary contract and conformance tests; this block does **not** implement or assert live provider connectivity.

## No effect or authority escalation

Reading evidence never authorizes mutation. CIGO does not write Business OS/MVP tables, call provider SDKs from the intelligence layer, execute operational effects, post finance entries, or treat AI proposals as human approval. Sensitive effects remain **proposal → policy check → human approval → authorized Business OS action → audit evidence**. Demo mode follows the same restrictions. Provider-specific adapters belong behind separately authorized interfaces, not the domain or evidence kernel.
