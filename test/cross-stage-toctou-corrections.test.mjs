import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {BusinessOsActionRequestBoundary} from "../dist/src/action/business-os-action-request.js";
import {InMemoryDeniedActionLedger} from "../dist/src/action/in-memory-denied-action-ledger.js";
import {HumanApprovalBoundary} from "../dist/src/action/trusted-human-approval.js";
import {InMemoryApprovalLedger} from "../dist/src/action/in-memory-approval-ledger.js";
import {fingerprintOperationalRecord} from "../dist/src/evidence/fingerprint.js";
import {requireAttestedObservation} from "../dist/src/evidence/source-attestation.js";
import {SyntheticSecurityEventCollector} from "../dist/src/security/synthetic-security-event-collector.js";
const A="workspace:a",B="workspace:b",NOW="2026-10-01T12:00:00.000Z";
const sub=()=>({workspaceId:A,intentId:"intent:1",reviewPacketId:"review:1",proposalId:"proposal:1",planId:"plan:1",mode:"DEMO",domainService:"CRM",operation:"FOLLOW_UP",evidenceFingerprints:["fingerprint:1"]});
const req=()=>({requestId:"request:1",workspaceId:A,intentId:"intent:1",approvalId:"approval:1",mode:"DEMO",domainService:"CRM",operation:"FOLLOW_UP",payload:null,idempotencyKey:"idem:1"});
const sha=x=>createHash("sha256").update(x).digest("hex");
function human({policyHook=()=>{},membershipHook=()=>{}}={}){
 const ledger=new InMemoryApprovalLedger();
 const authority={async resolveSession(){return {workspaceId:A,actorId:"owner:1",actorType:"HUMAN",sessionId:"session:1",authenticatedAt:NOW};},
  async assertCurrentMembership(x){membershipHook(x);if(x.workspaceId!==A||x.actorId!=="owner:1"||x.requiredRole!=="OWNER"||x.operation!=="FOLLOW_UP")throw Error("MEMBERSHIP_DENIED");}};
 const policy={async evaluate(x){policyHook(x);return {allow:true,requiredRole:"OWNER",policyVersion:"policy:v1",reasonCode:"ALLOW_SYNTHETIC",maxTtlMs:60000};}};
 return {ledger,boundary:new HumanApprovalBoundary(authority,policy,ledger,{digest:sha},{now:()=>NOW})};
}
test("CROSS-01 R7 snapshots verified request/subject before an async gate can mutate the caller object",async()=>{
 const request=req(),subject=sub(),ledger=new InMemoryDeniedActionLedger();let checked;
 const boundary=new BusinessOsActionRequestBoundary({async verify(g){
  checked=structuredClone(g);
  request.workspaceId=B;request.mode="PRODUCTION";request.idempotencyKey="idem:foreign";request.requestId="request:foreign";
  subject.operation="DELETE";subject.evidenceFingerprints[0]="fingerprint:tampered";
  return {identity:true,membership:true,source:true,policy:true,humanApproval:true,durableAudit:false,adapter:false};
 }},ledger);
 const out=await boundary.submit(request,subject);
 assert.equal(checked.workspaceId,A);assert.equal(checked.subject.operation,"FOLLOW_UP");
 assert.equal(out.workspaceId,A);assert.equal(out.mode,"DEMO");assert.equal(out.idempotencyKey,"idem:1");assert.equal(out.requestId,"request:1");
 assert.equal(out.operation,"FOLLOW_UP");assert.equal(out.reason,"GATES_NOT_ACCEPTED");assert.equal(out.status,"DENIED_NO_EFFECT");
 assert.deepEqual([out.requestedEffects,out.performedEffects,out.providerInvoked,out.dispatched],[0,0,false,false]);
 assert.equal(ledger.audit.length,1);assert.equal(ledger.audit[0].workspaceId,A);
});
test("CROSS-02 R6 decide binds a single pre-await subject, including policy, membership and immutable approval digest",async()=>{
 const subject=sub(),expected=structuredClone(subject),evaluated=[];
 const f=human({policyHook:x=>{evaluated.push(structuredClone(x.subject));subject.operation="DELETE";subject.planId="plan:attacker";subject.evidenceFingerprints[0]="fingerprint:attacker";}});
 const saved=await f.boundary.decide({approvalId:"approval:1",subject,decision:"APPROVE",requiredRole:"OWNER"});
 assert.deepEqual(evaluated[0],expected);
 assert.equal((await f.boundary.check({workspaceId:A,approvalId:saved.approvalId,subject:expected,requiredRole:"OWNER"})).status,"VALID_NON_EXECUTABLE");
 assert.equal((await f.boundary.check({workspaceId:A,approvalId:saved.approvalId,subject,requiredRole:"OWNER"})).status,"DENIED");
 assert.equal(f.ledger.audit.length,1);
});
test("CROSS-02 R6 check binds the initial subject despite caller mutation during membership await",async()=>{
 let mutate=()=>{};const f=human({membershipHook:()=>mutate()});const subject=sub();
 const a=await f.boundary.decide({approvalId:"approval:1",subject,decision:"APPROVE",requiredRole:"OWNER"});
 const checking=structuredClone(subject);
 mutate=()=>{checking.planId="plan:replaced";checking.evidenceFingerprints[0]="fingerprint:replaced";mutate=()=>{};};
 const result=await f.boundary.check({workspaceId:A,approvalId:a.approvalId,subject:checking,requiredRole:"OWNER"});
 assert.equal(result.status,"VALID_NON_EXECUTABLE");
 assert.equal((await f.boundary.check({workspaceId:A,approvalId:a.approvalId,subject:checking,requiredRole:"OWNER"})).status,"DENIED");
});
test("CROSS-03 R3 refuses authentic receipt misassociated with empty, foreign, duplicate or unrelated COMPLETE read result",async()=>{
 const record={workspaceId:A,reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1",version:"v1"},resourceKind:"lead",value:{status:"new"},observedAt:NOW};
 const att={workspaceId:A,sourceSystem:"BUSINESS_OS",externalReference:"lead:1",fingerprint:await fingerprintOperationalRecord(record),fetchedAt:NOW,adapterId:"server:fixture",receiptId:"receipt:1"};
 const authority={async verifyReceipt(a){return a.receiptId==="receipt:1";}};
 const fetched=records=>({records,fetchedAt:NOW,completeness:"COMPLETE",errors:[]});
 assert.equal((await requireAttestedObservation(record,fetched([record]),att,authority)).receiptId,"receipt:1");
 for(const records of [[],[{...record,workspaceId:B}],[{...record,reference:{...record.reference,externalReference:"lead:other"}}],[record,structuredClone(record)],[{...record,value:{status:"changed"}}]]){
  await assert.rejects(requireAttestedObservation(record,fetched(records),att,authority),/UNTRUSTED_SOURCE_PROVENANCE/);
 }
});
test("CROSS-04 direct R8 collector ingress rejects frozen forged values despite exact event keys",async()=>{
 const c=new SyntheticSecurityEventCollector();
 const valid={code:"AUTH_DENIED",stage:"R8",mode:"DEMO",occurredAt:NOW,correlationId:"opaque_12345678",severity:"INFO",effectCount:0};
 await c.emit(Object.freeze({...valid}));
 for(const bad of [{...valid,code:"UNREVIEWED"},{...valid,stage:"R10"},{...valid,mode:"LIVE"},{...valid,occurredAt:"tomorrow"},{...valid,correlationId:"SECRET:Bearer key"},{...valid,severity:"ERROR"}]){
  await assert.rejects(c.emit(Object.freeze(bad)),/UNSAFE_SYNTHETIC_EVENT/);
 }
 assert.equal(c.snapshot().length,1);
});

test("CROSS-01 R7 mutable ledger adapter cannot rewrite the original receipt used as integrity comparator",async()=>{
 const boundary=new BusinessOsActionRequestBoundary({async verify(){return {identity:true,membership:true,source:true,policy:true,humanApproval:true,durableAudit:false,adapter:false};}},
  {async record(row){row.workspaceId=B;row.requestId="request:forged";return row;}});
 await assert.rejects(boundary.submit(req(),sub()),/ACTION_LEDGER_INTEGRITY_FAILURE/);
});
test("CROSS-02 R6 mutable ledger adapter cannot rewrite the original approval decision used as integrity comparator",async()=>{
 const f=human();f.ledger.record=async row=>{row.subjectDigest="forged:digest";return row;};
 await assert.rejects(f.boundary.decide({approvalId:"approval:1",subject:sub(),decision:"APPROVE",requiredRole:"OWNER"}),/APPROVAL_LEDGER_INTEGRITY_FAILURE/);
});

test("CROSS-03 rejects conflicting same-identity records in a supposedly complete attested page",async()=>{
 const observation={workspaceId:A,reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1",version:"v1"},resourceKind:"lead",value:{status:"new"},observedAt:NOW};
 const attestation={workspaceId:A,sourceSystem:"BUSINESS_OS",externalReference:"lead:1",fingerprint:await fingerprintOperationalRecord(observation),fetchedAt:NOW,adapterId:"server:fixture",receiptId:"receipt:1"};
 const authority={async verifyReceipt(x){return x.receiptId==="receipt:1";}};
 const otherVersionsOfSameIdentity=[
  {...observation,value:{status:"closed"}},
  {...observation,observedAt:"2026-10-01T12:00:01.000Z"},
 ];
 for(const conflicting of otherVersionsOfSameIdentity){
  const page={records:[observation,conflicting],fetchedAt:NOW,completeness:"COMPLETE",errors:[]};
  await assert.rejects(requireAttestedObservation(observation,page,attestation,authority),/UNTRUSTED_SOURCE_PROVENANCE/);
 }
});
