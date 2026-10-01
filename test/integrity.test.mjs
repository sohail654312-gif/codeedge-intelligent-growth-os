import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryEvidenceLedger } from "../dist/src/evidence/intake.js";
import { InMemoryBusinessMemory } from "../dist/src/memory/in-memory-business-memory.js";
import { inspectKnowledgeIntegrity } from "../dist/src/memory/integrity.js";
const A="workspace:a", B="workspace:b", now="2026-10-01T00:00:00.000Z";
const ctx=(workspaceId=A)=>({workspaceId,actorId:"owner",authorizedAt:now});
const record=(value)=>({workspaceId:A,reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1"},resourceKind:"lead",value:{status:value},observedAt:"2026-09-01T00:00:00.000Z"});
async function fixture(){
 const ledger=new InMemoryEvidenceLedger(A,()=>now);
 const ingest=async(value)=>ledger.ingest(ctx(),{records:[record(value)],fetchedAt:now,completeness:"COMPLETE",errors:[]},"BUSINESS_OS");
 const old=(await ingest("new")).accepted[0].fingerprint;
 const memory=new InMemoryBusinessMemory(A,ledger,()=>now);
 memory.add(ctx(),{key:"pipeline",kind:"ASSUMPTION",value:{trend:"up"},evidenceFingerprints:[old]});
 memory.add(ctx(),{key:"pipeline",kind:"ANALYSIS",value:{trend:"flat"},evidenceFingerprints:[old]});
 const newer=(await ingest("qualified")).accepted[0].fingerprint;
 return {ledger,memory,old,newer};
}
test("integrity detects superseded evidence, stale evidence and revisions without certifying facts",async()=>{
 const {ledger,memory}=await fixture();
 const report=inspectKnowledgeIntegrity(ctx(),memory,ledger,{asOf:now,maxEvidenceAgeMs:86400000});
 assert.equal(report.checked,2);assert.equal(report.verificationAuthority,"NOT_CONFIGURED");
 assert.ok(report.findings[0].issues.includes("MEMORY_SUPERSEDED"));
 for(const item of report.findings){
  assert.ok(item.issues.includes("EVIDENCE_SUPERSEDED"));
  assert.ok(item.issues.includes("EVIDENCE_STALE"));
  assert.ok(item.issues.includes("UNVERIFIED_EVIDENCE"));
  assert.equal(item.eligibleAsVerifiedFact,false);
 }
 const page=inspectKnowledgeIntegrity(ctx(),memory,ledger,{asOf:now,maxEvidenceAgeMs:86400000,limit:1});
 assert.equal(page.checked,1);assert.equal(page.nextOffset,1);
});
test("tenant isolation and invalid options fail closed",async()=>{
 const {ledger,memory}=await fixture();
 assert.throws(()=>inspectKnowledgeIntegrity(ctx(B),memory,ledger,{asOf:now,maxEvidenceAgeMs:0}),/UNAUTHORIZED_WORKSPACE/);
 for(const bad of [{asOf:"invalid",maxEvidenceAgeMs:0},{asOf:now,maxEvidenceAgeMs:-1},{asOf:now,maxEvidenceAgeMs:0,limit:101},{asOf:now,maxEvidenceAgeMs:0,offset:-1}])
  assert.throws(()=>inspectKnowledgeIntegrity(ctx(),memory,ledger,bad),/INVALID_INTEGRITY_OPTIONS/);
});
test("integrity reports missing lineage and never accepts caller self-attestation",async()=>{
 const {ledger,memory,old}=await fixture();
 assert.throws(()=>memory.add(ctx(),{key:"x",kind:"FACT",value:1,evidenceFingerprints:[old],verification:{reviewerActorId:"owner",verifiedAt:now,evidenceFingerprint:old}}),/FACT_VERIFICATION_GATE_UNAVAILABLE/);
 assert.throws(()=>memory.add(ctx(),{key:"x",kind:"ASSUMPTION",value:1,evidenceFingerprints:["foreign"]}),/EVIDENCE_LINEAGE_NOT_FOUND/);
 const report=inspectKnowledgeIntegrity(ctx(),memory,ledger,{asOf:now,maxEvidenceAgeMs:0});
 report.findings[0].issues.push("EVIDENCE_MISSING");
 assert.ok(!inspectKnowledgeIntegrity(ctx(),memory,ledger,{asOf:now,maxEvidenceAgeMs:0}).findings[0].issues.includes("EVIDENCE_MISSING"));
});
