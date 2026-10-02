/** A tenant pool is a server-held credential, not a caller-selected SQL session variable.
 * The resolver must be installed only in a trusted server composition root.
 * Each pool authenticates as a distinct non-owner PostgreSQL role whose RLS policy
 * is pinned by the migration/owner to exactly one workspace. */
import type {PgPool} from "./postgres-evidence-store.js";
import {PostgresEvidenceStore} from "./postgres-evidence-store.js";
import type {TransactionalEvidenceStore} from "./durable-intake.js";
export interface TrustedTenantPoolResolver {
 resolveServerHeldTenantPool(workspaceId:string): Promise<PgPool | undefined>;
}
export function createTenantBoundEvidenceStoreFactory(resolver:TrustedTenantPoolResolver):
 (workspaceId:string)=>Promise<TransactionalEvidenceStore> {
 if(!resolver?.resolveServerHeldTenantPool) throw new Error("TRUSTED_TENANT_POOL_RESOLVER_REQUIRED");
 return async workspaceId=>{
  if(!workspaceId?.trim()) throw new Error("UNAUTHORIZED_TENANT_POOL");
  const pool=await resolver.resolveServerHeldTenantPool(workspaceId);
  if(!pool) throw new Error("UNAUTHORIZED_TENANT_POOL");
  return new PostgresEvidenceStore(pool,workspaceId);
 };
}
