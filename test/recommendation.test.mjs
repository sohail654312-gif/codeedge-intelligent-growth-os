import {makeMetricFixture} from "./metric-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCrossDomain } from "../dist/src/analysis/cross-domain.js";
import { proposeRecommendation } from "../dist/src/recommendation/proposal.js";
const now="2026-10-01T00:00:00.000Z",context={workspaceId:"clinic",actorId:"owner",authorizedAt:now};
const metric=(domain,changes={})=>makeMetricFixture(domain,ctx.workspaceId,now,changes);
const analysis=()=>analyzeCrossDomain(context,[metric("LEADS"),metric("APPOINTMENTS")],{asOf:now,maxEvidenceAgeMs:86400000,domains:["LEADS","APPOINTMENTS"]});
const request=()=>({proposalId:"proposal-1",asOf:now,title:"Review follow-up workflow",rationale:"Candidate for owner evaluation only",assumptions:["Staff availability is unverified"],alternatives:[{id:"a",description:"Review manually",tradeOffs:["Owner time"]},{id:"b",description:"Gather more observations",tradeOffs:["Delay"]}],supportingEvidenceFingerprints:["source-LEADS","source-APPOINTMENTS"]});
test("proposal is deterministic, cloned, unverified and cannot approve an action",()=>{
 const r=proposeRecommendation(context,analysis(),request());assert.equal(r.kind,"RECOMMENDATION");assert.equal(r.approved,false);
 assert.equal(r.actionable,false);assert.equal(r.decisionAuthority,"NONE");assert.equal(r.confidence,"INSUFFICIENT");
 assert.deepEqual(r,proposeRecommendation(context,analysis(),request()));
 r.alternatives[0].tradeOffs.push("tamper");assert.deepEqual(proposeRecommendation(context,analysis(),request()).alternatives[0].tradeOffs,["Owner time"]);
});
test("reject foreign tenant, missing provenance and fabricated source truth",()=>{
 assert.throws(()=>proposeRecommendation({...context,workspaceId:"other"},analysis(),request()),/UNAUTHORIZED/);
 assert.throws(()=>proposeRecommendation(context,analysis(),{...request(),supportingEvidenceFingerprints:["fake"]}),/INVALID/);
 assert.throws(()=>proposeRecommendation(context,{...analysis(),verifiedFact:true},request()),/UNSAFE/);
 assert.throws(()=>proposeRecommendation(context,{...analysis(),actionable:true},request()),/UNSAFE/);
});
test("reject incomplete, stale and inconsistent analysis",()=>{
 const partial=analyzeCrossDomain(context,[metric("LEADS"),{...metric("APPOINTMENTS"),coverage:"PARTIAL"}],{asOf:now,maxEvidenceAgeMs:86400000,domains:["LEADS","APPOINTMENTS"]});
 assert.throws(()=>proposeRecommendation(context,partial,request()),/UNSAFE/);
 assert.throws(()=>proposeRecommendation(context,{...analysis(),evidenceFingerprints:[]},request()),/UNSAFE/);
 assert.throws(()=>proposeRecommendation(context,analysis(),{...request(),asOf:"2026-09-01T00:00:00.000Z"}),/INVALID/);
});
test("require bounded assumptions, distinct alternatives and explicit trade-offs",()=>{
 assert.throws(()=>proposeRecommendation(context,analysis(),{...request(),assumptions:[]}),/INVALID/);
 assert.throws(()=>proposeRecommendation(context,analysis(),{...request(),alternatives:[request().alternatives[0]]}),/INVALID/);
 assert.throws(()=>proposeRecommendation(context,analysis(),{...request(),alternatives:[request().alternatives[0],request().alternatives[0]]}),/INVALID/);
});
