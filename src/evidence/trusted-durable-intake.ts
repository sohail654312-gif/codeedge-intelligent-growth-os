import type { OperationalRecord } from "../integration/contracts.js";
import type { TransactionalEvidenceStore, DurableIntakeReceipt } from "./durable-intake.js";
import { ingestDurably } from "./durable-intake.js";

/** Server-side authentication integration port. Implementations must obtain the actor from
 * a verified server session, never from a request body or caller-provided claims. */
export interface TrustedIdentityResolver {
 resolveAuthenticatedActor(): Promise<{readonly actorId:string} | undefined>;
}
/** Implementations must read authoritative membership state on each intake; no cached,
 * client-provided membership assertions or self-attestation are accepted. */
export interface TrustedMembershipResolver {
 resolveActiveMembership(actorId:string, workspaceId:string): Promise<{
  readonly active:boolean; readonly revoked:boolean; readonly expiresAt:string;
  readonly permissions:readonly string[]; readonly sourceSystems:readonly string[];
 } | undefined>;
}
export interface TrustedDurableIntakeDependencies {
 readonly identity:TrustedIdentityResolver;
 readonly membership:TrustedMembershipResolver;
 /** Must be an adapter scoped to the authenticated workspace by trusted server code. */
 readonly storeForWorkspace:(workspaceId:string)=>Promise<TransactionalEvidenceStore>;
 readonly now:()=>Date;
}
/** Server composition only: request supplies target workspace, not identity or authorization.
 * This contract does not itself install production identity, RLS policies or DB grants. */
export async function ingestWithTrustedIdentity(
 dependencies:TrustedDurableIntakeDependencies,
 request:{readonly workspaceId:string;readonly idempotencyKey:string;readonly records:readonly OperationalRecord[]}
):Promise<DurableIntakeReceipt> {
 if(!dependencies?.identity || !dependencies.membership || !dependencies.storeForWorkspace || !dependencies.now ||
    !request?.workspaceId?.trim() || !request.idempotencyKey?.trim() || !request.records?.length)
  throw new Error("UNAUTHORIZED_DURABLE_INTAKE");
 const actor=await dependencies.identity.resolveAuthenticatedActor();
 if(!actor?.actorId?.trim()) throw new Error("UNAUTHORIZED_DURABLE_INTAKE");
 const membership=await dependencies.membership.resolveActiveMembership(actor.actorId,request.workspaceId);
 const now=dependencies.now();
 if(!(now instanceof Date) || !Number.isFinite(now.getTime()) || !membership?.active || membership.revoked ||
    !membership.permissions.includes("evidence:intake") || !Number.isFinite(Date.parse(membership.expiresAt)) ||
    Date.parse(membership.expiresAt)<=now.getTime()) throw new Error("UNAUTHORIZED_DURABLE_INTAKE");
 if(request.records.some(record=>record.workspaceId!==request.workspaceId ||
    !membership.sourceSystems.includes(record.reference?.sourceSystem)))
  throw new Error("UNAUTHORIZED_DURABLE_INTAKE");
 const store=await dependencies.storeForWorkspace(request.workspaceId);
 if(!store) throw new Error("UNAUTHORIZED_DURABLE_INTAKE");
 return ingestDurably({workspaceId:request.workspaceId,actorId:actor.actorId,authorizedAt:now.toISOString()},
  request.idempotencyKey,request.records,store);
}
