/** R6: trusted, non-effect approval decision boundary. Never accepts a caller-supplied reviewer identity. */
export type ApprovalMode="DEMO"|"SANDBOX"|"PRODUCTION";
export interface ApprovalSubject {readonly workspaceId:string;readonly intentId:string;readonly reviewPacketId:string;readonly proposalId:string;readonly planId:string;readonly mode:ApprovalMode;readonly domainService:string;readonly operation:string;readonly evidenceFingerprints:readonly string[]}
export interface TrustedHumanSession {readonly workspaceId:string;readonly actorId:string;readonly actorType:"HUMAN";readonly sessionId:string;readonly authenticatedAt:string}
export interface ApprovalAuthority {
 resolveSession():Promise<TrustedHumanSession>;
 assertCurrentMembership(input:Readonly<{workspaceId:string;actorId:string;sessionId:string;requiredRole:"OWNER"|"APPROVER";operation:string}>):Promise<void>;
}
export interface ApprovalPolicy {
 evaluate(input:Readonly<{subject:ApprovalSubject;actorId:string;decision:"APPROVE"|"REJECT";now:string}>):Promise<Readonly<{allow:boolean;policyVersion:string;reasonCode:string;maxTtlMs:number}>>;
}
export interface ApprovalRecord {readonly kind:"HUMAN_APPROVAL_DECISION";readonly workspaceId:string;readonly approvalId:string;readonly intentId:string;readonly subjectDigest:string;readonly actorId:string;readonly sessionId:string;readonly decision:"APPROVE"|"REJECT";readonly policyVersion:string;readonly decidedAt:string;readonly expiresAt:string;readonly status:"RECORDED_NON_EXECUTABLE"}
export interface ApprovalLedger {
 /** Durable production implementation must atomically enforce unique workspace + approvalId, deny conflicting replay and append audit. */
 record(input:ApprovalRecord):Promise<ApprovalRecord>;
 lookup(workspaceId:string,approvalId:string):Promise<ApprovalRecord|undefined>;
 isRevoked(workspaceId:string,approvalId:string):Promise<boolean>;
 revoke(input:Readonly<{workspaceId:string;approvalId:string;actorId:string;revokedAt:string}>):Promise<void>;
}
export interface ApprovalClock {now():string}
const valid=(s:unknown):s is string=>typeof s==="string"&&s.trim().length>0&&s.length<=200;
const iso=(s:unknown):s is string=>typeof s==="string"&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
const fail=(code:string):never=>{throw Error(code)};
const same=(a:ApprovalRecord,b:ApprovalRecord)=>JSON.stringify(a)===JSON.stringify(b);
const canonical=(s:ApprovalSubject)=>JSON.stringify([s.workspaceId,s.intentId,s.reviewPacketId,s.proposalId,s.planId,s.mode,s.domainService,s.operation,[...s.evidenceFingerprints].sort()]);
/** Hashing supplied by trusted server. No model/caller digest is accepted as an approval subject. */
export interface ApprovalDigest {digest(canonicalSubject:string):string}
export class HumanApprovalBoundary {
 constructor(private readonly authority:ApprovalAuthority,private readonly policy:ApprovalPolicy,private readonly ledger:ApprovalLedger,
  private readonly digest:ApprovalDigest,private readonly clock:ApprovalClock){}
 private async identity(workspaceId:string,operation:string,role:"OWNER"|"APPROVER"){
  const session=await this.authority.resolveSession();
  if(!session||session.actorType!=="HUMAN"||session.workspaceId!==workspaceId||!valid(session.actorId)||!valid(session.sessionId)||!iso(session.authenticatedAt))fail("TRUSTED_HUMAN_SESSION_REQUIRED");
  await this.authority.assertCurrentMembership({workspaceId,actorId:session.actorId,sessionId:session.sessionId,requiredRole:role,operation});
  return session;
 }
 async decide(input:Readonly<{approvalId:string;subject:ApprovalSubject;decision:"APPROVE"|"REJECT";requiredRole:"OWNER"|"APPROVER"}>):Promise<ApprovalRecord>{
  const {approvalId,subject,decision,requiredRole}=input??{};
  if(!valid(approvalId)||!subject||!valid(subject.workspaceId)||!valid(subject.intentId)||!valid(subject.reviewPacketId)||!valid(subject.proposalId)||!valid(subject.planId)||!valid(subject.domainService)||!valid(subject.operation)||!["DEMO","SANDBOX","PRODUCTION"].includes(subject.mode)||!Array.isArray(subject.evidenceFingerprints)||subject.evidenceFingerprints.length<1||subject.evidenceFingerprints.length>100||!subject.evidenceFingerprints.every(valid)||new Set(subject.evidenceFingerprints).size!==subject.evidenceFingerprints.length||!["APPROVE","REJECT"].includes(decision)||!["OWNER","APPROVER"].includes(requiredRole))fail("INVALID_APPROVAL_REQUEST");
  const session=await this.identity(subject.workspaceId,subject.operation,requiredRole);
  const now=this.clock.now();if(!iso(now))fail("INVALID_TRUSTED_CLOCK");
  const evaluation=await this.policy.evaluate({subject:structuredClone(subject),actorId:session.actorId,decision,now});
  if(!evaluation?.allow||!valid(evaluation.policyVersion)||!Number.isSafeInteger(evaluation.maxTtlMs)||evaluation.maxTtlMs<1000||evaluation.maxTtlMs>86_400_000)fail("APPROVAL_POLICY_DENIED");
  const subjectDigest=this.digest.digest(canonical(subject));if(!valid(subjectDigest))fail("INVALID_TRUSTED_DIGEST");
  const record:ApprovalRecord={kind:"HUMAN_APPROVAL_DECISION",workspaceId:subject.workspaceId,approvalId,intentId:subject.intentId,subjectDigest,actorId:session.actorId,sessionId:session.sessionId,decision,policyVersion:evaluation.policyVersion,decidedAt:now,expiresAt:new Date(Date.parse(now)+evaluation.maxTtlMs).toISOString(),status:"RECORDED_NON_EXECUTABLE"};
  const existing=await this.ledger.lookup(subject.workspaceId,approvalId);
  if(existing){if(!same(existing,record))fail("APPROVAL_REPLAY_CONFLICT");return structuredClone(existing);}
  const saved=await this.ledger.record(record);
  if(!same(saved,record))fail("APPROVAL_LEDGER_INTEGRITY_FAILURE");
  return structuredClone(saved);
 }
 async check(input:Readonly<{workspaceId:string;approvalId:string;subject:ApprovalSubject;requiredRole:"OWNER"|"APPROVER"}>):Promise<Readonly<{status:"VALID_NON_EXECUTABLE"|"DENIED";reason:string}>>{
  const denied=(reason:string)=>({status:"DENIED" as const,reason});
  if(!input||!valid(input.workspaceId)||!valid(input.approvalId)||!input.subject||input.subject.workspaceId!==input.workspaceId)return denied("INVALID_SCOPE");
  let session:TrustedHumanSession;
  try{session=await this.identity(input.workspaceId,input.subject.operation,input.requiredRole);}catch{return denied("IDENTITY_OR_MEMBERSHIP_DENIED");}
  const saved=await this.ledger.lookup(input.workspaceId,input.approvalId);
  if(!saved||saved.kind!=="HUMAN_APPROVAL_DECISION"||saved.status!=="RECORDED_NON_EXECUTABLE"||saved.decision!=="APPROVE"||saved.actorId!==session.actorId||saved.sessionId!==session.sessionId)return denied("APPROVAL_NOT_VALID");
  if(saved.intentId!==input.subject.intentId||saved.subjectDigest!==this.digest.digest(canonical(input.subject)))return denied("SUBJECT_MISMATCH");
  if(!iso(saved.decidedAt)||!iso(saved.expiresAt)||!iso(this.clock.now())||Date.parse(this.clock.now())>=Date.parse(saved.expiresAt)||Date.parse(this.clock.now())<Date.parse(saved.decidedAt))return denied("APPROVAL_EXPIRED_OR_INVALID");
  if(await this.ledger.isRevoked(input.workspaceId,input.approvalId))return denied("APPROVAL_REVOKED");
  const evaluation=await this.policy.evaluate({subject:structuredClone(input.subject),actorId:session.actorId,decision:"APPROVE",now:this.clock.now()});
  if(!evaluation?.allow||evaluation.policyVersion!==saved.policyVersion)return denied("POLICY_CHANGED_OR_DENIED");
  return {status:"VALID_NON_EXECUTABLE",reason:"REQUIRES_SEPARATE_R7_EFFECT_AUTHORIZATION"};
 }
 async revoke(input:Readonly<{workspaceId:string;approvalId:string;operation:string}>):Promise<void>{
  if(!input||!valid(input.workspaceId)||!valid(input.approvalId)||!valid(input.operation))fail("INVALID_REVOCATION");
  const session=await this.identity(input.workspaceId,input.operation,"OWNER");
  const existing=await this.ledger.lookup(input.workspaceId,input.approvalId);
  if(!existing||existing.workspaceId!==input.workspaceId)fail("APPROVAL_NOT_FOUND");
  await this.ledger.revoke({workspaceId:input.workspaceId,approvalId:input.approvalId,actorId:session.actorId,revokedAt:this.clock.now()});
 }
}
