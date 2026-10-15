import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createStagingIdentity} from '../dist/src/staging/session.js';
import {createSupabaseSession,readCookie,sessionCookie,COOKIE} from '../apps/staging/supabase-session.mjs';
import {handleStaging,SAFE_HEADERS,loadServerConfiguration,nodeHandler,safeSnapshotFailureMarker,safeConfigurationLoadMarker,validateStagingUpstream} from '../apps/staging/runtime.mjs';
import {projectStagingSnapshot} from '../apps/staging/presentation.mjs';
const NOW='2026-10-07T12:00:00.000Z',FUTURE='2026-10-07T12:30:00.000Z';
const actor='11111111-1111-4111-8111-111111111111',A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',sid='22222222-2222-4222-8222-222222222222';
const session=()=>({actorId:actor,sessionId:sid,expiresAt:FUTURE});
const member=()=>({active:true,revoked:false,role:'OWNER',version:'1',expiresAt:FUTURE});
function fixture(overrides={}){let s=session(),m=member();return {
 authority:{verifyServerSession:async()=>s,readCurrentMembership:async(value,workspace)=>workspace===A&&value.actorId===actor?m:undefined,...overrides},
 setSession:value=>s=value,setMember:value=>m=value};}
for(const [name,changes,workspace,pass]of [
 ['own workspace',{},A,true],['cross workspace',{},B,false],['revoked membership',{m:{revoked:true}},A,false],
 ['inactive membership',{m:{active:false}},A,false],['expired membership',{m:{expiresAt:NOW}},A,false],
 ['expired session',{s:{expiresAt:NOW}},A,false],['invalid session',{s:undefined},A,false],
 ['unknown workspace',{},'unknown',false],['disallowed role',{m:{role:'MEMBER'}},A,false],
 ['tampered identity',{s:{actorId:'browser-forgery'}},A,false],['PostgreSQL unavailable',{db:true},A,false]]){
 test('server identity fails closed: '+name,async()=>{const f=fixture();if(Object.hasOwn(changes,'s'))f.setSession(changes.s?{...session(),...changes.s}:undefined);if(changes.m)f.setMember({...member(),...changes.m});if(changes.db)f.authority.readCurrentMembership=async()=>{throw Error('database unavailable');};
  const identity=createStagingIdentity(f.authority,workspace,()=>new Date(NOW));if(pass)assert.equal((await identity.authorize()).actorId,actor);else await assert.rejects(identity.authorize());});
}
for(const change of ['actor','session','version','role'])test('in-flight '+change+' change cannot retain prior authority',async()=>{
 const f=fixture(),identity=createStagingIdentity(f.authority,A,()=>new Date(NOW));await identity.authorize();
 if(change==='actor')f.setSession({...session(),actorId:'forged'});if(change==='session')f.setSession({...session(),sessionId:'replacement'});
 if(change==='version')f.setMember({...member(),version:'2'});if(change==='role')f.setMember({...member(),role:'ADMIN'});await assert.rejects(identity.authorize());
});
test('trusted intake resolvers recheck provider and membership on every use',async()=>{
 const f=fixture(),identity=createStagingIdentity(f.authority,A,()=>new Date(NOW));assert.equal((await identity.identity.resolveAuthenticatedActor()).actorId,actor);
 assert.equal((await identity.membership.resolveActiveMembership(actor,A)).active,true);f.setMember({...member(),revoked:true});await assert.rejects(identity.identity.resolveAuthenticatedActor());await assert.rejects(identity.membership.resolveActiveMembership(actor,A));
});
const claims={sub:actor,session_id:sid,iat:Date.parse(NOW)/1000,exp:Date.parse(FUTURE)/1000};
const token=c=>'header.'+Buffer.from(JSON.stringify(c)).toString('base64url')+'.signature';
test('provider verification precedes any JWT identity parsing or membership lookup',async()=>{
 let called=0;const provider=createSupabaseSession({authUrl:'https://test.supabase.co',publishableKey:'public',pool:{connect:async()=>{throw Error('should not query');}},token:token(claims),now:()=>Date.parse(NOW),fetchImpl:async()=>{called++;return new Response('{}',{status:401});}});
 await assert.rejects(provider.verifyServerSession());assert.equal(called,1);
});
test('verified provider user must match subject, session UUID and bounded lifetime',async()=>{
 for(const c of [{...claims,sub:'forged'},{...claims,session_id:'invalid'},{...claims,exp:Date.parse(NOW)/1000},{...claims,iat:Date.parse(NOW)/1000-1801}]){
  const p=createSupabaseSession({authUrl:'https://test.supabase.co',publishableKey:'public',pool:{},token:token(c),now:()=>Date.parse(NOW),fetchImpl:async()=>Response.json({id:actor,email_confirmed_at:NOW})});assert.equal(await p.verifyServerSession(),undefined);
 }
});
test('session cookies are HTTP-only secure strict and duplicates/tampering fail closed',()=>{
 assert.match(sessionCookie('abc'),/HttpOnly; Secure; SameSite=Strict/);assert.match(sessionCookie('',true),/Max-Age=0/);
 assert.equal(readCookie(COOKIE+'=abc'), 'abc');for(const c of ['',COOKIE+'=abc; '+COOKIE+'=def',COOKIE+'=invalid<>'])assert.equal(readCookie(c),undefined);
});
test('request-local provider verification never caches current session/membership and refreshes before disclosure',async()=>{
 let verified=0,queries=0,revoked=false;
 const p=createSupabaseSession({authUrl:'https://test.supabase.co',publishableKey:'public',token:token(claims),now:()=>Date.parse(NOW),
  fetchImpl:async()=>{verified++;return Response.json({id:actor,email_confirmed_at:NOW});},
  pool:{connect:async()=>({release(){},query:async()=>{queries++;return {rows:revoked?[]:[{active:true,revoked:false,role:'OWNER',version:'1',expires_at:FUTURE}]};}})}});
 const identity=createStagingIdentity(p,A,()=>new Date(NOW));await identity.authorize();await identity.authorize();assert.equal(verified,1);assert.equal(queries,2);
 revoked=true;await assert.rejects(identity.authorize());assert.equal(queries,3);await p.refreshServerVerification();assert.equal(verified,2);
});
const cfg={enabled:true,origin:'https://staging.example',authUrl:'https://test.supabase.co',publishableKey:'public',workspaces:{[A]:{label:'A'},[B]:{label:'B'}}};
const req=(url,method='GET',body)=>({url,method,body,headers:{cookie:COOKIE+'=token',origin:cfg.origin}});
const deps={authPool:{},sessionFactory:()=>({workspaces:async()=>[{id:A,label:'A'}],login:async()=>'session-secret',logout:async()=>{}})};
test('unauthenticated browser access denied before constructing trusted dependencies',async()=>{const r=req('/api/staging/snapshot?workspace='+A);r.headers.cookie='';assert.equal((await handleStaging(r,cfg,{sessionFactory:()=>{throw Error('must not reach');}})).status,401);});
test('browser identity, role and workspace JSON claims are not authority',async()=>{
 for(const body of [{email:'a@example.invalid',password:'password',actorId:actor},{email:'a@example.invalid',password:'password',role:'OWNER'}])assert.equal((await handleStaging(req('/api/staging/session','POST',body),cfg,deps)).status,400);
 for(const query of ['&actorId='+actor,'&role=OWNER','&workspace='+B])assert.equal((await handleStaging(req('/api/staging/snapshot?workspace='+A+query),cfg,deps)).status,400);
});
test('unknown workspace, effect routes and non-read snapshot methods cannot run',async()=>{
 assert.equal((await handleStaging(req('/api/staging/snapshot?workspace=unknown'),cfg,deps)).status,403);
 for(const method of ['POST','DELETE','PATCH'])assert.equal((await handleStaging(req('/api/staging/snapshot?workspace='+A,method),cfg,deps)).status,405);
 for(const path of ['execute','approve','send','booking','finance'])assert.equal((await handleStaging(req('/api/staging/'+path,'POST',{}),cfg,deps)).status,404);
});
test('cross-origin session changes denied; tokens never returned in JSON',async()=>{
 const request=req('/api/staging/session','POST',{email:'a@example.invalid',password:'password'});request.headers.origin='https://attacker.example';assert.equal((await handleStaging(request,cfg,deps)).status,403);
 request.headers.origin=cfg.origin;const result=await handleStaging(request,cfg,deps);assert.equal(result.status,200);assert.ok(!JSON.stringify(result.body).includes('session-secret'));assert.match(result.headers['Set-Cookie'],/HttpOnly/);
});
test('no cache reuse or tenant crossover on sequential workspace responses',async()=>{
 let calls=0;const d={...deps,loader:async({workspaceId})=>{calls++;return {mode:'AUTHENTICATED_STAGING',label:cfg.workspaces[workspaceId].label};}};
 for(const workspace of [A,B,A]){const r=await handleStaging(req('/api/staging/snapshot?workspace='+workspace),cfg,d);assert.equal(r.body.label,cfg.workspaces[workspace].label);assert.match(r.headers['Cache-Control'],/private, no-store/);assert.equal(r.headers.Vary,'Cookie');}assert.equal(calls,3);
});
function verifyStagingReaderOriginGuard(){
 const origin='https://business-os.example';
 const readerEnv={CIGO_BUSINESS_OS_READERS_JSON:JSON.stringify({[A]:{baseUrl:origin,keyId:'tenant-bound',secret:'S'.repeat(48)}})};
 const source={businessOsOrigin:origin,readerEnv};
 assert.equal(validateStagingUpstream(source,A),origin);
 for(const broken of [
  {...source,businessOsOrigin:'https://other.example'},
  {...source,businessOsOrigin:'http://business-os.example'},
  {...source,readerEnv:{CIGO_BUSINESS_OS_READERS_JSON:JSON.stringify({[B]:{baseUrl:origin}})}},
  {...source,readerEnv:{CIGO_BUSINESS_OS_READERS_JSON:'not-json'}},
  {...source,businessOsOrigin:'https://business-os.example/path'}
 ]){
  assert.throws(()=>validateStagingUpstream(broken,A),error=>
   error.message==='STAGING_SOURCE_CONFIGURATION_UNAVAILABLE'&&error.stagingStage==='SERVER_CONFIGURATION'&&
   !JSON.stringify(error).includes('tenant-bound'));
 }
}
async function verifyProtectedUpstreamHtmlDiagnostic(){
 const markers=[],privateHtml='<html>PRIVATE_UPSTREAM_LOGIN_TOKEN</html>';
 const result=await handleStaging(req('/api/staging/snapshot?workspace='+A),
  {...cfg,businessOsOrigin:'https://business-os.example',businessOsProtectionCookie:'secret-cookie'},{
   ...deps,logFailure:marker=>markers.push(marker),
   fetchImpl:async()=>new Response(privateHtml,{status:200,headers:{'content-type':'text/html'}}),
   loader:async({transport})=>{await transport('https://business-os.example/api/internal/cigo/v1/read',{headers:{}});throw Error('STAGING_SOURCE_UNAVAILABLE');}
  });
 assert.equal(result.status,503);assert.deepEqual(markers,[
  'CIGO_STAGING_UPSTREAM_MEDIA_FAILURE category=non_json',
  'CIGO_STAGING_SNAPSHOT_FAILURE stage=SNAPSHOT resource=none'
 ]);
 assert.ok(!JSON.stringify({result,markers}).includes('PRIVATE_UPSTREAM_LOGIN_TOKEN'));
}
test('source, receipt authority, PostgreSQL and session TOCTOU errors erase all data',async()=>{
 verifyStagingReaderOriginGuard();
 await verifyProtectedUpstreamHtmlDiagnostic();
 for(const message of ['STAGING_SOURCE_UNAVAILABLE','UNTRUSTED_SOURCE_PROVENANCE','database unavailable','STAGING_AUTHORITY_CHANGED']){
  const markers=[];
  const r=await handleStaging(req('/api/staging/snapshot?workspace='+A),cfg,{...deps,logFailure:message=>markers.push(message),loader:async()=>{throw Error(message+' private infrastructure');}});assert.ok(r.status>=400);assert.ok(!JSON.stringify(r.body).includes('private infrastructure'));assert.equal(r.body.metrics,undefined);assert.match(r.headers['Cache-Control'],/no-store/);
  assert.ok(markers.every(m=>m==='CIGO_STAGING_SNAPSHOT_FAILURE stage=SNAPSHOT resource=none'));
 }
 // Even crafted error metadata is constrained to closed enums, not logged or returned verbatim.
 const secrets='PRIVATE_DATABASE_PASSWORD_TOKEN_ACTOR';
 const failure=Object.assign(Error(secrets),{stagingStage:'SOURCE_READ',stagingResource:'lead',secret:secrets});
 assert.equal(safeSnapshotFailureMarker(failure),'CIGO_STAGING_SNAPSHOT_FAILURE stage=SOURCE_READ resource=lead');
 assert.equal(safeSnapshotFailureMarker({...failure,stagingStage:secrets,stagingResource:secrets}),'CIGO_STAGING_SNAPSHOT_FAILURE stage=SNAPSHOT resource=none');
 const markers=[];
 const r=await handleStaging(req('/api/staging/snapshot?workspace='+A),cfg,{...deps,logFailure:message=>markers.push(message),loader:async()=>{throw failure;}});
 assert.equal(r.status,503);assert.deepEqual(markers,['CIGO_STAGING_SNAPSHOT_FAILURE stage=SOURCE_READ resource=lead']);assert.ok(!JSON.stringify(r).includes(secrets));
 // A downstream HTTP 404 is only a fixed server log label, never a browser status
 // explanation or a route, credential, provider-body, or workspace disclosure.
 const upstreamMarkers=[],privateData='UPSTREAM_PRIVATE_TOKEN_PAYLOAD';
 const upstream=await handleStaging(req('/api/staging/snapshot?workspace='+A),{...cfg,businessOsOrigin:'https://business-os.example',businessOsProtectionCookie:privateData},{
  ...deps,logFailure:marker=>upstreamMarkers.push(marker),
  fetchImpl:async()=>new Response(privateData,{status:404}),
  loader:async({transport})=>{await transport('https://business-os.example/api/internal/cigo/v1/read',{headers:{}});throw Error('STAGING_SOURCE_UNAVAILABLE '+privateData);}
 });
 assert.equal(upstream.status,503);assert.deepEqual(upstreamMarkers,['CIGO_STAGING_UPSTREAM_HTTP_FAILURE status=404','CIGO_STAGING_SNAPSHOT_FAILURE stage=SNAPSHOT resource=none']);
 assert.ok(!JSON.stringify(upstream).includes(privateData));assert.ok(!JSON.stringify(upstreamMarkers).includes(privateData));
});
test('explicit browser DTO excludes source records, membership, credentials and receipts',()=>{
 const dto=projectStagingSnapshot({label:'Synthetic A',asOf:NOW,period:'2026-10 UTC',coverage:[{resource:'lead',status:'COMPLETE',count:2}],attestedCount:2,entries:[],
  metrics:[{domain:'LEADS',status:'AVAILABLE',value:2,numerator:2,limitations:[],actionable:false,verifiedFact:false,secret:'private-secret',fingerprint:'private-fingerprint'}],
  analysis:{insights:[{memoryKey:'lead',sourceKind:'ANALYSIS',observation:'2 observations',confidence:'INSUFFICIENT',actionable:false,verifiedFact:false,actorId:actor,receiptId:'private-receipt'}]},
  rawRecords:[{password:'private-password'}]});
 const text=JSON.stringify(dto);for(const secret of ['private-secret','private-fingerprint','private-receipt','private-password',actor])assert.ok(!text.includes(secret));
 assert.equal(dto.connection.provenanceStatus,'VERIFIED_SOURCE');assert.equal(dto.connection.evidenceStatus,'UNVERIFIED');assert.equal(dto.verifiedFact,false);assert.equal(dto.safety.executionEnabled,false);assert.equal(dto.metrics.find(m=>m.id==='CAPACITY').value,null);
});
test('presentation refuses FACT/action authority and suppresses unavailable numbers',()=>{
 const input={label:'A',asOf:NOW,period:'current',coverage:[],attestedCount:0,entries:[],metrics:[{domain:'LEADS',status:'UNAVAILABLE',value:999,numerator:999,actionable:false,verifiedFact:false}],analysis:{insights:[]}};
 const dto=projectStagingSnapshot(input);assert.equal(dto.metrics[0].value,null);assert.equal(dto.metrics[0].numerator,null);assert.equal(dto.connection.provenanceStatus,'NO_RECORD_ATTESTATION');
 for(const field of ['actionable','verifiedFact'])assert.throws(()=>projectStagingSnapshot({...input,metrics:[{...input.metrics[0],[field]:true}]}));
});
test('staging entry is separate and never imports demo data or silently falls back',()=>{
 const html=fs.readFileSync('apps/staging/site/staging.html','utf8'),entry=fs.readFileSync('apps/staging/public/staging.js','utf8');
 assert.ok(html.includes('data-mode="staging"'));assert.ok(html.includes('Authenticated staging'));assert.ok(!html.includes('id="scenario"'));assert.ok(!entry.includes('demo-data'));assert.ok(!/localStorage|sessionStorage|setInterval|WebSocket/.test(entry));assert.ok(entry.includes('clearStagingSnapshot'));assert.ok(entry.includes('current!==generation'));assert.ok(SAFE_HEADERS['Content-Security-Policy'].includes("connect-src 'self'"));
});
test('private server artifact is fixed-path, outside Git/browser output, and malformed configuration fails closed',()=>{
 const path='dist/staging-runtime-private.json';assert.equal(fs.existsSync(path),false);
 try{fs.writeFileSync(path,JSON.stringify({enabled:false,privateMarker:'PRIVATE_TEST_SERVER_CONFIG'}));
  assert.equal(loadServerConfiguration({}).enabled,false);assert.equal(loadServerConfiguration({CIGO_STAGING_SERVER_JSON:'{"enabled":true}'}).enabled,true);
  for(const bad of ['null','[]','invalid'])assert.throws(()=>loadServerConfiguration({CIGO_STAGING_SERVER_JSON:bad}));
  assert.ok(!fs.existsSync('apps/staging/site/staging-runtime-private.json'));assert.ok(!fs.readFileSync('apps/staging/site/staging.js','utf8').includes('PRIVATE_TEST_SERVER_CONFIG'));
 }finally{fs.unlinkSync(path);}
});
test('Vercel empty or forged GET body never substitutes for a session or breaks fail-closed status',async()=>{
 // A missing or malformed server-only config must fail BEFORE HTTP identity
 // processing, producing a fixed, non-sensitive Vercel runtime marker.
 const sensitive='PRIVATE_RUNTIME_CONFIG_PASSWORD_DO_NOT_LOG';
 assert.equal(safeConfigurationLoadMarker(Object.assign(Error(sensitive),{code:'ENOENT',path:'/private/'+sensitive})),'CIGO_STAGING_CONFIG_LOAD_FAILURE category=missing');
 assert.equal(safeConfigurationLoadMarker(new SyntaxError(sensitive)),'CIGO_STAGING_CONFIG_LOAD_FAILURE category=malformed');
 assert.equal(safeConfigurationLoadMarker(Error(sensitive)),'CIGO_STAGING_CONFIG_LOAD_FAILURE category=invalid');
 let status,body,headers;const marker=[];
 const originalConfig=process.env.CIGO_STAGING_SERVER_JSON,originalLogger=console.error;
 try{
  process.env.CIGO_STAGING_SERVER_JSON='{'+sensitive;
  console.error=value=>marker.push(String(value));
  const response={writeHead(code,values){status=code;headers=values;},end(value){body=value;}};
  await nodeHandler({method:'GET',url:'/api/staging/health',headers:{}},response);
 }finally{
  if(originalConfig===undefined)delete process.env.CIGO_STAGING_SERVER_JSON;
  else process.env.CIGO_STAGING_SERVER_JSON=originalConfig;
  console.error=originalLogger;
 }
 assert.equal(status,503);
 assert.deepEqual(marker,['CIGO_STAGING_CONFIG_LOAD_FAILURE category=malformed']);
 assert.equal(JSON.parse(body).error,'Staging unavailable');
 assert.match(headers['Cache-Control'],/no-store/);
 assert.ok(!JSON.stringify({marker,body}).includes(sensitive));
 for(const body of ['',{actorId:actor,role:'OWNER',workspaceId:A}]){
  let status,text;const response={writeHead(code){status=code;},end(value){text=value;}};
  await nodeHandler({method:'GET',url:'/api/staging/session',headers:{},body},response,cfg);
  assert.equal(status,401);assert.equal(JSON.parse(text).authenticated,undefined);
 }
});
