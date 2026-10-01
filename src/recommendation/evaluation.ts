import type { AuthorizedWorkspaceContext } from "../integration/contracts.js";
import type { CrossDomainResult } from "../analysis/cross-domain.js";
import type { RecommendationProposal } from "./proposal.js";

export interface EvaluatedAlternative {
  readonly id: string;
  readonly description: string;
  readonly tradeOffs: readonly string[];
  readonly dependencies: readonly string[];
  readonly grounding: "CANDIDATE_UNVERIFIED";
}
export interface RecommendationEvaluation {
  readonly kind: "RECOMMENDATION_EVALUATION";
  readonly workspaceId: string;
  readonly proposalId: string;
  readonly asOf: string;
  readonly supportingEvidenceFingerprints: readonly string[];
  readonly alternatives: readonly EvaluatedAlternative[];
  readonly uncertainty: readonly string[];
  readonly confidence: "INSUFFICIENT";
  readonly semanticGrounding: "NOT_VERIFIED";
  readonly status: "EVALUATION_ONLY";
  readonly selectedAlternativeId: null;
  readonly decisionAuthority: "NONE";
  readonly approved: false;
  readonly actionable: false;
  readonly verifiedFact: false;
}
const text=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=2000;
const strings=(v:unknown,min:number,max:number):v is string[]=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(text)&&new Set(v).size===v.length;
/** Structural evaluation only. Never infer candidate prose is entailed by source metrics. */
export function evaluateRecommendation(
  context: AuthorizedWorkspaceContext, analysis: CrossDomainResult, proposal: RecommendationProposal,
  dependencies: Readonly<Record<string,readonly string[]>>,
): RecommendationEvaluation {
  if (!context || !text(context.workspaceId) || !analysis || !proposal ||
    analysis.workspaceId!==context.workspaceId || proposal.workspaceId!==context.workspaceId)
    throw new Error("UNAUTHORIZED_EVALUATION_WORKSPACE");
  if (analysis.kind!=="ANALYSIS" || analysis.status!=="AVAILABLE" || analysis.sourceCoverage!=="UNVERIFIED" ||
    analysis.confidence!=="INSUFFICIENT" || analysis.verifiedFact!==false || analysis.actionable!==false ||
    !text(analysis.asOf) || proposal.asOf!==analysis.asOf || !strings(analysis.evidenceFingerprints,1,100) ||
    !Array.isArray(analysis.insights) || analysis.insights.length<2 || analysis.insights.length>100 ||
    analysis.insights.some(i=>i.status!=="AVAILABLE" || i.value===null ||
      i.verifiedFact!==false || i.actionable!==false || !strings(i.evidenceFingerprints,1,100) ||
      i.evidenceFingerprints.some((fp:string)=>!analysis.evidenceFingerprints.includes(fp))) ||
    !strings(analysis.limitations,1,100) || !analysis.limitations.includes("SOURCE_UNVERIFIED"))
    throw new Error("UNSAFE_EVALUATION_ANALYSIS");
  if (proposal.kind!=="RECOMMENDATION" || proposal.status!=="PROPOSED_UNVERIFIED" ||
    proposal.sourceCoverage!=="UNVERIFIED" || proposal.confidence!=="INSUFFICIENT" ||
    proposal.decisionAuthority!=="NONE" || proposal.approved!==false || proposal.actionable!==false ||
    proposal.verifiedFact!==false || !text(proposal.proposalId) || !text(proposal.title) || !text(proposal.rationale) ||
    !strings(proposal.assumptions,1,20) || !strings(proposal.supportingEvidenceFingerprints,1,100) ||
    proposal.supportingEvidenceFingerprints.some((fp:string)=>!analysis.evidenceFingerprints.includes(fp)) ||
    !strings(proposal.analysisLimitations,1,100) ||
    proposal.analysisLimitations.length!==analysis.limitations.length ||
    proposal.analysisLimitations.some((v:string,i:number)=>v!==analysis.limitations[i]) ||
    !Array.isArray(proposal.alternatives) || proposal.alternatives.length<2 || proposal.alternatives.length>5 ||
    proposal.alternatives.some(a=>!a || !text(a.id) || !text(a.description) || !strings(a.tradeOffs,1,10)) ||
    new Set(proposal.alternatives.map(a=>a.id)).size!==proposal.alternatives.length)
    throw new Error("UNSAFE_EVALUATION_PROPOSAL");
  if (!dependencies || typeof dependencies!=="object" || Array.isArray(dependencies) ||
    Object.keys(dependencies).length!==proposal.alternatives.length ||
    Object.keys(dependencies).some(id=>!proposal.alternatives.some(a=>a.id===id)) ||
    proposal.alternatives.some(a=>!Object.hasOwn(dependencies,a.id) || !strings(dependencies[a.id],1,10)))
    throw new Error("INVALID_EVALUATION_DEPENDENCIES");
  return structuredClone({
    kind:"RECOMMENDATION_EVALUATION" as const, workspaceId:context.workspaceId,
    proposalId:proposal.proposalId, asOf:proposal.asOf,
    supportingEvidenceFingerprints:[...proposal.supportingEvidenceFingerprints],
    alternatives:proposal.alternatives.map(a=>({id:a.id,description:a.description,tradeOffs:[...a.tradeOffs],
      dependencies:[...dependencies[a.id]],grounding:"CANDIDATE_UNVERIFIED" as const})),
    uncertainty:[...new Set(["SOURCE_UNVERIFIED","CANDIDATE_RATIONALE_NOT_SEMANTICALLY_VERIFIED",
      "ALTERNATIVE_DEPENDENCIES_UNVERIFIED","NO_CAUSAL_INFERENCE",...analysis.limitations,...proposal.assumptions])],
    confidence:"INSUFFICIENT" as const,semanticGrounding:"NOT_VERIFIED" as const,status:"EVALUATION_ONLY" as const,
    selectedAlternativeId:null,decisionAuthority:"NONE" as const,approved:false as const,
    actionable:false as const,verifiedFact:false as const,
  });
}
