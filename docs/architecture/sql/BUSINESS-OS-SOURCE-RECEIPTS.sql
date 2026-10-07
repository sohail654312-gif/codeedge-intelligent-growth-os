-- Additive source-receipt storage; no operational data or R4 evidence semantics change.
-- Apply as migration owner to an explicitly authorized CIGO database only.
-- No default policies/grants: server-selected tenant/issuer/verifier roles must be provisioned.
CREATE TABLE cigo.source_observation_identities (
 workspace_id text NOT NULL, adapter_id text NOT NULL, source_system text NOT NULL CHECK(source_system='BUSINESS_OS'),
 external_reference text NOT NULL, resource_kind text NOT NULL, source_version text NOT NULL, fingerprint text NOT NULL,
 PRIMARY KEY(workspace_id,adapter_id,source_system,external_reference,resource_kind,source_version),
 CHECK(length(workspace_id)>0 AND length(source_version)>0 AND length(fingerprint)>0)
);
CREATE TABLE cigo.source_receipts (
 workspace_id text NOT NULL, receipt_id uuid NOT NULL, attestation jsonb NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(workspace_id,receipt_id),
 CHECK(attestation->>'workspaceId'=workspace_id AND attestation->>'receiptId'=receipt_id::text),
 CHECK(attestation->>'sourceSystem'='BUSINESS_OS' AND attestation->>'adapterId'='business-os-http-read-model:v1'),
 CHECK(attestation ?& ARRAY['workspaceId','receiptId','sourceSystem','adapterId','fingerprint','fetchedAt','externalReference','pageFingerprint','expiresAt']),
 CHECK((attestation->>'expiresAt')::timestamptz=expires_at)
);
CREATE TABLE cigo.source_receipt_revocations (
 workspace_id text NOT NULL, receipt_id uuid NOT NULL, revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,receipt_id), FOREIGN KEY(workspace_id,receipt_id) REFERENCES cigo.source_receipts(workspace_id,receipt_id)
);
ALTER TABLE cigo.source_observation_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cigo.source_observation_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE cigo.source_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cigo.source_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE cigo.source_receipt_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cigo.source_receipt_revocations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON cigo.source_observation_identities,cigo.source_receipts,cigo.source_receipt_revocations FROM PUBLIC;
-- Issuer: SELECT/INSERT identities and receipts, SELECT revocations; server-only tenant-pinned RLS.
-- Verifier: SELECT receipts/revocations only. Revoker: INSERT revocations through trusted admin.
-- No application UPDATE, DELETE, TRUNCATE, table ownership, BYPASSRLS or role-management privileges.
