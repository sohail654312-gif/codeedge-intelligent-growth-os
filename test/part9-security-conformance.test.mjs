import {makeMetricFixture} from "./metric-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {InMemorySourceReader} from "../dist/src/integration/in-memory-source-reader.js";
import {InMemoryEvidenceLedger} from "../dist/src/evidence/intake.js";
import {InMemoryBusinessMemory} from "../dist/src/memory/in-memory-business-memory.js";
import {analyzeCrossDomain} from "../dist/src/analysis/cross-domain.js";
import {proposeRecommendation} from "../dist/src/recommendation/proposal.js";
import {evaluateRecommendation} from "../dist/src/recommendation/evaluation.js";
import {draftGoalPlan} from "../dist/src/planning/draft-goal.js";
import {composeCopilotResponse} from "../dist/src/copilot/read-only-response.js";
import {prepareCopilotReviewHandoff} from "../dist/src/copilot/review-handoff.js";
import {draftControlledActionPreflight} from "../dist/src/action/controlled-preflight.js";
import {previewDeniedBusinessOsDispatch} from "../dist/src/action/dispatch-preview.js";
import {summarizeDeniedActionLifecycle} from "../dist/src/action/denial-lifecycle.js";

const A="workspace:a",B="workspace:b",NOW="2026-10-01T00:00:00.000Z";
const ctx=(workspaceId=A)=>({workspaceId,actorId:"model",authorizedAt:NOW});
const record=(extra={})=>({workspaceId:A,reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1"},resourceKind:"lead",value:{status:"new"},observedAt:NOW,...extra});
const metric=(domain,changes={})=>makeMetricFixture(domain,A,NOW,changes);
const fixture=mode=>{
 const context=ctx();
 const analysis=analyzeCrossDomain(context,[metric("LEADS"),metric("APPOINTMENTS")],{asOf:NOW,maxEvidenceAgeMs:86400000,domains:["LEADS","APPOINTMENTS"]});
 const proposal=proposeRecommendation(context,analysis,{proposalId:"proposal-a",asOf:NOW,title:"Candidate",rationale:"Unverified observations",assumptions:["Staffing unknown"],alternatives:[{id:"a",description:"Observe",tradeOffs:["Delay"]},{id:"b",description:"Review",tradeOffs:["Time"]}],supportingEvidenceFingerprints:[...analysis.evidenceFingerprints]});
 const evaluation=evaluateRecommendation(context,analysis,proposal,{a:["Staff"],b:["Data"]});
 const plan=draftGoalPlan(context,evaluation,{goalId:"goal-a",planId:"plan-a",asOf:NOW,objective:"Observe safely",outcomeMeasure:"Candidate count",assumptions:["Capacity unknown"],constraints:["No effects"],steps:[{id:"observe",description:"Observe only",dependencyIds:[]}]});
 const response=composeCopilotResponse(context,evaluation,plan,{questionId:"question-a",question:"Review safely",asOf:NOW});
 const review=prepareCopilotReviewHandoff(context,response,{packetId:"packet-a",asOf:NOW,purpose:"Human review requested",reviewerRoleRequired:"OWNER"});
 const intent={intentId:"intent-a",asOf:NOW,mode,domainService:"CRM",operation:"CANDIDATE_FOLLOW_UP",rationale:"No actual action"};
 const preflight=draftControlledActionPreflight(context,review,intent);
 const previewRequest={previewId:"preview-a",intentId:preflight.intentId,asOf:preflight.asOf,mode:preflight.mode,domainService:preflight.domainService,operation:preflight.operation};
 const preview=previewDeniedBusinessOsDispatch(context,preflight,previewRequest);
 return {context,analysis,evaluation,plan,response,review,intent,preflight,previewRequest,preview};
};
test("Part9 source-reader denies foreign workspace, quarantines foreign seed and does not leak record values",async()=>{
 const source=new InMemorySourceReader("BUSINESS_OS",A,[record(),record({workspaceId:B,value:{private:"never-leak"}})],()=>NOW);
 const foreign=await source.read({context:ctx(B),sourceSystem:"BUSINESS_OS",resourceKind:"lead"});
 assert.equal(foreign.completeness,"PARTIAL");assert.deepEqual(foreign.records,[]);
 const local=await source.read({context:ctx(),sourceSystem:"BUSINESS_OS",resourceKind:"lead"});
 assert.equal(local.completeness,"PARTIAL");assert.equal(local.records.length,1);
 assert.ok(!JSON.stringify(local).includes("never-leak"));assert.equal(local.records[0].workspaceId,A);
});
test("Part9 unverified evidence cannot be caller-promoted to FACT and memory remains tenant isolated",async()=>{
 const ledger=new InMemoryEvidenceLedger(A,()=>NOW);
 const received=await ledger.ingest(ctx(),{records:[record()],fetchedAt:NOW,completeness:"COMPLETE",errors:[]},"BUSINESS_OS");
 const fingerprint=received.accepted[0].fingerprint,memory=new InMemoryBusinessMemory(A,ledger,()=>NOW);
 assert.throws(()=>memory.add(ctx(),{key:"claim",kind:"FACT",value:{ok:true},evidenceFingerprints:[fingerprint],verification:{reviewerActorId:"owner",verifiedAt:NOW,evidenceFingerprint:fingerprint}}),/FACT_VERIFICATION_GATE_UNAVAILABLE/);
 assert.throws(()=>memory.add(ctx(B),{key:"claim",kind:"ASSUMPTION",value:"cross-tenant",evidenceFingerprints:[fingerprint]}),/UNAUTHORIZED_WORKSPACE/);
 assert.throws(()=>memory.add(ctx(),{key:"claim",kind:"ASSUMPTION",value:"foreign proof",evidenceFingerprints:["fabricated"]}),/EVIDENCE_LINEAGE_NOT_FOUND/);
 const result=memory.add(ctx(),{key:"claim",kind:"ASSUMPTION",value:"unverified",evidenceFingerprints:[fingerprint]});
 assert.equal(result.status,"UNVERIFIED");assert.equal(result.kind,"ASSUMPTION");
});
test("Part9 cross-part workspace changes cannot promote unverified analysis into action",()=>{
 for(const mode of ["DEMO","SANDBOX","PRODUCTION"]){
  const x=fixture(mode);
  assert.equal(x.analysis.verifiedFact,false);assert.equal(x.evaluation.approved,false);
  assert.equal(x.plan.executable,false);assert.equal(x.response.verifiedFact,false);
  assert.equal(x.review.approval,null);assert.equal(x.preflight.humanApproval,"NOT_ATTESTED");
  assert.equal(x.preview.performedEffects,0);
  assert.throws(()=>composeCopilotResponse(ctx(B),x.evaluation,x.plan,{questionId:"foreign",asOf:NOW,question:"Review"}),/UNAUTHORIZED/);
  assert.throws(()=>draftControlledActionPreflight(ctx(B),x.review,x.intent),/UNAUTHORIZED/);
  assert.throws(()=>previewDeniedBusinessOsDispatch(ctx(B),x.preflight,x.previewRequest),/UNAUTHORIZED/);
  assert.throws(()=>summarizeDeniedActionLifecycle(ctx(B),x.preflight,[x.preview]),/UNAUTHORIZED/);
 }
});
test("Part9 forged authority, missing uncertainty and fake execution cannot cross Part7–8 boundaries",()=>{
 const x=fixture("SANDBOX");
 for(const changed of [{...x.review,approval:true},{...x.review,reviewerIdentity:"owner"},{...x.review,uncertainty:x.review.uncertainty.filter(v=>v!=="COPILOT_CONTENT_NOT_INDEPENDENTLY_VERIFIED")}])
 assert.throws(()=>draftControlledActionPreflight(ctx(),changed,x.intent),/UNSAFE/);
 for(const changed of [{...x.preflight,policy:"ALLOW"},{...x.preflight,gates:x.preflight.gates.map((g,i)=>i===0?{...g,status:"SATISFIED"}:g)},{...x.preflight,uncertainty:["SOURCE_UNVERIFIED"]}])
 assert.throws(()=>previewDeniedBusinessOsDispatch(ctx(),changed,x.previewRequest),/UNSAFE/);
 for(const changed of [{...x.preview,performedEffects:1},{...x.preview,submitted:true},{...x.preview,approved:true},{...x.preview,mode:"PRODUCTION"}])
 assert.throws(()=>summarizeDeniedActionLifecycle(ctx(),x.preflight,[changed]),/UNSAFE/);
});
test("Part9 modes have equal deny policy and in-memory replay never becomes audit proof",()=>{
 const outputs=["DEMO","SANDBOX","PRODUCTION"].map(mode=>{
 const x=fixture(mode),summary=summarizeDeniedActionLifecycle(ctx(),x.preflight,[x.preview,x.preview]);
 assert.equal(summary.replayCount,1);assert.equal(summary.auditEvidenceStatus,"NOT_DURABLE");
 assert.equal(summary.actualProviderEffect,false);assert.equal(summary.actualHumanApproval,false);
 assert.equal(summary.actualBusinessOsDispatch,false);
 return {policy:x.preflight.policy,gates:x.preflight.gates.map(g=>g.status),performedEffects:x.preview.performedEffects,summary:summary.status};
 });
 assert.deepEqual(outputs[0],outputs[1]);assert.deepEqual(outputs[1],outputs[2]);
});
test("Part9 core intelligence and action code contains no direct provider imports or provider network calls",()=>{
 for(const dir of ["src/analysis","src/recommendation","src/planning","src/copilot","src/action"]){
  for(const file of fs.readdirSync(dir).filter(f=>f.endsWith(".ts"))){
   const body=fs.readFileSync(path.join(dir,file),"utf8");
   assert.doesNotMatch(body,/\b(?:from|import\s*\()\s*["'](?:@(?:twilio|stripe|openai)\/|(?:twilio|stripe|openai|vapi|erpnext))/i,file);
   assert.doesNotMatch(body,/\b(?:fetch|XMLHttpRequest)\s*\(/,file);
  }
 }
});
