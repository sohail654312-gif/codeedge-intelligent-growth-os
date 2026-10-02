import type {ApprovalSubject} from "./trusted-human-approval.js";
/** R7: provider-neutral request admission. This is an intentionally NO-EFFECT boundary. */
export interface ActionRequest {readonly requestId:string;readonly workspaceId:string;readonly intentId:string;readonly approvalId:string;readonly mode:"DEMO"|"SANDBOX"|"PRODUCTION";readonly domainService:string;readonly operation:string;readonly payload:unknown;readonly idempotencyKey:string}
export interface TrustedActionGate {verify(input:Readonly<{workspaceId:string;intentId:string;approvalId:string;subject:ApprovalSubject;mode:ActionRequest["mode"];domainService:string;operation:string}>):Promise<Readonly<{identity:boolean;membership:boolean;source:boolean;policy:boolean;humanApproval:boolean;durableAudit:boolean;adapter:boolean}>>}
export interface ActionRequestLedger {/** Production implementation requires transactional unique(workspaceId,idempotencyKey) and immutable append-only audit. */record(input:DeniedActionReceipt):Promise<DeniedActionReceipt>}
export interface DeniedActionReceipt {readonly kind:"BUSINESS_OS_ACTION_REQUEST_DENIED";readonly requestId:string;readonly workspaceId:string;readonly intentId:string;readonly idempotencyKey:string;readonly mode:ActionRequest["mode"];readonly domainService:string;readonly operation:string;readonly reason:"GATES_NOT_ACCEPTED"|"EFFECTS_DISABLED";readonly requestedEffects:0;readonly performedEffects:0;readonly dispatched:false;readonly providerInvoked:false;readonly status:"DENIED_NO_EFFECT"}
const valid=(x:unknown):x is string=>typeof x==="string"&&x.trim().length>0&&x.length<=200;
const modes=["DEMO","SANDBOX","PRODUCTION"];
const requiredGates=["identity","membership","source","policy","humanApproval","durableAudit","adapter"] as const;
const allNamedGates=(value:unknown):boolean=>!!value&&typeof value==="object"&&!Array.isArray(value)&&requiredGates.every(key=>Object.prototype.hasOwnProperty.call(value,key)&&(value as Record<string,unknown>)[key]===true)&&Object.keys(value).length===requiredGates.length;
export class BusinessOsActionRequestBoundary {
 constructor(private readonly gate:TrustedActionGate,private readonly ledger:ActionRequestLedger){}
 async submit(input:ActionRequest,subject:ApprovalSubject):Promise<DeniedActionReceipt>{
  // Clone both caller-controlled inputs synchronously, BEFORE any trusted gate or ledger await.
  // The same validated snapshot must determine verification, tenant scope, idempotency and receipt.
  if(!input||input.payload!==null)throw Error(input?"UNTRUSTED_ACTION_PAYLOAD":"INVALID_OR_CROSS_TENANT_ACTION_REQUEST");
  let request:ActionRequest,approvedSubject:ApprovalSubject;
  try{request=structuredClone(input);approvedSubject=structuredClone(subject);}catch{throw Error("INVALID_OR_CROSS_TENANT_ACTION_REQUEST");}
  if(!valid(request.requestId)||!valid(request.workspaceId)||!valid(request.intentId)||!valid(request.approvalId)||!valid(request.domainService)||!valid(request.operation)||!valid(request.idempotencyKey)||!modes.includes(request.mode)||!approvedSubject||
   approvedSubject.workspaceId!==request.workspaceId||approvedSubject.intentId!==request.intentId||approvedSubject.mode!==request.mode||approvedSubject.domainService!==request.domainService||approvedSubject.operation!==request.operation)throw Error("INVALID_OR_CROSS_TENANT_ACTION_REQUEST");
  // No arbitrary payload or provider credentials are allowed through the closed reference boundary.
  let accepted=false;
  try{const g=await this.gate.verify({workspaceId:request.workspaceId,intentId:request.intentId,approvalId:request.approvalId,subject:structuredClone(approvedSubject),mode:request.mode,domainService:request.domainService,operation:request.operation});accepted=allNamedGates(g);}catch{/* Fail closed, never leak identity/provider errors. */}
  const receipt:DeniedActionReceipt={kind:"BUSINESS_OS_ACTION_REQUEST_DENIED",requestId:request.requestId,workspaceId:request.workspaceId,intentId:request.intentId,idempotencyKey:request.idempotencyKey,mode:request.mode,domainService:request.domainService,operation:request.operation,reason:accepted?"EFFECTS_DISABLED":"GATES_NOT_ACCEPTED",requestedEffects:0,performedEffects:0,dispatched:false,providerInvoked:false,status:"DENIED_NO_EFFECT"};
  let saved:DeniedActionReceipt;
  try{saved=await this.ledger.record(structuredClone(receipt));}catch{throw Error("ACTION_LEDGER_UNAVAILABLE_OR_CONFLICT");}
  // A storage adapter is untrusted: check every field explicitly, including zero-effect invariants.
  if(!saved||typeof saved!=="object"||Object.keys(saved).length!==Object.keys(receipt).length||
   (Object.keys(receipt) as (keyof DeniedActionReceipt)[]).some(key=>!Object.prototype.hasOwnProperty.call(saved,key)||saved[key]!==receipt[key]))throw Error("ACTION_LEDGER_INTEGRITY_FAILURE");
  return structuredClone(saved);
 }
}
