import test from "node:test";
import assert from "node:assert/strict";
import {ingestDurably} from "../dist/src/evidence/durable-intake.js";
const A="workspace:a",B="workspace:b",now="2026-10-01T12:00:00.000Z";
const context=workspaceId=>({workspaceId,actorId:"server:actor",authorizedAt:now});
const record=(workspaceId=A,value="new")=>({workspaceId,reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1"},resourceKind:"lead",value:{status:value},observedAt:now});
function store(){const map=new Map();return {lookupIntake:async(w,k)=>map.get(w+":"+k),commitIntake:async x=>{const key=x.workspaceId+":"+x.idempotencyKey,prior=map.get(key);if(prior){if(prior.requestDigest!==x.requestDigest)throw Error("IDEMPOTENCY_CONFLICT");return prior;}const receipt={workspaceId:x.workspaceId,idempotencyKey:x.idempotencyKey,requestDigest:x.requestDigest,fingerprints:x.observations.map(o=>o.fingerprint),status:"COMMITTED"};map.set(key,receipt);return receipt;}}}
test("R4 adapter contract: replay after new caller instance is stable and altered payload conflicts",async()=>{
 const db=store(),a=await ingestDurably(context(A),"request:1",[record()],db);
 assert.deepEqual(await ingestDurably(context(A),"request:1",[record()],db),a);
 await assert.rejects(ingestDurably(context(A),"request:1",[record(A,"changed")],db),/IDEMPOTENCY_CONFLICT/);
 assert.equal(a.status,"COMMITTED");
});
test("R4 rejects cross-tenant records and absent authorization before storage",async()=>{
 const db=store();await assert.rejects(ingestDurably(context(A),"x",[record(B)],db),/INVALID_INTAKE_RECORD/);
 await assert.rejects(ingestDurably({workspaceId:A,actorId:"",authorizedAt:now},"x",[record()],db),/UNAUTHORIZED/);
});
test("R4 never acknowledges failed or inconsistent commit",async()=>{
 const db=store();db.commitIntake=async()=>{throw Error("STORAGE_UNAVAILABLE")};
 await assert.rejects(ingestDurably(context(A),"x",[record()],db),/STORAGE_UNAVAILABLE/);
 const bad=store();bad.commitIntake=async x=>({workspaceId:x.workspaceId,idempotencyKey:x.idempotencyKey,requestDigest:x.requestDigest,fingerprints:[],status:"COMMITTED"});
 await assert.rejects(ingestDurably(context(A),"x",[record()],bad),/DURABLE_COMMIT_UNCONFIRMED/);
});
