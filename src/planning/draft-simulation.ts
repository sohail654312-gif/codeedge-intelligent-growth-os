import type {AuthorizedWorkspaceContext} from "../integration/contracts.js";
import type {DraftPlan} from "./draft-goal.js";
import type {DraftProgress} from "./draft-progress.js";
export interface DraftSimulation {
 readonly kind:"DRAFT_ORCHESTRATION_SIMULATION";readonly workspaceId:string;readonly planId:string;readonly goalId:string;readonly asOf:string;
 readonly steps:readonly {readonly id:string;readonly dependencyIds:readonly string[];readonly assessment:"BLOCKED_UNVERIFIED_DEPENDENCY"|"REVIEW_ONLY_UNVERIFIED";readonly milestoneStatus:"UNVERIFIED_OBSERVATION"|"NO_OBSERVATION"|"NO_MILESTONE";readonly executable:false}[];
 readonly constraints:readonly string[];readonly evidenceFingerprints:readonly string[];readonly uncertainty:readonly string[];
 readonly status:"SIMULATED_ONLY";readonly approved:false;readonly scheduled:false;readonly actionable:false;readonly executable:false;readonly verifiedFact:false;
}
const txt=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=2000;
const unique=(v:unknown,min:number,max:number):v is string[]=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(txt)&&new Set(v).size===v.length;
const timestamp=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
/** A pure visualization of dependency uncertainty; never a scheduler or execution engine. */
export function simulateDraftOrchestration(context:AuthorizedWorkspaceContext,plan:DraftPlan,progress:DraftProgress):DraftSimulation {
 if(!context||!txt(context.workspaceId)||!plan||!progress||plan.workspaceId!==context.workspaceId||progress.workspaceId!==context.workspaceId)
 throw new Error("UNAUTHORIZED_SIMULATION_WORKSPACE");
 if(plan.kind!=="DRAFT_PLAN"||plan.status!=="DRAFT_UNVERIFIED"||plan.confidence!=="INSUFFICIENT"||
 plan.selectedAlternativeId!==null||plan.approved!==false||plan.actionable!==false||plan.executable!==false||plan.verifiedFact!==false||
 !txt(plan.goalId)||!txt(plan.planId)||!timestamp(plan.asOf)||!unique(plan.evidenceFingerprints,1,100)||
 !unique(plan.uncertainty,1,100)||!plan.uncertainty.includes("SOURCE_UNVERIFIED")||
 !unique(plan.constraints,1,20)||!Array.isArray(plan.steps)||plan.steps.length<1||plan.steps.length>20||
 plan.steps.some(s=>!s||!txt(s.id)||!txt(s.description)||!Array.isArray(s.dependencyIds)||s.dependencyIds.length>20||
 new Set(s.dependencyIds).size!==s.dependencyIds.length||s.dependencyIds.some((d:string)=>!txt(d)))||
 new Set(plan.steps.map(s=>s.id)).size!==plan.steps.length)throw new Error("UNSAFE_SIMULATION_PLAN");
 const seen=new Set<string>();
 for(const step of plan.steps){if(step.dependencyIds.some((d:string)=>!seen.has(d)))throw new Error("UNSAFE_SIMULATION_DEPENDENCY");seen.add(step.id);}
 if(progress.kind!=="DRAFT_PROGRESS"||progress.status!=="DRAFT_UNVERIFIED"||
 progress.planId!==plan.planId||progress.goalId!==plan.goalId||!timestamp(progress.asOf)||
 Date.parse(progress.asOf)<Date.parse(plan.asOf)||Date.parse(progress.asOf)-Date.parse(plan.asOf)>366*86400000||
 progress.achievement!=="NOT_ESTABLISHED"||(progress as DraftProgress & {scheduled?:boolean}).scheduled===true||progress.approved!==false||progress.actionable!==false||
 progress.executable!==false||progress.verifiedFact!==false||!unique(progress.evidenceFingerprints,1,100)||
 progress.evidenceFingerprints.length!==plan.evidenceFingerprints.length||
 !progress.evidenceFingerprints.every((fp:string)=>plan.evidenceFingerprints.includes(fp))||
 !unique(progress.uncertainty,1,100)||!progress.uncertainty.includes("ACHIEVEMENT_NOT_ESTABLISHED")||
 !Array.isArray(progress.milestones)||progress.milestones.length<1||progress.milestones.length>20||
 progress.milestones.some(m=>!m||!txt(m.id)||!txt(m.stepId)||!plan.steps.some(s=>s.id===m.stepId)||
 !txt(m.measure)||m.achieved!==null||
 !["NO_OBSERVATION","UNVERIFIED_OBSERVATION"].includes(m.status)||
 !Array.isArray(m.evidenceFingerprints)||m.evidenceFingerprints.some((fp:string)=>!plan.evidenceFingerprints.includes(fp))||
 (m.status==="NO_OBSERVATION"&&(m.observed!==null||m.evidenceFingerprints.length!==0))||
 (m.status==="UNVERIFIED_OBSERVATION"&&(m.observed===null||!Number.isSafeInteger(m.observed)||m.observed<0||!unique(m.evidenceFingerprints,1,100))))||
 new Set(progress.milestones.map(m=>m.stepId)).size!==progress.milestones.length)
 throw new Error("UNSAFE_SIMULATION_PROGRESS");
 return structuredClone({kind:"DRAFT_ORCHESTRATION_SIMULATION" as const,workspaceId:context.workspaceId,planId:plan.planId,goalId:plan.goalId,asOf:progress.asOf,
 steps:plan.steps.map(s=>({id:s.id,dependencyIds:[...s.dependencyIds],
 assessment:s.dependencyIds.length?"BLOCKED_UNVERIFIED_DEPENDENCY" as const:"REVIEW_ONLY_UNVERIFIED" as const,
 milestoneStatus:progress.milestones.find(m=>m.stepId===s.id)?.status??"NO_MILESTONE" as const,executable:false as const})),
 constraints:[...plan.constraints],evidenceFingerprints:[...plan.evidenceFingerprints],
 uncertainty:[...new Set([...plan.uncertainty,...progress.uncertainty,"DEPENDENCIES_NOT_INDEPENDENTLY_VERIFIED","SIMULATION_NOT_AUTHORIZATION"])],
 status:"SIMULATED_ONLY" as const,approved:false as const,scheduled:false as const,actionable:false as const,executable:false as const,verifiedFact:false as const});
}
