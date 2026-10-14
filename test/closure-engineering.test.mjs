import test from 'node:test';import assert from 'node:assert/strict';import {randomBytes,createHash} from 'node:crypto';import http from 'node:http';import fs from 'node:fs';
import {runSyntheticJourney} from '../dist/src/pilot/synthetic-workflow-journeys.js';
import {sealBackup,openBackup,planRetention,disposableConfiguration} from '../ops/engineering/recovery.mjs';
import {createSecurityAlertSink} from '../ops/engineering/alert-delivery.mjs';
import {emitSafeSecurityEvent} from '../dist/src/security/safe-event.js';
import {HumanApprovalBoundary} from '../dist/src/action/trusted-human-approval.js';import {InMemoryApprovalLedger} from '../dist/src/action/in-memory-approval-ledger.js';
import {handleStaging} from '../apps/staging/runtime.mjs';import {createSupabaseSession} from '../apps/staging/supabase-session.mjs';
for(const vertical of ['CLINIC','TRADES'])for(const mode of ['DEMO','SANDBOX'])test(vertical+' '+mode+' complete enquiry, booking, invoice, call and owner-handoff journeys',async()=>{
 for(const scenario of ['STANDARD','CANCELLED','MISSING_HANDOFF']){const x=await runSyntheticJourney({vertical,mode,scenario});
  assert.equal(x.evidenceCount,4);assert.equal(x.memory.length,4);assert.equal(x.stages.length,4);assert.equal(x.sourceContract,'cigo-synthetic-workflow:v1');
  assert.ok(x.stages.every(s=>s.evidence==='UNVERIFIED'&&s.actionable===false));assert.ok(x.memory.every(m=>m.verifiedFact===false&&m.actionable===false));
  assert.deepEqual([x.providerCalls,x.financialEffects,x.performedEffects,x.handoff.approved,x.handoff.executable],[0,0,0,false,false]);
  assert.equal(x.handoff.status,scenario==='CANCELLED'?'CANCELLED':scenario==='MISSING_HANDOFF'?'UNAVAILABLE':'PROPOSED_ONLY');
  const dto=JSON.stringify(x);for(const value of ['actorId','workspaceId','sessionId','fingerprint','receiptId','phoneNumber','patient'])assert.ok(!dto.includes(value));
 }
});
test('synthetic journeys reject production, custom providers, cross-tenant seed injection and arbitrary scenarios',async()=>{
 const x={vertical:'CLINIC',mode:'DEMO',scenario:'STANDARD'};
 for(const delta of [{mode:'PRODUCTION'},{vertical:'OTHER'},{scenario:'SEND_INVOICE'},{provider:()=>{}},{workspaceId:'other'},{actorId:'owner'}])await assert.rejects(runSyntheticJourney({...x,...delta}));
});
test('journey admission snapshots mode and vertical before asynchronous read',async()=>{
 const x={vertical:'CLINIC',mode:'SANDBOX',scenario:'STANDARD'},pending=runSyntheticJourney(x);x.mode='PRODUCTION';x.vertical='TRADES';const result=await pending;assert.equal(result.mode,'SANDBOX');assert.equal(result.vertical,'CLINIC');
});
test('health is safe liveness only; disable and rollback never return live DTOs',async()=>{
 const config={enabled:true,origin:'https://staging.example'},request={method:'GET',url:'/api/staging/health',headers:{}};
 const live=await handleStaging(request,config);assert.equal(live.status,200);assert.deepEqual(live.body,{status:'RUNNING_READ_ONLY',effectsEnabled:false});
 const disabled=await handleStaging(request,{...config,enabled:false});assert.equal(disabled.status,503);assert.equal(disabled.body.status,'DISABLED');
 assert.match(live.headers['Cache-Control'],/no-store/);assert.equal((await handleStaging({...request,method:'POST'},config)).status,405);
});
test('provider authentication bounds advertised and streaming response sizes before parsing identity',async()=>{
 for(const declared of [true,false]){let cancelled=false;
  const body=new ReadableStream({start(c){c.enqueue(new Uint8Array(65537));},cancel(){cancelled=true;}});
  const auth=createSupabaseSession({authUrl:'https://fixture.supabase.co',publishableKey:'public',pool:{},token:'a.b.c',fetchImpl:async()=>new Response(body,{headers:declared?{'content-length':'65537'}:{}})});
  await assert.rejects(auth.verifyServerSession());assert.equal(cancelled,true);
 }
});
function approvalFixture(){let current=true,actor='owner:a';const subject={workspaceId:'workspace:a',intentId:'intent:a',reviewPacketId:'review:a',proposalId:'proposal:a',planId:'plan:a',mode:'SANDBOX',domainService:'CRM',operation:'FOLLOW_UP',evidenceFingerprints:['synthetic:evidence']};
 const ledger=new InMemoryApprovalLedger(),policy={evaluate:async()=>({allow:true,requiredRole:'OWNER',policyVersion:'v1',reasonCode:'SYNTHETIC',maxTtlMs:60000})};
 const authority={resolveSession:async()=>({workspaceId:'workspace:a',actorId:actor,actorType:'HUMAN',sessionId:'session:a',authenticatedAt:'2026-10-14T00:00:00.000Z'}),assertCurrentMembership:async()=>{if(!current)throw Error('revoked');}};
 const boundary=new HumanApprovalBoundary(authority,policy,ledger,{digest:x=>createHash('sha256').update(x).digest('hex')},{now:()=> '2026-10-14T00:00:01.000Z'});
 return {subject,ledger,policy,boundary,revoke:()=>current=false,replace:()=>actor='other',request:{approvalId:'approval:a',subject,decision:'APPROVE',requiredRole:'OWNER'}};
}
test('R6 membership revocation during awaited policy cannot return even non-executable validity',async()=>{
 const f=approvalFixture();await f.boundary.decide(f.request);f.policy.evaluate=async()=>{f.revoke();return {allow:true,requiredRole:'OWNER',policyVersion:'v1',maxTtlMs:60000};};
 const x=await f.boundary.check({workspaceId:'workspace:a',approvalId:'approval:a',subject:f.subject,requiredRole:'OWNER'});assert.equal(x.status,'DENIED');
});
test('R6 actor replacement during durable admission is denied without erasing immutable audit',async()=>{
 const f=approvalFixture(),record=f.ledger.record.bind(f.ledger);f.ledger.record=async x=>{const saved=await record(x);f.replace();return saved;};await assert.rejects(f.boundary.decide(f.request),/AUTHORITY_CHANGED/);assert.equal(f.ledger.audit.length,1);
});
test('encrypted backup rejects corruption, wrong key and truncation; harness rejects hosted databases',()=>{
 const key=randomBytes(32),plain=Buffer.from('SYNTHETIC_PRIVATE_BACKUP'),backup=sealBackup(plain,key);assert.ok(!backup.includes(plain));assert.deepEqual(openBackup(backup,key),plain);
 const corrupt=Buffer.from(backup);corrupt[22]^=1;for(const [b,k]of [[corrupt,key],[backup,randomBytes(32)],[backup.subarray(0,30),key]])assert.throws(()=>openBackup(b,k),/AUTHENTICATION_FAILED/);
 for(const url of ['postgres://postgres@remote.example/cigo_r4_disposable_ci','postgres://postgres@127.0.0.1/production'])assert.throws(()=>disposableConfiguration({CIGO_R4_DISPOSABLE_TEST_CONFIRM:'I_CONFIRM_DISPOSABLE_ONLY',CIGO_R4_DISPOSABLE_DATABASE_URL:url}),/DISPOSABLE/);
});
test('retention protects current history, revocation links and legal holds and never enables deletion',()=>{
 const x={asOf:'2026-10-14T00:00:00.000Z',retainDays:7,entries:[{createdAt:'2026-09-01T00:00:00.000Z',revocationLinked:false},{createdAt:'2026-09-01T00:00:00.000Z',revocationLinked:true},{createdAt:'2026-10-13T00:00:00.000Z',revocationLinked:false}]};
 const p=planRetention(x);assert.equal(p.archivable,1);assert.equal(p.held,2);assert.equal(p.deletionEnabled,false);assert.equal(p.ownerMaintenancePermitted,false);
 assert.equal(planRetention({...x,archiveVerified:true,legalHold:true}).ownerMaintenancePermitted,false);assert.throws(()=>planRetention({...x,retainDays:0}));
});
const event={code:'INTEGRITY_FAILURE',stage:'R8',mode:'SANDBOX',occurredAt:'2026-10-14T00:00:00.000Z',correlationId:'opaque_correlation_123'};
test('actual loopback alert delivery validates redaction, authorization, acknowledgement and duplicate delivery',async()=>{
 const received=new Map(),token='x'.repeat(48);const server=http.createServer(async(req,res)=>{let raw='';for await(const c of req){raw+=c;if(raw.length>2048){res.writeHead(413);return res.end();}}
  assert.equal(req.headers.authorization,'Bearer '+token);const id=createHash('sha256').update(raw).digest('hex');assert.equal(req.headers['idempotency-key'],id);received.set(id,JSON.parse(raw));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({eventId:id,status:'RECORDED',effectCount:0}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const sink=createSecurityAlertSink({endpoint:'http://127.0.0.1:'+server.address().port+'/security',token,disposable:true});await emitSafeSecurityEvent(sink,{...event,privateValue:'must not leave projection'});await emitSafeSecurityEvent(sink,event);assert.equal(received.size,1);assert.equal(JSON.stringify([...received.values()]).includes('must not leave'),false);assert.equal([...received.values()][0].effectCount,0);}finally{await new Promise(r=>server.close(r));}
});
test('unconfirmed/oversized alert receipts and injected secrets fail closed without error disclosure',async()=>{
 for(const response of [()=>new Response('',{status:503}),()=>Response.json({eventId:'forged',status:'RECORDED',effectCount:0}),()=>new Response('x'.repeat(300))]){
  const sink=createSecurityAlertSink({endpoint:'https://security.example/ingest',token:'x'.repeat(48),fetchImpl:async()=>response()});await assert.rejects(emitSafeSecurityEvent(sink,event),/DELIVERY_UNCONFIRMED/);
  await assert.rejects(sink.emit(Object.freeze({...event,severity:'ERROR',effectCount:0,secret:'private'})),/UNSAFE_ALERT/);
 }
});
test('browser history revalidation clears prior tenant snapshots and live mode cannot expose synthetic journeys',()=>{
 const entry=fs.readFileSync('apps/staging/public/staging.js','utf8'),html=fs.readFileSync('apps/staging/site/staging.html','utf8');assert.ok(entry.includes("addEventListener('pagehide',clear)"));assert.ok(entry.includes('event.persisted'));assert.ok(!html.includes('data-view="journeys"'));assert.ok(!entry.includes('demo-data'));
});
