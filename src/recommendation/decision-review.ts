import type { AuthorizedWorkspaceContext } from "../integration/contracts.js";
import type { RecommendationEvaluation } from "./evaluation.js";

/** An inert review packet, never a human attestation, decision or authorization. */
export interface DecisionReviewRequest {
  readonly recordId: string;
  readonly asOf: string;
  readonly expiresAt: string;
  readonly purpose: string;
  readonly reviewerRoleRequired: string;
}
export interface DecisionReviewPacket {
  readonly kind: "DECISION_REVIEW_PACKET";
  readonly workspaceId: string;
  readonly recordId: string;
  readonly proposalId: string;
  readonly asOf: string;
  readonly expiresAt: string;
  readonly purpose: string;
  readonly reviewerRoleRequired: string;
  readonly alternatives: readonly {readonly id:string;readonly tradeOffs:readonly string[];readonly dependencies:readonly string[]}[];
  readonly supportingEvidenceFingerprints: readonly string[];
  readonly uncertainty: readonly string[];
  readonly reviewStatus: "AWAITING_INDEPENDENT_HUMAN_REVIEW";
  readonly reviewerIdentity: null;
  readonly selectedAlternativeId: null;
  readonly decision: null;
  readonly approval: null;
  readonly authority: "NONE";
  readonly executable: false;
  readonly actionable: false;
  readonly verifiedFact: false;
}
const valid=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=2000;
const unique=(v:unknown,min:number,max:number):v is string[]=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(valid)&&new Set(v).size===v.length;
/** No reviewer identity is accepted from model or caller. No storage, mutation or execution. */
export function prepareDecisionReview(context:AuthorizedWorkspaceContext,evaluation:RecommendationEvaluation,request:DecisionReviewRequest):DecisionReviewPacket {
  if (!context || !valid(context.workspaceId) || !evaluation || evaluation.workspaceId!==context.workspaceId)
    throw new Error("UNAUTHORIZED_DECISION_WORKSPACE");
  if (evaluation.kind!=="RECOMMENDATION_EVALUATION" || evaluation.status!=="EVALUATION_ONLY" ||
    evaluation.confidence!=="INSUFFICIENT" || evaluation.semanticGrounding!=="NOT_VERIFIED" ||
    evaluation.selectedAlternativeId!==null || evaluation.decisionAuthority!=="NONE" ||
    evaluation.approved!==false || evaluation.actionable!==false || evaluation.verifiedFact!==false ||
    !valid(evaluation.proposalId) || !valid(evaluation.asOf) ||
    !unique(evaluation.supportingEvidenceFingerprints,1,100) || !unique(evaluation.uncertainty,1,100) ||
    !evaluation.uncertainty.includes("SOURCE_UNVERIFIED") ||
    !Array.isArray(evaluation.alternatives) || evaluation.alternatives.length<2 || evaluation.alternatives.length>5 ||
    evaluation.alternatives.some(a=>!a || !valid(a.id) || !valid(a.description) ||
      a.grounding!=="CANDIDATE_UNVERIFIED" || !unique(a.tradeOffs,1,10) || !unique(a.dependencies,1,10)) ||
    new Set(evaluation.alternatives.map(a=>a.id)).size!==evaluation.alternatives.length)
    throw new Error("UNSAFE_DECISION_EVALUATION");
  if (!request || !valid(request.recordId) || !valid(request.purpose) || !valid(request.reviewerRoleRequired) ||
    !valid(request.asOf) || request.asOf!==evaluation.asOf || !valid(request.expiresAt) ||
    !Number.isFinite(Date.parse(request.asOf)) || !Number.isFinite(Date.parse(request.expiresAt)) ||
    Date.parse(request.expiresAt)<=Date.parse(request.asOf) ||
    Date.parse(request.expiresAt)-Date.parse(request.asOf)>7*86400000)
    throw new Error("INVALID_DECISION_REVIEW_REQUEST");
  return structuredClone({
    kind:"DECISION_REVIEW_PACKET" as const,workspaceId:context.workspaceId,recordId:request.recordId,
    proposalId:evaluation.proposalId,asOf:request.asOf,expiresAt:request.expiresAt,
    purpose:request.purpose,reviewerRoleRequired:request.reviewerRoleRequired,
    alternatives:evaluation.alternatives.map(a=>({id:a.id,tradeOffs:[...a.tradeOffs],dependencies:[...a.dependencies]})),
    supportingEvidenceFingerprints:[...evaluation.supportingEvidenceFingerprints],
    uncertainty:[...evaluation.uncertainty],reviewStatus:"AWAITING_INDEPENDENT_HUMAN_REVIEW" as const,
    reviewerIdentity:null,selectedAlternativeId:null,decision:null,approval:null,authority:"NONE" as const,
    executable:false as const,actionable:false as const,verifiedFact:false as const,
  });
}
