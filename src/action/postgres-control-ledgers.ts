import type {PgPool,PgClient} from '../evidence/postgres-evidence-store.js';
import {guardPgClient} from '../evidence/postgres-evidence-store.js';
import type {ApprovalLedger,ApprovalRecord} from './trusted-human-approval.js';
import type {ActionRequestLedger,DeniedActionReceipt} from './business-os-action-request.js';
import {stableSerialize} from '../evidence/normalize.js';

const text=(x:unknown):x is string=>typeof x==='string'&&x.trim().length>0&&x.length<=200;
const iso=(x:unknown):x is string=>typeof x==='string'&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
function approval(value:unknown):ApprovalRecord {
 const r=value as ApprovalRecord;
 const keys=['kind','workspaceId','approvalId','intentId','subjectDigest','actorId','sessionId','decision','requiredRole','policyVersion','decidedAt','expiresAt','status'];
 if(!r||typeof r!=='object'||Object.keys(r).sort().join()!==keys.sort().join()||r.kind!=='HUMAN_APPROVAL_DECISION'||
  r.status!=='RECORDED_NON_EXECUTABLE'||![r.workspaceId,r.approvalId,r.intentId,r.subjectDigest,r.actorId,r.sessionId,r.policyVersion].every(text)||
  !['APPROVE','REJECT'].includes(r.decision)||!['OWNER','APPROVER'].includes(r.requiredRole)||!iso(r.decidedAt)||!iso(r.expiresAt)||Date.parse(r.expiresAt)<=Date.parse(r.decidedAt))throw Error('INVALID_CONTROL_RECORD');
 // Preserve boundary field order after PostgreSQL jsonb canonicalizes key order.
 return {kind:r.kind,workspaceId:r.workspaceId,approvalId:r.approvalId,intentId:r.intentId,subjectDigest:r.subjectDigest,
  actorId:r.actorId,sessionId:r.sessionId,decision:r.decision,requiredRole:r.requiredRole,policyVersion:r.policyVersion,
  decidedAt:r.decidedAt,expiresAt:r.expiresAt,status:r.status};
}
function denied(value:unknown):DeniedActionReceipt {
 const r=value as DeniedActionReceipt,keys=['kind','requestId','workspaceId','intentId','idempotencyKey','mode','domainService','operation','reason','requestedEffects','performedEffects','dispatched','providerInvoked','status'];
 if(!r||typeof r!=='object'||Object.keys(r).sort().join()!==keys.sort().join()||r.kind!=='BUSINESS_OS_ACTION_REQUEST_DENIED'||
  ![r.requestId,r.workspaceId,r.intentId,r.idempotencyKey,r.domainService,r.operation].every(text)||!['DEMO','SANDBOX','PRODUCTION'].includes(r.mode)||
  !['EFFECTS_DISABLED','GATES_NOT_ACCEPTED'].includes(r.reason)||r.requestedEffects!==0||r.performedEffects!==0||r.dispatched!==false||r.providerInvoked!==false||r.status!=='DENIED_NO_EFFECT')throw Error('INVALID_CONTROL_RECORD');
 return structuredClone(r);
}
type Kind='APPROVAL'|'REVOCATION'|'DENIAL';
const tables={APPROVAL:'cigo.approval_decisions',REVOCATION:'cigo.approval_revocations',DENIAL:'cigo.denied_actions'} as const;
const conflict=(kind:Kind)=>kind==='DENIAL'?'ACTION_IDEMPOTENCY_CONFLICT':'APPROVAL_REPLAY_CONFLICT';
/** Server-held tenant pool only; never an effect, policy or authentication capability. */
class ControlStore {
 constructor(readonly pool:PgPool,readonly workspace:string){if(!pool||!text(workspace))throw Error('TENANT_POOL_REQUIRED');}
 scope(workspace:string){if(workspace!==this.workspace)throw Error('TENANT_POOL_SCOPE_MISMATCH');}
 async lookup(kind:Kind,id:string){if(!text(id))throw Error('INVALID_CONTROL_RECORD');let c:PgClient|undefined;
  try{c=guardPgClient(await this.pool.connect());return (await c.query<{payload:unknown}>(`SELECT payload FROM ${tables[kind]} WHERE workspace_id=$1 AND record_id=$2`,[this.workspace,id])).rows[0]?.payload;}
  catch{throw Error('CONTROL_LEDGER_UNAVAILABLE');}finally{c?.release();}}
 async append(kind:Kind,id:string,value:unknown):Promise<unknown>{
  const snapshot=structuredClone(value),canonical=stableSerialize(snapshot);
  for(let attempt=0;attempt<3;attempt++){
   let c:PgClient|undefined,commitAttempted=false;
   try{c=guardPgClient(await this.pool.connect());await c.query('BEGIN ISOLATION LEVEL SERIALIZABLE');await c.query("SET LOCAL statement_timeout='4000ms'");await c.query("SET LOCAL lock_timeout='2000ms'");
    const inserted=await c.query(`INSERT INTO ${tables[kind]}(workspace_id,record_id,payload) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING record_id`,[this.workspace,id,JSON.stringify(snapshot)]);
    const row=(await c.query<{payload:unknown}>(`SELECT payload FROM ${tables[kind]} WHERE workspace_id=$1 AND record_id=$2`,[this.workspace,id])).rows[0];
    if(!row||stableSerialize(row.payload)!==canonical)throw Error(conflict(kind));
    if(inserted.rows.length)await c.query('INSERT INTO cigo.control_audit(workspace_id,event_kind,record_id) VALUES($1,$2,$3)',[this.workspace,kind,id]);
    commitAttempted=true;await c.query('COMMIT');return row.payload;
   }catch(error){
    if(commitAttempted){c?.release(true);c=undefined;let saved;
     try{saved=await this.lookup(kind,id);}catch{throw Error('CONTROL_LEDGER_OUTCOME_UNKNOWN');}
     if(!saved||stableSerialize(saved)!==canonical)throw Error('CONTROL_LEDGER_OUTCOME_UNKNOWN');return saved;
    }
    try{await c?.query('ROLLBACK');}catch{/* No speculative success. */}
    if((error as {code?:string})?.code==='40001'&&attempt<2)continue;
    if(error instanceof Error&&error.message===conflict(kind))throw error;
    throw Error('CONTROL_LEDGER_UNAVAILABLE');
   }finally{c?.release();}
  }
  throw Error('CONTROL_LEDGER_UNAVAILABLE');
 }
}
export class PostgresApprovalLedger implements ApprovalLedger {
 private readonly store:ControlStore;
 constructor(pool:PgPool,workspace:string){this.store=new ControlStore(pool,workspace);}
 async record(input:ApprovalRecord){const r=approval(structuredClone(input));this.store.scope(r.workspaceId);return approval(await this.store.append('APPROVAL',r.approvalId,r));}
 async lookup(workspace:string,id:string){this.store.scope(workspace);const r=await this.store.lookup('APPROVAL',id);if(r===undefined)return undefined;
  const parsed=approval(r);if(parsed.workspaceId!==workspace||parsed.approvalId!==id)throw Error('CONTROL_LEDGER_INTEGRITY_FAILURE');return parsed;}
 async isRevoked(workspace:string,id:string){this.store.scope(workspace);return (await this.store.lookup('REVOCATION',id))!==undefined;}
 async revoke(input:{workspaceId:string;approvalId:string;actorId:string;revokedAt:string}){
  const r=structuredClone(input);this.store.scope(r.workspaceId);if(!text(r.approvalId)||!text(r.actorId)||!iso(r.revokedAt))throw Error('INVALID_CONTROL_RECORD');
  // Revocation is idempotent and can never remove an earlier revocation or extend approval.
  const previous=await this.store.lookup('REVOCATION',r.approvalId);if(previous)return;
  try{await this.store.append('REVOCATION',r.approvalId,r);}catch(error){if(error instanceof Error&&error.message==='APPROVAL_REPLAY_CONFLICT'&&await this.isRevoked(r.workspaceId,r.approvalId))return;throw error;}
 }
}
export class PostgresDeniedActionLedger implements ActionRequestLedger {
 private readonly store:ControlStore;
 constructor(pool:PgPool,workspace:string){this.store=new ControlStore(pool,workspace);}
 async record(input:DeniedActionReceipt){const r=denied(structuredClone(input));this.store.scope(r.workspaceId);return denied(await this.store.append('DENIAL',r.idempotencyKey,r));}
}
