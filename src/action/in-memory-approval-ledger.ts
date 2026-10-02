import type {ApprovalLedger,ApprovalRecord} from "./trusted-human-approval.js";
/** Disposable, isolated fixture only. No persistence or production acceptance claim. */
export class InMemoryApprovalLedger implements ApprovalLedger {
 private records=new Map<string,ApprovalRecord>();private revoked=new Set<string>();readonly audit:ReadonlyArray<Readonly<{event:"DECIDED"|"REVOKED";workspaceId:string;approvalId:string}>>=[];
 private key(workspaceId:string,id:string){return JSON.stringify([workspaceId,id]);}
 async record(input:ApprovalRecord):Promise<ApprovalRecord>{
  const key=this.key(input.workspaceId,input.approvalId),old=this.records.get(key);
  if(old){if(JSON.stringify(old)!==JSON.stringify(input))throw Error("APPROVAL_REPLAY_CONFLICT");return structuredClone(old);}
  this.records.set(key,structuredClone(input));(this.audit as {event:string;workspaceId:string;approvalId:string}[]).push({event:"DECIDED",workspaceId:input.workspaceId,approvalId:input.approvalId});return structuredClone(input);
 }
 async lookup(workspaceId:string,id:string){const v=this.records.get(this.key(workspaceId,id));return v?structuredClone(v):undefined;}
 async isRevoked(workspaceId:string,id:string){return this.revoked.has(this.key(workspaceId,id));}
 async revoke(input:{workspaceId:string;approvalId:string;actorId:string;revokedAt:string}){const k=this.key(input.workspaceId,input.approvalId);if(!this.records.has(k))throw Error("APPROVAL_NOT_FOUND");if(this.revoked.has(k))return;this.revoked.add(k);(this.audit as {event:string;workspaceId:string;approvalId:string}[]).push({event:"REVOKED",workspaceId:input.workspaceId,approvalId:input.approvalId});}
}
