-- Synthetic local/CI fixture only; never production role provisioning.
CREATE ROLE cigo_source_issuer_a LOGIN PASSWORD 'source_issuer_a_ephemeral_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE cigo_source_verifier_a LOGIN PASSWORD 'source_verifier_a_ephemeral_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE cigo_source_verifier_b LOGIN PASSWORD 'source_verifier_b_ephemeral_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA cigo TO cigo_source_issuer_a,cigo_source_verifier_a,cigo_source_verifier_b;
GRANT SELECT,INSERT ON cigo.source_observation_identities,cigo.source_receipts TO cigo_source_issuer_a;
GRANT SELECT ON cigo.source_receipt_revocations TO cigo_source_issuer_a;
GRANT SELECT ON cigo.source_receipts,cigo.source_receipt_revocations TO cigo_source_verifier_a,cigo_source_verifier_b;
CREATE POLICY source_identities_issuer_a ON cigo.source_observation_identities TO cigo_source_issuer_a
 USING(workspace_id='workspace:a') WITH CHECK(workspace_id='workspace:a');
CREATE POLICY source_receipts_issuer_a ON cigo.source_receipts TO cigo_source_issuer_a
 USING(workspace_id='workspace:a') WITH CHECK(workspace_id='workspace:a');
CREATE POLICY source_revocations_issuer_a ON cigo.source_receipt_revocations FOR SELECT TO cigo_source_issuer_a USING(workspace_id='workspace:a');
CREATE POLICY source_receipts_verifier_a ON cigo.source_receipts FOR SELECT TO cigo_source_verifier_a USING(workspace_id='workspace:a');
CREATE POLICY source_revocations_verifier_a ON cigo.source_receipt_revocations FOR SELECT TO cigo_source_verifier_a USING(workspace_id='workspace:a');
CREATE POLICY source_receipts_verifier_b ON cigo.source_receipts FOR SELECT TO cigo_source_verifier_b USING(workspace_id='workspace:b');
CREATE POLICY source_revocations_verifier_b ON cigo.source_receipt_revocations FOR SELECT TO cigo_source_verifier_b USING(workspace_id='workspace:b');
