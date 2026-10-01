import type {AuthorizedWorkspaceContext} from "../integration/contracts.js";
import type {DraftPlan} from "./draft-goal.js";
export interface DraftMilestoneRequest {
 readonly asOf:string;
 readonly milestones:readonly {readonly id:string;readonly stepId:string;readonly measure:string;readonly target:number;readonly observed:number|null;readonly evidenceFingerprints:readonly string[];readonly observedAt:string|null}[];
}
export interface DraftProgress {
 readonly kind:"DRAFT_PROGRESS";readonly workspaceId:string;readonly planId:string;readonly goalId:string;readonly asOf:string;
 readonly milestones:readonly {readonly id:string;readonly stepId:string;readonly measure:string;readonly target:number;readonly observed:number|null;readonly evidenceFingerprints:readonly string[];readonly status:"UNVERIFIED_OBSERVATION"|"NO_OBSERVATION";readonly achieved:null}[];
 readonly evidenceFingerprints:readonly string[];readonly uncertainty:readonly string[];
 readonly status:"DRAFT_UNVERIFIED";readonly achievement:"NOT_ESTABLISHED";readonly approved:false;readonly actionable:false;readonly executable:false;readonly verifiedFact:false;
}
const txt=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=2000;
const unique=(v:unknown,min:number,max:number):v is string[]=>Array.isArray(v)&&v.length>=min&&v.length<=max&&v.every(txt)&&new Set(v).size===v.length;
const timestamp=(v:unknown):v is string=>typeof v==="string"&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const quantity=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
/** Observations are caller supplied and explicitly unverified; arithmetic never establishes achievement. */
export function observeDraftProgress(context:AuthorizedWorkspaceContext,plan:DraftPlan,request:DraftMilestoneRequest):DraftProgress {
 if(!context||!txt(context.workspaceId)||!plan||plan.workspaceId!==context.workspaceId)throw new Error("UNAUTHORIZED_PROGRESS_WORKSPACE");
 if(plan.kind!=="DRAFT_PLAN"||plan.status!=="DRAFT_UNVERIFIED"||plan.confidence!=="INSUFFICIENT"||
 plan.selectedAlternativeId!==null||plan.approved!==false||plan.actionable!==false||plan.executable!==false||plan.verifiedFact!==false||
 !txt(plan.goalId)||!txt(plan.planId)||!txt(plan.proposalId)||!timestamp(plan.asOf)||
 !unique(plan.evidenceFingerprints,1,100)||!unique(plan.uncertainty,1,100)||!plan.uncertainty.includes("SOURCE_UNVERIFIED")||
 !unique(plan.assumptions,1,20)||!unique(plan.constraints,1,20)||
 !Array.isArray(plan.steps)||plan.steps.length<1||plan.steps.length>20||
 plan.steps.some(s=>!s||!txt(s.id)||!txt(s.description)||!Array.isArray(s.dependencyIds))||
 new Set(plan.steps.map(s=>s.id)).size!==plan.steps.length)throw new Error("UNSAFE_PROGRESS_PLAN");
 if(!request||!timestamp(request.asOf)||Date.parse(request.asOf)<Date.parse(plan.asOf)||
 Date.parse(request.asOf)-Date.parse(plan.asOf)>366*86400000||
 !Array.isArray(request.milestones)||request.milestones.length<1||request.milestones.length>20||
 request.milestones.some(m=>!m||!txt(m.id)||!txt(m.stepId)||!plan.steps.some(s=>s.id===m.stepId)||
 !txt(m.measure)||!quantity(m.target)||m.target===0||
 (m.observed!==null&&!quantity(m.observed))||
 (m.observed===null&&(m.observedAt!==null||!Array.isArray(m.evidenceFingerprints)||m.evidenceFingerprints.length!==0))||
 (m.observed!==null&&(!timestamp(m.observedAt)||Date.parse(m.observedAt)<Date.parse(plan.asOf)||
 Date.parse(m.observedAt)>Date.parse(request.asOf)||!unique(m.evidenceFingerprints,1,100)||
 m.evidenceFingerprints.some((fp:string)=>!plan.evidenceFingerprints.includes(fp)))))||
 new Set(request.milestones.map(m=>m.id)).size!==request.milestones.length||
 new Set(request.milestones.map(m=>m.stepId)).size!==request.milestones.length)
 throw new Error("INVALID_DRAFT_PROGRESS");
 return structuredClone({kind:"DRAFT_PROGRESS" as const,workspaceId:context.workspaceId,planId:plan.planId,goalId:plan.goalId,asOf:request.asOf,
 milestones:request.milestones.map(m=>({id:m.id,stepId:m.stepId,measure:m.measure,target:m.target,observed:m.observed,
 evidenceFingerprints:[...m.evidenceFingerprints],status:m.observed===null?"NO_OBSERVATION" as const:"UNVERIFIED_OBSERVATION" as const,achieved:null})),
 evidenceFingerprints:[...plan.evidenceFingerprints],
 uncertainty:[...new Set([...plan.uncertainty,"MILESTONE_OBSERVATIONS_NOT_INDEPENDENTLY_VERIFIED","ACHIEVEMENT_NOT_ESTABLISHED"])],
 status:"DRAFT_UNVERIFIED" as const,achievement:"NOT_ESTABLISHED" as const,approved:false as const,actionable:false as const,executable:false as const,verifiedFact:false as const});
}
