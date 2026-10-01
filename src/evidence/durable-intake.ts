import type { AuthorizedWorkspaceContext, OperationalRecord } from "../integration/contracts.js";
import { validateOperationalRecord } from "./validation.js";
import { fingerprintOperationalRecord } from "./fingerprint.js";
import { normalizeOperationalRecord, stableSerialize } from "./normalize.js";

export interface DurableEvidenceRow {
 readonly workspaceId: OperationalRecord["workspaceId"];
 readonly fingerprint: string;
 readonly observation: ReturnType<typeof normalizeOperationalRecord>;
 readonly verification: "UNVERIFIED";
 readonly supersedes?: string;
}
export interface DurableIntakeReceipt {
 readonly workspaceId: OperationalRecord["workspaceId"];
 readonly idempotencyKey: string;
 readonly requestDigest: string;
 readonly fingerprints: readonly string[];
 readonly status: "COMMITTED";
}
/** Implement with one SERIALIZABLE database transaction, scoped uniqueness constraints,
 * and an atomic audit-event insert. No success may be returned before COMMIT. */
export interface TransactionalEvidenceStore {
 commitIntake(input: {readonly workspaceId: OperationalRecord["workspaceId"]; readonly idempotencyKey: string;
   readonly requestDigest: string; readonly observations: readonly DurableEvidenceRow[];}): Promise<DurableIntakeReceipt>;
 lookupIntake(workspaceId: OperationalRecord["workspaceId"], idempotencyKey: string): Promise<DurableIntakeReceipt | undefined>;
}
async function digest(value: unknown): Promise<string> {
 const bytes = new TextEncoder().encode(stableSerialize(value));
 const hash = await crypto.subtle.digest("SHA-256", bytes);
 return Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,"0")).join("");
}
/** Server-only composition root must authenticate context before invoking this function.
 * A caller-supplied context alone is NOT authentication; G1/G6 remain open. */
export async function ingestDurably(context: AuthorizedWorkspaceContext, idempotencyKey: string,
 records: readonly OperationalRecord[], store: TransactionalEvidenceStore): Promise<DurableIntakeReceipt> {
 if (!context?.workspaceId || !context.actorId?.trim() || !context.authorizedAt || !idempotencyKey?.trim() || !store)
   throw new Error("UNAUTHORIZED_DURABLE_INTAKE");
 if (!records.length) throw new Error("EMPTY_INTAKE");
 for (const record of records) {
   if (!validateOperationalRecord(record,context).ok) throw new Error("INVALID_INTAKE_RECORD");
 }
 const observations: DurableEvidenceRow[] = [];
 for (const record of records) observations.push({workspaceId:context.workspaceId,
   fingerprint:await fingerprintOperationalRecord(record), observation:normalizeOperationalRecord(record),verification:"UNVERIFIED"});
 const requestDigest=await digest({schema:"cigo-intake-v1",workspaceId:context.workspaceId,observations});
 const previous=await store.lookupIntake(context.workspaceId,idempotencyKey);
 if (previous) {
   if (previous.workspaceId!==context.workspaceId || previous.idempotencyKey!==idempotencyKey || previous.requestDigest!==requestDigest || previous.status!=="COMMITTED")
     throw new Error("IDEMPOTENCY_CONFLICT");
   return previous;
 }
 const committed=await store.commitIntake({workspaceId:context.workspaceId,idempotencyKey,requestDigest,observations});
 // Enforce postcondition even if an untrusted/broken adapter returns a success-shaped result.
 if (committed.workspaceId!==context.workspaceId || committed.idempotencyKey!==idempotencyKey ||
     committed.requestDigest!==requestDigest || committed.status!=="COMMITTED" ||
     stableSerialize(committed.fingerprints)!==stableSerialize(observations.map(o=>o.fingerprint)))
   throw new Error("DURABLE_COMMIT_UNCONFIRMED");
 return committed;
}
