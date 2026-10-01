# CIGO Part 2 — Integration Contracts

## Contract surface

`src/integration/contracts.ts` defines `AuthorizedWorkspaceContext`, `SourceRecordReference`, `OperationalRecord`, `ReadRequest`, `ReadResult`, `ReadError` and `ValidationResult`. `src/integration/source-reader.ts` defines the provider-neutral asynchronous `SourceReader` (`readonly sourceSystem` and `read`). `src/integration/index.ts` is the public integration export surface. Implementations use `.js` ESM specifiers in TypeScript.

- `AuthorizedWorkspaceContext`: server-derived `workspaceId`, nonblank `actorId`, `authorizedAt`. A client claim is insufficient. Authentication/policy enforcement belongs upstream; a demo reader cannot mint authority.
- `ReadRequest`: authorized context, expected `sourceSystem`, nonblank `resourceKind`, optional opaque adapter cursor, optional positive integer limit. A reader must reject requests outside its server-bound workspace/source.
- `OperationalRecord`: scoped `workspaceId`, source system, nonblank external reference, optional source version, resource kind, JSON-safe value and observed timestamp. A record is a projection, not a CIGO-owned operational record or automatically verified fact.
- `ReadResult`: zero or more validated records; `fetchedAt`; `COMPLETE` or `PARTIAL`; `errors` (code, safe message, retryable); optional `nextCursor`. `PARTIAL` records require caveats in downstream use.

## Demo reader implementation and conformance

Construct `new InMemorySourceReader(sourceSystem, trustedWorkspaceId, seedRecords, optionalClock)`. Its source/tenant binding must be supplied by the trusted application composition root, not by arbitrary user input. A request with missing context, wrong tenant/source, unsafe limit or cursor fails with no records. A malformed or cross-workspace seed is excluded and produces `PARTIAL` with a generic error; it never exposes the foreign value. The reader snapshots its seeds and clones output, paginates valid records with decimal-offset cursors scoped by the reader's tenant/source checks, and performs no external effects. Offsets are an in-memory implementation detail and must not be assumed by future adapters; a production adapter should use suitably scoped, opaque cursors.

`test/integration-evidence.test.mjs` tests request validation, source/tenant rejection, per-record provenance, pagination/partial failures, normalization/fingerprints, demo/read-contract behavior and Part 1 ownership/approval boundaries. Future live adapters must run the same conformance scenarios in addition to their connector-specific tests. The current block does not establish live Business OS connectivity, credential handling, real authentication or end-to-end provider parity.

## Separation and handoff

Business OS owns operational truth, permissions and provider execution; CIGO consumes least-privilege projections and records intelligence evidence. A source version/value change produces a new observation fingerprint; consumers retain historical observations rather than destructively replacing facts. Use separate verification evidence before promoting source observations to `FACT`. AI/system output must not self-approve `DECISION` or `ACTION`; require independently evidenced authorization and downstream controlled execution. No database schema or provider integrations are introduced in this block.
