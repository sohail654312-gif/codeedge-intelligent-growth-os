import test from "node:test";
import assert from "node:assert/strict";
import {createDisposableServerIdentityFixture} from "../dist/src/evidence/disposable-server-identity-fixture.js";
const fixture={testOnly:true,actorId:"server:actor",memberships:{"workspace:a":{active:true,revoked:false,expiresAt:"2026-10-03T00:00:00Z",permissions:["evidence:intake"],sourceSystems:["BUSINESS_OS"]}}};
const env={NODE_ENV:"test",CIGO_R4_DISPOSABLE_TEST_CONFIRM:"I_CONFIRM_DISPOSABLE_ONLY"};
test("R4L disposable identity fixture cannot run in production or without explicit opt-in",()=>{
 for(const e of [{...env,NODE_ENV:"production"},{NODE_ENV:"test"},{...env,CIGO_R4_DISPOSABLE_TEST_CONFIRM:"wrong"}])
  assert.throws(()=>createDisposableServerIdentityFixture(fixture,e),/DISPOSABLE_IDENTITY_FIXTURE_DISABLED/);
});
test("R4L fixture isolates membership, returns defensive copies and revokes server-side",async()=>{
 const f=createDisposableServerIdentityFixture(fixture,env);
 assert.deepEqual(await f.identity.resolveAuthenticatedActor(),{actorId:"server:actor"});
 assert.equal(await f.membership.resolveActiveMembership("forged","workspace:a"),undefined);
 assert.equal(await f.membership.resolveActiveMembership("server:actor","workspace:b"),undefined);
 const m=await f.membership.resolveActiveMembership("server:actor","workspace:a");
 assert.equal(m.revoked,false);m.permissions.push("forged:permission");
 const next=await f.membership.resolveActiveMembership("server:actor","workspace:a");
 assert.deepEqual(next.permissions,["evidence:intake"]);
 f.revoke("workspace:a");
 assert.equal((await f.membership.resolveActiveMembership("server:actor","workspace:a")).revoked,true);
});
