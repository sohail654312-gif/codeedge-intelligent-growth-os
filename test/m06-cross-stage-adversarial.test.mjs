import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {BusinessOsReadModelReader} from "../dist/src/integration/business-os-read-model.js";
import {InMemoryEvidenceLedger} from "../dist/src/evidence/intake.js";
import {fingerprintOperationalRecord} from "../dist/src/evidence/fingerprint.js";
import {normalizeOperationalRecord} from "../dist/src/evidence/normalize.js";
import {analyzeBusinessMetrics} from "../dist/src/analysis/business-metrics.js";
import {validateTruthRecord,promoteAssumption} from "../dist/src/domain/truth/validation.js";
import {HumanApprovalBoundary} from "../dist/src/action/trusted-human-approval.js";
import {InMemoryApprovalLedger} from "../dist/src/action/in-memory-approval-ledger.js";
import {BusinessOsActionRequestBoundary} from "../dist/src/action/business-os-action-request.js";
import {InMemoryDeniedActionLedger} from "../dist/src/action/in-memory-denied-action-ledger.js";

/** M-06: pass actual outputs to the next reference boundary; fixtures are neither server IAM nor live providers. */
const A="workspace:a",B="workspace:b",NOW="2026-10-01T12:00:00.000Z";
const context=(actorId="owner:a",workspaceId=A)=>({workspaceId,actorId,authorizedAt:NOW});
const record=(externalReference="lead:1",workspaceId=A)=>({workspaceId,reference:{sourceSystem:"BUSINESS_OS",externalReference,version:"v1"},resourceKind:"lead",value:{status:"new"},observedAt:NOW});
const request=(changes={})=>({context:context(),sourceSystem:"BUSINESS_OS",resourceKind:"lead",limit:2,...changes});
function readerFixture(readPage) {
 const authCalls=[],sourceCalls=[];
 let revoked=false;
 const reader=BusinessOsReadModelReader.create({
  workspaceId:A,port:{version:"v1",async readPage(x){sourceCalls.push(x);return readPage(x);}},
  authorization:{async assertAuthorized(x){authCalls.push(x);if(revoked)throw Error("synthetic credential leak");}},
  cursorKeys:new Map([["m06-fixture",Buffer.alloc(32,4)]]),activeKeyId:"m06-fixture",clock:()=>NOW,cursorNow:()=>Date.parse(NOW)
 });
 return {reader,authCalls,sourceCalls,revoke(){revoked=true;}};
}
const metric=(fp,coverage="COMPLETE",workspaceId=A)=>({workspaceId,domain:"LEADS",metricKey:"leads-created",
 metricDefinitionVersion:"v1",sourceContractVersion:"business-os-read-model:v1",windowTimezone:"UTC",
 periodStart:"2026-10-01T00:00:00.000Z",periodEnd:"2026-10-02T00:00:00.000Z",observedAt:NOW,
 unit:"COUNT",numerator:1,evidenceFingerprints:[fp],coverage,verification:"UNVERIFIED"});
const metricReq={asOf:NOW,maxEvidenceAgeMs:86_400_000};
const assumption=()=>({id:"truth:1",workspaceId:A,truthClass:"ASSUMPTION",sourceSystem:"BUSINESS_OS",
 ownership:"EXTERNAL_OPERATIONAL",subjectRef:"lead:1",value:{status:"new"},evidence:[],lineage:[],createdAt:NOW});
const subject=fp=>({workspaceId:A,intentId:"intent:1",reviewPacketId:"review:1",proposalId:"proposal:1",
 planId:"plan:1",mode:"SANDBOX",domainService:"CRM",operation:"FOLLOW_UP",evidenceFingerprints:[fp]});
const gates=humanApproval=>({identity:true,membership:true,source:true,policy:true,humanApproval,durableAudit:true,adapter:true});
const actionInput=id=>({requestId:id,workspaceId:A,intentId:"intent:1",approvalId:"approval:1",
 mode:"SANDBOX",domainService:"CRM",operation:"FOLLOW_UP",payload:null,idempotencyKey:id});

