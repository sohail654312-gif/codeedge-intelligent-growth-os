import type { AuthorizedWorkspaceContext } from "../integration/contracts.js";
import type { CrossDomainResult } from "../analysis/cross-domain.js";

export interface RecommendationOption {
  readonly id: string;
  readonly description: string;
  readonly tradeOffs: readonly string[];
}
export interface RecommendationRequest {
  readonly proposalId: string;
  readonly asOf: string;
  readonly title: string;
  readonly rationale: string;
  readonly assumptions: readonly string[];
  readonly alternatives: readonly RecommendationOption[];
  readonly supportingEvidenceFingerprints: readonly string[];
}
export interface RecommendationProposal {
  readonly kind: "RECOMMENDATION";
  readonly workspaceId: string;
  readonly proposalId: string;
  readonly asOf: string;
  readonly title: string;
  readonly rationale: string;
  readonly assumptions: readonly string[];
  readonly alternatives: readonly RecommendationOption[];
  readonly supportingEvidenceFingerprints: readonly string[];
  readonly analysisLimitations: readonly string[];
  readonly confidence: "INSUFFICIENT";
  readonly sourceCoverage: "UNVERIFIED";
  readonly status: "PROPOSED_UNVERIFIED";
  readonly decisionAuthority: "NONE";
  readonly approved: false;
  readonly actionable: false;
  readonly verifiedFact: false;
}
const validText=(x:unknown):x is string=>typeof x==="string"&&x.trim().length>0&&x.length<=2000;
const uniqueTexts=(a:unknown,max:number):a is string[]=>Array.isArray(a)&&a.length>0&&a.length<=max&&a.every(validText)&&new Set(a).size===a.length;
/** Formats a human-supplied candidate against bounded, complete, read-only Part4 analysis; never approves it. */
export function proposeRecommendation(context: AuthorizedWorkspaceContext, analysis: CrossDomainResult, request: RecommendationRequest): RecommendationProposal {
  if (!context || !validText(context.workspaceId) || !analysis || analysis.workspaceId!==context.workspaceId) throw new Error("UNAUTHORIZED_RECOMMENDATION_WORKSPACE");
  if (analysis.kind!=="ANALYSIS" || analysis.verifiedFact!==false || analysis.actionable!==false ||
    analysis.sourceCoverage!=="UNVERIFIED" || analysis.confidence!=="INSUFFICIENT" ||
    analysis.status!=="AVAILABLE" || !Array.isArray(analysis.insights) || analysis.insights.length<2 ||
    analysis.insights.length>100 || analysis.insights.some(i=>i.kind!=="ANALYSIS" || i.verifiedFact!==false || i.actionable!==false ||
      i.status!=="AVAILABLE" || i.value===null || !Array.isArray(i.evidenceFingerprints) || !i.evidenceFingerprints.length ||
      i.evidenceFingerprints.some(fp=>!validText(fp))) ||
    !uniqueTexts(analysis.evidenceFingerprints,100) ||
    !analysis.insights.every(i=>i.evidenceFingerprints.every(fp=>analysis.evidenceFingerprints.includes(fp))) ||
    !Array.isArray(analysis.limitations) || !analysis.limitations.includes("SOURCE_UNVERIFIED") ||
    !validText(analysis.asOf)) throw new Error("UNSAFE_RECOMMENDATION_ANALYSIS");
  if (!request || !validText(request.proposalId) || !validText(request.title) || !validText(request.rationale) ||
    !validText(request.asOf) || request.asOf!==analysis.asOf ||
    !uniqueTexts(request.assumptions,20) || !uniqueTexts(request.supportingEvidenceFingerprints,100) ||
    !request.supportingEvidenceFingerprints.every(fp=>analysis.evidenceFingerprints.includes(fp)) ||
    !Array.isArray(request.alternatives) || request.alternatives.length<2 || request.alternatives.length>5 ||
    request.alternatives.some(a=>!a || !validText(a.id) || !validText(a.description) || !uniqueTexts(a.tradeOffs,10)) ||
    new Set(request.alternatives.map(a=>a.id)).size!==request.alternatives.length)
    throw new Error("INVALID_RECOMMENDATION_REQUEST");
  return structuredClone({
    kind:"RECOMMENDATION" as const,workspaceId:context.workspaceId,proposalId:request.proposalId,
    asOf:request.asOf,title:request.title,rationale:request.rationale,
    assumptions:[...request.assumptions],alternatives:request.alternatives.map(a=>({id:a.id,description:a.description,tradeOffs:[...a.tradeOffs]})),
    supportingEvidenceFingerprints:[...request.supportingEvidenceFingerprints],
    analysisLimitations:[...analysis.limitations],confidence:"INSUFFICIENT" as const,sourceCoverage:"UNVERIFIED" as const,
    status:"PROPOSED_UNVERIFIED" as const,decisionAuthority:"NONE" as const,
    approved:false as const,actionable:false as const,verifiedFact:false as const,
  });
}
