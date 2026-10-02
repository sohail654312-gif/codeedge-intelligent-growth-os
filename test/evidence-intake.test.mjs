import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryEvidenceLedger } from "../dist/src/evidence/intake.js";
const A="workspace:a", B="workspace:b", now="2026-10-01T00:00:00.000Z";
const context=(workspaceId=A)=>({workspaceId,actorId:"human:owner",authorizedAt:now});
const record=(overrides={})=>({workspaceId:A,reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1",version:"1"},resourceKind:"lead",value:{status:"new"},observedAt:now,...overrides});
const result=(records,overrides={})=>({records,fetchedAt:now,completeness:"COMPLETE",errors:[],...overrides});
test("intake deduplicates replay and preserves append-only supersession",async()=>{
 const ledger=new InMemoryEvidenceLedger(A,()=>now);
 const first=await ledger.ingest(context(),result([record()]),"BUSINESS_OS");
 assert.equal(first.completeness,"COMPLETE");assert.equal(first.accepted.length,1);
 assert.equal(first.accepted[0].verification,"UNVERIFIED");
 const replay=await ledger.ingest(context(),result([record()]),"BUSINESS_OS");
 assert.equal(replay.accepted.length,0);assert.equal(replay.duplicates.length,1);
 const changed=await ledger.ingest(context(),result([record({value:{status:"qualified"}})]),"BUSINESS_OS");
 assert.equal(changed.accepted.length,1);
 assert.equal(changed.accepted[0].supersedes,first.accepted[0].fingerprint);
 assert.equal(ledger.list(context()).length,2);
 const version=await ledger.ingest(context(),result([record({reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1",version:"2"}})]),"BUSINESS_OS");
 assert.equal(version.accepted.length,1);assert.equal(version.accepted[0].supersedes,changed.accepted[0].fingerprint);
});
test("rejects unauthorized workspace and quarantines foreign or missing-reference records",async()=>{
 const ledger=new InMemoryEvidenceLedger(A,()=>now);
 await assert.rejects(ledger.ingest(context(B),result([record()]),"BUSINESS_OS"),/UNAUTHORIZED_WORKSPACE/);
 assert.throws(()=>ledger.list(context(B)),/UNAUTHORIZED_WORKSPACE/);
 const response=await ledger.ingest(context(),result([record({workspaceId:B,value:{secret:"private"}}),record({reference:{sourceSystem:"BUSINESS_OS",externalReference:" "}}),record()]),"BUSINESS_OS");
 assert.equal(response.completeness,"PARTIAL");assert.equal(response.accepted.length,1);
 assert.ok(response.errors.some(e=>e.code==="CROSS_WORKSPACE_RECORD"));
 assert.ok(response.errors.some(e=>e.code==="EXTERNAL_REFERENCE_REQUIRED"));
 assert.ok(!JSON.stringify(response).includes("private"));
});
test("preserves upstream partial/error/freshness/cursor without promoting completeness",async()=>{
 const ledger=new InMemoryEvidenceLedger(A,()=>now);
 const response=await ledger.ingest(context(),result([record()],{completeness:"PARTIAL",nextCursor:"next",errors:[{code:"UPSTREAM_TIMEOUT",message:"timeout",retryable:true}]}),"BUSINESS_OS");
 assert.equal(response.completeness,"PARTIAL");assert.equal(response.fetchedAt,now);assert.equal(response.nextCursor,"next");
 assert.equal(response.errors[0].code,"UPSTREAM_TIMEOUT");assert.equal(response.accepted[0].verification,"UNVERIFIED");
 response.accepted[0].observation.value.status="tampered";
 assert.equal(ledger.list(context())[0].observation.value.status,"new");
});

test("source mismatch is quarantined rather than ingested",async()=>{
 const ledger=new InMemoryEvidenceLedger(A,()=>now);
 const response=await ledger.ingest(context(),result([record({reference:{sourceSystem:"MVP",externalReference:"lead:1"}})]),"BUSINESS_OS");
 assert.equal(response.completeness,"PARTIAL");assert.equal(response.accepted.length,0);
 assert.ok(response.errors.some(e=>e.code==="SOURCE_SCOPE_MISMATCH"));
});


test("M-01 malformed canonical records are quarantined without fingerprint alias",async()=>{const ledger=new InMemoryEvidenceLedger(A,()=>now);const bad=[null,record({observedAt:"yesterday"}),record({value:{n:NaN}}),record({value:{n:undefined}}),record({value:{n:1n}}),record({value:{n:Infinity}}),record({value:{nested:(()=>{let x={};for(let i=0;i<30;i++)x={child:x};return x;})()}})];const r=await ledger.ingest(context(),result([...bad,record()]),"BUSINESS_OS");assert.equal(r.accepted.length,1);assert.equal(r.completeness,"PARTIAL");assert.equal(ledger.list(context()).length,1);});
test("M-01 fatal clock failure cannot partially commit staged valid batch",async()=>{let n=0;const ledger=new InMemoryEvidenceLedger(A,()=>{if(++n===2)throw Error("clock failed");return now;});await assert.rejects(ledger.ingest(context(),result([record(),record({reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:2"}})]),"BUSINESS_OS"),/clock failed/);assert.equal(ledger.list(context()).length,0);});
test("M-01 same-batch duplicate is deduplicated before commit",async()=>{const ledger=new InMemoryEvidenceLedger(A,()=>now);const r=await ledger.ingest(context(),result([record(),record()]),"BUSINESS_OS");assert.equal(r.accepted.length,1);assert.equal(r.duplicates.length,1);assert.equal(ledger.list(context()).length,1);});

test("M-01 simultaneous duplicate ingestion commits once and releases serialization after failure",async()=>{const ledger=new InMemoryEvidenceLedger(A,()=>now);const [a,b]=await Promise.all([ledger.ingest(context(),result([record()]),"BUSINESS_OS"),ledger.ingest(context(),result([record()]),"BUSINESS_OS")]);assert.equal(a.accepted.length+b.accepted.length,1);assert.equal(a.duplicates.length+b.duplicates.length,1);assert.equal(ledger.list(context()).length,1);await assert.rejects(ledger.ingest(context(),null,"BUSINESS_OS"),/INVALID_INTAKE_BATCH/);const next=await ledger.ingest(context(),result([record({value:{status:"changed"}})]),"BUSINESS_OS");assert.equal(next.accepted.length,1);});
