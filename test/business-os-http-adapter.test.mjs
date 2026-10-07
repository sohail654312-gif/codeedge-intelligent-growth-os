import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  BusinessOsHttpReadModelPort,
  createBusinessOsHttpReaderFromEnvironment,
} from "../dist/src/integration/index.js";
import { requireAttestedObservation } from "../dist/src/evidence/source-attestation.js";

const A="10000000-0000-4000-8000-000000000001";
const B="10000000-0000-4000-8000-000000000002";
const NOW="2026-10-06T06:00:00.000Z";
const secret="s".repeat(48);
const key=randomBytes(32).toString("base64url");
const env=(extra={})=>({
  CIGO_BUSINESS_OS_READERS_JSON:JSON.stringify({
    [A]:{
      baseUrl:"https://business-os.example.test",
      keyId:"cigo_a",
      secret,
      resourceKinds:["lead","customer"],
      timeoutMs:500,
      retries:1,
    },
  }),
  CIGO_BUSINESS_OS_CURSOR_KEYS_JSON:JSON.stringify({active:key}),
  CIGO_BUSINESS_OS_CURSOR_ACTIVE_KEY_ID:"active",
  ...extra,
});
const record=(overrides={})=>({
  workspaceId:A,
  reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1",version:"2026-10-06T05:59:00+00"},
  resourceKind:"lead",
  value:{status:"new"},
  observedAt:NOW,
  ...overrides,
});
const envelope=(overrides={})=>({
  contractVersion:"codeedge-business-os-read-model:v1",
  sourceSystem:"BUSINESS_OS",
  workspaceId:A,
  resourceKind:"lead",
  observedAt:NOW,
  records:[record()],
  pagination:{nextCursor:"upstream-opaque"},
  completeness:"COMPLETE",
  errors:[],
  ...overrides,
});
const response=(body,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{"content-type":"application/json"},
});

test("HTTP body deadline remains active after headers and cancels stalled streams",async()=>{
 let cancelled=false;
 const port=BusinessOsHttpReadModelPort.fromEnvironment(A,env(),{fetch:async()=>new Response(new ReadableStream({pull(){return new Promise(()=>{});},cancel(){cancelled=true;}})),sleep:async()=>{}});
 await assert.rejects(port.readPage({workspaceId:A,resourceKind:"lead",limit:10}),/BUSINESS_OS_READ_UNAVAILABLE/);
 assert.equal(cancelled,true);
});
test("chunked HTTP body stops at the byte bound without buffering the whole source",async()=>{
 let chunks=0,cancelled=false;
 const port=BusinessOsHttpReadModelPort.fromEnvironment(A,env(),{fetch:async()=>new Response(new ReadableStream({pull(controller){chunks++;controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}})),sleep:async()=>{}});
 await assert.rejects(port.readPage({workspaceId:A,resourceKind:"lead",limit:10}),/BUSINESS_OS_READ_UNAVAILABLE/);
 assert.ok(chunks<=22,"bounded across the configured retry");assert.equal(cancelled,true);
});

test("real Business OS port uses only server-selected endpoint/credential and preserves provenance",async()=>{
  const calls=[];
  const port=BusinessOsHttpReadModelPort.fromEnvironment(A,env(),{
    fetch:async(url,init)=>{calls.push({url:String(url),init});return response(envelope());},
    sleep:async()=>{},
  });
  const page=await port.readPage({workspaceId:A,resourceKind:"lead",limit:10});
  assert.equal(page.records.length,1);
  assert.equal(page.records[0].reference.sourceSystem,"BUSINESS_OS");
  assert.equal(page.records[0].reference.externalReference,"lead:1");
  assert.equal(page.records[0].reference.version,"2026-10-06T05:59:00+00");
  assert.equal(page.records[0].verification,undefined);
  assert.equal(page.nextCursor,"upstream-opaque");
  assert.equal(calls.length,1);
  const called=new URL(calls[0].url);
  assert.equal(called.origin,"https://business-os.example.test");
  assert.equal(called.pathname,"/api/internal/cigo/v1/read");
  assert.equal(called.searchParams.get("workspaceId"),A);
  assert.equal(called.searchParams.get("resourceKind"),"lead");
  assert.equal(calls[0].init.headers.authorization,`Bearer ${secret}`);
  assert.equal(calls[0].init.headers["x-codeedge-cigo-key-id"],"cigo_a");
  assert.equal(calls[0].init.body,undefined);
});

test("port rejects cross-workspace, ungranted resource and raw caller scope before network",async()=>{
  let calls=0;
  const port=BusinessOsHttpReadModelPort.fromEnvironment(A,env(),{
    fetch:async()=>{calls++;return response(envelope());},
  });
  for(const input of [
    {workspaceId:B,resourceKind:"lead",limit:10},
    {workspaceId:A,resourceKind:"booking",limit:10},
    {workspaceId:A,resourceKind:"lead",limit:101},
    {workspaceId:A,resourceKind:"lead",limit:10,cursor:"x".repeat(4097)},
  ]) await assert.rejects(port.readPage(input),/BUSINESS_OS_READ_UNAVAILABLE/);
  assert.equal(calls,0);
});

