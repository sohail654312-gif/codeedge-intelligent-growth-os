import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryEvidenceLedger } from "../dist/src/evidence/intake.js";
import { InMemoryBusinessMemory } from "../dist/src/memory/in-memory-business-memory.js";
import { queryBusinessKnowledge } from "../dist/src/memory/knowledge-view.js";
const A="workspace:a", B="workspace:b", now="2026-10-01T00:00:00.000Z";
const ctx=(workspaceId=A)=>({workspaceId,actorId:"owner",authorizedAt:now});
async function fixture(){
 const ledger=new InMemoryEvidenceLedger(A,()=>now);
 const report=await ledger.ingest(ctx(),{records:[{workspaceId:A,reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1"},resourceKind:"lead",value:{status:"new"},observedAt:"2026-09-01T00:00:00.000Z"}],fetchedAt:now,completeness:"COMPLETE",errors:[]},"BUSINESS_OS");
 const memory=new InMemoryBusinessMemory(A,ledger,()=>now),fp=report.accepted[0].fingerprint;
 memory.add(ctx(),{key:"pipeline",kind:"ASSUMPTION",value:{trend:"up"},evidenceFingerprints:[fp]});
 memory.add(ctx(),{key:"pipeline",kind:"ANALYSIS",value:{trend:"flat"},evidenceFingerprints:[fp]});
 memory.add(ctx(),{key:"capacity",kind:"ASSUMPTION",value:1,evidenceFingerprints:[fp]});
 return {ledger,memory,fp};
}
test("current and history views expose supersession and bounded pagination",async()=>{
 const {ledger,memory}=await fixture();
 const current=queryBusinessKnowledge(ctx(),memory,ledger,{asOf:now});
 assert.equal(current.total,2);assert.ok(current.items.every(item=>item.isCurrentRevision));
 const history=queryBusinessKnowledge(ctx(),memory,ledger,{asOf:now,view:"HISTORY",key:"pipeline",limit:1});
 assert.equal(history.total,2);assert.equal(history.nextOffset,1);assert.equal(history.items[0].isCurrentRevision,false);
 const next=queryBusinessKnowledge(ctx(),memory,ledger,{asOf:now,view:"HISTORY",key:"pipeline",limit:1,offset:1});
 assert.equal(next.items[0].memory.supersedes,history.items[0].memory.id);
 assert.equal(queryBusinessKnowledge(ctx(),memory,ledger,{asOf:now,kind:"ANALYSIS"}).total,1);
});
test("provenance, stale status and uncertainty remain explicit",async()=>{
 const {ledger,memory,fp}=await fixture();
 const item=queryBusinessKnowledge(ctx(),memory,ledger,{asOf:now,maxEvidenceAgeMs:86400000,key:"pipeline"}).items[0];
 assert.equal(item.evidence[0].fingerprint,fp);assert.equal(item.evidence[0].freshness,"STALE");
 assert.equal(item.evidence[0].verification,"UNVERIFIED");assert.equal(item.memory.status,"UNVERIFIED");
 assert.ok(item.limitations.includes("EVIDENCE_STALE"));assert.ok(item.limitations.includes("INTERPRETIVE_NOT_FACT"));
 item.memory.value.trend="tampered";
 assert.equal(queryBusinessKnowledge(ctx(),memory,ledger,{asOf:now,key:"pipeline"}).items[0].memory.value.trend,"flat");
});
test("tenant isolation, bounded input and unknown future freshness fail safely",async()=>{
 const {ledger,memory}=await fixture();
 assert.throws(()=>queryBusinessKnowledge(ctx(B),memory,ledger,{asOf:now}),/UNAUTHORIZED_WORKSPACE/);
 for(const bad of [{asOf:"invalid"},{asOf:now,limit:101},{asOf:now,offset:-1},{asOf:now,view:"OTHER"}])
  assert.throws(()=>queryBusinessKnowledge(ctx(),memory,ledger,bad),/INVALID_MEMORY_QUERY/);
 const item=queryBusinessKnowledge(ctx(),memory,ledger,{asOf:"2026-08-01T00:00:00.000Z",key:"pipeline"}).items[0];
 assert.equal(item.evidence[0].freshness,"UNKNOWN");assert.ok(item.limitations.includes("FRESHNESS_UNKNOWN"));
});

test("M-03 asOf is evidence freshness only and never a historical snapshot selector",async()=>{
 const {ledger,memory,fp}=await fixture();
 const early="2026-09-15T00:00:00.000Z";
 const current=queryBusinessKnowledge(ctx(),memory,ledger,{asOf:early,key:"pipeline"});
 assert.equal(current.asOfSemantics,"EVIDENCE_FRESHNESS_ONLY");
 assert.equal(current.items[0].memory.value.trend,"flat");
 assert.equal(current.items[0].isCurrentRevision,true);
 assert.ok(current.items[0].limitations.includes("REVISION_POSTDATES_AS_OF"));
 const history=queryBusinessKnowledge(ctx(),memory,ledger,{asOf:early,key:"pipeline",view:"HISTORY"});
 assert.equal(history.asOfSemantics,"EVIDENCE_FRESHNESS_ONLY");
 assert.equal(history.total,2);
 assert.equal(history.items[0].memory.value.trend,"up");
 assert.equal(history.items[1].memory.value.trend,"flat");
 assert.ok(history.items.every(item=>item.limitations.includes("REVISION_POSTDATES_AS_OF")));
 const later=queryBusinessKnowledge(ctx(),memory,ledger,{asOf:"2026-10-02T00:00:00.000Z",key:"pipeline"});
 assert.ok(!later.items[0].limitations.includes("REVISION_POSTDATES_AS_OF"));
 assert.equal(later.items[0].evidence[0].fingerprint,fp);
});
