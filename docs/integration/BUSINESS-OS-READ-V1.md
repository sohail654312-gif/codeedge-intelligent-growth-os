# Business OS → CIGO read-only integration v1

Contract: `codeedge-business-os-read-model:v1`. **PASS for repository and synthetic staging acceptance; production release remains unapproved.** Business OS remains the operational system of record; CIGO consumes evidence, provenance, truth, memory and analysis. There is no action/effect path to Business OS.

## Trusted server composition

`BusinessOsHttpReadModelPort.fromEnvironment(workspaceId)` selects origin, key, bearer secret, resource allowlist, timeout and bounded retries from server-owned `CIGO_BUSINESS_OS_READERS_JSON`. Request input cannot choose endpoint/credentials. The existing reader authorizes before networking and snapshots request scope before asynchronous authorization. The v1 resources are `business_profile`, `service`, `lead`, `customer`, `crm_activity`, `booking`, `inbox_summary`, `finance_summary`; configuration may grant a subset.

Server-only example (placeholders):

```json
{
  "<business-os-workspace-uuid>": {
    "baseUrl": "https://business-os.example",
    "keyId": "<server-selected-key-id>",
    "secret": "<random-secret-at-least-32-characters>",
    "resourceKinds": ["lead", "customer", "booking"],
    "timeoutMs": 4000,
    "retries": 1
  }
}
```

`CIGO_BUSINESS_OS_CURSOR_KEYS_JSON` maps IDs to 32-byte base64url keys; `CIGO_BUSINESS_OS_CURSOR_ACTIVE_KEY_ID` selects issuance. The existing outer AEAD cursor binds actor/workspace/resource/page-size/expiry and wraps opaque Business OS continuation. Business OS preserves the original microsecond database sort timestamp to avoid repeated rows.

Use `createAttestedBusinessOsHttpReader({workspaceId, env, authorization, receiptPool, dependencies})`. Injected authorization, optional fetch (including legitimate protected-preview access), clock and pool belong to the trusted server. Never expose these dependencies, receipt registration or a caller-provided reader as an application API. The production receipt pool must be tenant-pinned with reviewed RLS/issuer privileges, not an administrator pool. Separate verifiers use `createPostgresSourceAuthority(pool, workspaceId)` with SELECT-only access.

## Validation and durable source authority

GET transport uses a timeout covering headers/body, incremental 8 MiB body bounds, pages of at most 100, and at most two configured transient retries. Contract/source/workspace/resource/reference fields are strict. Incoming VERIFIED, FACT, approval or authority claims, mismatched provenance, stalled/oversized/malformed responses and invalid cursors fail closed.

Only complete, error-free observations from the authenticated and validated adapter register receipts. The trusted composition hashes the exact normalized record and entire page; binds workspace/source/external reference/fingerprint/fetchedAt/adapter ID/random unique receipt ID/page digest/expiry; and atomically persists identities and receipts. Duplicate identities and conflicting same-identity/version fingerprints fail; partial/error pages get no receipt. Durable failure or ambiguous commit emits no records, receipt or cursor. Default lifetime is 15 minutes, bounded to 1 second–24 hours.

The additive [receipt schema](../architecture/sql/BUSINESS-OS-SOURCE-RECEIPTS.sql) extends existing CIGO PostgreSQL storage with forced-RLS identities, receipts and append-only revocations, granting nobody access by default. Provision tenant-fixed issuer SELECT/INSERT and SELECT-only verifier policies through trusted server infrastructure. Application roles lack UPDATE/DELETE/TRUNCATE, ownership, BYPASSRLS and role management. The [disposable roles](../architecture/sql/BUSINESS-OS-DISPOSABLE-RECEIPT-ROLES.sql) are CI-only examples; their passwords must never be used in production. No request-controlled session setting selects tenancy.

`attestationFor(page, record)` accepts only an exact page object issued by that composition and rechecks page/record bindings through existing `requireAttestedObservation`. The authority verifies exact stored payload, tenant/source/adapter, application and database expiry, and absence of revocation. Unknown, copied-field, tampered, mismatched, revoked, expired receipts and outages fail closed. Restarted verification reads durable state. Repeated verification of the same exact unexpired observation is intentionally idempotent: receipts confer provenance only, never effects/approval rights. Scope changes, revocation and expiry deny replay.

## Evidence → provenance → truth → memory → analysis

HTTP success without a trusted receipt still fails attestation. A durable receipt permits only the exact intended observation through provenance. Source authenticity does not establish semantic truth: intake remains UNVERIFIED unless independently validated, arbitrary memory values remain ASSUMPTION, and unverified analysis remains non-actionable. No caller VERIFIED/FACT/approval/authority flag is accepted. No provenance shortcut trusts HTTP status. Existing R0–R9 safeguards and frozen PR #6 remain intact.

## Exact implementation acceptance — 2026-10-07

Tested CIGO implementation `f5b09214051550f4f4407aca17dc1a59d6c7887a`; Business OS implementation `e5a3c7d64940c79558c9318d446237340a32d620`. Documentation-only descendants require final exact-head CI, recorded in the PR acceptance report.

