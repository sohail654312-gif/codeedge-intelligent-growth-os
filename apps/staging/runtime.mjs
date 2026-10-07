import pg from 'pg';
import fs from 'node:fs';
import {createSupabaseSession,readCookie,sessionCookie} from './supabase-session.mjs';
import {loadStagingSnapshot} from './pipeline.mjs';
const pools=new Map();
export const CSP="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
export const SAFE_HEADERS={'Cache-Control':'private, no-store, max-age=0','Vary':'Cookie','Content-Type':'application/json; charset=utf-8',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':CSP};
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
  pools.set(url,new pg.Pool({host:u.hostname,port:Number(u.port),user:decodeURIComponent(u.username),password:decodeURIComponent(u.password),database:u.pathname.slice(1),
   ssl:{rejectUnauthorized:true,ca},max:2,idleTimeoutMillis:10000,connectionTimeoutMillis:6000,statement_timeout:4000,query_timeout:5000}));}
 return pools.get(url);
}
export async function handleStaging(request,config,dependencies={}){
 const headers={...SAFE_HEADERS};const reply=(status,body)=>({status,headers,body});
 const url=new URL(request.url,config.origin),path=url.pathname;
 if(!['/api/staging/session','/api/staging/snapshot'].includes(path))return reply(404,{error:'Unavailable route'});
 if(!['GET','POST','DELETE'].includes(request.method))return reply(405,{error:'Read-only console'});
 if(path.endsWith('snapshot')&&request.method!=='GET')return reply(405,{error:'Read-only console'});
 if(request.method!=='GET'&&request.headers.origin!==config.origin)return reply(403,{error:'Session request denied'});
 const queryAllowed=path.endsWith('snapshot')?['workspace']:[];
 if([...url.searchParams.keys()].some(k=>!queryAllowed.includes(k))||queryAllowed.some(k=>url.searchParams.getAll(k).length>1))return reply(400,{error:'Invalid request'});
 try{
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
  const deadline=Date.now()+55000;
  const transport=async(target,init)=>{
   const address=new URL(target);if(address.origin!==config.businessOsOrigin||Date.now()>deadline)throw Error('STAGING_SOURCE_UNAVAILABLE');
   const outgoing=new Headers(init.headers);outgoing.set('cookie',config.businessOsProtectionCookie);
   outgoing.set('x-vercel-skip-toolbar','1');return fetch(target,{...init,headers:outgoing});
  };
  const tenantPools=dependencies.tenantPools??{resolveServerHeldTenantPool:async id=>{
   if(!Object.hasOwn(config.workspaces,id))return undefined;return poolFor(config.workspaces[id].databaseUrl,config.databaseCa);}};
  const snapshot=await (dependencies.loader??loadStagingSnapshot)({workspaceId,label:config.workspaces[workspaceId].label,authority,tenantPools,
   env:config.readerEnv,transport,now:()=>{if(Date.now()>deadline)throw Error('STAGING_DEADLINE');return new Date();}});
  return reply(200,snapshot);
 }catch(error){
  const denied=/UNAUTHORIZED|AUTHORITY_CHANGED|WORKSPACE_IDENTITY/.test(error?.message??'');
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
 let config;try{config=configuration??loadServerConfiguration();}catch{res.writeHead(503,SAFE_HEADERS);res.end(JSON.stringify({error:'Staging unavailable'}));return;}
 // VERCEL_URL is a platform-owned deployment hostname, never an incoming Host header.
 if(process.env.VERCEL_URL)config={...config,origin:'https://'+process.env.VERCEL_URL};
 const result=await handleStaging({url:req.url,method:req.method,headers:req.headers,body},config);
 res.writeHead(result.status,result.headers);res.end(JSON.stringify(result.body));
}
