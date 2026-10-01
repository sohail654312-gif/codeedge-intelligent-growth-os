import test from "node:test";
import assert from "node:assert/strict";
import { requireWorkspaceIdentity } from "../dist/src/security/workspace-identity.js";
const A="workspace:a", B="workspace:b", now="2026-10-01T12:00:00.000Z";
const identity={actorId:"owner:1",workspaceId:A,role:"OWNER",sessionId:"session:1",membershipVersion:"v1",expiresAt:"2026-10-01T13:00:00.000Z"};
const live={verifySessionAndMembership:(session,actor,workspace,version)=>session==="session:1"&&actor==="owner:1"&&workspace===A&&version==="v1"};
test("R2 defaults deny absent trusted membership authority",()=>{
 assert.throws(()=>requireWorkspaceIdentity(identity,A,now),/UNAUTHORIZED/);
 assert.throws(()=>requireWorkspaceIdentity(undefined,A,now,live),/UNAUTHORIZED/);
});
test("R2 rejects cross-workspace, revoked membership, expired session and insufficient role",()=>{
 for(const [claim,workspace,authority,roles] of [
  [identity,B,live,undefined], [identity,A,{verifySessionAndMembership:()=>false},undefined],
  [{...identity,membershipVersion:"revoked"},A,live,undefined],
  [{...identity,expiresAt:now},A,live,undefined], [identity,A,live,["ADMIN"]],
 ]) assert.throws(()=>requireWorkspaceIdentity(claim,workspace,now,authority,roles),/UNAUTHORIZED/);
});
test("R2 accepts only matching fresh membership through supplied server authority",()=>{
 assert.equal(requireWorkspaceIdentity(identity,A,now,live,["OWNER"]).actorId,"owner:1");
});
