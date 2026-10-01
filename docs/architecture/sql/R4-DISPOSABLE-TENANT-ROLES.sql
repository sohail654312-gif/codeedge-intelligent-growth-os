-- DISPOSABLE CI ONLY. Never apply this synthetic-role fixture to a production database.
-- Database owner pins each separate LOGIN role to exactly one tenant in immutable RLS
-- policy expressions. No caller-set GUC, SET ROLE membership, or BYPASSRLS.
CREATE ROLE cigo_r4_tenant_a LOGIN PASSWORD 'r4_tenant_a_ephemeral_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE cigo_r4_tenant_b LOGIN PASSWORD 'r4_tenant_b_ephemeral_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA cigo TO cigo_r4_tenant_a,cigo_r4_tenant_b;
GRANT SELECT,INSERT ON cigo.intake_requests,cigo.evidence,cigo.audit_events TO cigo_r4_tenant_a,cigo_r4_tenant_b;
CREATE POLICY r4_tenant_a_intake_select ON cigo.intake_requests FOR SELECT TO cigo_r4_tenant_a USING (workspace_id='workspace:a');
CREATE POLICY r4_tenant_a_intake_insert ON cigo.intake_requests FOR INSERT TO cigo_r4_tenant_a WITH CHECK (workspace_id='workspace:a');
CREATE POLICY r4_tenant_b_intake_select ON cigo.intake_requests FOR SELECT TO cigo_r4_tenant_b USING (workspace_id='workspace:b');
CREATE POLICY r4_tenant_b_intake_insert ON cigo.intake_requests FOR INSERT TO cigo_r4_tenant_b WITH CHECK (workspace_id='workspace:b');
CREATE POLICY r4_tenant_a_evidence_select ON cigo.evidence FOR SELECT TO cigo_r4_tenant_a USING (workspace_id='workspace:a');
CREATE POLICY r4_tenant_a_evidence_insert ON cigo.evidence FOR INSERT TO cigo_r4_tenant_a WITH CHECK (workspace_id='workspace:a' AND verification='UNVERIFIED');
CREATE POLICY r4_tenant_b_evidence_select ON cigo.evidence FOR SELECT TO cigo_r4_tenant_b USING (workspace_id='workspace:b');
CREATE POLICY r4_tenant_b_evidence_insert ON cigo.evidence FOR INSERT TO cigo_r4_tenant_b WITH CHECK (workspace_id='workspace:b' AND verification='UNVERIFIED');
CREATE POLICY r4_tenant_a_audit_select ON cigo.audit_events FOR SELECT TO cigo_r4_tenant_a USING (workspace_id='workspace:a');
CREATE POLICY r4_tenant_a_audit_insert ON cigo.audit_events FOR INSERT TO cigo_r4_tenant_a WITH CHECK (workspace_id='workspace:a');
CREATE POLICY r4_tenant_b_audit_select ON cigo.audit_events FOR SELECT TO cigo_r4_tenant_b USING (workspace_id='workspace:b');
CREATE POLICY r4_tenant_b_audit_insert ON cigo.audit_events FOR INSERT TO cigo_r4_tenant_b WITH CHECK (workspace_id='workspace:b');