test("M-06 foreign row is quarantined through reader/intake/metric without leaking existence or value",async()=>{
 const foreign={...record("lead:b",B),value:{secret:"M06_FOREIGN_SECRET"}};
 const f=readerFixture(async()=>({records:[record(),foreign],nextCursor:"upstream-private"}));
 const page=await f.reader.read(request());
 assert.equal(f.sourceCalls.length,1);
 assert.equal(f.authCalls.length,1);
 assert.equal(page.completeness,"PARTIAL");
 assert.equal(page.nextCursor,undefined);
 assert.equal(page.records.length,1);
 assert.ok(!JSON.stringify(page).includes("M06_FOREIGN_SECRET"));
 const ledger=new InMemoryEvidenceLedger(A,()=>NOW);
 const report=await ledger.ingest(context(),page,"BUSINESS_OS");
 assert.equal(report.completeness,"PARTIAL");
 assert.equal(report.accepted.length,1);
 assert.equal(ledger.list(context()).length,1);
 assert.throws(()=>ledger.list(context("owner:b",B)),/UNAUTHORIZED_WORKSPACE/);
 assert.ok(!JSON.stringify(report).includes("M06_FOREIGN_SECRET"));
 const fp=report.accepted[0].fingerprint;
 const projection=analyzeBusinessMetrics(context(),[metric(fp,report.completeness)],metricReq).insights[0];
 assert.equal(projection.status,"UNAVAILABLE");
 assert.equal(projection.value,null);
 assert.equal(projection.verifiedFact,false);
 assert.equal(projection.actionable,false);
 assert.throws(()=>analyzeBusinessMetrics(context(),[metric(fp,"COMPLETE",B)],metricReq),/UNAUTHORIZED_WORKSPACE/);
});

test("M-06 accepted read->fingerprint->analysis stays unverified, forged FACT cannot inherit it",async()=>{
 const seed=record();
 const f=readerFixture(async()=>({records:[seed]}));
 const page=await f.reader.read(request());
 assert.equal(page.completeness,"COMPLETE");
 const ledger=new InMemoryEvidenceLedger(A,()=>NOW);
 const report=await ledger.ingest(context(),page,"BUSINESS_OS");
 assert.equal(report.accepted.length,1);
 const entry=report.accepted[0];
 assert.equal(entry.fingerprint,await fingerprintOperationalRecord(seed));
 assert.deepEqual(entry.observation,normalizeOperationalRecord(seed));
 assert.equal(entry.verification,"UNVERIFIED");
 const insight=analyzeBusinessMetrics(context(),[metric(entry.fingerprint)],metricReq).insights[0];
 assert.equal(insight.status,"AVAILABLE");
 assert.equal(insight.value,1);
 assert.equal(insight.verifiedFact,false);
 assert.equal(insight.actionable,false);
 const claimed={id:"evidence:claimed",workspaceId:A,sourceSystem:"BUSINESS_OS",externalReference:"lead:1",
  observedAt:NOW,recordedAt:NOW,verification:"VERIFIED"};
 assert.throws(()=>promoteAssumption(assumption(),[claimed]),/VERIFIED_EVIDENCE_REQUIRED/);
 const claimedFact={...assumption(),truthClass:"FACT",evidence:[claimed]};
 assert.ok(validateTruthRecord(claimedFact).errors.includes("FACT_VERIFICATION_REQUIRED"));
 // A caller may mutate its own returned objects but cannot rewrite committed fingerprint/observation.
 page.records[0].value.status="attacker-mutated";
 report.accepted[0].observation.value.status="attacker-mutated";
 assert.equal(ledger.list(context())[0].observation.value.status,"new");
 assert.equal(ledger.list(context())[0].fingerprint,entry.fingerprint);
});

test("M-06 non-executable trusted approval is rechecked at action gate; even valid gate stays deny-only",async()=>{
 const f=readerFixture(async()=>({records:[record()]}));
 const page=await f.reader.read(request());
 const evidenceLedger=new InMemoryEvidenceLedger(A,()=>NOW);
 const report=await evidenceLedger.ingest(context(),page,"BUSINESS_OS");
 const s=subject(report.accepted[0].fingerprint);
 let actor="owner:a",membershipChecks=0,gateCalls=0,providerCalls=0;
 const approvalLedger=new InMemoryApprovalLedger();
 const approval=new HumanApprovalBoundary({
  async resolveSession(){return {workspaceId:A,actorId:actor,actorType:"HUMAN",sessionId:"session:"+actor,authenticatedAt:NOW};},
  async assertCurrentMembership(x){membershipChecks++;if(x.actorId!=="owner:a"||x.requiredRole!=="OWNER")throw Error("revoked synthetic session");}
 },{async evaluate(){return {allow:true,requiredRole:"OWNER",policyVersion:"m06:owner:v1",reasonCode:"SYNTHETIC",maxTtlMs:60000};}},
 approvalLedger,{digest:x=>createHash("sha256").update(x).digest("hex")},{now:()=>NOW});
 const saved=await approval.decide({approvalId:"approval:1",subject:s,decision:"APPROVE",requiredRole:"OWNER"});
 assert.equal(saved.status,"RECORDED_NON_EXECUTABLE");
 assert.equal((await approval.check({workspaceId:A,approvalId:saved.approvalId,subject:s,requiredRole:"OWNER"})).status,"VALID_NON_EXECUTABLE");
 const actionLedger=new InMemoryDeniedActionLedger();
 const boundary=new BusinessOsActionRequestBoundary({async verify(){gateCalls++;
  const checked=await approval.check({workspaceId:A,approvalId:saved.approvalId,subject:s,requiredRole:"OWNER"});
  return gates(checked.status==="VALID_NON_EXECUTABLE");
 }},actionLedger);
 actor="stolen:session";
 const denied=await boundary.submit(actionInput("request:revoked"),s);
 assert.equal(denied.reason,"GATES_NOT_ACCEPTED");
 assert.equal(denied.status,"DENIED_NO_EFFECT");
 assert.equal(denied.providerInvoked,false);
 actor="owner:a";
 const stillDenied=await boundary.submit(actionInput("request:valid"),s);
 assert.equal(stillDenied.reason,"EFFECTS_DISABLED");
 assert.equal(stillDenied.status,"DENIED_NO_EFFECT");
 assert.equal(stillDenied.performedEffects,0);
 assert.equal(stillDenied.dispatched,false);
 assert.equal(stillDenied.providerInvoked,false);
 assert.equal(denied.performedEffects,0);
 assert.equal(gateCalls,2);
 assert.ok(membershipChecks>=4);
 assert.equal(approvalLedger.audit.length,1);
 assert.equal(actionLedger.audit.length,2);
 assert.equal(providerCalls,0);
});

