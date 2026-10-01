/** R8 bounded, secret-safe operational event projection. Never log untrusted payloads, URLs, credentials or source records. */
export type SecurityEventCode="AUTH_DENIED"|"TENANT_SCOPE_DENIED"|"SOURCE_UNAVAILABLE"|"APPROVAL_DENIED"|"ACTION_DENIED"|"REPLAY_CONFLICT"|"CURSOR_REJECTED"|"RATE_LIMITED"|"INTEGRITY_FAILURE";
export interface SecurityEvent {readonly code:SecurityEventCode;readonly stage:"R4"|"R5"|"R6"|"R7"|"R8";readonly mode:"DEMO"|"SANDBOX"|"PRODUCTION";readonly occurredAt:string;readonly correlationId:string;readonly severity:"INFO"|"WARN"|"ERROR";readonly effectCount:0}
export interface SecurityEventSink {emit(event:SecurityEvent):Promise<void>}
const codes=new Set<SecurityEventCode>(["AUTH_DENIED","TENANT_SCOPE_DENIED","SOURCE_UNAVAILABLE","APPROVAL_DENIED","ACTION_DENIED","REPLAY_CONFLICT","CURSOR_REJECTED","RATE_LIMITED","INTEGRITY_FAILURE"]);
const id=(v:unknown):v is string=>typeof v==="string"&&/^[a-zA-Z0-9_-]{8,64}$/.test(v);
const iso=(v:unknown):v is string=>typeof v==="string"&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString()===v;
/** Caller can choose only allowlisted codes and opaque correlation IDs; extra keys never pass through. */
export async function emitSafeSecurityEvent(sink:SecurityEventSink,input:Readonly<{code:SecurityEventCode;stage:SecurityEvent["stage"];mode:SecurityEvent["mode"];occurredAt:string;correlationId:string}>):Promise<void>{
 if(!sink||typeof sink.emit!=="function"||!input||!codes.has(input.code)||!["R4","R5","R6","R7","R8"].includes(input.stage)||!["DEMO","SANDBOX","PRODUCTION"].includes(input.mode)||!iso(input.occurredAt)||!id(input.correlationId))throw Error("INVALID_SECURITY_EVENT");
 const severity:SecurityEvent["severity"]=input.code==="INTEGRITY_FAILURE"?"ERROR":input.code==="SOURCE_UNAVAILABLE"?"WARN":"INFO";
 const event:SecurityEvent={code:input.code,stage:input.stage,mode:input.mode,occurredAt:input.occurredAt,correlationId:input.correlationId,severity,effectCount:0};
 await sink.emit(Object.freeze(event));
}
