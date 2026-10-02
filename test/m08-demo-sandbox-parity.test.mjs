import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {runSyntheticPilot} from "../dist/src/pilot/r9-synthetic-pilot.js";
import {syntheticLeadSeed} from "../dist/src/pilot/synthetic-pilot-fixtures.js";
import {BusinessOsReadModelReader} from "../dist/src/integration/business-os-read-model.js";
import {fingerprintOperationalRecord} from "../dist/src/evidence/fingerprint.js";
import {MAX_CANONICAL_STRING_BYTES} from "../dist/src/evidence/validation.js";
import {HumanApprovalBoundary} from "../dist/src/action/trusted-human-approval.js";
import {InMemoryApprovalLedger} from "../dist/src/action/in-memory-approval-ledger.js";
import {BusinessOsActionRequestBoundary} from "../dist/src/action/business-os-action-request.js";
import {InMemoryDeniedActionLedger} from "../dist/src/action/in-memory-denied-action-ledger.js";
const A="workspace:a",B="workspace:b",NOW="2026-10-01T12:00:00.000Z";
const seed=(mode="DEMO",kind="UK_TRADES",workspaceId=A)=>syntheticLeadSeed(kind,mode,workspaceId);
const clone=x=>structuredClone(x);
const normalized=r=>({...r,mode:"MODE",modeBanner:"SYNTHETIC_MODE_NO_EFFECT"});
test("M-08 both named fictional lead fixtures traverse identical DEMO and SANDBOX read/intake/analysis/approval/denial",async()=>{
 for(const kind of ["UK_TRADES","CLINIC"]){
  const d=await runSyntheticPilot(seed("DEMO",kind)),s=await runSyntheticPilot(seed("SANDBOX",kind));
  assert.deepEqual(normalized(d),normalized(s));
  assert.equal(d.analysis,"UNVERIFIED_NON_ACTIONABLE");
  assert.equal(d.verifiedFact,false);assert.equal(d.actionable,false);
  assert.equal(d.evidenceCount,1);assert.equal(d.readCount,1);
  assert.equal(d.approval,"VALID_NON_EXECUTABLE");assert.equal(d.actionReason,"GATES_NOT_ACCEPTED");
  assert.equal(d.action,"DENIED_NO_EFFECT");assert.equal(d.auditEvents,2);
  assert.deepEqual([d.providerCalls,d.productionConnections,d.performedEffects],[0,0,0]);
  assert.match(d.admittedEvidence[0].fingerprint,/^cigo:observation:v1:[a-f0-9]{64}$/);
  assert.deepEqual(d.approvalEvidenceFingerprints,d.admittedEvidence.map(e=>e.fingerprint));
 }
});
test("M-08 canonical admitted fingerprint is actual read/intake identity and observation mutation changes identity",async()=>{
 const a=seed(),original=await runSyntheticPilot(a);
 const fp=await fingerprintOperationalRecord(a.records[0]);
 assert.equal(original.admittedEvidence[0].fingerprint,fp);
 assert.equal(original.approvalEvidenceFingerprints[0],fp);
 const changed=clone(a);changed.records[0].value.status="qualified";
 const second=await runSyntheticPilot(changed);
 assert.notEqual(second.admittedEvidence[0].fingerprint,fp);
 assert.deepEqual(second.approvalEvidenceFingerprints,second.admittedEvidence.map(x=>x.fingerprint));
 assert.equal(a.records[0].value.status,"new");
});
test("M-08 foreign tenant and wrong source fail before downstream composition with generic errors",async()=>{
 for(const mutate of [
  x=>{x.records[0].workspaceId=B;x.records[0].value.secret="PRIVATE_FOREIGN";},
  x=>{x.records.push({...x.records[0],workspaceId:B,reference:{...x.records[0].reference,externalReference:"lead:foreign"}});},
  x=>{x.records[0].reference.sourceSystem="MVP";},
  x=>{x.records[0].resourceKind="invoice";},
  x=>{x.records.push(clone(x.records[0]));}
 ]){
  const x=seed();mutate(x);
  await assert.rejects(runSyntheticPilot(x),e=>e.message==="INVALID_SYNTHETIC_PILOT_SEED"&&!e.message.includes("PRIVATE_FOREIGN"));
 }
});
test("M-08 malformed canonical record, invalid date/reference, unsafe JSON and byte budget reject both modes",async()=>{
 for(const mode of ["DEMO","SANDBOX"])for(const mutate of [
  x=>{x.records[0].observedAt="tomorrow";},x=>{x.records[0].reference.externalReference="  ";},
  x=>{x.records[0].value={n:NaN};},x=>{x.records[0].value={n:1n};},
  x=>{x.records[0].value={note:"🙂".repeat(MAX_CANONICAL_STRING_BYTES)};},
  x=>{x.records[0].value={self:null};x.records[0].value.self=x.records[0].value;}
 ]){
  const x=seed(mode);mutate(x);
  await assert.rejects(runSyntheticPilot(x),/INVALID_SYNTHETIC_PILOT_SEED/);
 }
});
test("M-08 synthetic PRODUCTION and injected reader, mode override and codec are rejected at seed entry",async()=>{
 for(const x of [{...seed(),mode:"PRODUCTION"},{...seed(),reader:{read(){throw Error("not allowed");}}},
  {...seed(),modeOverride:"PRODUCTION"},{...seed(),cursorCodec:{decode(){return "private";}}}])
  await assert.rejects(runSyntheticPilot(x),/INVALID_SYNTHETIC_PILOT_SEED/);
 const common={workspaceId:A,port:{version:"v1",readPage:async()=>({records:[]})},
  authorization:{assertAuthorized:async()=>{}},cursorKeys:new Map([["k",Buffer.alloc(32,7)]]),activeKeyId:"k"};
 assert.throws(()=>BusinessOsReadModelReader.create({...common,mode:"PRODUCTION"}),/INVALID_READ_MODEL_COMPOSITION/);
 assert.throws(()=>new BusinessOsReadModelReader(A,common.port,common.authorization,
  {encode:()=> "legacy",decode:()=> "private"}),/CONFIDENTIAL_CURSOR_CODEC_REQUIRED/);
});
test("M-08 injected synthetic source outage and real intake clock fault never return successful pilot",async()=>{
 for(const fixtureFault of ["SOURCE_UNAVAILABLE","INTAKE_CLOCK_FAILURE"]){
  const x={...seed(),fixtureFault};
  await assert.rejects(runSyntheticPilot(x),e=>{
   assert.ok(["SYNTHETIC_READ_INCOMPLETE","SYNTHETIC_INTAKE_FAILED"].includes(e.message));
   assert.ok(!e.message.includes("credential"));return true;
  });
 }
 assert.equal((await runSyntheticPilot(seed())).action,"DENIED_NO_EFFECT");
});
test("M-08 isolated repeated runs, distinct workspaces and defensive cloning prevent mutable state reuse",async()=>{
 const a=seed(),first=await runSyntheticPilot(a),second=await runSyntheticPilot(seed()),other=await runSyntheticPilot(seed("DEMO","UK_TRADES",B));
 assert.deepEqual(first,second);
 assert.notEqual(first.admittedEvidence[0].fingerprint,other.admittedEvidence[0].fingerprint);
 assert.equal(first.auditEvents,2);assert.equal(second.auditEvents,2);assert.equal(other.auditEvents,2);
 assert.throws(()=>{first.admittedEvidence[0].externalReference="lead:tampered";},TypeError);
 assert.throws(()=>{first.approvalEvidenceFingerprints.push("fake");},TypeError);
 a.records[0].value.status="changed-after-completion";
 assert.equal(second.admittedEvidence[0].fingerprint,first.admittedEvidence[0].fingerprint);
 assert.equal((await runSyntheticPilot(seed())).evidenceCount,1);
});
/** A fixture exercising REAL R6 membership/policy/digest/ledger checks, not a test stub returning preselected decisions. */
function approvalFixture(fp){
 let actor="owner:a",role="OWNER",version="v1",member=true;
 const ledger=new InMemoryApprovalLedger();
 const subject=(fingerprint=fp,workspaceId=A)=>({workspaceId,intentId:"synthetic:intent",reviewPacketId:"synthetic:review",
  proposalId:"synthetic:proposal",planId:"synthetic:plan",mode:"DEMO",domainService:"CRM",operation:"FOLLOW_UP",
  evidenceFingerprints:[fingerprint]});
 const authority={async resolveSession(){return {workspaceId:A,actorId:actor,actorType:"HUMAN",sessionId:"session:"+actor,authenticatedAt:NOW};},
  async assertCurrentMembership(x){if(!member||x.workspaceId!==A||x.actorId!=="owner:a"||x.requiredRole!==role)throw Error("MEMBERSHIP_DENIED");}};
 const policy={async evaluate(){return {allow:true,requiredRole:"OWNER",policyVersion:version,reasonCode:"SYNTHETIC",maxTtlMs:60000};}};
 const digest={digest:x=>createHash("sha256").update(x).digest("hex")};
 const boundary=new HumanApprovalBoundary(authority,policy,ledger,digest,{now:()=>NOW});
 return {boundary,ledger,subject,setActor:x=>actor=x,setRole:x=>role=x,setMember:x=>member=x,setPolicy:x=>version=x};
}
test("M-08 actual admitted fingerprint binds immutable approval; stale evidence, actor or workspace cannot inherit it",async()=>{
 const first=await runSyntheticPilot(seed()),f=approvalFixture(first.admittedEvidence[0].fingerprint);
 const subject=f.subject(),saved=await f.boundary.decide({approvalId:"approval:parity",subject,decision:"APPROVE",requiredRole:"OWNER"});
 assert.equal((await f.boundary.check({workspaceId:A,approvalId:saved.approvalId,subject,requiredRole:"OWNER"})).status,"VALID_NON_EXECUTABLE");
 const changed=seed();changed.records[0].value.status="new-value";const newer=await runSyntheticPilot(changed);
 assert.equal((await f.boundary.check({workspaceId:A,approvalId:saved.approvalId,subject:f.subject(newer.admittedEvidence[0].fingerprint),requiredRole:"OWNER"})).status,"DENIED");
 await assert.rejects(f.boundary.decide({approvalId:saved.approvalId,subject:f.subject(newer.admittedEvidence[0].fingerprint),decision:"APPROVE",requiredRole:"OWNER"}),/APPROVAL_REPLAY_CONFLICT/);
 assert.equal((await f.boundary.check({workspaceId:B,approvalId:saved.approvalId,subject:f.subject(first.admittedEvidence[0].fingerprint,B),requiredRole:"OWNER"})).status,"DENIED");
 f.setActor("attacker");assert.equal((await f.boundary.check({workspaceId:A,approvalId:saved.approvalId,subject,requiredRole:"OWNER"})).status,"DENIED");
});
test("M-08 R6 policy changes, role downgrades and revocation invalidate current synthetic approval",async()=>{
 const first=await runSyntheticPilot(seed()),f=approvalFixture(first.admittedEvidence[0].fingerprint),subject=f.subject();
 const a=await f.boundary.decide({approvalId:"approval:1",subject,decision:"APPROVE",requiredRole:"OWNER"});
 f.setPolicy("v2");
 assert.equal((await f.boundary.check({workspaceId:A,approvalId:a.approvalId,subject,requiredRole:"OWNER"})).reason,"POLICY_CHANGED_OR_DENIED");
 f.setPolicy("v1");f.setRole("APPROVER");
 assert.equal((await f.boundary.check({workspaceId:A,approvalId:a.approvalId,subject,requiredRole:"OWNER"})).reason,"IDENTITY_OR_MEMBERSHIP_DENIED");
 f.setRole("OWNER");f.setMember(false);
 assert.equal((await f.boundary.check({workspaceId:A,approvalId:a.approvalId,subject,requiredRole:"OWNER"})).status,"DENIED");
 f.setMember(true);await f.boundary.revoke({workspaceId:A,approvalId:a.approvalId,operation:"FOLLOW_UP"});
 assert.equal((await f.boundary.check({workspaceId:A,approvalId:a.approvalId,subject,requiredRole:"OWNER"})).reason,"APPROVAL_REVOKED");
 assert.equal(f.ledger.audit.length,2);
});
test("M-08 live-shaped R7 reference denial remains zero-effect even after genuine R6 fixture approval",async()=>{
 const result=await runSyntheticPilot(seed()),fp=result.admittedEvidence[0].fingerprint,f=approvalFixture(fp),subject=f.subject();
 const a=await f.boundary.decide({approvalId:"approval:1",subject,decision:"APPROVE",requiredRole:"OWNER"});
 const audit=new InMemoryDeniedActionLedger();let checks=0,externalCalls=0;
 const action=new BusinessOsActionRequestBoundary({async verify(){checks++;const yes=await f.boundary.check({workspaceId:A,approvalId:a.approvalId,subject,requiredRole:"OWNER"});return {identity:true,membership:true,source:true,policy:true,humanApproval:yes.status==="VALID_NON_EXECUTABLE",durableAudit:false,adapter:false};}},audit);
 const denied=await action.submit({requestId:"request:1",workspaceId:A,intentId:subject.intentId,approvalId:a.approvalId,
  mode:"DEMO",domainService:"CRM",operation:"FOLLOW_UP",payload:null,idempotencyKey:"idem:1"},subject);
 assert.equal(checks,1);assert.equal(denied.reason,"GATES_NOT_ACCEPTED");assert.equal(denied.status,"DENIED_NO_EFFECT");
 assert.deepEqual([denied.requestedEffects,denied.performedEffects,denied.providerInvoked,denied.dispatched,externalCalls],[0,0,false,false,0]);
 assert.equal(audit.audit.length,1);
});
