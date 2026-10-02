import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import type {TrustedCursorCodec} from "./business-os-read-model.js";
type Scope=Parameters<TrustedCursorCodec["encode"]>[0];
type Payload={v:2;s:Scope;c:string;exp:number};
const domain=Buffer.from("cigo:business-os:cursor:aead:v2");
const validScope=(s:Scope)=>!!s&&typeof s.workspaceId==="string"&&typeof s.actorId==="string"&&typeof s.resourceKind==="string"&&Number.isSafeInteger(s.limit)&&s.limit>=1&&s.limit<=100;
const validId=(s:string)=>/^[A-Za-z0-9_-]{1,32}$/.test(s);
/** Confidential AEAD cursor: server-held 256-bit keys, random 96-bit nonce, GCM tag, actor/tenant/resource/limit binding. */
export class AeadBusinessOsCursorCodec implements TrustedCursorCodec {
 private readonly keys:ReadonlyMap<string,Uint8Array>;
 constructor(keys:ReadonlyMap<string,Uint8Array>,private readonly activeKeyId:string,private readonly now:()=>number=()=>Date.now(),private readonly ttlMs=300_000){
  if(!Number.isSafeInteger(ttlMs)||ttlMs<1000||ttlMs>86_400_000)throw Error("INVALID_CURSOR_TTL");
  if(!keys.size||!validId(activeKeyId)||![...keys].every(([id,key])=>validId(id)&&Buffer.isBuffer(key)&&key.length===32)||!keys.has(activeKeyId))throw Error("INVALID_CURSOR_KEYRING");
  this.keys=new Map([...keys].map(([id,key])=>[id,Buffer.from(key)]));
 }
 encode(scope:Scope,providerCursor:string):string{
  if(!validScope(scope))throw Error("INVALID_CURSOR_SCOPE");
  if(typeof providerCursor!=="string"||!providerCursor||providerCursor.length>2048)throw Error("INVALID_UPSTREAM_CURSOR");
  const now=this.now();if(!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(now+this.ttlMs))throw Error("INVALID_CURSOR_CLOCK");
  const nonce=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",this.keys.get(this.activeKeyId)!,nonce);
  cipher.setAAD(domain);
  const payload:Payload={v:2,s:scope,c:providerCursor,exp:now+this.ttlMs};
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(payload),"utf8"),cipher.final()]);
  const token=["v2",this.activeKeyId,nonce.toString("base64url"),encrypted.toString("base64url"),cipher.getAuthTag().toString("base64url")].join(".");
  if(token.length>4096)throw Error("CURSOR_TOO_LONG");
  return token;
 }
 decode(scope:Scope,token:string):string|undefined{
  if(!validScope(scope)||typeof token!=="string"||token.length>4096||!/^v2\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return undefined;
  const [version,kid,iv,body,tag]=token.split(".");const key=this.keys.get(kid);if(!key||version!=="v2")return undefined;
  try{
   const nonce=Buffer.from(iv,"base64url"),authTag=Buffer.from(tag,"base64url"),encrypted=Buffer.from(body,"base64url");
   if(nonce.length!==12||authTag.length!==16||!encrypted.length||encrypted.length>3072)return undefined;
   const decipher=createDecipheriv("aes-256-gcm",key,nonce);decipher.setAAD(domain);decipher.setAuthTag(authTag);
   const plaintext=Buffer.concat([decipher.update(encrypted),decipher.final()]).toString("utf8");
   const p:Payload=JSON.parse(plaintext);const now=this.now();
   if(p.v!==2||!p.c||typeof p.c!=="string"||p.c.length>2048||!Number.isSafeInteger(p.exp)||!Number.isSafeInteger(now)||now>=p.exp||p.exp-now>this.ttlMs||
     p.s?.workspaceId!==scope.workspaceId||p.s?.actorId!==scope.actorId||p.s?.resourceKind!==scope.resourceKind||p.s?.limit!==scope.limit)return undefined;
   return p.c;
  }catch{return undefined;}
 }
}
