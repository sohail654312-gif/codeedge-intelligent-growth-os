import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryEvidenceLedger } from "../dist/src/evidence/intake.js";
import { InMemoryBusinessMemory } from "../dist/src/memory/in-memory-business-memory.js";
import { analyzeKnowledge } from "../dist/src/analysis/evidence-grounded.js";
const A="workspace:a",B="workspace:b",now="2026-10-01T00:00:00.000Z";
const ctx=(workspaceId=A)=>({workspaceId,actorId:"owner",authorizedAt:now});
async function fixture(){
 const ledger=new InMemoryEvidenceLedger(A,()=>now);
 const accepted=await ledger.ingest(ctx(),{records:[{workspaceId:A,reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1"},resourceKind:"lead",value:{status:"new"},observedAt:"2026-09-01T00:00:00.000Z"}],fetchedAt:now,completeness:"COMPLETE",errors:[]},"BUSINESS_OS");
 const memory=new InMemoryBusinessMemory(A,ledger,()=>now),fp=accepted.accepted[0].fingerprint;
 memory.add(ctx(),{key:"pipeline",kind:"ASSUMPTION",value:{trend:"up"},evidenceFingerprints:[fp]});
 return {ledger,memory,fp};
}
test("analysis preserves evidence lineage and uncertainty, never certifies fact or action",async()=>{
 const {ledger,memory,fp}=await fixture();
 const request={asOf:now,maxEvidenceAgeMs:86400000};
 const result=analyzeKnowledge(ctx(),memory,ledger,request);
 assert.equal(result.kind,"ANALYSIS");assert.equal(result.sourceCoverage,"UNVERIFIED");
 assert.equal(result.insights[0].evidenceFingerprints[0],fp);
 assert.equal(result.insights[0].verifiedFact,false);assert.equal(result.insights[0].actionable,false);
 assert.equal(result.insights[0].confidence,"INSUFFICIENT");
 assert.ok(result.insights[0].uncertainty.includes("EVIDENCE_STALE"));
 assert.deepEqual(analyzeKnowledge(ctx(),memory,ledger,request),result);
 result.insights[0].observation.trend="tampered";
 assert.equal(analyzeKnowledge(ctx(),memory,ledger,request).insights[0].observation.trend,"up");
});
test("workspace mismatch and malformed bounds fail closed",async()=>{
 const {ledger,memory}=await fixture();
 assert.throws(()=>analyzeKnowledge(ctx(B),memory,ledger,{asOf:now,maxEvidenceAgeMs:0}),/UNAUTHORIZED_WORKSPACE/);
 for(const request of [{asOf:"invalid",maxEvidenceAgeMs:0},{asOf:now,maxEvidenceAgeMs:-1},{asOf:now,maxEvidenceAgeMs:0,limit:101},{asOf:now,maxEvidenceAgeMs:0,key:" "}])
  assert.throws(()=>analyzeKnowledge(ctx(),memory,ledger,request),/INVALID_ANALYSIS_REQUEST/);
});
test("analysis exposes bounded partial result instead of silently claiming completeness",async()=>{
 const {ledger,memory,fp}=await fixture();
 memory.add(ctx(),{key:"capacity",kind:"ANALYSIS",value:{slots:2},evidenceFingerprints:[fp]});
 const result=analyzeKnowledge(ctx(),memory,ledger,{asOf:now,maxEvidenceAgeMs:86400000,limit:1});
 assert.equal(result.insights.length,1);assert.equal(result.nextOffset,1);
 assert.ok(result.limitations.includes("RESULTS_PAGINATED"));
});
