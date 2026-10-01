import type {ActionRequestLedger,DeniedActionReceipt} from "./business-os-action-request.js";
/** Test-only fixture: production must replace with transactional durable tenant RLS storage. */
export class InMemoryDeniedActionLedger implements ActionRequestLedger {
 private readonly rows=new Map<string,DeniedActionReceipt>();
 readonly audit:{workspaceId:string;idempotencyKey:string;event:"DENIED"}[]=[];
 async record(input:DeniedActionReceipt):Promise<DeniedActionReceipt>{
  const key=JSON.stringify([input.workspaceId,input.idempotencyKey]);const prior=this.rows.get(key);
  if(prior){if(JSON.stringify(prior)!==JSON.stringify(input))throw Error("ACTION_IDEMPOTENCY_CONFLICT");return structuredClone(prior);}
  this.rows.set(key,structuredClone(input));this.audit.push({workspaceId:input.workspaceId,idempotencyKey:input.idempotencyKey,event:"DENIED"});return structuredClone(input);
 }
}
