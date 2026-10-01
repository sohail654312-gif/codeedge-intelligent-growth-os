import test from "node:test";
import assert from "node:assert/strict";
import {PostgresEvidenceStore} from "../dist/src/evidence/postgres-evidence-store.js";
const url=process.env.CIGO_R4_DISPOSABLE_DATABASE_URL;
const enabled=process.env.CIGO_R4_DISPOSABLE_TEST_CONFIRM==="I_CONFIRM_DISPOSABLE_ONLY" && !!url;
if(process.env.CIGO_R4_REQUIRE_POSTGRES_TESTS==="true"&&!enabled)throw Error("R4_POSTGRES_TESTS_REQUIRED_NOT_SKIPPED");
if(enabled){const p=new URL(url);if(p.pathname!=="/cigo_r4_disposable_ci"||!["localhost","127.0.0.1","::1","[::1]"].includes(p.hostname)||p.username!=="cigo_r4_app")throw Error("R4_DISPOSABLE_DATABASE_IDENTITY_MISMATCH");}
const skip=!enabled&&"Explicit disposable PostgreSQL required";
function row(workspace,fingerprint,reference=fingerprint,supersedes){return {workspaceId:workspace,fingerprint,verification:"UNVERIFIED",supersedes,observation:{workspaceId:workspace,sourceSystem:"BUSINESS_OS",externalReference:reference,resourceKind:"lead",value:{status:"new"},observedAt:"2026-10-01T12:00:00Z"}};}
function input(workspace,key,digest,rows){return {workspaceId:workspace,idempotencyKey:key,requestDigest:digest,observations:rows};}
async function pools(){const {default:pg}=await import("pg");const result=new Map();for(const [w,user,password] of [["workspace:a","cigo_r4_tenant_a","r4_tenant_a_ephemeral_only"],["workspace:b","cigo_r4_tenant_b","r4_tenant_b_ephemeral_only"]]){const u=new URL(url);u.username=user;u.password=password;result.set(w,new pg.Pool({connectionString:u.toString(),max:5}));}return result;}
test("R4M real DB concurrent identical requests have one receipt, one evidence row and one audit event",{skip},async()=>{
 const ps=await pools();try{const pool=ps.get("workspace:a"),store=new PostgresEvidenceStore(pool,"workspace:a");const x=input("workspace:a","r4m:identical","digest:identical",[row("workspace:a","r4m:identical:fingerprint")]);
 const settled=await Promise.allSettled(Array.from({length:6},()=>store.commitIntake(x)));
 const successes=settled.filter(r=>r.status==="fulfilled");assert.ok(successes.length>=1,JSON.stringify(settled));for(const r of successes)assert.deepEqual(r.value,successes[0].value);
 for(const r of settled.filter(r=>r.status==="rejected"))assert.match(String(r.reason),/DURABLE_SERIALIZATION_RETRY_EXHAUSTED|40001|IDEMPOTENCY_CONFLICT/);
 assert.deepEqual(await store.lookupIntake(x.workspaceId,x.idempotencyKey),successes[0].value);
 for(const [table,where] of [["intake_requests","idempotency_key"],["audit_events","idempotency_key"]])assert.equal((await pool.query(`SELECT count(*)::int AS n FROM cigo.${table} WHERE workspace_id=$1 AND ${where}=$2`,[x.workspaceId,x.idempotencyKey])).rows[0].n,1);
 assert.equal((await pool.query("SELECT count(*)::int AS n FROM cigo.evidence WHERE workspace_id=$1 AND fingerprint=$2",[x.workspaceId,x.observations[0].fingerprint])).rows[0].n,1);
 }finally{await Promise.all([...ps.values()].map(p=>p.end()));}
});
test("R4M real DB conflicting concurrent idempotency and duplicate fingerprint are fail-closed",{skip},async()=>{
 const ps=await pools();try{const pool=ps.get("workspace:a"),store=new PostgresEvidenceStore(pool,"workspace:a");const a=input("workspace:a","r4m:conflict","digest:first",[row("workspace:a","r4m:conflict:first")]),b=input("workspace:a","r4m:conflict","digest:second",[row("workspace:a","r4m:conflict:second")]);const outcomes=await Promise.allSettled([store.commitIntake(a),store.commitIntake(b)]);assert.equal(outcomes.filter(r=>r.status==="fulfilled").length,1,JSON.stringify(outcomes));assert.equal(outcomes.filter(r=>r.status==="rejected").length,1);const stored=await store.lookupIntake("workspace:a","r4m:conflict");assert.ok(["digest:first","digest:second"].includes(stored.requestDigest));assert.equal((await pool.query("SELECT count(*)::int AS n FROM cigo.audit_events WHERE idempotency_key=$1",["r4m:conflict"])).rows[0].n,1);
 const dup=input("workspace:a","r4m:duplicate","digest:duplicate",[row("workspace:a",stored.fingerprints[0])]);await assert.rejects(store.commitIntake(dup),/DURABLE_EVIDENCE_FINGERPRINT_CONFLICT/);assert.equal(await store.lookupIntake("workspace:a","r4m:duplicate"),undefined);assert.equal((await pool.query("SELECT count(*)::int AS n FROM cigo.audit_events WHERE idempotency_key=$1",["r4m:duplicate"])).rows[0].n,0);
 }finally{await Promise.all([...ps.values()].map(p=>p.end()));}
});
test("R4M real DB failed audit insertion rolls back receipt and evidence atomically",{skip},async()=>{
 const ps=await pools();try{const pool=ps.get("workspace:a"),store=new PostgresEvidenceStore(pool,"workspace:a");const x=input("workspace:a","r4m:audit:rollback","digest:audit:rollback",[row("workspace:a","r4m:audit:rollback:fp")]);// Inject a genuine FK failure after receipt and evidence inserts in one transaction.
 const c=await pool.connect();try{await c.query("BEGIN ISOLATION LEVEL SERIALIZABLE");await c.query("INSERT INTO cigo.intake_requests(workspace_id,idempotency_key,request_digest,result) VALUES($1,$2,$3,$4::jsonb)",[x.workspaceId,x.idempotencyKey,x.requestDigest,JSON.stringify({workspaceId:x.workspaceId,idempotencyKey:x.idempotencyKey,requestDigest:x.requestDigest,fingerprints:[x.observations[0].fingerprint],status:"COMMITTED"})]);await c.query("INSERT INTO cigo.evidence(workspace_id,fingerprint,source_system,external_reference,resource_kind,observation,observed_at,verification) VALUES($1,$2,'BUSINESS_OS','r4m:audit:rollback','lead',$3::jsonb,$4,'UNVERIFIED')",[x.workspaceId,x.observations[0].fingerprint,JSON.stringify(x.observations[0].observation),x.observations[0].observation.observedAt]);await assert.rejects(c.query("INSERT INTO cigo.audit_events(workspace_id,event_id,idempotency_key,event_type,payload_digest) VALUES($1,$2,$3,$4,$5)",[x.workspaceId,"r4m:audit:invalid","nonexistent:request","INTAKE_COMMITTED","bad"]),/foreign key/i);await c.query("ROLLBACK");}finally{c.release();}
 assert.equal(await store.lookupIntake(x.workspaceId,x.idempotencyKey),undefined);assert.equal((await pool.query("SELECT count(*)::int AS n FROM cigo.evidence WHERE fingerprint=$1",[x.observations[0].fingerprint])).rows[0].n,0);
 }finally{await Promise.all([...ps.values()].map(p=>p.end()));}
});
test("R4M real DB restart, reconciliation, tenant pool reuse and immutable provenance",{skip},async()=>{
 const ps=await pools();try{const a=ps.get("workspace:a"),b=ps.get("workspace:b");const x=input("workspace:a","r4m:restart","digest:restart",[row("workspace:a","r4m:restart:fp")]);const first=new PostgresEvidenceStore(a,"workspace:a");const receipt=await first.commitIntake(x);const restarted=new PostgresEvidenceStore(a,"workspace:a");assert.deepEqual(await restarted.reconcileIntake(x),receipt);await assert.rejects(restarted.reconcileIntake({...x,requestDigest:"forged"}),/IDEMPOTENCY_CONFLICT/);await assert.rejects(restarted.reconcileIntake({...x,idempotencyKey:"missing"}),/DURABLE_COMMIT_OUTCOME_UNKNOWN/);
 const both=await Promise.all([a.query("SELECT current_user AS role, count(*)::int AS n FROM cigo.evidence"),b.query("SELECT current_user AS role, count(*)::int AS n FROM cigo.evidence")]);assert.equal(both[0].rows[0].role,"cigo_r4_tenant_a");assert.equal(both[1].rows[0].role,"cigo_r4_tenant_b");assert.equal(both[1].rows[0].n,0);assert.ok(both[0].rows[0].n>=1);
 assert.equal((await a.query("SELECT verification FROM cigo.evidence WHERE fingerprint=$1",[x.observations[0].fingerprint])).rows[0].verification,"UNVERIFIED");
 await assert.rejects(a.query("DELETE FROM cigo.audit_events WHERE workspace_id='workspace:a'"),/permission denied/i);
 }finally{await Promise.all([...ps.values()].map(p=>p.end()));}
});

