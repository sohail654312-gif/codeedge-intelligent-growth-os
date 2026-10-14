import {createHash} from 'node:crypto';
import {isSafeSecurityEvent} from '../../dist/src/security/safe-event.js';
/** Fixed server-selected telemetry endpoint. Never a customer/provider action port.
 * Loopback is permitted only for explicitly disposable delivery tests. */
export function createSecurityAlertSink({endpoint,token,disposable=false,fetchImpl=fetch}){
 const url=new URL(endpoint),loopback=['127.0.0.1','localhost'].includes(url.hostname);
 if(url.username||url.password||url.hash||url.search||!token||!/^[A-Za-z0-9_-]{32,128}$/.test(token)||
  (disposable?(!loopback||url.protocol!=='http:'):url.protocol!=='https:'))throw Error('INVALID_ALERT_CONFIGURATION');
 return Object.freeze({async emit(input){
  if(!Object.isFrozen(input)||!isSafeSecurityEvent(input))throw Error('UNSAFE_ALERT_EVENT');
  const event=structuredClone(input);if(event.mode==='PRODUCTION'&&disposable)throw Error('DISPOSABLE_ALERT_ONLY');
  const body=JSON.stringify(event),id=createHash('sha256').update(body).digest('hex');
  try{const response=await fetchImpl(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(2000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','Idempotency-Key':id},body});
   if(!response.ok)throw Error('DENIED');const reader=response.body?.getReader();if(!reader)throw Error('SIZE');let text='';
   try{for(;;){const {done,value}=await reader.read();if(done)break;text+=new TextDecoder().decode(value);if(Buffer.byteLength(text)>256)throw Error('SIZE');}}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}const receipt=JSON.parse(text);
   if(Object.keys(receipt).sort().join()!=='effectCount,eventId,status'||receipt.eventId!==id||receipt.status!=='RECORDED'||receipt.effectCount!==0)throw Error('RECEIPT');
  }catch{throw Error('SECURITY_ALERT_DELIVERY_UNCONFIRMED');}
 }});
}
