import test,{before,after} from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import net from 'node:net';import {randomBytes,createHash} from 'node:crypto';
import {PostgresApprovalLedger,PostgresDeniedActionLedger} from '../dist/src/action/postgres-control-ledgers.js';
import {BusinessOsActionRequestBoundary} from '../dist/src/action/business-os-action-request.js';
import {PostgresEvidenceStore} from '../dist/src/evidence/postgres-evidence-store.js';
import {ingestDurably} from '../dist/src/evidence/durable-intake.js';
import {captureDisposableBackup,restoreDisposableBackup,sealBackup,openBackup,planRetention,disposableConfiguration,recoveryToolVersions} from '../ops/engineering/recovery.mjs';
const cfg=disposableConfiguration(),admin=new pg.Pool({...cfg,port:Number(cfg.port),max:2}),A='workspace:a',B='workspace:b';let a,b;
const base={kind:'HUMAN_APPROVAL_DECISION',workspaceId:A,approvalId:'approval:concurrent',intentId:'intent:fixture',subjectDigest:'digest:fixture',actorId:'owner:synthetic',sessionId:'session:synthetic',decision:'APPROVE',requiredRole:'OWNER',policyVersion:'synthetic:v1',decidedAt:'2026-10-14T00:00:00.000Z',expiresAt:'2026-10-14T00:01:00.000Z',status:'RECORDED_NON_EXECUTABLE'};
before(async()=>{
 assert.equal((await admin.query('SELECT current_database() AS db')).rows[0].db,'cigo_r4_disposable_ci');await admin.query(fs.readFileSync('docs/architecture/sql/CONTROL-LEDGERS.sql','utf8'));
 for(const [suffix,workspace]of [['a',A],['b',B]]){const role='cigo_control_ci_'+suffix;await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD 'control_ci_ephemeral' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; GRANT USAGE ON SCHEMA cigo TO ${role}`);
  for(const table of ['approval_decisions','approval_revocations','denied_actions','control_audit']){await admin.query(`GRANT SELECT,INSERT ON cigo.${table} TO ${role};CREATE POLICY control_${suffix}_${table}_read ON cigo.${table} FOR SELECT TO ${role} USING(workspace_id='${workspace}');CREATE POLICY control_${suffix}_${table}_insert ON cigo.${table} FOR INSERT TO ${role} WITH CHECK(workspace_id='${workspace}')`);}}
 const pool=user=>new pg.Pool({...cfg,port:Number(cfg.port),user,password:'control_ci_ephemeral',max:4});a=pool('cigo_control_ci_a');b=pool('cigo_control_ci_b');
});
after(async()=>{await Promise.all([a?.end(),b?.end(),admin.end()]);});
test('durable approval concurrent identical replay has one immutable decision/audit; conflicting content fails',async()=>{
 const ledger=new PostgresApprovalLedger(a,A);const results=await Promise.all(Array.from({length:4},()=>ledger.record(base)));assert.ok(results.every(r=>JSON.stringify(r)===JSON.stringify(base)));
 assert.equal(Number((await a.query("SELECT count(*) FROM cigo.control_audit WHERE event_kind='APPROVAL' AND record_id=$1",[base.approvalId])).rows[0].count),1);
 assert.deepEqual(await new PostgresApprovalLedger(a,A).lookup(A,base.approvalId),base);
 await assert.rejects(ledger.record({...base,decision:'REJECT'}),/APPROVAL_REPLAY_CONFLICT/);
});
test('durable control roles deny foreign reads/writes, owner bypass, mutable history and operational access',async()=>{
 const foreign=new PostgresApprovalLedger(b,B);assert.equal(await foreign.lookup(B,base.approvalId),undefined);await assert.rejects(foreign.lookup(A,base.approvalId),/SCOPE/);
 await assert.rejects(b.query('INSERT INTO cigo.approval_decisions VALUES($1,$2,$3,now())',[A,'foreign',{...base,approvalId:'foreign'}]),/row-level security/);
 for(const sql of ['UPDATE cigo.approval_decisions SET record_id=\'changed\'','DELETE FROM cigo.control_audit','TRUNCATE cigo.denied_actions','SET ROLE postgres','SELECT * FROM public.business_memberships'])await assert.rejects(a.query(sql),e=>e.code==='42501');
 for(const table of ['approval_decisions','approval_revocations','denied_actions','control_audit']){const r=await admin.query('SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid=$1::regclass',['cigo.'+table]);assert.ok(r.rows[0].relrowsecurity&&r.rows[0].relforcerowsecurity);}
});
test('durable revocation survives reconnection, is idempotent, preserves original expiry, and outage is untrusted',async()=>{
 const ledger=new PostgresApprovalLedger(a,A);await ledger.revoke({workspaceId:A,approvalId:base.approvalId,actorId:'owner:synthetic',revokedAt:'2026-10-14T00:00:01.000Z'});
 await ledger.revoke({workspaceId:A,approvalId:base.approvalId,actorId:'owner:synthetic',revokedAt:'2026-10-14T00:00:02.000Z'});
 assert.equal(await new PostgresApprovalLedger(a,A).isRevoked(A,base.approvalId),true);assert.equal((await ledger.lookup(A,base.approvalId)).expiresAt,base.expiresAt);
 const down=new PostgresApprovalLedger({connect:async()=>{throw Error('private database secret');}},A);await assert.rejects(down.lookup(A,base.approvalId),e=>e.message==='CONTROL_LEDGER_UNAVAILABLE');
 await assert.rejects(ledger.revoke({workspaceId:A,approvalId:'missing',actorId:'owner:synthetic',revokedAt:'2026-10-14T00:00:03.000Z'}));
});
test('R7 persists only immutable denied receipts even with all named gates true; replay never dispatches',async()=>{
 const ledger=new PostgresDeniedActionLedger(a,A),boundary=new BusinessOsActionRequestBoundary({verify:async()=>({identity:true,membership:true,source:true,policy:true,humanApproval:true,durableAudit:true,adapter:true})},ledger);
 const subject={workspaceId:A,intentId:'intent:denial',reviewPacketId:'review:a',proposalId:'proposal:a',planId:'plan:a',mode:'SANDBOX',domainService:'FINANCE',operation:'DRAFT_REVIEW',evidenceFingerprints:['synthetic']};
 const request={requestId:'request:a',workspaceId:A,intentId:subject.intentId,approvalId:'approval:none',mode:subject.mode,domainService:subject.domainService,operation:subject.operation,payload:null,idempotencyKey:'denial:once'};
 const first=await boundary.submit(request,subject),again=await boundary.submit(request,subject);assert.deepEqual(first,again);assert.equal(first.reason,'EFFECTS_DISABLED');assert.equal(first.performedEffects,0);assert.equal(first.providerInvoked,false);
 await assert.rejects(boundary.submit({...request,requestId:'changed'},subject),/UNAVAILABLE_OR_CONFLICT/);assert.equal(Number((await a.query("SELECT count(*) FROM cigo.control_audit WHERE event_kind='DENIAL' AND record_id='denial:once'")).rows[0].count),1);
 await assert.rejects(ledger.record({...first,performedEffects:1}),/INVALID_CONTROL_RECORD/);
});
test('a real audit-insert failure atomically rolls back control admission and never reports success',async()=>{
 await admin.query("CREATE FUNCTION cigo.fail_control_audit_ci() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.record_id='approval:audit-fail' THEN RAISE EXCEPTION 'synthetic audit unavailable'; END IF; RETURN NEW; END $$;CREATE TRIGGER fail_control_audit BEFORE INSERT ON cigo.control_audit FOR EACH ROW EXECUTE FUNCTION cigo.fail_control_audit_ci()");
 try{await assert.rejects(new PostgresApprovalLedger(a,A).record({...base,approvalId:'approval:audit-fail'}),/UNAVAILABLE/);assert.equal((await a.query("SELECT 1 FROM cigo.approval_decisions WHERE record_id='approval:audit-fail'")).rowCount,0);}finally{await admin.query('DROP TRIGGER fail_control_audit ON cigo.control_audit;DROP FUNCTION cigo.fail_control_audit_ci()');}
});
test('real TCP loss after PostgreSQL COMMIT reaches the server reconciles through a fresh connection',async()=>{
 let armed=false,cut=false;const sockets=new Set();const proxy=net.createServer(client=>{const upstream=net.connect(Number(cfg.port),cfg.host);sockets.add(client);sockets.add(upstream);
  client.on('data',data=>{if(!cut&&data.includes(Buffer.from('COMMIT\0')))armed=true;upstream.write(data);});
  upstream.on('data',data=>{if(armed&&!cut&&data.includes(Buffer.from('COMMIT\0'))){cut=true;client.destroy();upstream.destroy();}else client.write(data);});
  client.on('error',()=>{});upstream.on('error',()=>client.destroy());client.on('close',()=>{upstream.destroy();sockets.delete(client);});upstream.on('close',()=>sockets.delete(upstream));});
 await new Promise(r=>proxy.listen(0,'127.0.0.1',r));const pool=new pg.Pool({...cfg,host:'127.0.0.1',port:proxy.address().port,user:'cigo_control_ci_a',password:'control_ci_ephemeral',max:2,connectionTimeoutMillis:3000});
 try{const ledger=new PostgresApprovalLedger(pool,A),record={...base,approvalId:'approval:tcp-cut'};assert.deepEqual(await ledger.record(record),record);assert.equal(cut,true);assert.equal((await a.query("SELECT 1 FROM cigo.approval_decisions WHERE record_id='approval:tcp-cut'")).rowCount,1);
  cut=false;armed=false;const evidencePool=new pg.Pool({...cfg,host:'127.0.0.1',port:proxy.address().port,user:'cigo_r4_tenant_a',password:'r4_tenant_a_ephemeral_only',max:2,connectionTimeoutMillis:3000});
  try{const context={workspaceId:A,actorId:'synthetic:tcp-cut',authorizedAt:new Date().toISOString()},observation={workspaceId:A,reference:{sourceSystem:'CIGO',externalReference:'synthetic:tcp-evidence',version:'1'},resourceKind:'lead',value:{synthetic:true},observedAt:new Date().toISOString()};
   const receipt=await ingestDurably(context,'tcp-evidence-commit',[observation],new PostgresEvidenceStore(evidencePool,A));assert.equal(receipt.status,'COMMITTED');assert.equal(cut,true);assert.equal((await admin.query("SELECT 1 FROM cigo.intake_requests WHERE workspace_id=$1 AND idempotency_key='tcp-evidence-commit'",[A])).rowCount,1);
  }finally{await evidencePool.end();}
 }
 finally{await pool.end();for(const s of sockets)s.destroy();await new Promise(r=>proxy.close(r));}
});
test('actual encrypted pg_dump/pg_restore restores evidence, receipts, revocations, control audit, grants and tenant RLS',async()=>{
 const tables=['evidence','intake_requests','audit_events','source_receipts','source_receipt_revocations','approval_decisions','approval_revocations','denied_actions','control_audit'];
 const manifest=async client=>Object.fromEntries(await Promise.all(tables.map(async table=>{const rows=(await client.query('SELECT row_to_json(t) AS row FROM cigo.'+table+' t ORDER BY row_to_json(t)::text')).rows;return [table,{count:rows.length,digest:createHash('sha256').update(JSON.stringify(rows)).digest('hex')}];})));
 const before=await manifest(admin),started=Date.now(),plain=captureDisposableBackup(),key=randomBytes(32),sealed=sealBackup(plain,key),dir=fs.mkdtempSync(path.join(os.tmpdir(),'cigo-recovery-'));const file=path.join(dir,'synthetic-backup.enc');fs.writeFileSync(file,sealed,{mode:0o600});
 const corrupt=Buffer.from(sealed);corrupt[24]^=1;assert.throws(()=>openBackup(corrupt,key),/AUTHENTICATION_FAILED/);
 await admin.query('CREATE DATABASE cigo_closure_restore_ci');restoreDisposableBackup(openBackup(fs.readFileSync(file),key));
 const restore=new pg.Pool({...cfg,port:Number(cfg.port),database:'cigo_closure_restore_ci',max:2}),tenant=new pg.Pool({...cfg,port:Number(cfg.port),database:'cigo_closure_restore_ci',user:'cigo_control_ci_a',password:'control_ci_ephemeral',max:1});
 try{assert.deepEqual(await manifest(restore),before);assert.equal((await tenant.query('SELECT * FROM cigo.approval_decisions WHERE workspace_id=$1',[B])).rowCount,0);assert.ok((await tenant.query('SELECT * FROM cigo.approval_decisions WHERE workspace_id=$1',[A])).rowCount>0);await assert.rejects(tenant.query('DELETE FROM cigo.approval_decisions'),e=>e.code==='42501');
  const evidence={kind:'DISPOSABLE_RECOVERY_DRILL',result:'PASS',encrypted:true,tamperDenied:true,tables:Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v.count])),elapsedMs:Date.now()-started,rpoObservedMissingRows:0,tenantRls:'PASS',mutableHistory:'DENIED',versions:recoveryToolVersions(),productionRecoveryAcceptance:false};
  fs.writeFileSync(process.env.CIGO_OPS_RECOVERY_EVIDENCE??path.join(os.tmpdir(),'cigo-recovery-evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
 }finally{await Promise.all([restore.end(),tenant.end()]);fs.unlinkSync(file);fs.rmdirSync(dir);key.fill(0);}
});
test('retention rehearsal inventories immutable history without purge or loss of revocation lineage',async()=>{
 const count=Number((await a.query('SELECT count(*) FROM cigo.control_audit')).rows[0].count),rows=(await a.query("SELECT created_at AS \"createdAt\",event_kind='REVOCATION' AS \"revocationLinked\" FROM cigo.control_audit")).rows;
 const result=planRetention({asOf:new Date().toISOString(),retainDays:30,entries:rows.map(r=>({...r,createdAt:new Date(r.createdAt).toISOString()})),archiveVerified:true,legalHold:true});assert.equal(result.deletionEnabled,false);assert.equal(result.ownerMaintenancePermitted,false);assert.equal(Number((await a.query('SELECT count(*) FROM cigo.control_audit')).rows[0].count),count);
});
