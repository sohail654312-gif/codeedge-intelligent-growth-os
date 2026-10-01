import type {AuthorizedWorkspaceContext} from "../integration/contracts.js";
import type {ActionIntentPreflight} from "./controlled-preflight.js";

export interface DispatchPreviewRequest {
 readonly previewId:string;
 readonly intentId:string;
 readonly mode:"DEMO"|"SANDBOX"|"PRODUCTION";
 readonly domainService:string;
 readonly operation:string;
 readonly asOf:string;
}
const text=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=2000;
const unique=(v:unknown):v is string[]=>Array.isArray(v)&&v.length>=1&&v.length<=100&&v.every(text)&&new Set(v).size===v.length;
const timestamp=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export const REQUIRED_DISPATCH_GATES=[
 "AUTHENTICATED_SERVER_IDENTITY","INDEPENDENT_SOURCE_VERIFICATION","POLICY_AUTHORIZATION",
 "ATTESTED_HUMAN_APPROVAL","DURABLE_AUDIT_AND_IDEMPOTENCY","AUTHORIZED_BUSINESS_OS_ADAPTER"
] as const;
/** Pure preview: a denied preflight cannot become a dispatch, even in Demo mode. */
export function previewDeniedBusinessOsDispatch(context:AuthorizedWorkspaceContext,preflight:ActionIntentPreflight,request:DispatchPreviewRequest){
 if(!context||!text(context.workspaceId)||!preflight||preflight.workspaceId!==context.workspaceId)throw Error("UNAUTHORIZED_DISPATCH_PREVIEW");
 if(preflight.kind!=="CONTROLLED_ACTION_PREFLIGHT"||!text(preflight.intentId)||!text(preflight.reviewPacketId)||
 !text(preflight.proposalId)||!text(preflight.planId)||!timestamp(preflight.asOf)||
 !["DEMO","SANDBOX","PRODUCTION"].includes(preflight.mode)||!text(preflight.domainService)||!text(preflight.operation)||!text(preflight.rationale)||
 !unique(preflight.evidenceFingerprints)||!unique(preflight.uncertainty)||
 !["SOURCE_UNVERIFIED","COPILOT_CONTENT_NOT_INDEPENDENTLY_VERIFIED","REVIEW_NOT_ATTESTED","PENDING_REVIEW_IS_NOT_APPROVAL","NO_EXECUTION_AUTHORITY"].every(t=>preflight.uncertainty.includes(t))||
 preflight.policy!=="DENY_UNVERIFIED"||preflight.humanApproval!=="NOT_ATTESTED"||preflight.sourceVerification!=="NOT_AUTHENTICATED"||
 preflight.effect!=="NONE"||preflight.approved!==false||preflight.actionable!==false||preflight.executable!==false||preflight.verifiedFact!==false||
 !Array.isArray(preflight.gates)||preflight.gates.length!==REQUIRED_DISPATCH_GATES.length||
 preflight.gates.some((g,i)=>!g||g.id!==REQUIRED_DISPATCH_GATES[i]||g.status!=="UNSATISFIED"))
 throw Error("UNSAFE_DISPATCH_PREFLIGHT");
 if(!request||!text(request.previewId)||request.intentId!==preflight.intentId||request.mode!==preflight.mode||
 request.domainService!==preflight.domainService||request.operation!==preflight.operation||request.asOf!==preflight.asOf)
 throw Error("INVALID_DISPATCH_PREVIEW");
 return structuredClone({
 kind:"BUSINESS_OS_DISPATCH_PREVIEW" as const,workspaceId:context.workspaceId,previewId:request.previewId,
 intentId:preflight.intentId,reviewPacketId:preflight.reviewPacketId,proposalId:preflight.proposalId,planId:preflight.planId,
 mode:preflight.mode,asOf:preflight.asOf,domainBoundary:"BUSINESS_OS_DOMAIN_SERVICE_ONLY" as const,
 domainService:preflight.domainService,operation:preflight.operation,evidenceFingerprints:[...preflight.evidenceFingerprints],
 uncertainty:[...new Set([...preflight.uncertainty,"DISPATCH_PREVIEW_IS_NOT_EXECUTION","NO_PROVIDER_ADAPTER_INVOCATION"])],
 gateStatus:"BLOCKED_UNVERIFIED" as const,reason:"UNSATISFIED_PRODUCTION_GATES" as const,
 requestedEffects:0 as const,performedEffects:0 as const,submitted:false as const,authorized:false as const,
 scheduled:false as const,approved:false as const,actionable:false as const,executable:false as const,verifiedFact:false as const
 });
}