test("R4M real DB evidence FK failure rolls back receipt and audit; supersession is tenant-scoped",{skip},async()=>{
 const ps=await pools();try{const a=ps.get("workspace:a"),b=ps.get("workspace:b"),store=new PostgresEvidenceStore(a,"workspace:a");
 const bad=input("workspace:a","r4m:bad:lineage","digest:bad:lineage",[row("workspace:a","r4m:bad:lineage:fp","bad","missing:ancestor")]);
 await assert.rejects(store.commitIntake(bad),/foreign key/i);assert.equal(await store.lookupIntake("workspace:a",bad.idempotencyKey),undefined);
 assert.equal((await a.query("SELECT count(*)::int AS n FROM cigo.evidence WHERE fingerprint=$1",["r4m:bad:lineage:fp"])).rows[0].n,0);
 assert.equal((await a.query("SELECT count(*)::int AS n FROM cigo.audit_events WHERE idempotency_key=$1",[bad.idempotencyKey])).rows[0].n,0);
 const parent=input("workspace:a","r4m:lineage:parent","digest:lineage:parent",[row("workspace:a","r4m:lineage:parent:fp")]);await store.commitIntake(parent);
 const child=input("workspace:a","r4m:lineage:child","digest:lineage:child",[row("workspace:a","r4m:lineage:child:fp","child",parent.observations[0].fingerprint)]);await store.commitIntake(child);
 assert.equal((await a.query("SELECT supersedes,verification FROM cigo.evidence WHERE fingerprint=$1",[child.observations[0].fingerprint])).rows[0].supersedes,parent.observations[0].fingerprint);
 const cross=new PostgresEvidenceStore(b,"workspace:b");const other=input("workspace:b","r4m:lineage:cross","digest:lineage:cross",[row("workspace:b","r4m:lineage:cross:fp","cross",parent.observations[0].fingerprint)]);
 await assert.rejects(cross.commitIntake(other),/foreign key/i);assert.equal(await cross.lookupIntake("workspace:b",other.idempotencyKey),undefined);
 }finally{await Promise.all([...ps.values()].map(p=>p.end()));}
});

