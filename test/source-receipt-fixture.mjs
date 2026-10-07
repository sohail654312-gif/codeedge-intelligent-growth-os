import {randomBytes} from 'node:crypto';
import {createAttestedBusinessOsHttpReader} from '../dist/src/integration/attested-business-os-reader.js';
export const A='workspace:a',B='workspace:b';
export const record=(overrides={})=>({workspaceId:A,reference:{sourceSystem:'BUSINESS_OS',externalReference:'lead:receipt:1',version:'1'},resourceKind:'lead',value:{status:'new'},observedAt:'2026-10-07T00:00:00.000Z',...overrides});
export const request=()=>({context:{workspaceId:A,actorId:'server:actor',authorizedAt:new Date().toISOString()},sourceSystem:'BUSINESS_OS',resourceKind:'lead',limit:10});
export function composition(pool,options={}){
 const env={CIGO_BUSINESS_OS_READERS_JSON:JSON.stringify({[A]:{baseUrl:'https://business-os.example.test',keyId:'synthetic',secret:'s'.repeat(48),resourceKinds:['lead'],timeoutMs:250,retries:0}}),CIGO_BUSINESS_OS_CURSOR_KEYS_JSON:JSON.stringify({active:randomBytes(32).toString('base64url')}),CIGO_BUSINESS_OS_CURSOR_ACTIVE_KEY_ID:'active'};
 return createAttestedBusinessOsHttpReader({workspaceId:A,receiptPool:pool,env,authorization:{assertAuthorized:async()=>{if(options.denied)throw Error('denied');}},dependencies:{fetch:async()=>new Response(JSON.stringify({contractVersion:'codeedge-business-os-read-model:v1',sourceSystem:'BUSINESS_OS',workspaceId:A,resourceKind:'lead',observedAt:new Date().toISOString(),records:options.records??[record()],pagination:{},completeness:'COMPLETE',errors:[],...options.envelope}),{status:options.status??200})},...options.input});
}
// Unit-only receipt persistence fixture. Actual durability/RLS is separately tested in PostgreSQL.
export function unitPool(){
 const receipts=new Map(),identities=new Map(),revoked=new Set();
 return {receipts,identities,revoked,connects:0,fail:false,async connect(){this.connects++;const pool=this;let saved;
  return {release(){},async query(sql,params=[]){
   if(pool.fail)throw Error('synthetic store outage');
   if(sql==='BEGIN'){saved={receipts:new Map(receipts),identities:new Map(identities)};return {rows:[]};}
   if(sql==='ROLLBACK'){receipts.clear();identities.clear();for(const [k,v] of saved.receipts)receipts.set(k,v);for(const [k,v] of saved.identities)identities.set(k,v);return {rows:[]};}
   if(sql==='COMMIT')return {rows:[]};
   if(sql.startsWith('SET LOCAL'))return {rows:[]};
   if(sql.startsWith('INSERT INTO cigo.source_observation')){const k=JSON.stringify(params.slice(0,6));if(!identities.has(k))identities.set(k,params[6]);return {rows:[]};}
   if(sql.startsWith('SELECT fingerprint')){const v=identities.get(JSON.stringify(params));return {rows:v?[{fingerprint:v}]:[]};}
   if(sql.startsWith('INSERT INTO cigo.source_receipts')){receipts.set(params[1],JSON.parse(params[2]));return {rows:[]};}
   if(sql.startsWith('SELECT r.attestation')){const r=receipts.get(params[1]);return {rows:r?.workspaceId===params[0]&&!revoked.has(params[1])&&Date.parse(r.expiresAt)>Date.now()?[{attestation:structuredClone(r)}]:[]};}
   throw Error('Unexpected fixture query');
  }};
 }};
}
