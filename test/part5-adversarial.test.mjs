import {makeMetricFixture} from "./metric-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {analyzeCrossDomain} from "../dist/src/analysis/cross-domain.js";
import {proposeRecommendation} from "../dist/src/recommendation/proposal.js";
import {evaluateRecommendation} from "../dist/src/recommendation/evaluation.js";
import {prepareDecisionReview} from "../dist/src/recommendation/decision-review.js";
const now="2026-10-01T00:00:00.000Z",ctx={workspaceId:"clinic",actorId:"model",authorizedAt:now};
const metric=(domain,changes={})=>makeMetricFixture(domain,ctx.workspaceId,now,changes);
const source=()=>analyzeCrossDomain(ctx,[metric("LEADS"),metric("APPOINTMENTS")],{asOf:now,maxEvidenceAgeMs:86400000,domains:["LEADS","APPOINTMENTS"]});
const candidate=a=>({proposalId:"p1",asOf:now,title:"Consider review",rationale:"Unverified candidate",assumptions:["Capacity unknown"],alternatives:[{id:"a",description:"Review",tradeOffs:["Time"]},{id:"b",description:"Observe",tradeOffs:["Delay"]}],supportingEvidenceFingerprints:[...a.evidenceFingerprints]});
const chain=()=>{const a=source(),p=proposeRecommendation(ctx,a,candidate(a)),e=evaluateRecommendation(ctx,a,p,{a:["Owner time"],b:["More data"]});return {a,p,e};};
const packet={recordId:"packet-1",asOf:now,expiresAt:"2026-10-02T00:00:00.000Z",purpose:"Review only",reviewerRoleRequired:"owner"};
test("cross-tenant and fabricated provenance fail at every boundary",()=>{
 const {a,p,e}=chain(),foreign={...ctx,workspaceId:"other"};
 assert.throws(()=>proposeRecommendation(foreign,a,candidate(a)),/UNAUTHORIZED/);
 assert.throws(()=>evaluateRecommendation(foreign,a,p,{a:["Time"],b:["Data"]}),/UNAUTHORIZED/);
 assert.throws(()=>prepareDecisionReview(foreign,e,packet),/UNAUTHORIZED/);
 assert.throws(()=>proposeRecommendation(ctx,a,{...candidate(a),supportingEvidenceFingerprints:["fabricated"]}),/INVALID/);
 assert.throws(()=>evaluateRecommendation(ctx,a,{...p,supportingEvidenceFingerprints:["fabricated"]},{a:["Time"],b:["Data"]}),/UNSAFE/);
 assert.throws(()=>prepareDecisionReview(ctx,{...e,supportingEvidenceFingerprints:[]},packet),/UNSAFE/);
});
test("stale, partial and forged authority never promote",()=>{
 const {a,p,e}=chain();
 for(const patch of [{status:"PARTIAL"},{verifiedFact:true},{actionable:true},{evidenceFingerprints:[]}])
 assert.throws(()=>proposeRecommendation(ctx,{...a,...patch},candidate(a)),/UNSAFE/);
 for(const patch of [{approved:true},{decisionAuthority:"OWNER"},{selectedAlternativeId:"a"},{semanticGrounding:"VERIFIED"}])
 assert.throws(()=>prepareDecisionReview(ctx,{...e,...patch},packet),/UNSAFE/);
 assert.throws(()=>evaluateRecommendation(ctx,{...a,asOf:"2026-09-01T00:00:00.000Z"},p,{a:["Time"],b:["Data"]}),/UNSAFE/);
});
test("bounds, replay and defensive clone confer no human authority",()=>{
 const {a,p,e}=chain();
 assert.throws(()=>proposeRecommendation(ctx,a,{...candidate(a),assumptions:Array.from({length:21},(_,i)=>String(i))}),/INVALID/);
 assert.throws(()=>evaluateRecommendation(ctx,a,p,{a:Array.from({length:11},(_,i)=>String(i)),b:["Data"]}),/INVALID/);
 assert.throws(()=>prepareDecisionReview(ctx,e,{...packet,expiresAt:"2026-10-09T00:00:00.000Z"}),/INVALID/);
 const one=prepareDecisionReview(ctx,e,packet),two=prepareDecisionReview(ctx,e,packet);assert.deepEqual(one,two);
 one.alternatives[0].tradeOffs.push("tamper");assert.deepEqual(prepareDecisionReview(ctx,e,packet),two);
 for(const r of [one,two]){assert.equal(r.reviewerIdentity,null);assert.equal(r.approval,null);assert.equal(r.decision,null);assert.equal(r.authority,"NONE");assert.equal(r.executable,false);}
});
