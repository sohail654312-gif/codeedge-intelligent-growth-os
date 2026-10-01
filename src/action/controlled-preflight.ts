import type {AuthorizedWorkspaceContext} from "../integration/contracts.js";
import type {prepareCopilotReviewHandoff} from "../copilot/review-handoff.js";
type ReviewPacket=ReturnType<typeof prepareCopilotReviewHandoff>;
export interface ControlledIntentRequest {
 readonly intentId:string;readonly asOf:string;readonly mode:"DEMO"|"SANDBOX"|"PRODUCTION";
 readonly domainService:string;readonly operation:string;readonly rationale:string;
}
export interface ActionIntentPreflight {
 readonly kind:"CONTROLLED_ACTION_PREFLIGHT";readonly workspaceId:string;readonly intentId:string;readonly reviewPacketId:string;
 readonly proposalId:string;readonly planId:string;readonly mode:"DEMO"|"SANDBOX"|"PRODUCTION";readonly asOf:string;
 readonly domainService:string;readonly operation:string;readonly rationale:string;readonly evidenceFingerprints:readonly string[];
 readonly uncertainty:readonly string[];readonly gates:readonly {readonly id:string;readonly status:"UNSATISFIED"}[];
 readonly policy:"DENY_UNVERIFIED";readonly humanApproval:"NOT_ATTESTED";readonly sourceVerification:"NOT_AUTHENTICATED";
 readonly effect:"NONE";readonly approved:false;readonly actionable:false;readonly executable:false;readonly verifiedFact:false;
}
const valid=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=2000;
const refs=(v:unknown):v is string[]=>Array.isArray(v)&&v.length>0&&v.length<=100&&v.every(valid)&&new Set(v).size===v.length;
const timestamp=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
/** A pending human-review request never authorizes an action; this pure preflight ALWAYS denies effects. */
export function draftControlledActionPreflight(context:AuthorizedWorkspaceContext,packet:ReviewPacket,request:ControlledIntentRequest):ActionIntentPreflight {
 if(!context||!valid(context.workspaceId)||!packet||packet.workspaceId!==context.workspaceId)throw Error("UNAUTHORIZED_ACTION_PREFLIGHT");
 if(packet.kind!=="COPILOT_REVIEW_REQUEST"||!valid(packet.packetId)||!valid(packet.questionId)||!valid(packet.proposalId)||!valid(packet.planId)||
 !timestamp(packet.asOf)||!valid(packet.purpose)||!valid(packet.reviewerRoleRequired)||
 packet.status!=="AWAITING_INDEPENDENT_HUMAN_REVIEW"||packet.reviewerIdentity!==null||packet.decision!==null||packet.approval!==null||
 packet.approved!==false||packet.actionable!==false||packet.executable!==false||packet.verifiedFact!==false||
 !Array.isArray(packet.toolCalls)||packet.toolCalls.length!==0||!refs(packet.evidenceFingerprints)||!refs(packet.uncertainty)||
 !packet.uncertainty.includes("SOURCE_UNVERIFIED")||!packet.uncertainty.includes("REVIEW_NOT_ATTESTED")||
 !Array.isArray(packet.sections)||packet.sections.length!==4||
 packet.sections.some((s,i)=>!s||s.category!==["ASSUMPTION","ANALYSIS","RECOMMENDATION","DRAFT_PLAN"][i]||!valid(s.content)||
 s.verifiedFact!==false||!refs(s.evidenceFingerprints)||s.evidenceFingerprints.length!==packet.evidenceFingerprints.length||
 !s.evidenceFingerprints.every((fp:string)=>packet.evidenceFingerprints.includes(fp))))
 throw Error("UNSAFE_ACTION_REVIEW_PACKET");
 if(!request||!valid(request.intentId)||!timestamp(request.asOf)||request.asOf!==packet.asOf||
 !["DEMO","SANDBOX","PRODUCTION"].includes(request.mode)||!valid(request.domainService)||!valid(request.operation)||!valid(request.rationale))
 throw Error("INVALID_ACTION_INTENT");
 return structuredClone({kind:"CONTROLLED_ACTION_PREFLIGHT" as const,workspaceId:context.workspaceId,intentId:request.intentId,
 reviewPacketId:packet.packetId,proposalId:packet.proposalId,planId:packet.planId,mode:request.mode,asOf:request.asOf,
 domainService:request.domainService,operation:request.operation,rationale:request.rationale,
 evidenceFingerprints:[...packet.evidenceFingerprints],uncertainty:[...new Set([...packet.uncertainty,"PENDING_REVIEW_IS_NOT_APPROVAL","NO_EXECUTION_AUTHORITY"])],
 gates:["AUTHENTICATED_SERVER_IDENTITY","INDEPENDENT_SOURCE_VERIFICATION","POLICY_AUTHORIZATION","ATTESTED_HUMAN_APPROVAL","DURABLE_AUDIT_AND_IDEMPOTENCY","AUTHORIZED_BUSINESS_OS_ADAPTER"].map(id=>({id,status:"UNSATISFIED" as const})),
 policy:"DENY_UNVERIFIED" as const,humanApproval:"NOT_ATTESTED" as const,sourceVerification:"NOT_AUTHENTICATED" as const,
 effect:"NONE" as const,approved:false as const,actionable:false as const,executable:false as const,verifiedFact:false as const});
}