| Evidence | Result |
| --- | --- |
| [CIGO CI 37652362206](https://github.com/sohail654312-gif/codeedge-intelligent-growth-os/actions/runs/37652362206) | PASS: 270/270, zero skips; governance, typecheck/build, dependency/provenance checks |
| [R4 disposable PostgreSQL 37652362181](https://github.com/sohail654312-gif/codeedge-intelligent-growth-os/actions/runs/37652362181) | PASS: 14/14 PostgreSQL and 270/270 unit, zero skips |
| [Business OS CI 37652747567](https://github.com/sohail654312-gif/codeedge-business-os/actions/runs/37652747567) | PASS: schema/drift, lint, typecheck, 751 unit + 342 security + 4 E2E, build |
| [Disposable ERPNext 37653107373](https://github.com/sohail654312-gif/codeedge-business-os/actions/runs/37653107373) | PASS: separately covers provider smoke intentionally skipped in ordinary CI |
| Protected cross-system HTTP | PASS: actual adapter → protected Preview → restricted hosted projection → validation → durable receipt → provenance/memory/analysis |
| Hosted migration / tenant boundary | PASS: 33/33 migrations; 40/40 public tables force RLS; direct operational/grant/rate-table SELECT denied |

Protected deployment `dpl_BiWkCsCoQCgs7x9WWGaH7DxNdzCv`, [Preview origin](https://codeedge-business-os-test-ebo73f7y3-codeedge.vercel.app), project `codeedge-business-os-test`, region `bom1`, exact Business OS SHA above. SSO Deployment Protection remains enabled (`all_except_custom_domains`). Legitimate temporary Vercel access was kept private and exchanged for an origin-scoped cookie; protection settings were not weakened.

The adapter was server-run from CIGO's compiled integration with receipts in a separate disposable PostgreSQL instance; this is not a claim of a deployed CIGO production service. Business OS projected two newly provisioned synthetic workspaces in dedicated test Supabase project `kffcywicqrtxdwgyvhvk`; no real customer/provider records changed. [Sanitized HTTP evidence](evidence/BUSINESS-OS-READ-2026-10-07.json) records all 12 passing groups and request IDs/statuses: same tenant, pagination, cross-tenant denial, unsupported resource, invalid bearer, revoked grant, old → revoked → rotated key, eight-resource minimisation, HTTP 429, cursor tamper/scope/limit binding, authentic expiry/retained-old-key rotation and denied direct DB access.

Adversarial unit and actual least-privilege PostgreSQL tests cover all receipt fields, complete-page mutation, partial/error pages, caller claims, duplicate/conflicting identities, store outage, transaction rollback, durable restart, expiry and admin revocation. Stream tests cover stalled and oversized chunked HTTP bodies. No historical test count substitutes for these runs.

## Operations, revocation and rollback

Reviewed Preview logs contain authorization/rate-limit/source-unavailable events with safe request/scope identifiers. The inspected window included rehearsals: 4 authorization, 2 rate-limit, 4 source-unavailable events; no tested secrets or synthetic private markers. Provider credentials and record content are not logged. **No Vercel log drain is configured; external alert delivery remains untested.**

Service keys require both the Business OS server map and private DB fingerprint grant. Provision a new random key/grant, deploy a map retaining both, switch CIGO's server config and prove the new key. Disable/revoke the old DB grant immediately, remove its mapping and redeploy. DB denial protects existing immutable deployments; environment edits affect new deployments only. Staging proved old success → safe 503 after revocation → rotated success. Revoke remaining `acceptance_*` synthetic grants when Preview review ends.

Rotate inner Business OS and outer CIGO cursor keys independently: add a fresh 32-byte key, change active ID, deploy, retain the previous decrypt key for the maximum cursor lifetime, then remove it. Early removal deliberately invalidates outstanding cursors; clients restart pagination. Protected HTTP rejected authentic expiry and accepted a retained-old-key cursor.

Revoke receipts by trusted administrator INSERT into `cigo.source_receipt_revocations`; never edit receipts or grant issuer/verifier revoker privileges. Retain append-only evidence. The authority rejects revocation/expiry after restart.

Disable by revoking Business OS private grants, removing server maps and stopping this reader composition. Roll back the integration through normal Git/redeployment history with grants disabled until conformance passes. Neither requires changing Business OS operational/customer data or dropping evidence tables. Frozen main/PR #6 stay untouched. No merge, self-approval, production effect, customer message/call, financial action or Builder/Verifier/Steward/Remediation activation occurred.

## Remaining external production gates

Repository/staging G3 read integration is PASS. Independent human review and merge/release approval remain required. Provision/accept production server identities, restricted database credentials and tenant-pinned receipt issuer/verifier policies in their actual environment. Decide/configure/test external alert delivery if required. These gates do not reopen demonstrated protected-preview, tenant, rate-limit, lifecycle or durable provenance acceptance.
