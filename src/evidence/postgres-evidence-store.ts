import type { TransactionalEvidenceStore, DurableIntakeReceipt, DurableEvidenceRow } from "./durable-intake.js";
import type { WorkspaceId } from "../domain/truth/types.js";

/** PostgreSQL-compatible driver interfaces. Construct only in a trusted server composition root.
 * This adapter is unusable until reviewed RLS policies and least-privilege roles are provisioned. */
export interface PgClient {
 query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<{rows: T[]; rowCount?: number | null}>;
 release(): void;
}
export interface PgPool { connect(): Promise<PgClient>; }
interface Input {readonly workspaceId: WorkspaceId; readonly idempotencyKey: string; readonly requestDigest: string; readonly observations: readonly DurableEvidenceRow[];}
function parseReceipt(value: unknown): DurableIntakeReceipt {
 if (!value || typeof value!=="object") throw new Error("INVALID_DURABLE_RECEIPT");
 const r=value as Partial<DurableIntakeReceipt>;
 if (typeof r.workspaceId!=="string" || !r.workspaceId.trim() || typeof r.idempotencyKey!=="string" || !r.idempotencyKey.trim() || typeof r.requestDigest!=="string" || !r.requestDigest.trim() || r.status!=="COMMITTED" || !Array.isArray(r.fingerprints) || !r.fingerprints.length || !r.fingerprints.every(x=>typeof x==="string" && x.length>0) || new Set(r.fingerprints).size!==r.fingerprints.length) throw new Error("INVALID_DURABLE_RECEIPT");
 return r as DurableIntakeReceipt;
}
export class PostgresEvidenceStore implements TransactionalEvidenceStore {
 constructor(private readonly pool: PgPool) {}
 async lookupIntake(workspaceId: WorkspaceId,idempotencyKey: string): Promise<DurableIntakeReceipt|undefined> {
  const client=await this.pool.connect();
  try {
   const result=await client.query<{result:unknown}>(
    "SELECT result FROM cigo.intake_requests WHERE workspace_id=$1 AND idempotency_key=$2", [workspaceId,idempotencyKey]);
   return result.rows[0] ? parseReceipt(result.rows[0].result) : undefined;
  } finally {client.release();}
 }
 /** Reconcile an ambiguous COMMIT using a fresh connection. Never infer rollback from a lost acknowledgement. */
 async reconcileIntake(input:Input):Promise<DurableIntakeReceipt> {
  let found:DurableIntakeReceipt|undefined;
  try {found=await this.lookupIntake(input.workspaceId,input.idempotencyKey);} catch {throw new Error("DURABLE_COMMIT_OUTCOME_UNKNOWN");}
  if (!found) throw new Error("DURABLE_COMMIT_OUTCOME_UNKNOWN");
  const expected:DurableIntakeReceipt={workspaceId:input.workspaceId,idempotencyKey:input.idempotencyKey,requestDigest:input.requestDigest,fingerprints:input.observations.map(o=>o.fingerprint),status:"COMMITTED"};
  if (JSON.stringify(found)!==JSON.stringify(expected)) throw new Error("IDEMPOTENCY_CONFLICT");
  return found;
 }
 async commitIntake(input:Input):Promise<DurableIntakeReceipt> {
  if (!input.workspaceId || !input.idempotencyKey?.trim() || !input.requestDigest || !input.observations.length ||
      input.observations.some(o=>o.workspaceId!==input.workspaceId || o.verification!=="UNVERIFIED")) throw new Error("INVALID_DURABLE_INTAKE");
  const receipt:DurableIntakeReceipt={workspaceId:input.workspaceId,idempotencyKey:input.idempotencyKey,requestDigest:input.requestDigest,fingerprints:input.observations.map(o=>o.fingerprint),status:"COMMITTED"};
  const client=await this.pool.connect();let commitAttempted=false;
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
      JSON.stringify(parseReceipt(existing.rows[0].result))!==JSON.stringify(receipt)) throw new Error("IDEMPOTENCY_CONFLICT");
    commitAttempted=true;await client.query("COMMIT");return parseReceipt(existing.rows[0].result);
   }
   for (const row of input.observations) {
    const o=row.observation;
    await client.query(`INSERT INTO cigo.evidence (workspace_id,fingerprint,source_system,external_reference,resource_kind,source_version,observation,observed_at,verification,supersedes)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,'UNVERIFIED',$9) ON CONFLICT (workspace_id,fingerprint) DO NOTHING`,
      [input.workspaceId,row.fingerprint,o.sourceSystem,o.externalReference,o.resourceKind,o.version??null,JSON.stringify(o),o.observedAt,row.supersedes??null]);
   }
   await client.query(`INSERT INTO cigo.audit_events (workspace_id,event_id,idempotency_key,event_type,payload_digest)
     VALUES ($1,$2,$3,'INTAKE_COMMITTED',$4)`,[input.workspaceId,input.idempotencyKey,input.idempotencyKey,input.requestDigest]);
   commitAttempted=true;await client.query("COMMIT");return receipt;
  } catch (error) {
   if (commitAttempted) {
    // The connection used for COMMIT is no longer authoritative. Release it first in finally;
    // caller can explicitly reconcile with a fresh trusted connection via reconcileIntake.
    throw new Error("DURABLE_COMMIT_OUTCOME_UNKNOWN",{cause:error});
   }
   try {await client.query("ROLLBACK");} catch { /* original error is authoritative */ }
   throw error;
  } finally {client.release();}
 }
}
