import test from "node:test";
import assert from "node:assert/strict";
import {BusinessOsReadModelReader,AeadBusinessOsCursorCodec} from "../dist/src/integration/index.js";
const A="workspace:a",B="workspace:b",NOW="2026-10-01T12:00:00Z";
const rec=(workspaceId=A)=>({workspaceId,reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1",version:"v1"},resourceKind:"lead",value:{status:"new"},observedAt:NOW});
const req=(extra={})=>({context:{workspaceId:A,actorId:"owner:1",authorizedAt:NOW},sourceSystem:"BUSINESS_OS",resourceKind:"lead",limit:1,...extra});
function fixture(page={records:[rec()]}){let reads=[],auths=[],decodes=0;const port={version:"v1",async readPage(x){reads.push(x);if(page instanceof Error)throw page;return page;}};const auth={async assertAuthorized(x){auths.push(x);if(x.actorId==="revoked")throw Error("revoked");}};class TrackingAead extends AeadBusinessOsCursorCodec{decode(scope,token){decodes++;return super.decode(scope,token);}}const codec=new TrackingAead(new Map([["fixture",Buffer.alloc(32,7)]]),"fixture");return {reader:new BusinessOsReadModelReader(A,port,auth,codec,()=>NOW),reads,auths,codec,get decodes(){return decodes;}};}
const codes=r=>r.errors.map(e=>e.code);
test("R5 versioned read port only invokes server-held authorized workspace",async()=>{const f=fixture();const r=await f.reader.read(req());assert.equal(r.completeness,"COMPLETE");assert.equal(r.records.length,1);assert.deepEqual(f.reads,[{workspaceId:A,resourceKind:"lead",limit:1}]);assert.equal(f.auths.length,1);});
test("R5 wrong workspace/source, invalid page size, forged actor and invalid request never reach source",async()=>{const f=fixture();for(const x of [req({context:{...req().context,workspaceId:B}}),req({sourceSystem:"MVP"}),req({limit:101}),req({context:{...req().context,actorId:"revoked"}}),req({context:undefined})]){const r=await f.reader.read(x);assert.deepEqual(r.records,[]);assert.equal(r.completeness,"PARTIAL");}assert.equal(f.reads.length,0);});
test("R5 encrypted cursor binds tenant, resource and limit; never forwards attacker token",async()=>{const f=fixture({records:[rec()],nextCursor:"private:page:2"});const first=await f.reader.read(req());assert.ok(first.nextCursor.startsWith("v2."));await f.reader.read(req({cursor:first.nextCursor}));assert.equal(f.reads[1].cursor,"private:page:2");for(const x of [req({cursor:"private:page:2"}),req({cursor:first.nextCursor,resourceKind:"customer"}),req({cursor:first.nextCursor,limit:2}),req({cursor:first.nextCursor,context:{...req().context,actorId:"other"}}),req({cursor:"x".repeat(4097)})]){const r=await f.reader.read(x);assert.deepEqual(r.records,[]);assert.ok(codes(r).includes("INVALID_CURSOR"));}assert.equal(f.reads.length,2);});
test("R5 cross-tenant, wrong source and kind records are quarantined without leaking values",async()=>{const f=fixture({records:[{...rec(B),value:{secret:"DO_NOT_LEAK"}}]});const r=await f.reader.read(req());assert.deepEqual(r.records,[]);assert.equal(r.completeness,"PARTIAL");assert.ok(!JSON.stringify(r).includes("DO_NOT_LEAK"));});
test("R5 malformed oversized source page and unavailable provider fail closed",async()=>{for(const page of [{records:[rec(),rec()]},{records:null},{records:[rec()],nextCursor:""},{records:[rec()],nextCursor:"x".repeat(4097)},new Error("secret connection url")]){const f=fixture(page);const r=await f.reader.read(req());assert.deepEqual(r.records,[]);assert.equal(r.completeness,"PARTIAL");assert.ok(!JSON.stringify(r).includes("secret connection url"));}});
test("R5 partial source retains valid records with generic errors and detached return values",async()=>{const seed=rec(),f=fixture({records:[seed],partial:true});const r=await f.reader.read(req());assert.equal(r.completeness,"PARTIAL");assert.deepEqual(codes(r),["PARTIAL_SOURCE_PAGE"]);r.records[0].value.status="tampered";assert.equal(seed.value.status,"new");});
test("R5 rejects unversioned port before any read",()=>{assert.throws(()=>new BusinessOsReadModelReader(A,{version:"v2"}, {assertAuthorized:async()=>{}},{encode:()=>"",decode:()=>undefined}),/UNSUPPORTED_BUSINESS_OS_READ_MODEL/);});

test("R5 incomplete page does not issue continuation token",async()=>{for(const page of [{records:[rec()],nextCursor:"next",partial:true},{records:[rec(B)],nextCursor:"next"}]){const r=await fixture(page).reader.read(req());assert.equal(r.nextCursor,undefined);assert.equal(r.completeness,"PARTIAL");}});
test("R5 authorization is checked before decoding attacker cursor",async()=>{const f=fixture();const r=await f.reader.read(req({context:{...req().context,actorId:"revoked"},cursor:"attacker"}));assert.ok(codes(r).includes("READ_AUTHORIZATION_DENIED"));assert.equal(f.decodes,0);assert.equal(f.reads.length,0);});


test("R5 read boundary cannot downgrade AEAD in any mode, including omitted and forged synthetic modes",()=>{const port={version:"v1",async readPage(){return {records:[]}}},auth={async assertAuthorized(){}},unsafe={encode:()=>"",decode:()=>undefined};for(const mode of [undefined,"PRODUCTION","DEMO","SANDBOX"])assert.throws(()=>new BusinessOsReadModelReader(A,port,auth,unsafe,()=>NOW,mode),/CONFIDENTIAL_CURSOR_CODEC_REQUIRED/);const secure=new AeadBusinessOsCursorCodec(new Map([["key1",Buffer.alloc(32,7)]]),"key1");assert.doesNotThrow(()=>new BusinessOsReadModelReader(A,port,auth,secure,()=>NOW));});

test("R5 subclass and instance overrides cannot impersonate confidential AEAD",()=>{
 const port={version:"v1",async readPage(){return {records:[]}}},authorization={async assertAuthorized(){}};
 const keys=new Map([["fixture",Buffer.alloc(32,7)]]);
 class Downgraded extends AeadBusinessOsCursorCodec{encode(){return "plain:secret";}decode(){return "plain:secret";}}
 const subclass=new Downgraded(keys,"fixture");
 assert.throws(()=>new BusinessOsReadModelReader(A,port,authorization,subclass),/CONFIDENTIAL_CURSOR_CODEC_REQUIRED/);
 const overridden=new AeadBusinessOsCursorCodec(keys,"fixture");
 overridden.encode=()=> "plain:secret";
 assert.throws(()=>new BusinessOsReadModelReader(A,port,authorization,overridden),/CONFIDENTIAL_CURSOR_CODEC_REQUIRED/);
});
test("R5 server factory composes genuine AEAD and refuses injected codec or mode",async()=>{
 const port={version:"v1",async readPage(){return {records:[rec()],nextCursor:"sensitive-upstream"}}},authorization={async assertAuthorized(){}};
 const config={workspaceId:A,port,authorization,cursorKeys:new Map([["fixture",Buffer.alloc(32,9)]]),activeKeyId:"fixture",clock:()=>NOW};
 for(const injected of [{...config,mode:"DEMO"},{...config,cursors:{encode:()=> "plain",decode:()=> "raw"}}])
  assert.throws(()=>BusinessOsReadModelReader.create(injected),/INVALID_READ_MODEL_COMPOSITION/);
 const reader=BusinessOsReadModelReader.create(config);
 const first=await reader.read(req());
 assert.ok(first.nextCursor.startsWith("v2."));
 assert.ok(!first.nextCursor.includes("sensitive-upstream"));
 const second=await reader.read(req({cursor:first.nextCursor}));
 assert.equal(second.completeness,"COMPLETE");
});
