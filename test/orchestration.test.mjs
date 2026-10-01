import test from "node:test";
import assert from "node:assert/strict";
import { orchestrateEvidenceIntake } from "../dist/src/integration/orchestrate-evidence.js";
import { InMemorySourceReader } from "../dist/src/integration/in-memory-source-reader.js";
import { InMemoryEvidenceLedger } from "../dist/src/evidence/intake.js";
const A="workspace:a",B="workspace:b",NOW="2026-10-01T00:00:00.000Z";
const context=(workspaceId=A)=>({workspaceId,actorId:"owner",authorizedAt:NOW});
const request=(overrides={})=>({context:context(),sourceSystem:"BUSINESS_OS",resourceKind:"lead",limit:1,...overrides});
const record=(id)=>({workspaceId:A,reference:{sourceSystem:"BUSINESS_OS",externalReference:id,version:"1"},resourceKind:"lead",value:{status:"new"},observedAt:NOW});
const ledger=()=>new InMemoryEvidenceLedger(A,()=>NOW);
const response=(nextCursor,overrides={})=>({records:[record("lead:1")],fetchedAt:NOW,completeness:"COMPLETE",errors:[],...(nextCursor===undefined?{}:{nextCursor}),...overrides});
test("bounded multi-page read and replay are idempotent",async()=>{
 const source=new InMemorySourceReader("BUSINESS_OS",A,[record("lead:1"),record("lead:2")],()=>NOW), store=ledger();
 const first=await orchestrateEvidenceIntake(source,store,request());
 assert.equal(first.pages,2);assert.equal(first.accepted,2);assert.equal(first.completeness,"COMPLETE");
 const replay=await orchestrateEvidenceIntake(source,store,request());
 assert.equal(replay.accepted,0);assert.equal(replay.duplicates,2);assert.equal(store.list(context()).length,2);
});
test("source and workspace mismatches fail closed",async()=>{
 const source=new InMemorySourceReader("BUSINESS_OS",A,[record("lead:1")],()=>NOW);
 assert.equal((await orchestrateEvidenceIntake(source,ledger(),request({sourceSystem:"MVP"}))).pages,0);
 const foreign=await orchestrateEvidenceIntake(source,ledger(),request({context:context(B)}));
 assert.equal(foreign.completeness,"PARTIAL");assert.equal(foreign.accepted,0);
});
test("partial source response preserves errors and halts pagination",async()=>{
 let calls=0;const source={sourceSystem:"BUSINESS_OS",async read(){calls++;return response("next",{completeness:"PARTIAL",errors:[{code:"TIMEOUT",message:"timeout",retryable:true}]});}};
 const output=await orchestrateEvidenceIntake(source,ledger(),request());
 assert.equal(calls,1);assert.equal(output.completeness,"PARTIAL");assert.equal(output.errors[0].code,"TIMEOUT");
 assert.equal(output.reports[0].accepted[0].verification,"UNVERIFIED");
});
test("repeated and empty cursors, bounds, exceptions fail safely",async()=>{
 for(const nextCursor of ["0",""]) {
  const source={sourceSystem:"BUSINESS_OS",async read(){return response(nextCursor);}};
  const output=await orchestrateEvidenceIntake(source,ledger(),request({cursor:"0"}));
  assert.equal(output.completeness,"PARTIAL");assert.ok(output.errors.some(e=>e.code==="INVALID_NEXT_CURSOR"));
 }
 const endless={sourceSystem:"BUSINESS_OS",async read(input){return response(String(Number(input.cursor??"0")+1));}};
 const bounded=await orchestrateEvidenceIntake(endless,ledger(),request(),2);
 assert.equal(bounded.pages,2);assert.ok(bounded.errors.some(e=>e.code==="PAGE_BOUND_REACHED"));
 const throwing={sourceSystem:"BUSINESS_OS",async read(){throw Error("secret");}};
 const failed=await orchestrateEvidenceIntake(throwing,ledger(),request());
 assert.equal(failed.pages,0);assert.equal(failed.errors[0].code,"SOURCE_READ_FAILED");
 assert.ok(!JSON.stringify(failed).includes("secret"));
});

test("unexpected resource kind is rejected before ingestion",async()=>{
 const store=ledger();const source={sourceSystem:"BUSINESS_OS",async read(){return response(undefined,{records:[{...record("booking:1"),resourceKind:"booking"}]});}};
 const output=await orchestrateEvidenceIntake(source,store,request());
 assert.equal(output.completeness,"PARTIAL");assert.equal(output.accepted,0);
 assert.ok(output.errors.some(e=>e.code==="RESOURCE_SCOPE_MISMATCH"));
 assert.equal(store.list(context()).length,0);
});

test("malformed source records fail closed before any ingestion",async()=>{
 for(const malformed of [null, "unexpected", {resourceKind:undefined}]) {
  const store=ledger();
  const source={sourceSystem:"BUSINESS_OS",async read(){
   return response(undefined,{records:[record("lead:valid"),malformed]});
  }};
  const output=await orchestrateEvidenceIntake(source,store,request());
  assert.equal(output.completeness,"PARTIAL");
  assert.equal(output.accepted,0);
  assert.equal(output.pages,0);
  assert.ok(output.errors.some(e=>e.code==="INVALID_SOURCE_RESPONSE"));
  assert.equal(store.list(context()).length,0);
 }
});
