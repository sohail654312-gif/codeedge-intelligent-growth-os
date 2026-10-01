import test from "node:test";
import assert from "node:assert/strict";
import {PostgresEvidenceStore} from "../dist/src/evidence/postgres-evidence-store.js";
// Never default to a live URL. A disposable database must be explicitly provisioned
// with the reviewed R4 migration and a least-privilege, non-owner application role.
const url=process.env.CIGO_R4_DISPOSABLE_DATABASE_URL;
const enabled=process.env.CIGO_R4_DISPOSABLE_TEST_CONFIRM==="I_CONFIRM_DISPOSABLE_ONLY" && Boolean(url);
if(process.env.CIGO_R4_REQUIRE_POSTGRES_TESTS==="true" && !enabled) throw new Error("R4_POSTGRES_TESTS_REQUIRED_NOT_SKIPPED");
if(enabled) { const parsed=new URL(url); if(parsed.pathname!=="/cigo_r4_disposable_ci" || !["localhost","127.0.0.1","::1","[::1]"].includes(parsed.hostname) || parsed.username!=="cigo_r4_app") throw new Error("R4_DISPOSABLE_DATABASE_IDENTITY_MISMATCH"); }
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

test("R4F disposable PostgreSQL schema security introspection", {skip:!enabled && "Requires explicitly confirmed disposable PostgreSQL"},async()=>{
 const {default:pg}=await import("pg");const pool=new pg.Pool({connectionString:url,max:2});
 try {
  const role=await pool.query("SELECT current_user AS name, rolbypassrls AS bypass, rolsuper AS super FROM pg_roles WHERE rolname=current_user");
  assert.equal(role.rows[0].bypass,false);assert.equal(role.rows[0].super,false);
  const tables=await pool.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='cigo' AND c.relname=ANY($1::text[])",[["evidence","intake_requests","audit_events"]]);
  assert.equal(tables.rows.length,3);for(const row of tables.rows){assert.equal(row.relrowsecurity,true);assert.equal(row.relforcerowsecurity,true);assert.notEqual(row.owner,role.rows[0].name);}
  const privileges=await pool.query("SELECT has_table_privilege(current_user,'cigo.evidence','UPDATE') AS upd,has_table_privilege(current_user,'cigo.evidence','DELETE') AS del,has_table_privilege(current_user,'cigo.evidence','TRUNCATE') AS trunc");
  assert.deepEqual(Object.values(privileges.rows[0]),[false,false,false]);
  const constraints=await pool.query("SELECT conname FROM pg_constraint WHERE connamespace='cigo'::regnamespace");assert.ok(constraints.rows.length>=3);
 } finally {await pool.end();}
});

test("R4G disposable PostgreSQL immutable table privileges and cross-tenant fail-closed reads", {skip:!enabled && "Requires confirmed disposable PostgreSQL"},async()=>{
 const {default:pg}=await import("pg");const pool=new pg.Pool({connectionString:url,max:2});
 try {
  for(const table of ["evidence","intake_requests","audit_events"]){
   const result=await pool.query("SELECT has_table_privilege(current_user,$1,'UPDATE') AS upd,has_table_privilege(current_user,$1,'DELETE') AS del,has_table_privilege(current_user,$1,'TRUNCATE') AS trunc",["cigo."+table]);
   assert.equal(result.rows[0].upd,false);assert.equal(result.rows[0].del,false);assert.equal(result.rows[0].trunc,false);
  }
  const store=new PostgresEvidenceStore(pool);
  assert.equal(await store.lookupIntake("workspace:unprovisioned:one","missing"),undefined);
  assert.equal(await store.lookupIntake("workspace:unprovisioned:two","missing"),undefined);
 }finally{await pool.end();}
});
