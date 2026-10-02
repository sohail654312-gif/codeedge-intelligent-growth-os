import {makeMetricFixture} from "./metric-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {analyzeCrossDomain} from "../dist/src/analysis/cross-domain.js";
import {proposeRecommendation} from "../dist/src/recommendation/proposal.js";
import {evaluateRecommendation} from "../dist/src/recommendation/evaluation.js";
import {draftGoalPlan} from "../dist/src/planning/draft-goal.js";
const now="2026-10-01T00:00:00.000Z",ctx={workspaceId:"clinic",actorId:"model",authorizedAt:now};
const metric=(domain,changes={})=>makeMetricFixture(domain,ctx.workspaceId,now,changes);
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
const previewRequest=(p)=>({previewId:"preview-1",intentId:p.intentId,mode:p.mode,domainService:p.domainService,operation:p.operation,asOf:p.asOf});
import {summarizeDeniedActionLifecycle} from "../dist/src/action/denial-lifecycle.js";
const inputs=(mode="DEMO")=>{const p=preflight(mode),first=previewDeniedBusinessOsDispatch(ctx,p,previewRequest(p));return {p,first};};
test("denial lifecycle summarizes only supplied no-effect previews and deduplicates identical replays",()=>{
 for(const mode of ["DEMO","SANDBOX","PRODUCTION"]){
 const {p,first}=inputs(mode);
 const second=previewDeniedBusinessOsDispatch(ctx,p,{...previewRequest(p),previewId:"preview-2"});
 const result=summarizeDeniedActionLifecycle(ctx,p,[first,first,second]);
 assert.equal(result.status,"SIMULATED_DENIAL_ONLY");assert.equal(result.auditEvidenceStatus,"NOT_DURABLE");
 assert.equal(result.inputCount,3);assert.equal(result.distinctPreviewCount,2);assert.equal(result.replayCount,1);
 assert.deepEqual(result.records.map(r=>r.previewId),["preview-1","preview-2"]);
 for(const field of ["approved","actionable","executable","verifiedFact","actualHumanApproval","actualBusinessOsDispatch","actualProviderEffect"])assert.equal(result[field],false);
 assert.ok(result.uncertainty.includes("NO_DURABLE_IDEMPOTENCY"));assert.deepEqual(result.evidenceFingerprints,p.evidenceFingerprints);
 }
});
test("denial lifecycle rejects forged effects, success and identity mismatches",()=>{
 const {p,first}=inputs("SANDBOX");
 assert.throws(()=>summarizeDeniedActionLifecycle({...ctx,workspaceId:"foreign"},p,[first]),/UNAUTHORIZED/);
 for(const patch of [{submitted:true},{authorized:true},{approved:true},{performedEffects:1},{requestedEffects:1},{executable:true},{gateStatus:"READY"},{mode:"PRODUCTION"},{intentId:"foreign"},{reviewPacketId:"foreign"},{domainService:"other"},{evidenceFingerprints:["foreign"]},{uncertainty:["SOURCE_UNVERIFIED"]}])
 assert.throws(()=>summarizeDeniedActionLifecycle(ctx,p,[{...first,...patch}]),/UNSAFE/);
});
test("denial lifecycle bounds, clone and conflicting replay fail closed",()=>{
 const {p,first}=inputs(),two=previewDeniedBusinessOsDispatch(ctx,p,{...previewRequest(p),previewId:"preview-2"});
 assert.throws(()=>summarizeDeniedActionLifecycle(ctx,p,[]),/INVALID/);
 assert.throws(()=>summarizeDeniedActionLifecycle(ctx,p,Array.from({length:11},()=>first)),/INVALID/);
 assert.throws(()=>summarizeDeniedActionLifecycle(ctx,p,[first,{...two,previewId:first.previewId,performedEffects:1}]),/UNSAFE|CONFLICT/);
 const original=summarizeDeniedActionLifecycle(ctx,p,[first,two]),mutant=summarizeDeniedActionLifecycle(ctx,p,[first,two]);
 mutant.records[0].status="PERFORMED";mutant.evidenceFingerprints.push("fabricated");
 assert.deepEqual(summarizeDeniedActionLifecycle(ctx,p,[first,two]),original);
});
