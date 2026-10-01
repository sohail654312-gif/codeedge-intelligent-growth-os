import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryEvidenceLedger } from "../dist/src/evidence/intake.js";
import { InMemoryBusinessMemory } from "../dist/src/memory/in-memory-business-memory.js";
const A="workspace:a",B="workspace:b",now="2026-10-01T00:00:00.000Z";
const ctx=(workspaceId=A)=>({workspaceId,actorId:"owner",authorizedAt:now});
async function fixture(){
 const evidence=new InMemoryEvidenceLedger(A,()=>now);
 const result=await evidence.ingest(ctx(),{records:[{workspaceId:A,reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1"},resourceKind:"lead",value:{status:"new"},observedAt:now}],fetchedAt:now,completeness:"COMPLETE",errors:[]},"BUSINESS_OS");
 return {memory:new InMemoryBusinessMemory(A,evidence,()=>now),fingerprint:result.accepted[0].fingerprint};
}
test("append-only replay, supersession and defensive cloning",async()=>{
 const {memory,fingerprint}=await fixture();
 const draft={key:"pipeline",kind:"ASSUMPTION",value:{trend:"up"},evidenceFingerprints:[fingerprint]};
 const first=memory.add(ctx(),draft);
 assert.equal(memory.add(ctx(),draft).id,first.id);
 first.value.trend="changed";
 assert.equal(memory.list(ctx())[0].value.trend,"up");
 const second=memory.add(ctx(),{...draft,value:{trend:"down"}});
 assert.equal(second.supersedes,first.id);assert.equal(memory.list(ctx()).length,2);
});
test("tenant and evidence lineage isolation",async()=>{
 const {memory,fingerprint}=await fixture();
 assert.throws(()=>memory.list(ctx(B)),/UNAUTHORIZED_WORKSPACE/);
 assert.throws(()=>memory.add(ctx(B),{key:"x",kind:"ASSUMPTION",value:1,evidenceFingerprints:[fingerprint]}),/UNAUTHORIZED_WORKSPACE/);
 assert.throws(()=>memory.add(ctx(),{key:"x",kind:"ASSUMPTION",value:1,evidenceFingerprints:["unknown"]}),/EVIDENCE_LINEAGE_NOT_FOUND/);
});
test("unverified evidence never becomes verified FACT",async()=>{
 const {memory,fingerprint}=await fixture();
 assert.throws(()=>memory.add(ctx(),{key:"x",kind:"FACT",value:1,evidenceFingerprints:[fingerprint]}),/FACT_VERIFICATION_GATE_UNAVAILABLE/);
 const item=memory.add(ctx(),{key:"x",kind:"ANALYSIS",value:1,evidenceFingerprints:[fingerprint]});
 assert.equal(item.status,"UNVERIFIED");
 assert.throws(()=>memory.add(ctx(),{key:"x",kind:"ANALYSIS",value:1,evidenceFingerprints:[fingerprint],verification:{reviewerActorId:"owner",verifiedAt:now,evidenceFingerprint:fingerprint}}),/VERIFICATION_NOT_ALLOWED/);
});
