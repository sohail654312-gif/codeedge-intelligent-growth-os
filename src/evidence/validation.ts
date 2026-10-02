import type { AuthorizedWorkspaceContext, OperationalRecord, ValidationResult } from "../integration/contracts.js";

/** Ingestion limits apply to every record entry point, not only an orchestration fixture. */
export const MAX_CANONICAL_RECORD_BYTES = 262_144;
export const MAX_CANONICAL_STRING_BYTES = 65_536;
const encoder = new TextEncoder();
const iso=(s:unknown)=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(s)&&Number.isFinite(Date.parse(s))&&(new Date(s).toISOString()===s||new Date(s).toISOString()===s.replace("Z",".000Z"));

/** Reject non-JSON values, aliases, sparse arrays, pathological depth and oversized payloads before hashing. */
function jsonSafe(value:unknown, seen:Set<object>, budget:{bytes:number},depth=0):boolean{
 if(depth>24||budget.bytes>MAX_CANONICAL_RECORD_BYTES)return false;
 if(typeof value==="string"){
  if(value.length>MAX_CANONICAL_STRING_BYTES)return false;
  const size=encoder.encode(value).byteLength;
  budget.bytes+=size+2;
  return size<=MAX_CANONICAL_STRING_BYTES&&budget.bytes<=MAX_CANONICAL_RECORD_BYTES;
 }
 if(value===null||typeof value==="boolean"){budget.bytes+=5;return budget.bytes<=MAX_CANONICAL_RECORD_BYTES;}
 if(typeof value==="number"){if(!Number.isFinite(value))return false;budget.bytes+=24;return budget.bytes<=MAX_CANONICAL_RECORD_BYTES;}
 if(typeof value!=="object"||seen.has(value))return false;
 if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return false;
 seen.add(value);
 const keys=Object.keys(value);
 if(keys.length>10000)return false;
 budget.bytes+=2+keys.length;
 if(budget.bytes>MAX_CANONICAL_RECORD_BYTES)return false;
 if(Array.isArray(value)){
  if(keys.length!==value.length||!keys.every((key,index)=>key===String(index)))return false;
  for(const item of value)if(!jsonSafe(item,seen,budget,depth+1))return false;
 }else{
  for(const key of keys){
   if(key==="__proto__"||key==="constructor"||key==="prototype"||!jsonSafe(key,seen,budget,depth+1)||!jsonSafe((value as Record<string,unknown>)[key],seen,budget,depth+1))return false;
  }
 }
 seen.delete(value);
 return true;
}
export function validateOperationalRecord(record:OperationalRecord,context:AuthorizedWorkspaceContext):ValidationResult{
 const errors:string[]=[];
 if(!record||typeof record!=="object"||Array.isArray(record))return {ok:false,errors:["INVALID_RECORD"]};
 try{
  if(typeof record.workspaceId!=="string"||!record.workspaceId.trim())errors.push("WORKSPACE_REQUIRED");
  if(record.workspaceId!==context?.workspaceId)errors.push("CROSS_WORKSPACE_RECORD");
  if(!record.reference||typeof record.reference!=="object"||Array.isArray(record.reference)||typeof record.reference.sourceSystem!=="string"||!record.reference.sourceSystem.trim())errors.push("SOURCE_SYSTEM_REQUIRED");
  if(typeof record.reference?.externalReference!=="string"||!record.reference.externalReference.trim())errors.push("EXTERNAL_REFERENCE_REQUIRED");
  if(typeof record.resourceKind!=="string"||!record.resourceKind.trim())errors.push("RESOURCE_KIND_REQUIRED");
  if(!record.observedAt)errors.push("OBSERVED_AT_REQUIRED");
  else if(!iso(record.observedAt))errors.push("INVALID_OBSERVED_AT");
  if(record.reference?.version!==undefined&&(typeof record.reference.version!=="string"||!record.reference.version.trim()))errors.push("INVALID_SOURCE_VERSION");
  // Validate the ENTIRE record, including metadata, so unused unsafe keys cannot enter the hash boundary.
  if(!jsonSafe(record,new Set<object>(),{bytes:0})||encoder.encode(JSON.stringify(record)).byteLength>MAX_CANONICAL_RECORD_BYTES)errors.push("INVALID_JSON_VALUE");
 }catch{errors.push("INVALID_JSON_VALUE");}
 return {ok:errors.length===0,errors:[...new Set(errors)]};
}
