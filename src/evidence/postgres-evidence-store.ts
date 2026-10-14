import type { TransactionalEvidenceStore, DurableIntakeReceipt, DurableEvidenceRow } from "./durable-intake.js";
import type { WorkspaceId } from "../domain/truth/types.js";

/** PostgreSQL-compatible driver interfaces. Construct only in a trusted server composition root.
 * This adapter is unusable until reviewed RLS policies and least-privilege roles are provisioned. */
export interface PgClient {
 query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{rows: T[]; rowCount?: number | null}>;
 release(discard?: boolean): void;
 on?(event:'error',listener:(error:unknown)=>void):unknown;
}
export interface PgPool { connect(): Promise<PgClient>; }
const guardedClients=new WeakSet<object>();
/** pg emits a checked-out connection error before its query promise rejection.
 * Contain that event so transaction rollback/reconciliation can run. Query errors
 * still reject normally; this never turns a failed query into a success. */
export function guardPgClient<T extends PgClient>(client:T):T {
 if(!guardedClients.has(client)){client.on?.('error',()=>{});guardedClients.add(client);}return client;
}
interface Input {readonly workspaceId: WorkspaceId; readonly idempotencyKey: string; readonly requestDigest: string; readonly observations: readonly DurableEvidenceRow[];}
function parseReceipt(value: unknown): DurableIntakeReceipt {
 if (!value || typeof value!=="object") throw new Error("INVALID_DURABLE_RECEIPT");
 const r=value as Partial<DurableIntakeReceipt>;
 if (typeof r.workspaceId!=="string" || !r.workspaceId.trim() || typeof r.idempotencyKey!=="string" || !r.idempotencyKey.trim() || typeof r.requestDigest!=="string" || !r.requestDigest.trim() || r.status!=="COMMITTED" || !Array.isArray(r.fingerprints) || !r.fingerprints.length || !r.fingerprints.every(x=>typeof x==="string" && x.length>0) || new Set(r.fingerprints).size!==r.fingerprints.length) throw new Error("INVALID_DURABLE_RECEIPT");
 return r as DurableIntakeReceipt;
}
function isSerializationFailure(error:unknown):boolean {return typeof error==="object" && error!==null && "code" in error && error.code==="40001";}
function sameReceipt(a:DurableIntakeReceipt,b:DurableIntakeReceipt):boolean {return a.workspaceId===b.workspaceId && a.idempotencyKey===b.idempotencyKey && a.requestDigest===b.requestDigest && a.status===b.status && a.fingerprints.length===b.fingerprints.length && a.fingerprints.every((v,i)=>v===b.fingerprints[i]);}
export class PostgresEvidenceStore implements TransactionalEvidenceStore {
 constructor(private readonly pool: PgPool, private readonly boundWorkspaceId?: string) {}
 private assertWorkspace(workspaceId:WorkspaceId):void {
  if(this.boundWorkspaceId !== undefined && workspaceId !== this.boundWorkspaceId) throw new Error("TENANT_POOL_SCOPE_MISMATCH");
 }
 async lookupIntake(workspaceId: WorkspaceId,idempotencyKey: string): Promise<DurableIntakeReceipt|undefined> {
  this.assertWorkspace(workspaceId);
  const client=guardPgClient(await this.pool.connect());
  try {
   const result=await client.query<{result:unknown}>(
    "SELECT result FROM cigo.intake_requests WHERE workspace_id=$1 AND idempotency_key=$2", [workspaceId,idempotencyKey]);
   if (!result.rows[0]) return undefined;
   const receipt=parseReceipt(result.rows[0].result);
   if (receipt.workspaceId!==workspaceId || receipt.idempotencyKey!==idempotencyKey) throw new Error("DURABLE_RECEIPT_SCOPE_MISMATCH");
   return receipt;
  } finally {client.release();}
 }
 /** Reconcile an ambiguous COMMIT using a fresh connection. Never infer rollback from a lost acknowledgement. */
 async reconcileIntake(input:Input):Promise<DurableIntakeReceipt> {
  this.assertWorkspace(input.workspaceId);
  let found:DurableIntakeReceipt|undefined;
  try {found=await this.lookupIntake(input.workspaceId,input.idempotencyKey);} catch {throw new Error("DURABLE_COMMIT_OUTCOME_UNKNOWN");}
  if (!found) throw new Error("DURABLE_COMMIT_OUTCOME_UNKNOWN");
  const expected:DurableIntakeReceipt={workspaceId:input.workspaceId,idempotencyKey:input.idempotencyKey,requestDigest:input.requestDigest,fingerprints:input.observations.map(o=>o.fingerprint),status:"COMMITTED"};
  if (found.workspaceId!==expected.workspaceId || found.idempotencyKey!==expected.idempotencyKey || found.requestDigest!==expected.requestDigest || found.status!==expected.status || found.fingerprints.length!==expected.fingerprints.length || found.fingerprints.some((v,i)=>v!==expected.fingerprints[i])) throw new Error("IDEMPOTENCY_CONFLICT");
  return found;
 }
 async commitIntake(input:Input):Promise<DurableIntakeReceipt> {
  this.assertWorkspace(input.workspaceId);
  if (!input.workspaceId || !input.idempotencyKey?.trim() || !input.requestDigest || !input.observations.length ||
      input.observations.some(o=>o.workspaceId!==input.workspaceId || o.verification!=="UNVERIFIED")) throw new Error("INVALID_DURABLE_INTAKE");
  if (new Set(input.observations.map(o=>o.fingerprint)).size!==input.observations.length || input.observations.some(o=>!o.fingerprint || o.observation.workspaceId!==input.workspaceId)) throw new Error("INVALID_DURABLE_INTAKE");
  const receipt:DurableIntakeReceipt={workspaceId:input.workspaceId,idempotencyKey:input.idempotencyKey,requestDigest:input.requestDigest,fingerprints:input.observations.map(o=>o.fingerprint),status:"COMMITTED"};
  for(let attempt=0;attempt<3;attempt++) {
  const client=guardPgClient(await this.pool.connect());let commitAttempted=false;let ambiguous=false;
  try {
   await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
   const inserted=await client.query(`INSERT INTO cigo.intake_requests (workspace_id,idempotency_key,request_digest,result)
     VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (workspace_id,idempotency_key) DO NOTHING RETURNING request_digest`,
     [input.workspaceId,input.idempotencyKey,input.requestDigest,JSON.stringify(receipt)]);
   if (!inserted.rows.length) {
    const existing=await client.query<{request_digest:string;result:unknown}>(
     "SELECT request_digest,result FROM cigo.intake_requests WHERE workspace_id=$1 AND idempotency_key=$2",
     [input.workspaceId,input.idempotencyKey]);
    if (!existing.rows[0] || existing.rows[0].request_digest!==input.requestDigest ||
      !sameReceipt(parseReceipt(existing.rows[0].result),receipt)) throw new Error("IDEMPOTENCY_CONFLICT");
    commitAttempted=true;await client.query("COMMIT");return parseReceipt(existing.rows[0].result);
   }
   for (const row of input.observations) {
    const o=row.observation;
    const evidenceInsert=await client.query(`INSERT INTO cigo.evidence (workspace_id,fingerprint,source_system,external_reference,resource_kind,source_version,observation,observed_at,verification,supersedes)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'UNVERIFIED',$9) ON CONFLICT (workspace_id,fingerprint) DO NOTHING`,
      [input.workspaceId,row.fingerprint,o.sourceSystem,o.externalReference,o.resourceKind,o.version??null,JSON.stringify(o),o.observedAt,row.supersedes??null]);
    if (evidenceInsert.rowCount===0) throw new Error("DURABLE_EVIDENCE_FINGERPRINT_CONFLICT");
   }
   await client.query(`INSERT INTO cigo.audit_events (workspace_id,event_id,idempotency_key,event_type,payload_digest)
     VALUES ($1,$2,$3,'INTAKE_COMMITTED',$4)`,[input.workspaceId,input.idempotencyKey,input.idempotencyKey,input.requestDigest]);
   commitAttempted=true;await client.query("COMMIT");return receipt;
  } catch (error) {
   if (commitAttempted) {ambiguous=true;}
   else {
   try {await client.query("ROLLBACK");} catch { /* original error is authoritative */ }
   if (isSerializationFailure(error) && attempt<2) continue;
   if (isSerializationFailure(error)) throw new Error("DURABLE_SERIALIZATION_RETRY_EXHAUSTED");
   throw error;
   }
  } finally {client.release(ambiguous);}
  if (ambiguous) return this.reconcileIntake(input);
  }
  throw new Error("DURABLE_SERIALIZATION_RETRY_EXHAUSTED");
 }
}
