import {codespacesBrowserOrigin} from '../apps/staging/render-server.mjs';
// CIGO-only loopback integration acceptance: starts the real Node host.
// This is NOT an authenticated hosted tenant or a deployed public endpoint.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as sleep} from 'node:timers/promises';

const workspace='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const kinds=['business_profile','service','lead','customer','crm_activity','booking','inbox_summary','finance_summary'];
async function unusedLoopbackPort(){
 const s=createServer();
 await new Promise((resolve,reject)=>s.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=s.address().port;
 await new Promise((resolve,reject)=>s.close(error=>error?reject(error):resolve()));
 return port;
}
async function launch(config,t,platform=false){
 const port=await unusedLoopbackPort();
 if(platform)config={...config,origin:'https://synthetic-test-123-'+port+'.app.github.dev'};
 const child=spawn(process.execPath,['apps/staging/render-server.mjs'],{
  cwd:process.cwd(),env:{...process.env,...(platform?{CODESPACES:"true",CODESPACE_NAME:"synthetic-test-123",GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:"app.github.dev"}:{}),PORT:String(port),CIGO_STAGING_SERVER_JSON:JSON.stringify(config)},
  stdio:['ignore','pipe','pipe']
 });
 // Consume streams without printing private configuration or server diagnostics.
 child.stdout.resume();child.stderr.resume();
 child.on('error',()=>{});
 t.after(async()=>{
  if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');
  if(child.exitCode===null&&child.signalCode===null)await Promise.race([
   new Promise(resolve=>child.once('exit',resolve)),sleep(2000)
  ]);
 });
 const origin='http://127.0.0.1:'+port;
 for(let i=0;i<100;i++){
  if(child.exitCode!==null||child.signalCode!==null)throw Error('STAGING_HOST_EXITED');
  try{
   const response=await fetch(origin+'/__cigo_host_liveness',{signal:AbortSignal.timeout(500)});
   if(response.status===200)return origin;
  }catch{/* host not yet listening */}
  await sleep(50);
 }
 throw Error('STAGING_HOST_NOT_READY');
}
async function get(origin,path,options={}){
 const response=await fetch(origin+path,{...options,signal:AbortSignal.timeout(1500)});
 return {status:response.status,headers:response.headers,body:await response.text()};
}
const json=response=>JSON.parse(response.body);
const assertNoStore=response=>assert.match(response.headers.get('cache-control')??'',/no-store/);

test('real Node host: disabled mode has liveness but no staging surface',async t=>{
 const platform={CODESPACES:'true',CODESPACE_NAME:'synthetic-test-123',GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'app.github.dev'};
 const cfg={enabled:true,origin:'https://synthetic-test-123-10000.app.github.dev'};
 const request={headers:{origin:'http://localhost:10000',host:'attacker.example','x-forwarded-host':'attacker.example'},socket:{localPort:10000,remoteAddress:'127.0.0.1'}};
 assert.equal(codespacesBrowserOrigin(request,cfg,platform),cfg.origin);
 for(const bad of [{...platform,CODESPACES:'false'},{...platform,CODESPACE_NAME:'other'},{...platform,GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:'attacker.example'}])assert.equal(codespacesBrowserOrigin(request,cfg,bad),request.headers.origin);
 for(const patch of [{origin:'https://other.example'},{enabled:false}])assert.equal(codespacesBrowserOrigin(request,{...cfg,...patch},platform),request.headers.origin);
 for(const socket of [{localPort:10001,remoteAddress:'127.0.0.1'},{localPort:10000,remoteAddress:'192.0.2.1'},{localPort:0,remoteAddress:'127.0.0.1'}])assert.equal(codespacesBrowserOrigin({...request,socket},cfg,platform),request.headers.origin);
 for(const origin of ['https://attacker.example','null','http://localhost:10001',undefined])assert.equal(codespacesBrowserOrigin({...request,headers:{origin}},cfg,platform),origin);

 const origin=await launch({enabled:false},t);
 const live=await get(origin,'/__cigo_host_liveness');
 assert.equal(live.status,200);
 assert.deepEqual(json(live),{service:'CIGO_STAGING_HOST',listener:true,authenticatedSnapshotVerified:false});
 for(const path of ['/staging','/staging.js','/app.js','/assets/logo.svg','/api/staging/health']){
  const response=await get(origin,path);assert.equal(response.status,503);assertNoStore(response);
 }
 assert.deepEqual(json(await get(origin,'/api/staging/health')),{status:'DISABLED',effectsEnabled:false});
 for(const path of ['/demo-data.js','/dist/staging-runtime-private.json','/.env','/package.json','/api/approve']){
  const response=await get(origin,path);assert.equal(response.status,404);assertNoStore(response);
 }
 assert.equal((await get(origin,'/staging',{method:'POST'})).status,405);
 assert.equal((await get(origin,'/__cigo_host_liveness',{method:'POST'})).status,405);
});

test('real Node host: valid synthetic configuration permits shell but denies anonymous snapshot',async t=>{
 const sourceOrigin='https://business-os.example';
 const pool=user=>'postgresql://'+user+':synthetic@aws-0-ap-south-1.pooler.supabase.com/postgres';
 const cfg={enabled:true,origin:'https://cigo-staging.example',authUrl:'https://auth.example',
  publishableKey:'synthetic_public',authDatabaseUrl:pool('cigo_stage_gateway'),
  workspaces:{[workspace]:{label:'Synthetic A',databaseUrl:pool('cigo_stage_tenant_a')}},
  businessOsOrigin:sourceOrigin,businessOsProtectionCookie:'synthetic_protection=token',
  readerEnv:{CIGO_BUSINESS_OS_READERS_JSON:JSON.stringify({[workspace]:{
   baseUrl:sourceOrigin,keyId:'synthetic',secret:'S'.repeat(48),resourceKinds:kinds
  }}),CIGO_BUSINESS_OS_CURSOR_KEYS_JSON:JSON.stringify({synthetic:Buffer.alloc(32,7).toString('base64url')}),
  CIGO_BUSINESS_OS_CURSOR_ACTIVE_KEY_ID:'synthetic'}};
 const origin=await launch(cfg,t);
 const forwarded=await launch(cfg,t,true),port=new URL(forwarded).port;
 const loginOptions=origin=>({method:'POST',headers:{Origin:origin,'Content-Type':'application/json','x-forwarded-host':'synthetic-test-123-'+port+'.app.github.dev'},body:'{}'});
 assert.equal((await get(forwarded,'/api/staging/session',loginOptions('http://localhost:'+port))).status,400);
 assert.equal((await get(forwarded,'/api/staging/session',loginOptions('https://attacker.example'))).status,403);
 assert.equal((await get(forwarded,'/api/staging/session',loginOptions('http://localhost:1'))).status,403);
 const shell=await get(origin,'/staging');
 assert.equal(shell.status,200);assertNoStore(shell);
 assert.match(shell.body,/Authenticated staging/);
 assert.ok(!shell.body.includes('synthetic_public'));
 const anonymous=await get(origin,'/api/staging/snapshot?workspace='+workspace);
 assert.equal(anonymous.status,401);assertNoStore(anonymous);
 assert.ok(!anonymous.body.includes('Synthetic A'));
 assert.equal((await get(origin,'/api/staging/snapshot?workspace='+workspace,{method:'POST'})).status,405);
 assert.equal((await get(origin,'/api/staging/health')).status,200);
 for(const path of ['/demo-data.js','/dist/staging-runtime-private.json','/.env']){
  assert.equal((await get(origin,path)).status,404);
 }
});

test('real Node host: incomplete source configuration refuses shell and APIs without reflection',async t=>{
 const privateMarker='PRIVATE_SMOKE_DO_NOT_REFLECT';
 const origin=await launch({enabled:true,origin:'https://cigo-staging.example',authUrl:'https://auth.example',
  publishableKey:privateMarker,authDatabaseUrl:'postgresql://cigo_stage_gateway:synthetic@aws-0-ap-south-1.pooler.supabase.com/postgres',
  workspaces:{[workspace]:{label:'Synthetic A',databaseUrl:'postgresql://cigo_stage_tenant_a:synthetic@aws-0-ap-south-1.pooler.supabase.com/postgres'}},
  businessOsOrigin:'https://business-os.example',businessOsProtectionCookie:privateMarker+'=token',
  readerEnv:{CIGO_BUSINESS_OS_READERS_JSON:JSON.stringify({[workspace]:{baseUrl:'https://business-os.example'}}),
   CIGO_BUSINESS_OS_CURSOR_KEYS_JSON:'{"synthetic":"bad"}',CIGO_BUSINESS_OS_CURSOR_ACTIVE_KEY_ID:'synthetic'}},t);
 for(const path of ['/staging','/api/staging/health','/api/staging/snapshot?workspace='+workspace]){
  const r=await get(origin,path);assert.equal(r.status,503);assertNoStore(r);
  assert.ok(!r.body.includes(privateMarker));
 }
 assert.equal((await get(origin,'/__cigo_host_liveness')).status,200);
});
