import {BusinessOsReadModelReader} from "../integration/business-os-read-model.js";
import type {BusinessOsReadModelPort,TrustedReadAuthorization} from "../integration/business-os-read-model.js";
import {createHmac,randomBytes} from "node:crypto";
import {validateOperationalRecord} from "../evidence/validation.js";
import {InMemoryEvidenceLedger} from "../evidence/intake.js";
import {analyzeBusinessMetrics} from "../analysis/business-metrics.js";
import {HumanApprovalBoundary} from "../action/trusted-human-approval.js";
import type {ApprovalAuthority,ApprovalClock,ApprovalDigest,ApprovalPolicy,ApprovalSubject} from "../action/trusted-human-approval.js";
import {InMemoryApprovalLedger} from "../action/in-memory-approval-ledger.js";
import {BusinessOsActionRequestBoundary} from "../action/business-os-action-request.js";
import {InMemoryDeniedActionLedger} from "../action/in-memory-denied-action-ledger.js";
import type {OperationalRecord,ReadRequest} from "../integration/contracts.js";
import type {WorkspaceId} from "../domain/truth/types.js";

export type PilotMode="DEMO"|"SANDBOX";
/** Fault injection drives the real reader or intake boundary; it is synthetic-only and cannot select providers. */
export interface SyntheticPilotSeed {
 readonly workspaceId:string;readonly actorId:string;readonly sessionId:string;readonly mode:PilotMode;
 readonly records:readonly OperationalRecord[];
 readonly fixtureFault?:"SOURCE_UNAVAILABLE"|"INTAKE_CLOCK_FAILURE";
}
export interface SyntheticPilotEvidence {
 readonly fingerprint:string;readonly externalReference:string;readonly verification:"UNVERIFIED";
}
export interface SyntheticPilotResult {
 readonly kind:"R9_SYNTHETIC_NO_EFFECT_ACCEPTANCE";readonly mode:PilotMode;readonly modeBanner:"SYNTHETIC_DEMO_NO_EFFECT"|"SYNTHETIC_SANDBOX_NO_EFFECT";
 readonly workspaceId:string;readonly readCount:number;readonly evidenceCount:number;
 readonly admittedEvidence:readonly SyntheticPilotEvidence[];readonly approvalEvidenceFingerprints:readonly string[];
 readonly analysis:"UNVERIFIED_NON_ACTIONABLE";readonly analysisValue:number;readonly verifiedFact:false;readonly actionable:false;
 readonly approval:"VALID_NON_EXECUTABLE";readonly action:"DENIED_NO_EFFECT";readonly actionReason:"GATES_NOT_ACCEPTED";
 readonly auditEvents:number;readonly providerCalls:0;readonly productionConnections:0;readonly performedEffects:0;
}
const stamp="2026-10-01T12:00:00.000Z";
const safe=(s:unknown):s is string=>typeof s==="string"&&/^[a-zA-Z0-9:_-]{3,100}$/.test(s);
const reject=(code:string):never=>{throw Error(code);};
const allowed=new Set(["workspaceId","actorId","sessionId","mode","records","fixtureFault"]);
/** Synthetic reference only. Reject PRODUCTION and unexpected composition before constructing any reader/authority. */
export async function runSyntheticPilot(seed:SyntheticPilotSeed):Promise<SyntheticPilotResult>{
 if(!seed||typeof seed!=="object"||!["DEMO","SANDBOX"].includes(seed.mode)||
  Object.keys(seed).some(key=>!allowed.has(key))||
  !safe(seed.workspaceId)||!safe(seed.actorId)||!safe(seed.sessionId)||
  (seed.fixtureFault!==undefined&&!["SOURCE_UNAVAILABLE","INTAKE_CLOCK_FAILURE"].includes(seed.fixtureFault))||
  !Array.isArray(seed.records)||seed.records.length<1||seed.records.length>10)
  reject("INVALID_SYNTHETIC_PILOT_SEED");
 const workspaceId=seed.workspaceId as WorkspaceId;
 const mode:PilotMode=seed.mode,actorId=seed.actorId,sessionId=seed.sessionId;
 const context={workspaceId,actorId,authorizedAt:stamp};
 const references=new Set<string>();
 for(const record of seed.records){
  if(!record||record.workspaceId!==workspaceId||record.reference?.sourceSystem!=="BUSINESS_OS"||
    record.resourceKind!=="lead"||record.reference.version!=="v1"||
    !validateOperationalRecord(record,context).ok||
    Date.parse(record.observedAt)<Date.parse("2026-10-01T00:00:00.000Z")||
    Date.parse(record.observedAt)>=Date.parse("2026-10-02T00:00:00.000Z")||
    references.has(record.reference.externalReference))reject("INVALID_SYNTHETIC_PILOT_SEED");
  references.add(record.reference.externalReference);
 }
 // Capture a detached, validated snapshot BEFORE the first await: caller mutation must not change admission.
 let records:OperationalRecord[]=[];
 try{records=structuredClone([...seed.records]);}catch{return reject("INVALID_SYNTHETIC_PILOT_SEED");}
 const fault=seed.fixtureFault;
 const port:BusinessOsReadModelPort={version:"v1",async readPage(x){
  if(x.workspaceId!==workspaceId||x.resourceKind!=="lead"||x.cursor!==undefined)reject("SYNTHETIC_SOURCE_SCOPE_DENIED");
  if(fault==="SOURCE_UNAVAILABLE")reject("SYNTHETIC_SOURCE_FAULT");
  return {records:structuredClone(records.slice(0,x.limit))};
 }};
 const authorization:TrustedReadAuthorization={async assertAuthorized(x){
  if(x.workspaceId!==workspaceId||x.actorId!==actorId||x.resourceKind!=="lead")reject("SYNTHETIC_AUTH_DENIED");
 }};
 // The same strict confidential AEAD constructor as the reference R5 reader; new disposable key each run.
 const reader=BusinessOsReadModelReader.create({workspaceId,port,authorization,
  cursorKeys:new Map([["synthetic",randomBytes(32)]]),activeKeyId:"synthetic",clock:()=>stamp,cursorNow:()=>Date.parse(stamp)});
 const request:ReadRequest={context,sourceSystem:"BUSINESS_OS",resourceKind:"lead",limit:10};
 const read=await reader.read(request);
 if(read.completeness!=="COMPLETE"||read.errors.length||read.records.length!==records.length||read.nextCursor!==undefined)
  reject("SYNTHETIC_READ_INCOMPLETE");
 const evidenceLedger=new InMemoryEvidenceLedger(workspaceId,()=>fault==="INTAKE_CLOCK_FAILURE"?reject("SYNTHETIC_INTAKE_CLOCK_FAULT"):stamp);
 const report=await evidenceLedger.ingest(context,read,"BUSINESS_OS").catch(()=>reject("SYNTHETIC_INTAKE_FAILED"));
 if(report.completeness!=="COMPLETE"||report.errors.length||report.duplicates.length||
  report.accepted.length!==records.length||report.accepted.some(x=>x.verification!=="UNVERIFIED"||x.observation.workspaceId!==workspaceId||
  !/^cigo:observation:v1:[a-f0-9]{64}$/.test(x.fingerprint)))reject("SYNTHETIC_EVIDENCE_INCOMPLETE");
 const admitted=evidenceLedger.list(context);
 if(admitted.length!==report.accepted.length)reject("SYNTHETIC_EVIDENCE_INCOMPLETE");
 const fingerprints=admitted.map(x=>x.fingerprint);
 // Projection is explicitly synthetic and derived from distinct admitted fixture lead references, NOT an authenticated operational aggregate.
 const insight=analyzeBusinessMetrics(context,[{workspaceId,domain:"LEADS",metricKey:"leads-created",metricDefinitionVersion:"v1",
  sourceContractVersion:"business-os-read-model:v1",windowTimezone:"UTC",periodStart:"2026-10-01T00:00:00.000Z",
  periodEnd:"2026-10-02T00:00:00.000Z",observedAt:stamp,unit:"COUNT",numerator:admitted.length,
  evidenceFingerprints:fingerprints,coverage:"COMPLETE",verification:"UNVERIFIED"}],
  {asOf:stamp,maxEvidenceAgeMs:86400000}).insights[0];
 if(!insight||insight.status!=="AVAILABLE"||insight.value!==admitted.length||insight.verifiedFact!==false||
  insight.actionable!==false||insight.evidenceFingerprints.some((x,i)=>x!==fingerprints[i]))reject("SYNTHETIC_ANALYSIS_INVALID");
 const subject:ApprovalSubject={workspaceId,intentId:"synthetic:intent",reviewPacketId:"synthetic:review",
  proposalId:"synthetic:proposal",planId:"synthetic:plan",mode:mode,domainService:"CRM",operation:"FOLLOW_UP",
  evidenceFingerprints:[...fingerprints]};
 const authority:ApprovalAuthority={
  async resolveSession(){return {workspaceId,actorId:actorId,actorType:"HUMAN",sessionId:sessionId,authenticatedAt:stamp};},
  async assertCurrentMembership(x){if(x.workspaceId!==workspaceId||x.actorId!==actorId||x.sessionId!==sessionId||
   x.requiredRole!=="OWNER"||x.operation!=="FOLLOW_UP")reject("SYNTHETIC_MEMBERSHIP_DENIED");}
 };
 const policy:ApprovalPolicy={async evaluate(x){return {allow:x.subject.workspaceId===workspaceId&&x.subject.mode===mode&&
  x.subject.evidenceFingerprints.length===fingerprints.length&&x.subject.evidenceFingerprints.every((fp,i)=>fp===fingerprints[i]),
  requiredRole:"OWNER",policyVersion:"synthetic:v1",reasonCode:"SYNTHETIC_ONLY",maxTtlMs:60000};}};
 const approvalLedger=new InMemoryApprovalLedger();
 const digest:ApprovalDigest={digest:x=>createHmac("sha256",new TextEncoder().encode("M08_SYNTHETIC_NOT_AUTHORITY")).update("").update(x).digest().toString("hex")};
 const clock:ApprovalClock={now:()=>stamp};
 const approval=new HumanApprovalBoundary(authority,policy,approvalLedger,digest,clock);
 const recorded=await approval.decide({approvalId:"synthetic:approval",subject,decision:"APPROVE",requiredRole:"OWNER"});
 const checked=await approval.check({workspaceId,approvalId:recorded.approvalId,subject,requiredRole:"OWNER"});
 if(checked.status!=="VALID_NON_EXECUTABLE")reject("SYNTHETIC_APPROVAL_DENIED");
 const actionLedger=new InMemoryDeniedActionLedger();
 const action=new BusinessOsActionRequestBoundary({async verify(x){
  const actual=await approval.check({workspaceId:x.workspaceId,approvalId:x.approvalId,subject:x.subject,requiredRole:"OWNER"});
  const sourceBound=x.workspaceId===workspaceId&&x.intentId===subject.intentId&&x.mode===mode&&
   x.domainService===subject.domainService&&x.operation===subject.operation&&
   x.subject.evidenceFingerprints.length===fingerprints.length&&x.subject.evidenceFingerprints.every((fp,i)=>fp===fingerprints[i])&&
   evidenceLedger.list(context).every((entry,i)=>entry.fingerprint===fingerprints[i]&&entry.verification==="UNVERIFIED");
  // No durable approval audit or live provider adapter exists in synthetic fixtures. Never forge these gates true.
  return {identity:actual.status==="VALID_NON_EXECUTABLE",membership:actual.status==="VALID_NON_EXECUTABLE",
   source:sourceBound,policy:actual.status==="VALID_NON_EXECUTABLE",humanApproval:actual.status==="VALID_NON_EXECUTABLE",
   durableAudit:false,adapter:false};
 }},actionLedger);
 const denied=await action.submit({requestId:"synthetic:request",workspaceId,intentId:subject.intentId,
  approvalId:recorded.approvalId,mode:mode,domainService:subject.domainService,operation:subject.operation,
  payload:null,idempotencyKey:"synthetic:idempotency"},subject);
 if(denied.status!=="DENIED_NO_EFFECT"||denied.reason!=="GATES_NOT_ACCEPTED"||
  denied.performedEffects!==0||denied.providerInvoked!==false||denied.dispatched!==false||
  approvalLedger.audit.length!==1||actionLedger.audit.length!==1)reject("SYNTHETIC_EFFECT_INVARIANT_FAILED");
 const admittedEvidence=admitted.map(entry=>Object.freeze({fingerprint:entry.fingerprint,
  externalReference:entry.observation.externalReference,verification:"UNVERIFIED" as const}));
 return Object.freeze({kind:"R9_SYNTHETIC_NO_EFFECT_ACCEPTANCE" as const,mode:mode,
  modeBanner:mode==="DEMO"?"SYNTHETIC_DEMO_NO_EFFECT" as const:"SYNTHETIC_SANDBOX_NO_EFFECT" as const,
  workspaceId,readCount:read.records.length,evidenceCount:admitted.length,
  admittedEvidence:Object.freeze(admittedEvidence),approvalEvidenceFingerprints:Object.freeze([...subject.evidenceFingerprints]),
  analysis:"UNVERIFIED_NON_ACTIONABLE" as const,analysisValue:insight.value!,verifiedFact:false as const,actionable:false as const,
  approval:"VALID_NON_EXECUTABLE" as const,action:"DENIED_NO_EFFECT" as const,actionReason:"GATES_NOT_ACCEPTED" as const,
  auditEvents:approvalLedger.audit.length+actionLedger.audit.length,
  providerCalls:0 as const,productionConnections:0 as const,performedEffects:0 as const});
}
