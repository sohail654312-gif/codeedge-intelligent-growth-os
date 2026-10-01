import test from "node:test";
import assert from "node:assert/strict";
import {PostgresEvidenceStore} from "../dist/src/evidence/postgres-evidence-store.js";
// Never default to a live URL. A disposable database must be explicitly provisioned
// with the reviewed R4 migration and a least-privilege, non-owner application role.
const url=process.env.CIGO_R4_DISPOSABLE_DATABASE_URL;
const enabled=process.env.CIGO_R4_DISPOSABLE_TEST_CONFIRM==="I_CONFIRM_DISPOSABLE_ONLY" && Boolean(url);
test("R4C real PostgreSQL: forced RLS denies unprovisioned application role", {skip:!enabled && "Requires explicitly confirmed disposable PostgreSQL URL and reviewed migration"}, async()=>{
 const {default:pg}=await import("pg");
 const pool=new pg.Pool({connectionString:url, max:2});
 try {
  const role=await pool.query("SELECT current_user AS name, rolbypassrls AS bypass FROM pg_roles WHERE rolname=current_user");
  assert.equal(role.rows[0].bypass,false,"BYPASSRLS role is prohibited");
  const store=new PostgresEvidenceStore(pool);
  const receipt=await store.lookupIntake("workspace:unprovisioned","nonexistent");
  assert.equal(receipt,undefined);
  // No permissive policy is shipped. The app role must not be able to insert.
  await assert.rejects(store.commitIntake({workspaceId:"workspace:unprovisioned",idempotencyKey:"deny-test",requestDigest:"deny",observations:[{workspaceId:"workspace:unprovisioned",fingerprint:"deny",observation:{workspaceId:"workspace:unprovisioned",sourceSystem:"BUSINESS_OS",externalReference:"deny",resourceKind:"lead",value:{},observedAt:"2026-10-01T00:00:00Z"},verification:"UNVERIFIED"}]}));
 } finally {await pool.end();}
});
