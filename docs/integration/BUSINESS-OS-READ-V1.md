# Real Business OS → CIGO read-only integration v1

## Contract freeze

Business OS contract identity: `codeedge-business-os-read-model:v1`.

CIGO retains the existing `BusinessOsReadModelPort` / `BusinessOsReadModelReader` architecture. The real adapter does not bypass the R5 reader, does not accept a URL or credential from a read request, and does not write to Business OS.

Allowed v1 resource kinds are intentionally narrow: `business_profile`, `service`, `lead`, `customer`, `crm_activity`, `booking`, `inbox_summary`, and `finance_summary`. A workspace's server configuration may grant a strict subset.

## Server composition

`BusinessOsHttpReadModelPort.fromEnvironment(workspaceId)` selects the Business OS origin, key ID, bearer secret, allowed resources, timeout and bounded retry policy from `CIGO_BUSINESS_OS_READERS_JSON`. The origin must be HTTPS, except localhost development. URL credentials, query strings, fragments and path overrides are rejected.

`createBusinessOsHttpReaderFromEnvironment(...)` composes that port with the existing `BusinessOsReadModelReader`, an injected trusted read-authorization authority, and CIGO's existing AES-256-GCM cursor wrapper. The outer CIGO cursor remains actor/workspace/resource/page-size/expiry bound; the inner Business OS continuation remains opaque.

Recommended server-only configuration shape:

```json
{
  "<business-os-workspace-uuid>": {
    "baseUrl": "https://business-os.example",
    "keyId": "cigo_workspace_a",
    "secret": "32-or-more-random-characters",
    "resourceKinds": ["lead", "customer", "booking"],
    "timeoutMs": 4000,
    "retries": 1
  }
}
```

Required CIGO cursor settings:

- `CIGO_BUSINESS_OS_CURSOR_KEYS_JSON` — key ID → 32-byte base64url key.
- `CIGO_BUSINESS_OS_CURSOR_ACTIVE_KEY_ID` — active key ID; old keys can remain temporarily for rotation.

## Validation and safe failure

The adapter rejects the response unless contract version, source system, workspace, resource kind and record provenance agree with the requested scope. Each record passes the existing canonical operational-record validator. Wrong-source, cross-workspace, malformed, oversized, partial-with-cursor, unsupported-version and invalid-record responses fail closed.

Reads use GET only, an abort timeout, at most two configured retries (default one), retry only for safe transient HTTP/network cases, a bounded response body and a maximum page of 100.

## Evidence / provenance / truth

Authenticated HTTPS plus a workspace-bound Business OS service credential establishes access to the Business OS read boundary. It is **not** a semantic truth attestation and is not converted into a `VERIFIED` flag.

Returned records remain `BUSINESS_OS` operational evidence with the source record identity and source revision. They still pass through CIGO evidence intake and the existing provenance/source-attestation and truth-validation architecture before memory and analysis. The existing `TrustedSourceAuthority` receipt boundary remains fail-closed; this integration does not fabricate a receipt or mark observations as FACT merely because HTTP succeeded.

This deliberately closes the real read transport portion of the former G3 gap while leaving independent source-attestation/semantic verification and deployed identity acceptance to their own explicit gates. No CIGO → Business OS effect path is introduced.


## Remaining production acceptance gates

The repository implementation is not, by itself, production acceptance. The following remain explicit before G3 can be closed as a deployed production gate:

1. **Business OS endpoint abuse control** — the companion endpoint currently authenticates and bounds each read, but deployed per-key/per-workspace rate limiting and abuse telemetry are not yet evidenced.
2. **Database-layer tenant containment** — the Business OS security-definer projection filters every query by the requested business ID and the service credential is workspace-bound at the server boundary. A separate database-level proof should demonstrate that misuse of the CIGO database capability cannot widen tenant scope outside that trusted composition.
3. **Source authenticity authority** — authenticated transport is not an independent source-attestation receipt. CIGO now has regression coverage proving a real HTTP observation still fails `requireAttestedObservation` when no trusted receipt/authority exists.
4. **Credential lifecycle acceptance** — staging must prove grant creation, rotation and revocation for both Business OS service credentials and cursor keyrings without committing secrets.
5. **Isolated staging conformance** — exercise at least two synthetic workspaces, including positive same-workspace reads and negative cross-workspace attempts, partial/unavailable responses, cursor tamper/expiry and revocation.
6. **Operational evidence** — verify safe logging/redaction, alerting for repeated authorization failures and rollback of the integration without modifying Business OS operational data.

Until those checks are evidenced, describe this work as **implemented and exact-SHA tested read transport**, not a fully production-accepted G3 closure.