test("M-06 cursor continuation reauthorizes before decrypt and never calls upstream after revocation or actor swap",async()=>{
 const f=readerFixture(async x=>x.cursor?{records:[record("lead:2")]}:{records:[record()],nextCursor:"private-page-two"});
 const first=await f.reader.read(request());
 assert.equal(first.completeness,"COMPLETE");
 assert.ok(first.nextCursor?.startsWith("v2."));
 assert.ok(!first.nextCursor.includes("private-page-two"));
 assert.equal(f.sourceCalls.length,1);
 f.revoke();
 const revoked=await f.reader.read(request({cursor:first.nextCursor}));
 assert.equal(revoked.completeness,"PARTIAL");
 assert.deepEqual(revoked.records,[]);
 assert.ok(!JSON.stringify(revoked).includes("synthetic credential leak"));
 assert.equal(f.authCalls.length,2);
 assert.equal(f.sourceCalls.length,1);
 const g=readerFixture(async()=>{throw Error("upstream should not execute");});
 const swapped=await g.reader.read(request({cursor:first.nextCursor,context:context("another:actor")}));
 assert.equal(swapped.completeness,"PARTIAL");
 assert.deepEqual(swapped.records,[]);
 assert.equal(g.authCalls.length,1);
 assert.equal(g.sourceCalls.length,0);
 assert.throws(()=>BusinessOsReadModelReader.create({workspaceId:A,port:{version:"v1",readPage:async()=>({records:[]})},
  authorization:{assertAuthorized:async()=>{}},cursorKeys:new Map([["m06-fixture",Buffer.alloc(32,4)]]),
  activeKeyId:"m06-fixture",mode:"PRODUCTION"}),/INVALID_READ_MODEL_COMPOSITION/);
});

test("M-06 partial upstream and fatal second-record staging cannot imply a complete or partially committed batch",async()=>{
 const f=readerFixture(async()=>({records:[record(),{...record("lead:b"),value:{secret:"synthetic:unsafe"},observedAt:"not-iso"}],
  nextCursor:"incomplete-next"}));
 const partial=await f.reader.read(request());
 assert.equal(partial.completeness,"PARTIAL");
 assert.equal(partial.nextCursor,undefined);
 assert.equal(partial.records.length,1);
 assert.ok(!JSON.stringify(partial).includes("synthetic:unsafe"));
 const ledger=new InMemoryEvidenceLedger(A,()=>NOW);
 const report=await ledger.ingest(context(),partial,"BUSINESS_OS");
 assert.equal(report.completeness,"PARTIAL");
 assert.equal(report.accepted.length,1);
 let ticks=0;
 const atomic=new InMemoryEvidenceLedger(A,()=>{if(++ticks===2)throw Error("synthetic clock outage");return NOW;});
 const full={records:[record(),record("lead:2")],fetchedAt:NOW,completeness:"COMPLETE",errors:[]};
 await assert.rejects(atomic.ingest(context(),full,"BUSINESS_OS"),/synthetic clock outage/);
 assert.equal(atomic.list(context()).length,0);
 const recovered=await atomic.ingest(context(),{...full,records:[record()]}, "BUSINESS_OS");
 assert.equal(recovered.accepted.length,1);
 assert.equal(atomic.list(context()).length,1);
});
