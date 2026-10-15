import pg from 'pg';
import fs from 'node:fs';
import {createSupabaseSession,readCookie,sessionCookie} from './supabase-session.mjs';
import {loadStagingSnapshot} from './pipeline.mjs';
const pools=new Map();
export const CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
export const SAFE_HEADERS={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie','Content-Type':'application/json; charset=utf-8',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':CSP};
// Only fixed server-owned diagnostic identifiers enter runtime logs. Never log error
// objects, incoming URLs, tenant IDs, tokens, DB details, source records or headers.
const FAILURE_STAGES=new Set(['SERVER_CONFIGURATION','TENANT_POOL','SOURCE_READ','SOURCE_RECEIPT','DURABLE_INTAKE','SESSION_RECHECK']);
const FAILURE_RESOURCES=new Set(['business_profile','service','lead','customer','crm_activity','booking','inbox_summary','finance_summary']);
export function safeSnapshotFailureMarker(error){
 const stage=FAILURE_STAGES.has(error?.stagingStage)?error.stagingStage:'SNAPSHOT';
 const resource=FAILURE_RESOURCES.has(error?.stagingResource)?error.stagingResource:'none';
 return 'CIGO_STAGING_SNAPSHOT_FAILURE stage='+stage+' resource='+resource;
}
// The early Vercel entrypoint runs before request/session logic can emit the
// snapshot markers. Report only fixed error *classes*: never error messages,
// absolute artifact paths, protected config contents, environment or credentials.
export function safeConfigurationLoadMarker(error){
 const category=error?.code==='ENOENT'?'missing':error instanceof SyntaxError?'malformed':'invalid';
 return 'CIGO_STAGING_CONFIG_LOAD_FAILURE category='+category;
}
// Classify trusted server-side staging configuration before creating any provider
// pool or attempting an authenticated source read. Never log values, names of
// workspaces, credentials, URLs, exception text or protected JSON.
const CONFIG_CATEGORIES=new Set(['shape','origin','auth','database','workspace','source']);
export function safeConfigurationPreflightMarker(error){
 const category=CONFIG_CATEGORIES.has(error?.stagingConfigCategory)?error.stagingConfigCategory:'shape';
 return 'CIGO_STAGING_CONFIG_PREFLIGHT_FAILURE category='+category;
}
export function validateStagingPrivateConfiguration(config){
 const fail=category=>{
  const error=Error('STAGING_CONFIGURATION_UNAVAILABLE');
  Object.defineProperty(error,'stagingConfigCategory',{value:category});
  throw error;
 };
 if(!config||typeof config!=='object'||Array.isArray(config)||typeof config.enabled!=='boolean')fail('shape');
 if(config.enabled===false)return false; // explicit safe disabled mode
 const safeOrigin=value=>{
  try{
   const url=new URL(value);
   return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&
    (url.pathname==='/'||url.pathname==='')&&!!url.hostname;
  }catch{return false;}
 };
 const safePool=value=>{
  try{
   const url=new URL(value);
   return url.protocol==='postgresql:'&&url.hostname.endsWith('.pooler.supabase.com')&&
    url.username.startsWith('cigo_stage_')&&!!url.password&&url.pathname.length>1&&
    !url.search&&!url.hash;
  }catch{return false;}
 };
 if(!safeOrigin(config.origin))fail('origin');
 if(!safeOrigin(config.authUrl)||typeof config.publishableKey!=='string'||!config.publishableKey.trim())fail('auth');
 if(!safePool(config.authDatabaseUrl))fail('database');
 const workspaces=config.workspaces;
 if(!workspaces||typeof workspaces!=='object'||Array.isArray(workspaces)||!Object.keys(workspaces).length)fail('workspace');
 for(const [id,scope] of Object.entries(workspaces)){
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||
   !scope||typeof scope!=='object'||Array.isArray(scope)||
   typeof scope.label!=='string'||!scope.label.trim()||scope.label.length>100||
   !safePool(scope.databaseUrl))fail('workspace');
 }
 if(!safeOrigin(config.businessOsOrigin)||
  typeof config.businessOsProtectionCookie!=='string'||!config.businessOsProtectionCookie.includes('=')||
  config.businessOsProtectionCookie.length>8192||/[\r\n]/.test(config.businessOsProtectionCookie)||
  !config.readerEnv||typeof config.readerEnv!=='object'||Array.isArray(config.readerEnv)||
  !['CIGO_BUSINESS_OS_READERS_JSON','CIGO_BUSINESS_OS_CURSOR_KEYS_JSON','CIGO_BUSINESS_OS_CURSOR_ACTIVE_KEY_ID']
   .every(key=>typeof config.readerEnv[key]==='string'&&config.readerEnv[key].trim()))fail('source');
 for(const id of Object.keys(workspaces)){
  try{validateStagingUpstream(config,id);}catch{fail('source');}
 }
 return true;
}
// The credential-bearing reader map stays server-side. This guard checks only
// whether its selected upstream origin agrees with the independently configured
// protected-source transport; no URL, key or tenant value is ever logged.
export function validateStagingUpstream(config,workspaceId){
 try{
  const readers=JSON.parse(config.readerEnv?.CIGO_BUSINESS_OS_READERS_JSON);
  const configured=new URL(config.businessOsOrigin);
  const target=new URL(readers?.[workspaceId]?.baseUrl);
  if(configured.protocol!=='https:'||target.protocol!=='https:'||
   configured.username||configured.password||configured.search||configured.hash||
   target.username||target.password||target.search||target.hash||
   !['','/'].includes(configured.pathname)||!['','/'].includes(target.pathname)||
   configured.origin!==target.origin)throw Error('MISMATCH');
  return configured.origin;
 }catch{
  const error=Error('STAGING_SOURCE_CONFIGURATION_UNAVAILABLE');
  Object.defineProperty(error,'stagingStage',{value:'SERVER_CONFIGURATION'});
  throw error;
 }
}
/** Trusted server configuration only. The optional private artifact is injected by the
 * deployment owner outside Git, under dist (function includeFiles), never static output.
 * No URL/body/header can choose this path or supply a configuration override. */
