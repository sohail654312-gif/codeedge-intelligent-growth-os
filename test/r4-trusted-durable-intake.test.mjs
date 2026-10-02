import test from "node:test";
import assert from "node:assert/strict";
import {ingestWithTrustedIdentity} from "../dist/src/evidence/trusted-durable-intake.js";
const now="2026-10-01T12:00:00.000Z", workspaceId="workspace:a";
const record={workspaceId,reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1"},resourceKind:"lead",value:{status:"new"},observedAt:now};
function setup(overrides={}) {
 let acquired=0,committed=0;
 const membership={active:true,revoked:false,expiresAt:"2026-10-02T12:00:00.000Z",permissions:["evidence:intake"],sourceSystems:["BUSINESS_OS"]};
 const deps={identity:{resolveAuthenticatedActor:async()=>({actorId:"trusted:actor"})},
 membership:{resolveActiveMembership:async()=>membership},
 now:()=>new Date(now),storeForWorkspace:async()=>{acquired++;return {lookupIntake:async()=>undefined,commitIntake:async input=>{committed++;return {workspaceId:input.workspaceId,idempotencyKey:input.idempotencyKey,requestDigest:input.requestDigest,fingerprints:input.observations.map(o=>o.fingerprint),status:"COMMITTED"};}}},...overrides};
 return {deps,request:{workspaceId,idempotencyKey:"request:1",records:[record]},get acquired(){return acquired},get committed(){return committed}};
}
test("R4H trusted server composition allows a valid resolved actor and membership",async()=>{const f=setup();const result=await ingestWithTrustedIdentity(f.deps,f.request);assert.equal(result.status,"COMMITTED");assert.equal(f.acquired,1);assert.equal(f.committed,1);});
test("R4H rejects missing actor before storage",async()=>{const f=setup({identity:{resolveAuthenticatedActor:async()=>undefined}});await assert.rejects(ingestWithTrustedIdentity(f.deps,f.request),/UNAUTHORIZED/);assert.equal(f.acquired,0);});
test("R4H rejects revoked expired inactive missing-permission and invalid-source memberships",async()=>{
 for(const change of [{revoked:true},{active:false},{expiresAt:now},{permissions:[]},{sourceSystems:[]}]){
 const f=setup({membership:{resolveActiveMembership:async()=>({active:true,revoked:false,expiresAt:"2026-10-02T12:00:00.000Z",permissions:["evidence:intake"],sourceSystems:["BUSINESS_OS"],...change})}});
 await assert.rejects(ingestWithTrustedIdentity(f.deps,f.request),/UNAUTHORIZED/);assert.equal(f.acquired,0);
 }
});
test("R4H rejects cross-tenant record and ignores forged request identity",async()=>{
 const f=setup();await assert.rejects(ingestWithTrustedIdentity(f.deps,{...f.request,records:[{...record,workspaceId:"workspace:b"}]}),/UNAUTHORIZED/);assert.equal(f.acquired,0);
 const denied=setup({identity:{resolveAuthenticatedActor:async()=>undefined}});
 await assert.rejects(ingestWithTrustedIdentity(denied.deps,{...denied.request,actorId:"forged",authorizedAt:now}),/UNAUTHORIZED/);assert.equal(denied.acquired,0);
});