test("R4M real DB lost COMMIT acknowledgement reconciles through fresh physical connection",{skip},async()=>{
 const ps=await pools();try{const pool=ps.get("workspace:a");let commits=0,connects=0,released=false;
 const wrapped={async connect(){const physical=await pool.connect();connects++;const index=connects;return {release(){if(index===1)released=true;physical.release()},async query(sql,params){const result=await physical.query(sql,params);if(index===1&&sql==="COMMIT"&&++commits===1)throw Error("SIMULATED_LOST_ACK_AFTER_REAL_POSTGRES_COMMIT");if(index>1)assert.equal(released,true);return result;}};}};
 const x=input("workspace:a","r4m:ack:lost","digest:ack:lost",[row("workspace:a","r4m:ack:lost:fp")]);const receipt=await new PostgresEvidenceStore(wrapped,"workspace:a").commitIntake(x);assert.equal(receipt.status,"COMMITTED");assert.equal(commits,1);assert.equal(connects,2);assert.deepEqual(await new PostgresEvidenceStore(pool,"workspace:a").lookupIntake("workspace:a",x.idempotencyKey),receipt);
 }finally{await Promise.all([...ps.values()].map(p=>p.end()));}
});
test("R4M real DB bounded 40001 retry rolls back and obtains fresh physical connections",{skip},async()=>{
 const ps=await pools();try{const pool=ps.get("workspace:a");let connections=0,injected=0,rollbacks=0;
 const wrapped={async connect(){connections++;const physical=await pool.connect();return {release(){physical.release()},async query(sql,params){if(sql.includes("ON CONFLICT (workspace_id,idempotency_key)")&&injected++<2)throw Object.assign(Error("INJECTED_SERIALIZATION_FAILURE"),{code:"40001"});if(sql==="ROLLBACK")rollbacks++;return physical.query(sql,params);}};}};
 const x=input("workspace:a","r4m:retry","digest:retry",[row("workspace:a","r4m:retry:fp")]);assert.equal((await new PostgresEvidenceStore(wrapped,"workspace:a").commitIntake(x)).status,"COMMITTED");assert.equal(connections,3);assert.equal(rollbacks,2);assert.equal((await pool.query("SELECT count(*)::int AS n FROM cigo.audit_events WHERE idempotency_key=$1",[x.idempotencyKey])).rows[0].n,1);
 }finally{await Promise.all([...ps.values()].map(p=>p.end()));}
});

