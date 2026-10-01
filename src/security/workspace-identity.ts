/** R2 reference contract only: not a session verifier or deployed RBAC. */
import type { WorkspaceId } from "../domain/truth/types.js";

export type WorkspaceRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export interface ServerIdentityAssertion {
  readonly actorId: string;
  readonly workspaceId: WorkspaceId;
  readonly role: WorkspaceRole;
  readonly sessionId: string;
  readonly membershipVersion: string;
  readonly expiresAt: string;
}
export interface MembershipAuthority {
  /** Must be a trusted server-side lookup, never client-supplied. */
  verifySessionAndMembership(sessionId: string, actorId: string, workspaceId: WorkspaceId, membershipVersion: string): boolean;
}
export function requireWorkspaceIdentity(
  assertion: ServerIdentityAssertion | undefined,
  workspaceId: WorkspaceId,
  now: string,
  authority?: MembershipAuthority,
  allowedRoles: readonly WorkspaceRole[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"],
): ServerIdentityAssertion {
  if (!assertion || !authority || !assertion.actorId || !assertion.sessionId || !assertion.membershipVersion ||
      assertion.workspaceId !== workspaceId || !allowedRoles.includes(assertion.role) ||
      !Number.isFinite(Date.parse(now)) || !Number.isFinite(Date.parse(assertion.expiresAt)) ||
      Date.parse(assertion.expiresAt) <= Date.parse(now) ||
      authority.verifySessionAndMembership(assertion.sessionId, assertion.actorId, workspaceId, assertion.membershipVersion) !== true) {
    throw new Error("UNAUTHORIZED_WORKSPACE_IDENTITY");
  }
  return assertion;
}
