// Server only: reuse released Business OS getUser + active membership semantics.
// Provider tokens are HttpOnly cookies; never returned in JSON or stored by browser JS.
import {guardPgClient} from '../../dist/src/evidence/postgres-evidence-store.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const COOKIE='__Secure-cigo_staging';
export function sessionCookie(token,clear=false){return `${COOKIE}=${clear?'':token}; Path=/api/staging; HttpOnly; Secure; SameSite=Strict; Max-Age=${clear?0:1800}`;}
export function readCookie(header=''){
 const values=header.split(';').map(s=>s.trim()).filter(s=>s.startsWith(COOKIE+'='));
 if(values.length!==1)return undefined;
 const token=values[0].slice(COOKIE.length+1);return token.length<=8192&&/^[A-Za-z0-9_.-]+$/.test(token)?token:undefined;
}
export function createSupabaseSession({authUrl,publishableKey,pool,token,fetchImpl=fetch,now=Date.now}){
 const base=new URL(authUrl);if(base.protocol!=='https:'||base.username||base.password||base.pathname!=='/')throw Error('INVALID_AUTH_CONFIGURATION');
 async function call(path,options={}){
  const response=await fetchImpl(new URL(path,base),{...options,redirect:'error',signal:AbortSignal.timeout(6000),
   headers:{apikey:publishableKey,'Content-Type':'application/json',...(options.headers??{})}});
  if(!response.ok)throw Error([400,401,403].includes(response.status)?'UNAUTHORIZED_STAGING':'AUTHENTICATION_UNAVAILABLE');
  const length=response.headers.get('content-length');
  if(length&&(!/^\d+$/.test(length)||Number(length)>65536)){await response.body?.cancel();throw Error('AUTHENTICATION_UNAVAILABLE');}
  const reader=response.body?.getReader();if(!reader)return {};
  const chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>65536)throw Error('AUTHENTICATION_UNAVAILABLE');chunks.push(value);}
   const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
   const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);return text?JSON.parse(text):{};
  }catch{await reader.cancel().catch(()=>{});throw Error('AUTHENTICATION_UNAVAILABLE');}finally{reader.releaseLock();}
 }
 async function query(sql,params){const client=guardPgClient(await pool.connect());try{return await client.query(sql,params);}finally{client.release();}}
 async function verifyProviderSession(){
  if(!token)return undefined;
  // JWT claims have no authority until the provider has verified this exact token.
  const user=await call('/auth/v1/user',{headers:{Authorization:`Bearer ${token}`}});
  if(!uuid.test(user.id)||!user.email_confirmed_at)return undefined;
  let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());}catch{return undefined;}
  if(claims.sub!==user.id||!uuid.test(claims.session_id)||!Number.isSafeInteger(claims.exp)||!Number.isSafeInteger(claims.iat)||
    claims.iat*1000>now()+30000||Math.min(claims.exp*1000,claims.iat*1000+1800000)<=now())return undefined;
  return {actorId:user.id,sessionId:claims.session_id,expiresAt:new Date(Math.min(claims.exp*1000,claims.iat*1000+1800000)).toISOString()};
 }
 // Request-local token verification only. Current auth.sessions and membership are
 // independently queried on EVERY authorization; never cached across HTTP requests.
 let verification;
 async function verifyServerSession(){verification??=verifyProviderSession();const value=await verification;
  return value&&Date.parse(value.expiresAt)>now()?{...value}:undefined;}
 return {
  verifyServerSession,
  async refreshServerVerification(){verification=undefined;return verifyServerSession();},
  async readCurrentMembership(session,workspace){
   if(!uuid.test(workspace))return undefined;
   const {rows}=await query('SELECT * FROM cigo.staging_membership($1::uuid,$2::uuid,$3::uuid)',[session.actorId,session.sessionId,workspace]);
   const row=rows[0];return row?{active:row.active,revoked:row.revoked,role:row.role,version:row.version,expiresAt:new Date(row.expires_at).toISOString()}:undefined;
  },
  async workspaces(){const session=await verifyServerSession();if(!session)throw Error('UNAUTHORIZED_STAGING');
   return (await query('SELECT * FROM cigo.staging_workspaces($1::uuid,$2::uuid)',[session.actorId,session.sessionId])).rows.map(r=>({id:r.workspace_id,label:r.label}));},
  async login(email,password){
   const {rows}=await query('SELECT cigo.staging_login_allowed($1) AS allowed',[email.toLowerCase()]);
   if(rows[0]?.allowed!==true)throw Error('UNAUTHORIZED_STAGING');
   const result=await call('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});
   if(typeof result.access_token!=='string'||result.access_token.length>8192)throw Error('UNAUTHORIZED_STAGING');
   const candidate=createSupabaseSession({authUrl,publishableKey,pool,token:result.access_token,fetchImpl,now});
   if(!(await candidate.workspaces()).length)throw Error('UNAUTHORIZED_STAGING');return result.access_token;
  },
  async logout(){if(token)await call('/auth/v1/logout?scope=local',{method:'POST',headers:{Authorization:`Bearer ${token}`}});},
 };
}
