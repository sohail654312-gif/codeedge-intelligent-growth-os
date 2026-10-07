import {requireWorkspaceIdentity, type WorkspaceRole} from '../security/workspace-identity.js';
import type {WorkspaceId} from '../domain/truth/types.js';
import type {TrustedIdentityResolver, TrustedMembershipResolver} from '../evidence/trusted-durable-intake.js';

export interface VerifiedSession {readonly actorId:string;readonly sessionId:string;readonly expiresAt:string}
export interface CurrentMembership {readonly active:boolean;readonly revoked:boolean;readonly role:WorkspaceRole;
 readonly version:string;readonly expiresAt:string}
export interface SessionAuthority {verifyServerSession():Promise<VerifiedSession|undefined>;
 readCurrentMembership(session:VerifiedSession,workspaceId:string):Promise<CurrentMembership|undefined>}
const roles:readonly WorkspaceRole[]=['OWNER','ADMIN','VIEWER'];
/** Request supplies only a target workspace. Both ports are installed by the server composition.
 * Every invocation re-verifies the provider session and current database state; no shared cache. */
export function createStagingIdentity(authority:SessionAuthority,workspaceId:string,now:()=>Date=()=>new Date()) {
 let first: {actorId:string;sessionId:string;version:string;role:string}|undefined;
 let currentExpiresAt='';
 const authorize=async()=>{
  const session=await authority.verifyServerSession();
  if(!session?.actorId || !session.sessionId)throw Error('UNAUTHORIZED_STAGING');
  const membership=await authority.readCurrentMembership(session,workspaceId);
  if(!membership?.active || membership.revoked || !membership.version)throw Error('UNAUTHORIZED_STAGING');
  const expiresAt=new Date(Math.min(Date.parse(session.expiresAt),Date.parse(membership.expiresAt))).toISOString();
  const assertion={...session,workspaceId:workspaceId as WorkspaceId,role:membership.role,
   membershipVersion:membership.version,expiresAt};
  requireWorkspaceIdentity(assertion,workspaceId as WorkspaceId,now().toISOString(),{
   verifySessionAndMembership:(sid,actor,workspace,version)=>sid===session.sessionId&&actor===session.actorId&&
    workspace===workspaceId&&version===membership.version},roles);
  if(first && (first.actorId!==session.actorId || first.sessionId!==session.sessionId ||
    first.version!==membership.version || first.role!==membership.role))throw Error('STAGING_AUTHORITY_CHANGED');
  first??={actorId:session.actorId,sessionId:session.sessionId,version:membership.version,role:membership.role};
  currentExpiresAt=expiresAt;
  return {workspaceId:workspaceId as WorkspaceId,actorId:session.actorId,authorizedAt:now().toISOString()};
 };
 const identity:TrustedIdentityResolver={resolveAuthenticatedActor:async()=>({actorId:(await authorize()).actorId})};
 const membership:TrustedMembershipResolver={resolveActiveMembership:async(actor,workspace)=>{
  if(workspace!==workspaceId)return undefined;
  const context=await authorize();if(context.actorId!==actor)return undefined;
  return {active:true,revoked:false,expiresAt:currentExpiresAt,
   permissions:['evidence:intake'],sourceSystems:['BUSINESS_OS']};
 }};
 return Object.freeze({authorize,identity,membership});
}
