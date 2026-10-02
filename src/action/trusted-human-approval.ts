/** R6: trusted, non-effect approval decision boundary. Never accepts a caller-supplied reviewer identity. */
export type ApprovalMode="DEMO"|"SANDBOX"|"PRODUCTION";
export interface ApprovalSubject {readonly workspaceId:string;readonly intentId:string;readonly reviewPacketId:string;readonly proposalId:string;readonly planId:string;readonly mode:ApprovalMode;readonly domainService:string;readonly operation:string;readonly evidenceFingerprints:readonly string[]}
export interface TrustedHumanSession {readonly workspaceId:string;readonly actorId:string;readonly actorType:"HUMAN";readonly sessionId:string;readonly authenticatedAt:string}
export interface ApprovalAuthority {
 resolveSession():Promise<TrustedHumanSession>;
 assertCurrentMembership(input:Readonly<{workspaceId:string;actorId:string;sessionId:string;requiredRole:"OWNER"|"APPROVER";operation:string}>):Promise<void>;
}
export interface ApprovalPolicy {
 evaluate(input:Readonly<{subject:ApprovalSubject;actorId:string;decision:"APPROVE"|"REJECT";now:string}>):Promise<Readonly<{allow:boolean;requiredRole:"OWNER"|"APPROVER";policyVersion:string;reasonCode:string;maxTtlMs:number}>>;
}
export interface ApprovalRecord {readonly kind:"HUMAN_APPROVAL_DECISION";readonly workspaceId:string;readonly approvalId:string;readonly intentId:string;readonly subjectDigest:string;readonly actorId:string;readonly sessionId:string;readonly decision:"APPROVE"|"REJECT";readonly requiredRole:"OWNER"|"APPROVER";readonly policyVersion:string;readonly decidedAt:string;readonly expiresAt:string;readonly status:"RECORDED_NON_EXECUTABLE"}
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
/** Replay identity deliberately excludes clock-derived timestamps; a retry cannot extend the original expiry. */
const sameDecision=(a:ApprovalRecord,b:ApprovalRecord)=>a.kind===b.kind&&a.status===b.status&&a.workspaceId===b.workspaceId&&a.approvalId===b.approvalId&&a.intentId===b.intentId&&a.subjectDigest===b.subjectDigest&&a.actorId===b.actorId&&a.sessionId===b.sessionId&&a.decision===b.decision&&a.requiredRole===b.requiredRole&&a.policyVersion===b.policyVersion;
const canonical=(s:ApprovalSubject)=>JSON.stringify([s.workspaceId,s.intentId,s.reviewPacketId,s.proposalId,s.planId,s.mode,s.domainService,s.operation,[...s.evidenceFingerprints].sort()]);
/** Hashing supplied by trusted server. No model/caller digest is accepted as an approval subject. */
export interface ApprovalDigest {digest(canonicalSubject:string):string}
export class HumanApprovalBoundary {
 constructor(private readonly authority:ApprovalAuthority,private readonly policy:ApprovalPolicy,private readonly ledger:ApprovalLedger,
  private readonly digest:ApprovalDigest,private readonly clock:ApprovalClock){}
 private async session(workspaceId:string):Promise<TrustedHumanSession>{
  const session=await this.authority.resolveSession();
  if(!session||session.actorType!=="HUMAN"||session.workspaceId!==workspaceId||!valid(session.actorId)||!valid(session.sessionId)||!iso(session.authenticatedAt))fail("TRUSTED_HUMAN_SESSION_REQUIRED");
  return session;
 }
 private async membership(session:TrustedHumanSession,operation:string,requiredRole:"OWNER"|"APPROVER"):Promise<void>{
  await this.authority.assertCurrentMembership({workspaceId:session.workspaceId,actorId:session.actorId,sessionId:session.sessionId,requiredRole,operation});
 }
 private async identity(workspaceId:string,operation:string,role:"OWNER"|"APPROVER"){
  const session=await this.session(workspaceId);
  await this.membership(session,operation,role);
  return session;
 }
 async decide(input:Readonly<{approvalId:string;subject:ApprovalSubject;decision:"APPROVE"|"REJECT";requiredRole:"OWNER"|"APPROVER"}>):Promise<ApprovalRecord>{
  const {approvalId,decision,requiredRole}=input??{};
  // Copy the subject before the first await. Policy, membership, digest and ledger must see one identity.
  const subject:ApprovalSubject=(()=>{try{return structuredClone(input?.subject);}catch{return fail("INVALID_APPROVAL_REQUEST");}})();
  if(!valid(approvalId)||!subject||!valid(subject.workspaceId)||!valid(subject.intentId)||!valid(subject.reviewPacketId)||!valid(subject.proposalId)||!valid(subject.planId)||!valid(subject.domainService)||!valid(subject.operation)||!["DEMO","SANDBOX","PRODUCTION"].includes(subject.mode)||!Array.isArray(subject.evidenceFingerprints)||subject.evidenceFingerprints.length<1||subject.evidenceFingerprints.length>100||!subject.evidenceFingerprints.every(valid)||new Set(subject.evidenceFingerprints).size!==subject.evidenceFingerprints.length||!["APPROVE","REJECT"].includes(decision)||!["OWNER","APPROVER"].includes(requiredRole))fail("INVALID_APPROVAL_REQUEST");
  const session=await this.session(subject.workspaceId);
  const now=this.clock.now();if(!iso(now))fail("INVALID_TRUSTED_CLOCK");
  const evaluation=await this.policy.evaluate({subject:structuredClone(subject),actorId:session.actorId,decision,now});
  if(!evaluation?.allow||evaluation.requiredRole!==requiredRole||!valid(evaluation.policyVersion)||!Number.isSafeInteger(evaluation.maxTtlMs)||evaluation.maxTtlMs<1000||evaluation.maxTtlMs>86_400_000)fail("APPROVAL_POLICY_DENIED");
  // A caller cannot choose a weaker role; only the trusted policy supplies the membership requirement.
  await this.membership(session,subject.operation,evaluation.requiredRole);
  const subjectDigest=this.digest.digest(canonical(subject));if(!valid(subjectDigest))fail("INVALID_TRUSTED_DIGEST");
  const record:ApprovalRecord={kind:"HUMAN_APPROVAL_DECISION",workspaceId:subject.workspaceId,approvalId,intentId:subject.intentId,subjectDigest,actorId:session.actorId,sessionId:session.sessionId,decision,requiredRole,policyVersion:evaluation.policyVersion,decidedAt:now,expiresAt:new Date(Date.parse(now)+evaluation.maxTtlMs).toISOString(),status:"RECORDED_NON_EXECUTABLE"};
  const existing=await this.ledger.lookup(subject.workspaceId,approvalId);
  if(existing){if(!sameDecision(existing,record))fail("APPROVAL_REPLAY_CONFLICT");if(!iso(existing.decidedAt)||!iso(existing.expiresAt)||Date.parse(now)>=Date.parse(existing.expiresAt)||Date.parse(now)<Date.parse(existing.decidedAt)||await this.ledger.isRevoked(subject.workspaceId,approvalId))fail("APPROVAL_REPLAY_EXPIRED_OR_REVOKED");return structuredClone(existing);}
  let saved:ApprovalRecord;
  try{saved=await this.ledger.record(record);}catch(error){
   // A concurrent writer may have inserted the same immutable decision first; never mask unrelated storage failures.
   if(!(error instanceof Error)||error.message!=="APPROVAL_REPLAY_CONFLICT")throw error;
   const winner=await this.ledger.lookup(subject.workspaceId,approvalId);
   if(!winner)throw Error("APPROVAL_REPLAY_CONFLICT");
   if(!sameDecision(winner,record))throw Error("APPROVAL_REPLAY_CONFLICT");
   if(!iso(winner.decidedAt)||!iso(winner.expiresAt)||Date.parse(now)>=Date.parse(winner.expiresAt)||Date.parse(now)<Date.parse(winner.decidedAt)||await this.ledger.isRevoked(subject.workspaceId,approvalId))fail("APPROVAL_REPLAY_EXPIRED_OR_REVOKED");
   return structuredClone(winner);
  }
  if(!same(saved,record))fail("APPROVAL_LEDGER_INTEGRITY_FAILURE");
  return structuredClone(saved);
 }
 async check(input:Readonly<{workspaceId:string;approvalId:string;subject:ApprovalSubject;requiredRole:"OWNER"|"APPROVER"}>):Promise<Readonly<{status:"VALID_NON_EXECUTABLE"|"DENIED";reason:string}>>{
  const denied=(reason:string)=>({status:"DENIED" as const,reason});
  let frozen:typeof input;
  try{frozen=structuredClone(input);}catch{return denied("INVALID_SCOPE");}
  if(!frozen||!valid(frozen.workspaceId)||!valid(frozen.approvalId)||!frozen.subject||frozen.subject.workspaceId!==frozen.workspaceId)return denied("INVALID_SCOPE");
  let session:TrustedHumanSession;
  try{session=await this.session(frozen.workspaceId);}catch{return denied("IDENTITY_OR_MEMBERSHIP_DENIED");}
  let saved:ApprovalRecord|undefined;
  try{saved=await this.ledger.lookup(frozen.workspaceId,frozen.approvalId);}catch{return denied("APPROVAL_LEDGER_UNAVAILABLE");}
  if(!saved||saved.kind!=="HUMAN_APPROVAL_DECISION"||saved.status!=="RECORDED_NON_EXECUTABLE"||saved.decision!=="APPROVE"||saved.actorId!==session.actorId||saved.sessionId!==session.sessionId||!["OWNER","APPROVER"].includes(saved.requiredRole)||saved.requiredRole!==frozen.requiredRole)return denied("APPROVAL_NOT_VALID");
  // Recheck current membership against the stored, immutable policy role, never a caller-only claim.
  try{await this.membership(session,frozen.subject.operation,saved.requiredRole);}catch{return denied("IDENTITY_OR_MEMBERSHIP_DENIED");}
  let now:string;
  try{
   if(saved.intentId!==frozen.subject.intentId||saved.subjectDigest!==this.digest.digest(canonical(frozen.subject)))return denied("SUBJECT_MISMATCH");
   now=this.clock.now();
   if(!iso(saved.decidedAt)||!iso(saved.expiresAt)||!iso(now)||Date.parse(now)>=Date.parse(saved.expiresAt)||Date.parse(now)<Date.parse(saved.decidedAt))return denied("APPROVAL_EXPIRED_OR_INVALID");
   if(await this.ledger.isRevoked(frozen.workspaceId,frozen.approvalId))return denied("APPROVAL_REVOKED");
   const evaluation=await this.policy.evaluate({subject:structuredClone(frozen.subject),actorId:session.actorId,decision:"APPROVE",now});
   if(!evaluation?.allow||evaluation.requiredRole!==saved.requiredRole||evaluation.policyVersion!==saved.policyVersion)return denied("POLICY_CHANGED_OR_DENIED");
  }catch{return denied("APPROVAL_DEPENDENCY_UNAVAILABLE");}
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
