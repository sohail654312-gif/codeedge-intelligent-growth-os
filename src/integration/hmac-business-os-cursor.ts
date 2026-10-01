import {createHmac, timingSafeEqual} from "node:crypto";
import type {TrustedCursorCodec} from "./business-os-read-model.js";
type Scope=Parameters<TrustedCursorCodec["encode"]>[0];
type Payload={v:1;k:string;s:Scope;c:string;exp:number};
/** Server-held HMAC cursor: authenticated, actor/tenant/resource/page scoped and expiring. Never log or expose upstream cursors. */
export class HmacBusinessOsCursorCodec implements TrustedCursorCodec {
 private readonly keys:ReadonlyMap<string,Buffer>;
 constructor(keys:ReadonlyMap<string,Buffer>,private readonly activeKeyId:string,
  private readonly now:()=>number=()=>Date.now(),private readonly ttlMs=300_000){
  if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>86_400_000)throw Error("INVALID_CURSOR_TTL");
  if(!keys.size || [...keys].some(([id,key])=>!id||!Buffer.isBuffer(key)||key.length<32) || !keys.has(activeKeyId))throw Error("INVALID_CURSOR_KEYRING");
  this.keys=new Map([...keys].map(([id,key])=>[id,Buffer.from(key)]));
 }
 private mac(key:Buffer,body:string){return createHmac("sha256",key).update("cigo:business-os:cursor:v1:").update(body).digest();}
 encode(scope:Scope,providerCursor:string):string{
  if(!providerCursor||providerCursor.length>4096)throw Error("INVALID_UPSTREAM_CURSOR");
  const payload:Payload={v:1,k:this.activeKeyId,s:scope,c:providerCursor,exp:this.now()+this.ttlMs};
  const body=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token=body+"."+this.mac(this.keys.get(this.activeKeyId)!,body).toString("base64url");
  if(token.length>4096)throw Error("CURSOR_TOO_LONG");
  return token;
 }
 decode(scope:Scope,token:string):string|undefined{
  if(typeof token!=="string"||token.length>4096||!token.match(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/))return undefined;
  const [body,signature]=token.split(".");
  try{
   const payload:Payload=JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
   if(payload.v!==1||typeof payload.k!=="string"||typeof payload.c!=="string"||!payload.c||payload.c.length>4096||
      !Number.isSafeInteger(payload.exp)||this.now()>=payload.exp||
      payload.s?.workspaceId!==scope.workspaceId||payload.s?.resourceKind!==scope.resourceKind||
      payload.s?.limit!==scope.limit||payload.s?.actorId!==scope.actorId)return undefined;
   const key=this.keys.get(payload.k);if(!key)return undefined;
   const given=Buffer.from(signature,"base64url"),expected=this.mac(key,body);
   if(given.length!==expected.length||!timingSafeEqual(given,expected))return undefined;
   return payload.c;
  }catch{return undefined;}
 }
}
