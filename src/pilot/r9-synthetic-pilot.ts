import {BusinessOsReadModelReader} from "../integration/business-os-read-model.js";
import type {BusinessOsReadModelPort,TrustedReadAuthorization} from "../integration/business-os-read-model.js";
import {randomBytes} from "node:crypto";
import {HumanApprovalBoundary} from "../action/trusted-human-approval.js";
import type {ApprovalAuthority,ApprovalClock,ApprovalDigest,ApprovalPolicy,ApprovalSubject} from "../action/trusted-human-approval.js";
import {InMemoryApprovalLedger} from "../action/in-memory-approval-ledger.js";
import {BusinessOsActionRequestBoundary} from "../action/business-os-action-request.js";
import {InMemoryDeniedActionLedger} from "../action/in-memory-denied-action-ledger.js";
import type {OperationalRecord,ReadRequest} from "../integration/contracts.js";
import type {WorkspaceId} from "../domain/truth/types.js";
export type PilotMode="DEMO"|"SANDBOX";
export interface SyntheticPilotSeed {readonly workspaceId:string;readonly actorId:string;readonly sessionId:string;readonly mode:PilotMode;readonly records:readonly OperationalRecord[]}
export interface SyntheticPilotResult {readonly kind:"R9_SYNTHETIC_NO_EFFECT_ACCEPTANCE";readonly mode:PilotMode;readonly workspaceId:string;readonly readCount:number;readonly approval:"VALID_NON_EXECUTABLE";readonly action:"DENIED_NO_EFFECT";readonly auditEvents:number;readonly providerCalls:0;readonly productionConnections:0;readonly performedEffects:0}
const stamp="2026-10-01T12:00:00.000Z";
const safe=(s:unknown):s is string=>typeof s==="string"&&/^[a-zA-Z0-9:_-]{3,100}$/.test(s);
const reject=(code:string):never=>{throw Error(code)};
/** Purely synthetic, single-workspace, in-process pilot. No HTTP, production credentials, external adapter or effects. */
export async function runSyntheticPilot(seed:SyntheticPilotSeed):Promise<SyntheticPilotResult>{
 if(!seed||!["DEMO","SANDBOX"].includes(seed.mode)||!safe(seed.workspaceId)||!safe(seed.actorId)||!safe(seed.sessionId)||
  !Array.isArray(seed.records)||seed.records.length<1||seed.records.length>10||
  seed.records.some(x=>!x||x.workspaceId!==seed.workspaceId||x.reference?.sourceSystem!=="BUSINESS_OS"||x.resourceKind!=="lead"))reject("INVALID_SYNTHETIC_PILOT_SEED");
 const workspaceId=seed.workspaceId as WorkspaceId;
 const port:BusinessOsReadModelPort={version:"v1",async readPage(x){if(x.workspaceId!==seed.workspaceId||x.resourceKind!=="lead"||x.cursor!==undefined)reject("SYNTHETIC_SOURCE_SCOPE_DENIED");return {records:structuredClone(seed.records.slice(0,x.limit))};}};
 const authorization:TrustedReadAuthorization={async assertAuthorized(x){if(x.workspaceId!==seed.workspaceId||x.actorId!==seed.actorId||x.resourceKind!=="lead")reject("SYNTHETIC_AUTH_DENIED");}};
 // Disposable synthetic key is never a production credential; the same confidential reader boundary applies.
 const reader=BusinessOsReadModelReader.create({workspaceId,port,authorization,cursorKeys:new Map([["synthetic",randomBytes(32)]]),activeKeyId:"synthetic",clock:()=>stamp,cursorNow:()=>Date.parse(stamp)});
 const request:ReadRequest={context:{workspaceId,actorId:seed.actorId,authorizedAt:stamp},sourceSystem:"BUSINESS_OS",resourceKind:"lead",limit:10};
 const read=await reader.read(request);
 if(read.completeness!=="COMPLETE"||read.errors.length||read.records.length!==seed.records.length)reject("SYNTHETIC_READ_INCOMPLETE");
 const subject:ApprovalSubject={workspaceId:seed.workspaceId,intentId:"synthetic:intent",reviewPacketId:"synthetic:review",proposalId:"synthetic:proposal",planId:"synthetic:plan",mode:seed.mode,domainService:"CRM",operation:"FOLLOW_UP",evidenceFingerprints:["synthetic:fingerprint"]};
 const authority:ApprovalAuthority={async resolveSession(){return {workspaceId:seed.workspaceId,actorId:seed.actorId,actorType:"HUMAN",sessionId:seed.sessionId,authenticatedAt:stamp};},async assertCurrentMembership(x){if(x.workspaceId!==seed.workspaceId||x.actorId!==seed.actorId||x.sessionId!==seed.sessionId||x.requiredRole!=="OWNER")reject("SYNTHETIC_MEMBERSHIP_DENIED");}};
 const policy:ApprovalPolicy={async evaluate(){return {allow:true,requiredRole:"OWNER",policyVersion:"synthetic:v1",reasonCode:"SYNTHETIC_ONLY",maxTtlMs:60000};}};
 const approvalLedger=new InMemoryApprovalLedger();
 const digest:ApprovalDigest={digest(x){let h=2166136261;for(let i=0;i<x.length;i++)h=Math.imul(h^x.charCodeAt(i),16777619);return "synthetic:"+String(h>>>0);}};
 const clock:ApprovalClock={now:()=>stamp};
 const approval=new HumanApprovalBoundary(authority,policy,approvalLedger,digest,clock);
 const recorded=await approval.decide({approvalId:"synthetic:approval",subject,decision:"APPROVE",requiredRole:"OWNER"});
 const checked=await approval.check({workspaceId:seed.workspaceId,approvalId:recorded.approvalId,subject,requiredRole:"OWNER"});
 if(checked.status!=="VALID_NON_EXECUTABLE")reject("SYNTHETIC_APPROVAL_DENIED");
 const actionLedger=new InMemoryDeniedActionLedger();
 const action=new BusinessOsActionRequestBoundary({async verify(){return {identity:true,membership:true,source:true,policy:true,humanApproval:true,durableAudit:true,adapter:true};}},actionLedger);
 const denied=await action.submit({requestId:"synthetic:request",workspaceId:seed.workspaceId,intentId:subject.intentId,approvalId:recorded.approvalId,mode:seed.mode,domainService:subject.domainService,operation:subject.operation,payload:null,idempotencyKey:"synthetic:idempotency"},subject);
 if(denied.status!=="DENIED_NO_EFFECT"||denied.performedEffects!==0||denied.providerInvoked||denied.dispatched)reject("SYNTHETIC_EFFECT_INVARIANT_FAILED");
 return {kind:"R9_SYNTHETIC_NO_EFFECT_ACCEPTANCE",mode:seed.mode,workspaceId:seed.workspaceId,readCount:read.records.length,approval:"VALID_NON_EXECUTABLE",action:"DENIED_NO_EFFECT",auditEvents:approvalLedger.audit.length+actionLedger.audit.length,providerCalls:0,productionConnections:0,performedEffects:0};
}
