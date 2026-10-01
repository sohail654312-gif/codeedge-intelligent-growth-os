-- R4 reference migration: apply ONLY to a separately authorized disposable database after review.
-- Database connection role must not own these tables or possess BYPASSRLS.
CREATE SCHEMA IF NOT EXISTS cigo;
CREATE TABLE cigo.evidence (
 workspace_id text NOT NULL, fingerprint text NOT NULL, source_system text NOT NULL,
 external_reference text NOT NULL, resource_kind text NOT NULL, source_version text,
 observation jsonb NOT NULL, observed_at timestamptz NOT NULL, ingested_at timestamptz NOT NULL DEFAULT now(),
 verification text NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification = 'UNVERIFIED'),
 supersedes text, receipt_reference text,
 PRIMARY KEY (workspace_id,fingerprint),
 FOREIGN KEY (workspace_id,supersedes) REFERENCES cigo.evidence(workspace_id,fingerprint),
 CHECK (length(workspace_id)>0 AND length(fingerprint)>0 AND length(source_system)>0 AND length(external_reference)>0)
);
CREATE TABLE cigo.intake_requests (
 workspace_id text NOT NULL, idempotency_key text NOT NULL, request_digest text NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (workspace_id,idempotency_key), CHECK(length(idempotency_key)>0 AND length(request_digest)>0)
);
CREATE TABLE cigo.audit_events (
 workspace_id text NOT NULL, event_id text NOT NULL, idempotency_key text NOT NULL,
 event_type text NOT NULL, payload_digest text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,event_id),
 FOREIGN KEY(workspace_id,idempotency_key) REFERENCES cigo.intake_requests(workspace_id,idempotency_key)
);
ALTER TABLE cigo.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE cigo.evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE cigo.intake_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cigo.intake_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE cigo.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cigo.audit_events FORCE ROW LEVEL SECURITY;
-- No permissive policies/grants are installed: access fails closed until a reviewed
-- server-derived tenant setting, least-privilege role, and transaction-scoped RLS policies exist.
-- Immutable history: no application role may receive UPDATE, DELETE or TRUNCATE privileges.
