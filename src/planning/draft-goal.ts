import type { AuthorizedWorkspaceContext } from "../integration/contracts.js";
import type { RecommendationEvaluation } from "../recommendation/evaluation.js";

export interface DraftGoalRequest {
 readonly goalId:string; readonly planId:string; readonly asOf:string; readonly objective:string;
 readonly outcomeMeasure:string; readonly assumptions:readonly string[]; readonly constraints:readonly string[];
 readonly steps:readonly {readonly id:string;readonly description:string;readonly dependencyIds:readonly string[]}[];
}
export interface DraftPlan {
 readonly kind:"DRAFT_PLAN";readonly workspaceId:string;readonly goalId:string;readonly planId:string;
 readonly proposalId:string;readonly asOf:string;readonly objective:string;readonly outcomeMeasure:string;
 readonly assumptions:readonly string[];readonly constraints:readonly string[];
 readonly steps:readonly {readonly id:string;readonly description:string;readonly dependencyIds:readonly string[]}[];
 readonly evidenceFingerprints:readonly string[];readonly uncertainty:readonly string[];
 readonly status:"DRAFT_UNVERIFIED";readonly confidence:"INSUFFICIENT";readonly selectedAlternativeId:null;
 readonly approved:false;readonly actionable:false;readonly executable:false;readonly verifiedFact:false;
}
const txt=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=2000;
const strs=(v:unknown,min:number,max:number):v is string[]=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(txt)&&new Set(v).size===v.length;
/** Reference-only draft: the caller's objective, steps and measure are NOT verified facts. */
export function draftGoalPlan(context:AuthorizedWorkspaceContext,evaluation:RecommendationEvaluation,request:DraftGoalRequest):DraftPlan {
 if(!context||!txt(context.workspaceId)||!evaluation||evaluation.workspaceId!==context.workspaceId)throw new Error("UNAUTHORIZED_PLAN_WORKSPACE");
 if(evaluation.kind!=="RECOMMENDATION_EVALUATION"||evaluation.status!=="EVALUATION_ONLY"||
 evaluation.confidence!=="INSUFFICIENT"||evaluation.semanticGrounding!=="NOT_VERIFIED"||
 evaluation.selectedAlternativeId!==null||evaluation.decisionAuthority!=="NONE"||
 evaluation.approved!==false||evaluation.actionable!==false||evaluation.verifiedFact!==false||
 !txt(evaluation.proposalId)||!txt(evaluation.asOf)||
 !strs(evaluation.supportingEvidenceFingerprints,1,100)||!strs(evaluation.uncertainty,1,100)||
 !evaluation.uncertainty.includes("SOURCE_UNVERIFIED")||
 !Array.isArray(evaluation.alternatives)||evaluation.alternatives.length<2||evaluation.alternatives.length>5||
 evaluation.alternatives.some(a=>!a||!txt(a.id)||a.grounding!=="CANDIDATE_UNVERIFIED"||
 !strs(a.tradeOffs,1,10)||!strs(a.dependencies,1,10))||
 new Set(evaluation.alternatives.map(a=>a.id)).size!==evaluation.alternatives.length)
 throw new Error("UNSAFE_PLAN_SOURCE");
 if(!request||!txt(request.goalId)||!txt(request.planId)||!txt(request.objective)||
 !txt(request.outcomeMeasure)||!txt(request.asOf)||request.asOf!==evaluation.asOf||
 !strs(request.assumptions,1,20)||!strs(request.constraints,1,20)||
 !Array.isArray(request.steps)||request.steps.length<1||request.steps.length>20||
 request.steps.some(s=>!s||!txt(s.id)||!txt(s.description)||!Array.isArray(s.dependencyIds)||
 s.dependencyIds.length>20||s.dependencyIds.some((d:string)=>!txt(d))||new Set(s.dependencyIds).size!==s.dependencyIds.length)||
 new Set(request.steps.map(s=>s.id)).size!==request.steps.length)
 throw new Error("INVALID_DRAFT_PLAN");
 const seen=new Set<string>();
 for(const step of request.steps){if(step.dependencyIds.some((id:string)=>!seen.has(id)))throw new Error("INVALID_PLAN_DEPENDENCY");seen.add(step.id);}
 return structuredClone({kind:"DRAFT_PLAN" as const,workspaceId:context.workspaceId,goalId:request.goalId,
 planId:request.planId,proposalId:evaluation.proposalId,asOf:request.asOf,objective:request.objective,
 outcomeMeasure:request.outcomeMeasure,assumptions:[...request.assumptions],constraints:[...request.constraints],
 steps:request.steps.map(s=>({id:s.id,description:s.description,dependencyIds:[...s.dependencyIds]})),
 evidenceFingerprints:[...evaluation.supportingEvidenceFingerprints],
 uncertainty:[...new Set([...evaluation.uncertainty,"GOAL_AND_PLAN_CANDIDATE_UNVERIFIED","OUTCOME_MEASURE_NOT_VALIDATED"])],
 status:"DRAFT_UNVERIFIED" as const,confidence:"INSUFFICIENT" as const,selectedAlternativeId:null,
 approved:false as const,actionable:false as const,executable:false as const,verifiedFact:false as const});
}
