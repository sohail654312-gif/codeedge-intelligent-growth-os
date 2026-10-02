import type { AuthorizedWorkspaceContext, OperationalRecord, ValidationResult } from "../integration/contracts.js";
const iso=(s:unknown)=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(s)&&Number.isFinite(Date.parse(s))&&(new Date(s).toISOString()===s||new Date(s).toISOString()===s.replace("Z",".000Z"));
function jsonSafe(value:unknown,seen=new Set<object>(),depth=0):boolean{
 if(depth>24)return false;
 if(value===null||typeof value==="string"||typeof value==="boolean")return true;
 if(typeof value==="number")return Number.isFinite(value);
 if(typeof value!=="object"||seen.has(value))return false;
 if(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)return false;
 seen.add(value);
 const ok=Array.isArray(value)?value.length<=10000&&Object.keys(value).length===value.length&&value.every(v=>jsonSafe(v,seen,depth+1)):
 Object.keys(value).length<=10000&&Object.keys(value).every(k=>k!=="__proto__"&&k!=="constructor"&&k!=="prototype"&&jsonSafe((value as Record<string,unknown>)[k],seen,depth+1));
 seen.delete(value);return ok;
}
export function validateOperationalRecord(record:OperationalRecord,context:AuthorizedWorkspaceContext):ValidationResult{
 const errors:string[]=[];
 if(!record||typeof record!=="object"||Array.isArray(record))return {ok:false,errors:["INVALID_RECORD"]};
 if(typeof record.workspaceId!=="string"||!record.workspaceId.trim())errors.push("WORKSPACE_REQUIRED");
 if(record.workspaceId!==context?.workspaceId)errors.push("CROSS_WORKSPACE_RECORD");
 if(!record.reference||typeof record.reference!=="object"||typeof record.reference.sourceSystem!=="string"||!record.reference.sourceSystem.trim())errors.push("SOURCE_SYSTEM_REQUIRED");
 if(typeof record.reference?.externalReference!=="string"||!record.reference.externalReference.trim())errors.push("EXTERNAL_REFERENCE_REQUIRED");
 if(typeof record.resourceKind!=="string"||!record.resourceKind.trim())errors.push("RESOURCE_KIND_REQUIRED");
 if(!record.observedAt)errors.push("OBSERVED_AT_REQUIRED");
 else if(!iso(record.observedAt))errors.push("INVALID_OBSERVED_AT");
 if(!jsonSafe(record.value))errors.push("INVALID_JSON_VALUE");
 if(record.reference?.version!==undefined&&(typeof record.reference.version!=="string"||!record.reference.version.trim()))errors.push("INVALID_SOURCE_VERSION");
 return {ok:errors.length===0,errors:[...new Set(errors)]};
}