export function loadServerConfiguration(environment=process.env){
 const text=environment.CIGO_STAGING_SERVER_JSON??fs.readFileSync(new URL('../../dist/staging-runtime-private.json',import.meta.url),'utf8');
 const config=JSON.parse(text);if(!config||typeof config!=='object'||Array.isArray(config))throw Error('STAGING_CONFIGURATION_UNAVAILABLE');
 return config;
}
function poolFor(url,ca){
 if(!pools.has(url)){const u=new URL(url);if(u.protocol!=='postgresql:'||!u.hostname.endsWith('.pooler.supabase.com')||!u.username.startsWith('cigo_stage_'))throw Error('INVALID_SERVER_CONFIGURATION');
  const pool=new pg.Pool({host:u.hostname,port:Number(u.port),user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:u.pathname.slice(1),
   ssl:{rejectUnauthorized:true,ca},max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:6000,statement_timeout:4000,query_timeout:5000});
  pool.on('error',()=>console.error('STAGING_DATABASE_POOL_UNAVAILABLE'));pools.set(url,pool);}
 return pools.get(url);
}
export async function handleStaging(request,config,dependencies={}){
 // Start the budget before provider/session verification, not after it.
 // Reserve five seconds under the 60s Vercel function limit for denial,
 // cleanup and completing the HTTP response if upstream stalls.
 const clock=dependencies.clock??Date.now;
 const startedAt=clock();
 const deadline=startedAt+55000;
 const headers={...SAFE_HEADERS};const reply=(status,body)=>({status,headers,body});
 const url=new URL(request.url,config.origin),path=url.pathname;
 if(!['/api/staging/session','/api/staging/snapshot','/api/staging/health'].includes(path))return reply(404,{error:'Unavailable route'});
 if(!['GET','POST','DELETE'].includes(request.method))return reply(405,{error:'Read-only console'});
 if(path.endsWith('snapshot')&&request.method!=='GET')return reply(405,{error:'Read-only console'});
 if(path.endsWith('health')&&request.method!=='GET')return reply(405,{error:'Read-only console'});
 if(request.method!=='GET'&&request.headers.origin!==config.origin)return reply(403,{error:'Session request denied'});
 const queryAllowed=path.endsWith('snapshot')?['workspace']:[];
 if([...url.searchParams.keys()].some(k=>!queryAllowed.includes(k))||queryAllowed.some(k=>url.searchParams.getAll(k).length>1))return reply(400,{error:'Invalid request'});
 try{
  if(path.endsWith('health'))return reply(config.enabled===true?200:503,{status:config.enabled===true?'RUNNING_READ_ONLY':'DISABLED',effectsEnabled:false});
  if(config.enabled!==true)throw Error('STAGING_DISABLED');
  const token=readCookie(request.headers.cookie);
  if(request.method==='GET'&&!token)return reply(401,{error:'Sign in to staging'});
  const authority=(dependencies.sessionFactory??createSupabaseSession)({authUrl:config.authUrl,publishableKey:config.publishableKey,
   pool:dependencies.authPool??poolFor(config.authDatabaseUrl,config.databaseCa),token});
  if(path.endsWith('session')){
   if(request.method==='POST'){
    const body=request.body;if(!body||Object.keys(body).sort().join(',')!=='email,password'||typeof body.email!=='string'||typeof body.password!=='string'||
      body.email.length>254||body.password.length<8||body.password.length>256)return reply(400,{error:'Enter staging sign-in details'});
    const value=await authority.login(body.email,body.password);headers['Set-Cookie']=sessionCookie(value);return reply(200,{authenticated:true});
   }
   if(request.method==='DELETE'){headers['Set-Cookie']=sessionCookie('',true);await authority.logout();return reply(200,{authenticated:false});}
   const workspaces=await authority.workspaces();return reply(200,{authenticated:true,workspaces});
  }
  const workspaceId=url.searchParams.get('workspace');
  if(!workspaceId||!Object.hasOwn(config.workspaces,workspaceId))return reply(403,{error:'Workspace unavailable'});
  // Production composition must never silently target a different protected
  // Business OS deployment than its tenant-bound reader credentials specify.
  if(!dependencies.loader)validateStagingUpstream(config,workspaceId);
  const transport=async(target,init)=>{
   const address=new URL(target);
   if(address.origin!==config.businessOsOrigin)throw Error('STAGING_SOURCE_UNAVAILABLE');
   const remaining=deadline-clock()-5000;
   if(remaining<=0){
    // Fixed diagnostic only: no target URL, tenant, headers, secrets or error bodies.
    try{(dependencies.logFailure??console.error)('CIGO_STAGING_SOURCE_BUDGET_EXHAUSTED');}catch{/* safe denial without logging */}
    throw Error('STAGING_SOURCE_UNAVAILABLE');
   }
   const outgoing=new Headers(init.headers);outgoing.set('cookie',config.businessOsProtectionCookie);
   outgoing.set('x-vercel-skip-toolbar','1');
   // The adapter retains its own per-read timeout; this additionally enforces
   // the request-wide budget across all sequential resources and retries.
   const budgetSignal=AbortSignal.timeout(remaining);
   const signal=init.signal?AbortSignal.any([init.signal,budgetSignal]):budgetSignal;
   const response=await (dependencies.fetchImpl??fetch)(target,{...init,headers:outgoing,signal});
   if(!response.ok){
    // Fixed status allowlist only. Never log upstream body, URL, headers, credentials or tenant.
    const status=[401,403,404,429,500,502,503,504].includes(response.status)?String(response.status):'other';
    try{(dependencies.logFailure??console.error)('CIGO_STAGING_UPSTREAM_HTTP_FAILURE status='+status);}catch{/* best-effort telemetry */}
   }else if(!/^application\/json\s*(?:;|$)/i.test(response.headers.get('content-type')??'')){
    // A protected upstream login page may return HTTP 200 with HTML. This is
    // NOT a valid read-model response; record only the fixed media category.
    try{(dependencies.logFailure??console.error)('CIGO_STAGING_UPSTREAM_MEDIA_FAILURE category=non_json');}catch{/* best-effort telemetry */}
   }
   return response;
  };
  const tenantPools=dependencies.tenantPools??{resolveServerHeldTenantPool:async id=>{
   if(!Object.hasOwn(config.workspaces,id))return undefined;return poolFor(config.workspaces[id].databaseUrl,config.databaseCa);}};
  const snapshot=await (dependencies.loader??loadStagingSnapshot)({workspaceId,label:config.workspaces[workspaceId].label,authority,tenantPools,
   env:config.readerEnv,transport,now:()=>{if(clock()>deadline-5000)throw Error('STAGING_DEADLINE');return new Date();}});
  return reply(200,snapshot);
 }catch(error){
  const denied=/UNAUTHORIZED|AUTHORITY_CHANGED|WORKSPACE_IDENTITY/.test(error?.message??'');
  if(path.endsWith('snapshot')&&!denied){
   // A diagnostics sink is injectable in tests only; HTTP input never selects it.
   // Reporter failures must never change fail-closed responses.
   try{(dependencies.logFailure??console.error)(safeSnapshotFailureMarker(error));}catch{/* no telemetry dependency may authorize reads */}
  }
  return reply(denied?403:503,{error:denied?'Session or workspace unavailable':'Staging observations unavailable',mode:'AUTHENTICATED_STAGING'});
 }
}
export async function nodeHandler(req,res,configuration){
 let body;
 try{
  // Vercel may preparse an empty GET/DELETE body as ''. Only login consumes JSON;
  // read identity and authority never come from body data, including GET bodies.
  if(req.method==='POST'){
   if(req.body!==undefined){if(Buffer.byteLength(JSON.stringify(req.body))>4096)throw Error('SIZE');body=typeof req.body==='string'?JSON.parse(req.body):req.body;}
   else {let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>4096)throw Error('SIZE');}if(text)body=JSON.parse(text);}
  }
 }catch{res.writeHead(400,SAFE_HEADERS);res.end(JSON.stringify({error:'Invalid request'}));return;}
 let config;try{
  config=configuration??loadServerConfiguration();
  // Production entrypoints pass no injected configuration. This test-only
  // dependency-injection seam must not become an HTTP-selected bypass.
  if(configuration===undefined)validateStagingPrivateConfiguration(config);
 }catch(error){
  // This occurs before user authorization. Emit only a fixed, allowlisted
  // failure class; never emit the raw exception or the protected configuration.
  try{console.error(error?.stagingConfigCategory?
   safeConfigurationPreflightMarker(error):safeConfigurationLoadMarker(error));}
  catch{/* logging is optional; denial is mandatory */}
  res.writeHead(503,SAFE_HEADERS);res.end(JSON.stringify({error:'Staging unavailable'}));return;
 }
 // VERCEL_URL is a platform-owned deployment hostname, never an incoming Host header.
 if(process.env.VERCEL_URL)config={...config,origin:'https://'+process.env.VERCEL_URL};
 const result=await handleStaging({url:req.url,method:req.method,headers:req.headers,body},config);
 res.writeHead(result.status,result.headers);res.end(JSON.stringify(result.body));
}