test("G6 pre-review: genuine PostgreSQL backend termination rolls back an in-flight authorized transaction",{skip},async()=>{
 const {default:pg}=await import("pg");const ps=await pools();
 const admin=new pg.Pool({host:process.env.PGHOST??"localhost",port:Number(process.env.PGPORT??5432),database:"cigo_r4_disposable_ci",user:process.env.PGUSER??"postgres",password:process.env.PGPASSWORD,max:1});
 try {
  const tenant=ps.get("workspace:a"),client=await tenant.connect(),key="g6:terminated:transaction",fp="g6:terminated:fingerprint";
  try {
   await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
   await client.query("INSERT INTO cigo.intake_requests(workspace_id,idempotency_key,request_digest,result) VALUES($1,$2,$3,$4::jsonb)",["workspace:a",key,"digest:terminated",JSON.stringify({workspaceId:"workspace:a",idempotencyKey:key,requestDigest:"digest:terminated",fingerprints:[fp],status:"COMMITTED"})]);
   const pid=Number((await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
   assert.equal((await admin.query("SELECT pg_terminate_backend($1) AS terminated",[pid])).rows[0].terminated,true);
   await assert.rejects(client.query("COMMIT"),/terminat|connection|closed|not queryable|ECONNRESET/i);
  }finally{client.release(true);}
  const fresh=new PostgresEvidenceStore(tenant,"workspace:a");assert.equal(await fresh.lookupIntake("workspace:a",key),undefined);
  assert.equal((await tenant.query("SELECT count(*)::int AS n FROM cigo.evidence WHERE fingerprint=$1",[fp])).rows[0].n,0);
  assert.equal((await tenant.query("SELECT count(*)::int AS n FROM cigo.audit_events WHERE idempotency_key=$1",[key])).rows[0].n,0);
 }finally{await admin.end();await Promise.all([...ps.values()].map(p=>p.end()));}
});
