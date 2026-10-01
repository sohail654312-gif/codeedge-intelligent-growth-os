import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCrossDomain } from "../dist/src/analysis/cross-domain.js";
import { proposeRecommendation } from "../dist/src/recommendation/proposal.js";
import { evaluateRecommendation } from "../dist/src/recommendation/evaluation.js";
const now="2026-10-01T00:00:00.000Z",ctx={workspaceId:"clinic",actorId:"owner",authorizedAt:now};
const metric=domain=>({workspaceId:"clinic",domain,metricKey:domain.toLowerCase(),periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-09-30T00:00:00.000Z",observedAt:now,unit:"COUNT",numerator:4,denominator:8,evidenceFingerprints:["source-"+domain],coverage:"COMPLETE",verification:"UNVERIFIED"});
const analysis=()=>analyzeCrossDomain(ctx,[metric("LEADS"),metric("APPOINTMENTS")],{asOf:now,maxEvidenceAgeMs:86400000,domains:["LEADS","APPOINTMENTS"]});
const proposal=a=>proposeRecommendation(ctx,a,{proposalId:"p1",asOf:now,title:"Review process",rationale:"Candidate only",assumptions:["Capacity not independently established"],alternatives:[{id:"manual",description:"Manual review",tradeOffs:["Time"]},{id:"observe",description:"Collect evidence",tradeOffs:["Delay"]}],supportingEvidenceFingerprints:["source-LEADS","source-APPOINTMENTS"]});
const deps=()=>({manual:["Owner time"],observe:["Access to observations"]});
test("evaluates alternatives without selecting, verifying or approving; deterministic clone",()=>{
 const a=analysis(),p=proposal(a),r=evaluateRecommendation(ctx,a,p,deps());
 assert.equal(r.selectedAlternativeId,null);assert.equal(r.approved,false);assert.equal(r.actionable,false);
 assert.equal(r.semanticGrounding,"NOT_VERIFIED");assert.equal(r.alternatives[0].grounding,"CANDIDATE_UNVERIFIED");
 assert.ok(r.uncertainty.includes("CANDIDATE_RATIONALE_NOT_SEMANTICALLY_VERIFIED"));
 const original=evaluateRecommendation(ctx,a,p,deps());assert.deepEqual(r,original);
 r.alternatives[0].dependencies.push("tamper");assert.deepEqual(evaluateRecommendation(ctx,a,p,deps()),original);
});
test("foreign tenancy, fabricated authority and changed lineage fail closed",()=>{
 const a=analysis(),p=proposal(a);
 assert.throws(()=>evaluateRecommendation({...ctx,workspaceId:"other"},a,p,deps()),/UNAUTHORIZED/);
 assert.throws(()=>evaluateRecommendation(ctx,a,{...p,approved:true},deps()),/UNSAFE_EVALUATION_PROPOSAL/);
 assert.throws(()=>evaluateRecommendation(ctx,a,{...p,supportingEvidenceFingerprints:["foreign"]},deps()),/UNSAFE_EVALUATION_PROPOSAL/);
 assert.throws(()=>evaluateRecommendation(ctx,a,{...p,analysisLimitations:["fabricated"]},deps()),/UNSAFE_EVALUATION_PROPOSAL/);
});
test("partial, contradictory or stale analysis cannot be evaluated",()=>{
 const a=analysis(),p=proposal(a);
 assert.throws(()=>evaluateRecommendation(ctx,{...a,status:"PARTIAL"},p,deps()),/UNSAFE_EVALUATION_ANALYSIS/);
 assert.throws(()=>evaluateRecommendation(ctx,{...a,insights:[{...a.insights[0],value:null},a.insights[1]]},p,deps()),/UNSAFE_EVALUATION_ANALYSIS/);
 assert.throws(()=>evaluateRecommendation(ctx,{...a,asOf:"2026-09-01T00:00:00.000Z"},p,deps()),/UNSAFE_EVALUATION_PROPOSAL/);
});
test("missing, unexpected, duplicated and unbounded dependencies rejected",()=>{
 const a=analysis(),p=proposal(a);
 for(const d of [{manual:["Owner time"]},{...deps(),other:["Unrelated"]},{manual:[],observe:["Access"]},{manual:["x","x"],observe:["Access"]},{manual:Array.from({length:11},(_,i)=>String(i)),observe:["Access"]}])
 assert.throws(()=>evaluateRecommendation(ctx,a,p,d),/INVALID_EVALUATION_DEPENDENCIES/);
});
