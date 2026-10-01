import type {AuthorizedWorkspaceContext} from "../integration/contracts.js";
import type {ActionIntentPreflight} from "./controlled-preflight.js";
import {previewDeniedBusinessOsDispatch} from "./dispatch-preview.js";
type DeniedDispatchPreview=ReturnType<typeof previewDeniedBusinessOsDispatch>;
const valid=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=2000;
/**
 * A pure projection of SUPPLIED denied previews, NOT actual audit events.
 * Canonical preview recomputation validates that no forged effects/authority or changed lineage enter the summary.
 * Repeat IDs are deduplicated in memory only, never persisted as idempotency claims.
 */
export function summarizeDeniedActionLifecycle(
 context:AuthorizedWorkspaceContext,preflight:ActionIntentPreflight,previews:readonly DeniedDispatchPreview[]
){
 if(!context||!valid(context.workspaceId)||!Array.isArray(previews)||previews.length<1||previews.length>10)
 throw Error("INVALID_DENIAL_LIFECYCLE_INPUT");
 const seen=new Map<string,string>();
 const records:{previewId:string;status:"DENIED_NO_EFFECT";performedEffects:0;submitted:false}[]=[];
 let duplicateInputCount=0;
 for(const item of previews){
  if(!item||item.workspaceId!==context.workspaceId)throw Error("UNAUTHORIZED_DENIAL_LIFECYCLE");
  if(!valid(item.previewId))throw Error("INVALID_DENIAL_PREVIEW_ID");
  const expected=previewDeniedBusinessOsDispatch(context,preflight,{
   previewId:item.previewId,intentId:preflight.intentId,mode:preflight.mode,
   domainService:preflight.domainService,operation:preflight.operation,asOf:preflight.asOf
  });
  // This function never trusts previews as effect evidence, even if caller-supplied JSON appears valid.
  if(JSON.stringify(item)!==JSON.stringify(expected))throw Error("UNSAFE_DENIAL_PREVIEW");
  const identity=JSON.stringify(expected),existing=seen.get(item.previewId);
  if(existing!==undefined){
   if(existing!==identity)throw Error("CONFLICTING_DENIAL_PREVIEW");
   duplicateInputCount++;
   continue;
  }
  seen.set(item.previewId,identity);
  records.push({previewId:item.previewId,status:"DENIED_NO_EFFECT",performedEffects:0,submitted:false});
 }
 return structuredClone({
  kind:"DENIED_ACTION_LIFECYCLE_SIMULATION" as const,workspaceId:context.workspaceId,
  intentId:preflight.intentId,reviewPacketId:preflight.reviewPacketId,proposalId:preflight.proposalId,planId:preflight.planId,
  asOf:preflight.asOf,mode:preflight.mode,domainService:preflight.domainService,operation:preflight.operation,
  evidenceFingerprints:[...preflight.evidenceFingerprints],
  uncertainty:[...new Set([...preflight.uncertainty,"INPUT_PREVIEWS_NOT_AUDIT_EVENTS","NO_DURABLE_IDEMPOTENCY","NO_EXECUTION_AUTHORITY"])],
  records,replayCount:duplicateInputCount,inputCount:previews.length,distinctPreviewCount:records.length,
  status:"SIMULATED_DENIAL_ONLY" as const,auditEvidenceStatus:"NOT_DURABLE" as const,
  actualHumanApproval:false as const,actualBusinessOsDispatch:false as const,actualProviderEffect:false as const,
  approved:false as const,actionable:false as const,executable:false as const,verifiedFact:false as const
 });
}