test("port rejects wrong contract, source, workspace, resource and malformed records",async()=>{
  const bad=[
    envelope({contractVersion:"v2"}),
    envelope({sourceSystem:"MVP"}),
    envelope({workspaceId:B}),
    envelope({resourceKind:"customer"}),
    envelope({records:[record({workspaceId:B})]}),
    envelope({records:[record({reference:{sourceSystem:"MVP",externalReference:"lead:1",version:"v1"}})]}),
    envelope({records:[record({observedAt:"not-a-date"})]}),
    envelope({records:[record({reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1"}})]}),
  ];
  for(const body of bad){
    const port=BusinessOsHttpReadModelPort.fromEnvironment(A,env(),{fetch:async()=>response(body),sleep:async()=>{}});
    await assert.rejects(port.readPage({workspaceId:A,resourceKind:"lead",limit:10}),/BUSINESS_OS_READ_UNAVAILABLE/);
  }
});

test("partial projection is preserved and cannot carry a continuation cursor",async()=>{
  const good=BusinessOsHttpReadModelPort.fromEnvironment(A,env(),{
    fetch:async()=>response(envelope({
      pagination:{},
      completeness:"PARTIAL",
      errors:[{code:"UPSTREAM_PARTIAL",message:"Projection is incomplete",retryable:true}],
    })),
  });
  const page=await good.readPage({workspaceId:A,resourceKind:"lead",limit:10});
  assert.equal(page.partial,true);
  assert.equal(page.nextCursor,undefined);

  const bad=BusinessOsHttpReadModelPort.fromEnvironment(A,env(),{
    fetch:async()=>response(envelope({
      completeness:"PARTIAL",
      errors:[{code:"UPSTREAM_PARTIAL",message:"Projection is incomplete",retryable:true}],
    })),
  });
  await assert.rejects(bad.readPage({workspaceId:A,resourceKind:"lead",limit:10}),/BUSINESS_OS_READ_UNAVAILABLE/);
});

test("safe GET retry is bounded and authorization failures are never retried",async()=>{
  let attempts=0,sleeps=0;
  const retry=BusinessOsHttpReadModelPort.fromEnvironment(A,env(),{
    fetch:async()=>{attempts++;return attempts===1?response({error:"unavailable"},503):response(envelope({pagination:{}}));},
    sleep:async()=>{sleeps++;},
  });
  await retry.readPage({workspaceId:A,resourceKind:"lead",limit:10});
  assert.equal(attempts,2);
  assert.equal(sleeps,1);

  attempts=0;sleeps=0;
  const denied=BusinessOsHttpReadModelPort.fromEnvironment(A,env(),{
    fetch:async()=>{attempts++;return response({error:"Unauthorized"},401);},
    sleep:async()=>{sleeps++;},
  });
  await assert.rejects(denied.readPage({workspaceId:A,resourceKind:"lead",limit:10}),/BUSINESS_OS_READ_UNAVAILABLE/);
  assert.equal(attempts,1);
  assert.equal(sleeps,0);
});

test("trusted composition keeps CIGO authorization ahead of the live HTTP read and wraps upstream cursor",async()=>{
  let network=0,auths=0;
  const reader=createBusinessOsHttpReaderFromEnvironment({
    workspaceId:A,
    env:env(),
    authorization:{async assertAuthorized(input){auths++;if(input.actorId==="revoked")throw Error("revoked");}},
    dependencies:{fetch:async()=>{network++;return response(envelope());},sleep:async()=>{}},
    clock:()=>NOW,
    cursorNow:()=>1000,
    cursorTtlMs:10000,
  });
  const base={context:{workspaceId:A,actorId:"owner:1",authorizedAt:NOW},sourceSystem:"BUSINESS_OS",resourceKind:"lead",limit:10};
  const first=await reader.read(base);
  assert.equal(first.completeness,"COMPLETE");
  assert.ok(first.nextCursor?.startsWith("v2."));
  assert.notEqual(first.nextCursor,"upstream-opaque");
  assert.equal(network,1);
  assert.equal(auths,1);

  const denied=await reader.read({...base,context:{...base.context,actorId:"revoked"}});
  assert.equal(denied.completeness,"PARTIAL");
  assert.equal(denied.errors[0].code,"READ_AUTHORIZATION_DENIED");
  assert.equal(network,1);
  assert.equal(auths,2);
});

test("environment config rejects unsafe endpoints, weak secrets and unapproved resources",()=>{
  const configs=[
    {[A]:{baseUrl:"http://remote.example.test",keyId:"k",secret,resourceKinds:["lead"]}},
    {[A]:{baseUrl:"https://user:pass@example.test",keyId:"k",secret,resourceKinds:["lead"]}},
    {[A]:{baseUrl:"https://example.test/path",keyId:"k",secret,resourceKinds:["lead"]}},
    {[A]:{baseUrl:"https://example.test",keyId:"k",secret:"short",resourceKinds:["lead"]}},
    {[A]:{baseUrl:"https://example.test",keyId:"k",secret,resourceKinds:["provider_credentials"]}},
  ];
  for(const config of configs){
    assert.throws(()=>BusinessOsHttpReadModelPort.fromEnvironment(A,{
      CIGO_BUSINESS_OS_READERS_JSON:JSON.stringify(config),
    }),/BUSINESS_OS_READ_UNAVAILABLE/);
  }
});


test("real HTTP evidence still fails closed at source-attestation without a trusted receipt authority",async()=>{
  const port=BusinessOsHttpReadModelPort.fromEnvironment(A,env(),{
    fetch:async()=>response(envelope({pagination:{}})),
    sleep:async()=>{},
  });
  const page=await port.readPage({workspaceId:A,resourceKind:"lead",limit:10});
  const record=page.records[0];
  const readResult={
    records:page.records,
    fetchedAt:NOW,
    completeness:"COMPLETE",
    errors:[],
  };
  await assert.rejects(
    requireAttestedObservation(record,readResult,undefined,undefined),
    /UNTRUSTED_SOURCE_PROVENANCE/,
  );
  assert.equal(record.verification,undefined);
});
