import test from "node:test";
import assert from "node:assert/strict";
import {PostgresEvidenceStore} from "../dist/src/evidence/postgres-evidence-store.js";
const workspaceId="workspace:a", observation={workspaceId,sourceSystem:"BUSINESS_OS",externalReference:"lead:1",resourceKind:"lead",value:{status:"new"},observedAt:"2026-10-01T12:00:00Z"};
const input={workspaceId,idempotencyKey:"request:1",requestDigest:"digest:1",observations:[{workspaceId,fingerprint:"fingerprint:1",observation,verification:"UNVERIFIED"}]};
function fake({failAt,existing}={}) {const calls=[];let released=false;return {calls,get released(){return released},pool:{connect:async()=>({query:async(sql,params=[])=>{calls.push({sql,params});if(failAt&&(failAt==="COMMIT"?sql==="COMMIT":sql.includes(failAt)))throw Error("INJECTED_FAILURE");if(sql.includes("ON CONFLICT (workspace_id,idempotency_key)"))return {rows:existing?[]:[{request_digest:input.requestDigest}]};if(sql.includes("SELECT request_digest,result"))return {rows:existing?[{request_digest:input.requestDigest,result:existing}]:[]};if(sql.includes("SELECT result FROM"))return {rows:existing?[{result:existing}]:[]};return {rows:[]}},release:()=>{released=true}})}}}
test("R4B transaction uses parameterized inserts, audit and commit before receipt",async()=>{const f=fake(),receipt=await new PostgresEvidenceStore(f.pool).commitIntake(input);assert.equal(receipt.status,"COMMITTED");assert.ok(f.calls.some(c=>c.sql.startsWith("BEGIN ISOLATION LEVEL SERIALIZABLE")));assert.ok(f.calls.some(c=>c.sql.includes("cigo.audit_events")));assert.equal(f.calls.at(-1).sql,"COMMIT");assert.ok(f.calls.every(c=>!c.sql.includes("request:1")));assert.equal(f.released,true)});
test("R4B audit failure rolls back and does not acknowledge",async()=>{const f=fake({failAt:"cigo.audit_events"});await assert.rejects(new PostgresEvidenceStore(f.pool).commitIntake(input),/INJECTED_FAILURE/);assert.equal(f.calls.at(-1).sql,"ROLLBACK");assert.equal(f.released,true)});
test("R4B lost COMMIT acknowledgement fails unknown rather than success",async()=>{const f=fake({failAt:"COMMIT"});await assert.rejects(new PostgresEvidenceStore(f.pool).commitIntake(input),/DURABLE_COMMIT_OUTCOME_UNKNOWN/);assert.equal(f.released,true)});
test("R4B replay reads existing receipt without writing new evidence",async()=>{const receipt={workspaceId,idempotencyKey:input.idempotencyKey,requestDigest:input.requestDigest,fingerprints:["fingerprint:1"],status:"COMMITTED"};const f=fake({existing:receipt});assert.deepEqual(await new PostgresEvidenceStore(f.pool).commitIntake(input),receipt);assert.ok(!f.calls.some(c=>c.sql.includes("INSERT INTO cigo.evidence")))});
test("R4B rejects mismatched tenant before acquiring connection",async()=>{const f=fake();await assert.rejects(new PostgresEvidenceStore(f.pool).commitIntake({...input,observations:[{...input.observations[0],workspaceId:"workspace:b"}]}),/INVALID_DURABLE_INTAKE/);assert.equal(f.calls.length,0)});

test("R4C reconcile unknown COMMIT using a fresh connection and reject conflicting receipt",async()=>{
 const receipt={workspaceId,idempotencyKey:input.idempotencyKey,requestDigest:input.requestDigest,fingerprints:["fingerprint:1"],status:"COMMITTED"};
 const f=fake({existing:receipt}),store=new PostgresEvidenceStore(f.pool);
 assert.deepEqual(await store.reconcileIntake(input),receipt);
 const bad=fake({existing:{...receipt,requestDigest:"altered"}});
 await assert.rejects(new PostgresEvidenceStore(bad.pool).reconcileIntake(input),/IDEMPOTENCY_CONFLICT/);
 const missing=fake();await assert.rejects(new PostgresEvidenceStore(missing.pool).reconcileIntake(input),/DURABLE_COMMIT_OUTCOME_UNKNOWN/);
});

test("R4D malformed persisted receipt fails closed",async()=>{
 for (const bad of [{workspaceId,idempotencyKey:"request:1",requestDigest:"digest:1",fingerprints:[],status:"COMMITTED"},
  {workspaceId,idempotencyKey:"request:1",requestDigest:"digest:1",fingerprints:["same","same"],status:"COMMITTED"},
  {workspaceId,idempotencyKey:"request:1",requestDigest:"digest:1",fingerprints:["fingerprint:1"],status:"PENDING"}]) {
  const f=fake({existing:bad});await assert.rejects(new PostgresEvidenceStore(f.pool).lookupIntake(workspaceId,"request:1"),/INVALID_DURABLE_RECEIPT/);
 }
});

test("R4E serialization retry is bounded and uses fresh clients",async()=>{
 let connections=0, failures=0;
 const pool={connect:async()=>{connections++;return {release(){},async query(sql){if(sql.includes("ON CONFLICT (workspace_id,idempotency_key)") && failures++<2)throw Object.assign(new Error("serialization"),{code:"40001"});if(sql.includes("ON CONFLICT (workspace_id,idempotency_key)"))return {rows:[{request_digest:input.requestDigest}]};return {rows:[]};}}}};
 assert.equal((await new PostgresEvidenceStore(pool).commitIntake(input)).status,"COMMITTED");assert.equal(connections,3);
 let exhausted=0;const always={connect:async()=>({release(){},async query(sql){if(sql.startsWith("BEGIN"))throw Object.assign(new Error("serialization"),{code:"40001"});exhausted++;return {rows:[]};}})};
 await assert.rejects(new PostgresEvidenceStore(always).commitIntake(input),/DURABLE_SERIALIZATION_RETRY_EXHAUSTED/);assert.equal(exhausted,3);
});

test("R4F lost acknowledgement reconciles only after releasing transaction client",async()=>{
 const receipt={workspaceId,idempotencyKey:input.idempotencyKey,requestDigest:input.requestDigest,fingerprints:["fingerprint:1"],status:"COMMITTED"};
 let connects=0,released=false;
 const pool={async connect(){connects++;if(connects===1)return {release(){released=true},async query(sql){if(sql.includes("ON CONFLICT (workspace_id,idempotency_key)"))return {rows:[{}]};if(sql==="COMMIT")throw Error("ack lost");return {rows:[]}}};assert.equal(released,true);return {release(){},async query(){return {rows:[{result:receipt}]}}};}};
 assert.deepEqual(await new PostgresEvidenceStore(pool).commitIntake(input),receipt);assert.equal(connects,2);
});
test("R4F rejects duplicate batch fingerprints before connection",async()=>{
 const f=fake();await assert.rejects(new PostgresEvidenceStore(f.pool).commitIntake({...input,observations:[input.observations[0],input.observations[0]]}),/INVALID_DURABLE_INTAKE/);assert.equal(f.calls.length,0);
});
