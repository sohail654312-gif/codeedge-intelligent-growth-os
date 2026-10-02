import type { TrustedIdentityResolver, TrustedMembershipResolver } from "./trusted-durable-intake.js";

/** Disposable test-only server fixture. It does not authenticate production sessions.
 * Construction requires an explicit test switch; never expose the controller to request handlers. */
export function createDisposableServerIdentityFixture(
 configuration: {
  readonly testOnly: true;
  readonly actorId: string;
  readonly memberships: Readonly<Record<string, {
   readonly active: boolean; readonly revoked: boolean; readonly expiresAt: string;
   readonly permissions: readonly string[]; readonly sourceSystems: readonly string[];
  }>>;
 },
 environment: { readonly CIGO_R4_DISPOSABLE_TEST_CONFIRM?: string; readonly NODE_ENV?: string }
): { readonly identity: TrustedIdentityResolver; readonly membership: TrustedMembershipResolver;
     readonly revoke: (workspaceId:string)=>void } {
 if (configuration?.testOnly !== true || environment?.CIGO_R4_DISPOSABLE_TEST_CONFIRM !== "I_CONFIRM_DISPOSABLE_ONLY" ||
     environment?.NODE_ENV === "production" || !configuration.actorId?.trim())
  throw new Error("DISPOSABLE_IDENTITY_FIXTURE_DISABLED");
 const memberships = new Map(Object.entries(configuration.memberships).map(([workspace, membership]) =>
  [workspace, { ...membership, permissions: [...membership.permissions], sourceSystems: [...membership.sourceSystems] }]));
 const actorId = configuration.actorId;
 return {
  identity: { resolveAuthenticatedActor: async () => ({actorId}) },
  membership: { resolveActiveMembership: async (requestedActor, workspace) => {
   if (requestedActor !== actorId) return undefined;
   const membership = memberships.get(workspace);
   return membership ? { ...membership, permissions: [...membership.permissions], sourceSystems: [...membership.sourceSystems] } : undefined;
  }},
  revoke: workspace => { const membership = memberships.get(workspace); if (membership) memberships.set(workspace,{...membership,revoked:true}); }
 };
}
