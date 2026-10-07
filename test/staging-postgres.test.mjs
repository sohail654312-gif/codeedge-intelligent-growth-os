import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import pg from 'pg';import {randomBytes,randomUUID} from 'node:crypto';
import {createStagingIdentity} from '../dist/src/staging/session.js';import {loadStagingSnapshot,RESOURCES} from '../apps/staging/pipeline.mjs';
const url=process.env.CIGO_R4_DISPOSABLE_DATABASE_URL;
if(process.env.CIGO_R4_DISPOSABLE_TEST_CONFIRM!=='I_CONFIRM_DISPOSABLE_ONLY'||!url)throw Error('EXPLICIT_DISPOSABLE_POSTGRES_REQUIRED');
const u=new URL(url);if(u.pathname!=='/cigo_r4_disposable_ci'||!['localhost','127.0.0.1'].includes(u.hostname))throw Error('DISPOSABLE_IDENTITY_MISMATCH');
const admin=new pg.Pool({host:u.hostname,port:Number(u.port),database:'cigo_r4_disposable_ci',user:process.env.PGUSER??'postgres',password:process.env.PGPASSWORD,max:2});
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',actor='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
let issuer,gateway;
before(async()=>{
 await admin.query(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid,created_at timestamptz,not_after timestamptz);
 CREATE TABLE public.businesses(id uuid PRIMARY KEY,status text,updated_at timestamptz);
 CREATE TABLE public.business_memberships(user_id uuid,business_id uuid,role text,status text,updated_at timestamptz);`);
 await admin.query(fs.readFileSync('docs/architecture/sql/STAGING-CONSOLE-AUTHORITY.sql','utf8'));
 await admin.query(`CREATE ROLE cigo_stage_ci_gateway LOGIN PASSWORD 'ci_gateway_ephemeral' NOSUPERUSER NOBYPASSRLS NOINHERIT;
 GRANT USAGE ON SCHEMA cigo TO cigo_stage_ci_gateway; GRANT EXECUTE ON FUNCTION cigo.staging_membership(uuid,uuid,uuid),cigo.staging_workspaces(uuid,uuid),cigo.staging_login_allowed(text) TO cigo_stage_ci_gateway;
 CREATE ROLE cigo_stage_ci_a LOGIN PASSWORD 'ci_tenant_ephemeral' NOSUPERUSER NOBYPASSRLS NOINHERIT;
 GRANT USAGE ON SCHEMA cigo TO cigo_stage_ci_a; GRANT SELECT,INSERT ON cigo.evidence,cigo.intake_requests,cigo.audit_events,cigo.source_observation_identities,cigo.source_receipts TO cigo_stage_ci_a;
 GRANT SELECT ON cigo.source_receipt_revocations TO cigo_stage_ci_a;`);
 for(const table of ['evidence','intake_requests','audit_events','source_observation_identities','source_receipts','source_receipt_revocations']){
  await admin.query(`CREATE POLICY stage_ci_${table}_read ON cigo.${table} FOR SELECT TO cigo_stage_ci_a USING(workspace_id='${A}')`);
  if(table!=='source_receipt_revocations')await admin.query(`CREATE POLICY stage_ci_${table}_insert ON cigo.${table} FOR INSERT TO cigo_stage_ci_a WITH CHECK(workspace_id='${A}')`);
 }
 await admin.query('INSERT INTO auth.users VALUES($1,$2)',[actor,'synthetic@example.invalid']);
 await admin.query('INSERT INTO auth.sessions VALUES($1,$2,now(),now()+interval \'1 hour\')',[sid,actor]);
 await admin.query('INSERT INTO public.businesses VALUES($1,\'active\',now()),($2,\'active\',now())',[A,B]);
 await admin.query('INSERT INTO public.business_memberships VALUES($1,$2,\'owner\',\'active\',now())',[actor,A]);
 await admin.query('INSERT INTO cigo.staging_access(actor_id,workspace_id,label,active,expires_at) VALUES($1,$2,\'Synthetic A\',true,now()+interval \'1 day\')',[actor,A]);
 const rolePool=(name,password)=>{const conn=new URL(url);conn.username=name;conn.password=password;return new pg.Pool({connectionString:conn.toString(),max:2});};
 issuer=rolePool('cigo_stage_ci_a','ci_tenant_ephemeral');gateway=rolePool('cigo_stage_ci_gateway','ci_gateway_ephemeral');
});
after(async()=>{await Promise.all([issuer?.end(),gateway?.end(),admin.end()]);});
const authority={verifyServerSession:async()=>({actorId:actor,sessionId:sid,expiresAt:new Date(Date.now()+1800000).toISOString()}),readCurrentMembership:async(session,workspace)=>{
 const row=(await gateway.query('SELECT * FROM cigo.staging_membership($1,$2,$3)',[session.actorId,session.sessionId,workspace])).rows[0];return row?{active:row.active,revoked:row.revoked,role:row.role,version:row.version,expiresAt:new Date(row.expires_at).toISOString()}:undefined;
}};
test('actual PostgreSQL current sessions/membership authorize own workspace and deny foreign or unknown',async()=>{
 await createStagingIdentity(authority,A).authorize();for(const workspace of [B,randomUUID()])await assert.rejects(createStagingIdentity(authority,workspace).authorize());
 const unknown={...authority,verifyServerSession:async()=>({actorId:actor,sessionId:randomUUID(),expiresAt:new Date(Date.now()+10000).toISOString()})};await assert.rejects(createStagingIdentity(unknown,A).authorize());
});
test('actual membership revocation, expiration and stale-session TOCTOU deny subsequent use',async()=>{
 const identity=createStagingIdentity(authority,A);await identity.authorize();
 try{await admin.query('UPDATE cigo.staging_access SET revoked=true WHERE actor_id=$1',[actor]);await assert.rejects(identity.authorize());
  await admin.query('UPDATE cigo.staging_access SET revoked=false,expires_at=now()-interval \'1 second\' WHERE actor_id=$1',[actor]);await assert.rejects(createStagingIdentity(authority,A).authorize());
 }finally{await admin.query('UPDATE cigo.staging_access SET revoked=false,expires_at=now()+interval \'1 day\' WHERE actor_id=$1',[actor]);}
});
test('actual Business OS role/status and session expiry are authoritative',async()=>{
 try{await admin.query("UPDATE public.business_memberships SET role='staff'");await assert.rejects(createStagingIdentity(authority,A).authorize());
  await admin.query("UPDATE public.business_memberships SET role='owner',status='revoked'");await assert.rejects(createStagingIdentity(authority,A).authorize());
  await admin.query("UPDATE public.business_memberships SET status='active'");await admin.query("UPDATE auth.sessions SET not_after=now()-interval '1 second'");await assert.rejects(createStagingIdentity(authority,A).authorize());
 }finally{await admin.query("UPDATE public.business_memberships SET role='owner',status='active'");await admin.query("UPDATE auth.sessions SET not_after=now()+interval '1 hour'");}
});
test('server gateway and tenant issuer have no operational mutation or role bypass',async()=>{
 for(const pool of [gateway,issuer])for(const sql of ['SELECT * FROM auth.users','SELECT * FROM auth.sessions','SELECT * FROM public.business_memberships','UPDATE cigo.evidence SET verification=\'VERIFIED\'','TRUNCATE cigo.evidence','SET ROLE postgres'])await assert.rejects(pool.query(sql),e=>e.code==='42501');
 assert.equal((await issuer.query('SELECT * FROM cigo.evidence WHERE workspace_id=$1',[B])).rowCount,0);
 await assert.rejects(issuer.query('INSERT INTO cigo.audit_events(workspace_id,event_id,idempotency_key,event_type,payload_digest) VALUES($1,\'foreign\',\'foreign\',\'INTAKE_COMMITTED\',\'digest\')',[B]),/row-level security/);
});
function input(options={}){
 const ref='lead:'+randomUUID(),record={workspaceId:A,reference:{sourceSystem:'BUSINESS_OS',externalReference:ref,version:'1'},resourceKind:'lead',observedAt:options.observedAt??new Date().toISOString(),value:{createdAt:new Date().toISOString(),status:'new',privateNotes:'SYNTHETIC_PRIVATE_DO_NOT_PROJECT'}};
 const env={CIGO_BUSINESS_OS_READERS_JSON:JSON.stringify({[A]:{baseUrl:'https://synthetic.example',keyId:'synthetic',secret:'s'.repeat(48),resourceKinds:RESOURCES,timeoutMs:250,retries:0}}),CIGO_BUSINESS_OS_CURSOR_KEYS_JSON:JSON.stringify({active:randomBytes(32).toString('base64url')}),CIGO_BUSINESS_OS_CURSOR_ACTIVE_KEY_ID:'active'};
 return {workspaceId:A,label:'Synthetic A',authority,tenantPools:{resolveServerHeldTenantPool:async()=>options.pool??issuer},env,
  transport:async url=>{const resource=new URL(url).searchParams.get('resourceKind');if(options.beforeResponse)await options.beforeResponse(resource);
   return Response.json({contractVersion:'codeedge-business-os-read-model:v1',sourceSystem:'BUSINESS_OS',workspaceId:A,resourceKind:resource,observedAt:new Date().toISOString(),records:resource==='lead'?[record]:[],pagination:options.cursor&&resource==='lead'?{nextCursor:'opaque-next-page'}:{},completeness:options.partial?'PARTIAL':'COMPLETE',errors:[]});}};
}
test('real adapter -> durable PostgreSQL receipt/intake -> truth/memory/analysis -> safe DTO',async()=>{
 const dto=await loadStagingSnapshot(input());assert.equal(dto.connection.attestedCount,1);assert.equal(dto.metrics[0].value,1);assert.equal(dto.memory.length,1);assert.equal(dto.memory[0].kind,'ANALYSIS');assert.equal(dto.memory[0].actionable,false);
 assert.equal(dto.connection.provenanceStatus,'VERIFIED_SOURCE');assert.equal(dto.connection.evidenceStatus,'UNVERIFIED');assert.ok(!JSON.stringify(dto).includes('SYNTHETIC_PRIVATE'));assert.ok(!JSON.stringify(dto).includes('fingerprint'));assert.ok(!JSON.stringify(dto).includes('receiptId'));
 assert.ok(Number((await issuer.query('SELECT count(*) FROM cigo.source_receipts')).rows[0].count)>0);assert.ok(Number((await issuer.query('SELECT count(*) FROM cigo.evidence')).rows[0].count)>0);
});
test('HTTP 200 without durable authority, partial page and current receipt revocation fail closed',async()=>{
 await assert.rejects(loadStagingSnapshot(input({pool:{connect:async()=>{throw Error('PostgreSQL unavailable');}}})),/UNAVAILABLE/);
 await assert.rejects(loadStagingSnapshot(input({partial:true})),/UNAVAILABLE/);
 await assert.rejects(loadStagingSnapshot(input({beforeResponse:async resource=>{if(resource==='finance_summary')await admin.query('INSERT INTO cigo.source_receipt_revocations(workspace_id,receipt_id) SELECT workspace_id,receipt_id FROM cigo.source_receipts WHERE workspace_id=$1 ON CONFLICT DO NOTHING',[A]);}})),/UNTRUSTED_SOURCE_PROVENANCE/);
});
test('actual durable stale/future observations and bounded continuation never expose a guessed complete metric',async()=>{
 for(const options of [{observedAt:new Date(Date.now()-172800000).toISOString()},{observedAt:new Date(Date.now()+3600000).toISOString()},{cursor:true}]){
  const dto=await loadStagingSnapshot(input(options));assert.equal(dto.metrics[0].value,null);assert.equal(dto.metrics[0].numerator,null);
  assert.equal(dto.metrics[0].status,'UNAVAILABLE');assert.equal(dto.actionable,false);assert.equal(dto.recommendations.length,0);
 }
});
