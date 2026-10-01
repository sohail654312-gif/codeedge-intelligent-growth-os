import test from "node:test";
import assert from "node:assert/strict";
import {analyzeCrossDomain} from "../dist/src/analysis/cross-domain.js";
import {proposeRecommendation} from "../dist/src/recommendation/proposal.js";
import {evaluateRecommendation} from "../dist/src/recommendation/evaluation.js";
import {draftGoalPlan} from "../dist/src/planning/draft-goal.js";
const now="2026-10-01T00:00:00.000Z",ctx={workspaceId:"clinic",actorId:"model",authorizedAt:now};
const metric=d=>({workspaceId:"clinic",domain:d,metricKey:d.toLowerCase(),periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-09-30T00:00:00.000Z",observedAt:now,unit:"COUNT",numerator:4,denominator:8,evidenceFingerprints:["source-"+d],coverage:"COMPLETE",verification:"UNVERIFIED"});
const evaluation=()=>{const a=analyzeCrossDomain(ctx,[metric("LEADS"),metric("APPOINTMENTS")],{asOf:now,maxEvidenceAgeMs:86400000,domains:["LEADS","APPOINTMENTS"]});const p=proposeRecommendation(ctx,a,{proposalId:"p1",asOf:now,title:"Review",rationale:"Candidate",assumptions:["Staff unknown"],alternatives:[{id:"a",description:"Review",tradeOffs:["Time"]},{id:"b",description:"Observe",tradeOffs:["Delay"]}],supportingEvidenceFingerprints:[...a.evidenceFingerprints]});return evaluateRecommendation(ctx,a,p,{a:["Staff"],b:["Data"]});};
const req=()=>({goalId:"g1",planId:"plan1",asOf:now,objective:"Explore follow-up quality",outcomeMeasure:"Candidate observation count",assumptions:["Resources unknown"],constraints:["No live changes"],steps:[{id:"observe",description:"Review observations",dependencyIds:[]},{id:"draft",description:"Prepare a draft",dependencyIds:["observe"]}]});
import {observeDraftProgress} from "../dist/src/planning/draft-progress.js";
import {simulateDraftOrchestration} from "../dist/src/planning/draft-simulation.js";
const plan=()=>draftGoalPlan(ctx,evaluation(),req());
const progress=p=>observeDraftProgress(ctx,p,{asOf:"2026-10-02T00:00:00.000Z",milestones:[{id:"m1",stepId:"observe",measure:"count",target:2,observed:5,observedAt:"2026-10-02T00:00:00.000Z",evidenceFingerprints:["source-LEADS"]}]});
import {composeCopilotResponse} from "../dist/src/copilot/read-only-response.js";

import {prepareCopilotReviewHandoff} from "../dist/src/copilot/review-handoff.js";
import {summarizeCopilotConversation} from "../dist/src/copilot/conversation-context.js";

const fixture=()=>{
 const e=evaluation(),p=draftGoalPlan(ctx,e,req());
 const response=composeCopilotResponse(ctx,e,p,{questionId:"q1",question:"Review these candidates",asOf:now});
 const request={packetId:"packet-1",asOf:now,purpose:"Independent review requested",reviewerRoleRequired:"OWNER"};
 return {e,p,response,request};
};
import {draftControlledActionPreflight} from "../dist/src/action/controlled-preflight.js";
const intent=(mode="DEMO")=>({intentId:"intent-1",asOf:now,mode,domainService:"CRM",operation:"CANDIDATE_FOLLOW_UP",rationale:"Possible experiment only"});

import {previewDeniedBusinessOsDispatch,REQUIRED_DISPATCH_GATES} from "../dist/src/action/dispatch-preview.js";
const preflight=(mode="DEMO")=>{const {response,request}=fixture();const packet=prepareCopilotReviewHandoff(ctx,response,request);return draftControlledActionPreflight(ctx,packet,intent(mode));};
const req=(p)=>({previewId:"preview-1",intentId:p.intentId,mode:p.mode,domainService:p.domainService,operation:p.operation,asOf:p.asOf});
test("all modes produce a deterministic provider-neutral zero-effect dispatch preview",()=>{
 for(const mode of ["DEMO","SANDBOX","PRODUCTION"]){
 const p=preflight(mode),r=previewDeniedBusinessOsDispatch(ctx,p,req(p));
 assert.equal(r.kind,"BUSINESS_OS_DISPATCH_PREVIEW");assert.equal(r.mode,mode);assert.equal(r.domainBoundary,"BUSINESS_OS_DOMAIN_SERVICE_ONLY");
 assert.equal(r.requestedEffects,0);assert.equal(r.performedEffects,0);
 for(const k of ["submitted","authorized","scheduled","approved","actionable","executable","verifiedFact"])assert.equal(r[k],false);
 assert.deepEqual(p.gates.map(x=>x.id),REQUIRED_DISPATCH_GATES);
 assert.equal(r.gateStatus,"BLOCKED_UNVERIFIED");assert.ok(r.uncertainty.includes("DISPATCH_PREVIEW_IS_NOT_EXECUTION"));
 }
});
test("foreign workspace, forged policy, approval or altered gate fails closed",()=>{
 const p=preflight("SANDBOX");
 assert.throws(()=>previewDeniedBusinessOsDispatch({...ctx,workspaceId:"other"},p,req(p)),/UNAUTHORIZED/);
 for(const patch of [{policy:"ALLOW"},{approved:true},{actionable:true},{executable:true},{effect:"SENT"},{humanApproval:"ATTESTED"},{sourceVerification:"VERIFIED"},{gates:p.gates.slice(1)},{gates:p.gates.map((g,i)=>i===0?{...g,status:"SATISFIED"}:g)},{evidenceFingerprints:["fake"]},{uncertainty:["SOURCE_UNVERIFIED"]}])
 assert.throws(()=>previewDeniedBusinessOsDispatch(ctx,{...p,...patch},req(p)),/UNSAFE/);
});
test("reject mismatched intent, mode, domain service, operation and asOf",()=>{
 const p=preflight("PRODUCTION");
 for(const patch of [{intentId:"other"},{mode:"DEMO"},{domainService:"ProviderSDK"},{operation:"other"},{asOf:"wrong"},{previewId:""}])
 assert.throws(()=>previewDeniedBusinessOsDispatch(ctx,p,{...req(p),...patch}),/INVALID/);
});
test("denied dispatch preview is replayable but never durable or executable",()=>{
 const p=preflight(),r=req(p),a=previewDeniedBusinessOsDispatch(ctx,p,r),b=previewDeniedBusinessOsDispatch(ctx,p,r);
 assert.deepEqual(a,b);a.evidenceFingerprints.push("tamper");a.uncertainty.push("tamper");
 assert.deepEqual(previewDeniedBusinessOsDispatch(ctx,p,r),b);
 assert.equal(b.performedEffects,0);assert.equal(b.submitted,false);
});
