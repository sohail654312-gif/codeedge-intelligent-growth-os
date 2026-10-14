-- CIGO intelligence/control audit only. Does not enable approval HTTP endpoints or effects.
CREATE TABLE cigo.approval_decisions (
 workspace_id text NOT NULL,record_id text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,record_id),CHECK(payload ?& ARRAY['workspaceId','approvalId','kind','status']),CHECK(payload->>'workspaceId'=workspace_id AND payload->>'approvalId'=record_id),
 CHECK(payload->>'kind'='HUMAN_APPROVAL_DECISION' AND payload->>'status'='RECORDED_NON_EXECUTABLE')
);
CREATE TABLE cigo.approval_revocations (
 workspace_id text NOT NULL,record_id text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,record_id),FOREIGN KEY(workspace_id,record_id) REFERENCES cigo.approval_decisions(workspace_id,record_id),
 CHECK(payload ?& ARRAY['workspaceId','approvalId','actorId','revokedAt']),CHECK(payload->>'workspaceId'=workspace_id AND payload->>'approvalId'=record_id)
);
CREATE TABLE cigo.denied_actions (
 workspace_id text NOT NULL,record_id text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(workspace_id,record_id),CHECK(payload->>'workspaceId'=workspace_id AND payload->>'idempotencyKey'=record_id),
 CHECK(payload->>'kind'='BUSINESS_OS_ACTION_REQUEST_DENIED' AND payload->>'status'='DENIED_NO_EFFECT'),
 CHECK(payload @> '{"requestedEffects":0,"performedEffects":0,"dispatched":false,"providerInvoked":false}'::jsonb)
);
CREATE TABLE cigo.control_audit (
 workspace_id text NOT NULL,event_kind text NOT NULL CHECK(event_kind IN ('APPROVAL','REVOCATION','DENIAL')),
 record_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,event_kind,record_id)
);
ALTER TABLE cigo.approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cigo.approval_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE cigo.approval_revocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cigo.approval_revocations FORCE ROW LEVEL SECURITY;
ALTER TABLE cigo.denied_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cigo.denied_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE cigo.control_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE cigo.control_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON cigo.approval_decisions,cigo.approval_revocations,cigo.denied_actions,cigo.control_audit FROM PUBLIC;
-- No default policies/grants. Owner must bind separate non-owner server roles to fixed
-- workspace IDs, SELECT/INSERT only. No UPDATE, DELETE, TRUNCATE or BYPASSRLS grants.
