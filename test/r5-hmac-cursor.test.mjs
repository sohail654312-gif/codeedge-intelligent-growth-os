import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {HmacBusinessOsCursorCodec} from "../dist/src/integration/index.js";
const A={workspaceId:"workspace:a",resourceKind:"lead",limit:10,actorId:"owner:1"},B={...A,workspaceId:"workspace:b"};
test("R5 HMAC cursor authenticates tenant, actor, resource, page size and expiry",()=>{
 let now=10000;const key=randomBytes(32),codec=new HmacBusinessOsCursorCodec(new Map([["k1",key]]),"k1",()=>now,1000);
 const token=codec.encode(A,"upstream:secret");assert.equal(codec.decode(A,token),"upstream:secret");assert.ok(!token.includes("upstream:secret"));
 for(const scope of [B,{...A,actorId:"owner:2"},{...A,resourceKind:"invoice"},{...A,limit:11}])assert.equal(codec.decode(scope,token),undefined);
 const parts=token.split(".");assert.equal(codec.decode(A,parts[0]+"."+parts[1].replace(/^./,parts[1][0]==="A"?"B":"A")),undefined);
 assert.equal(codec.decode(A,"upstream:secret"),undefined);
 now=11000;assert.equal(codec.decode(A,token),undefined);
});
test("R5 key rotation accepts old key only while retained; new token uses active key",()=>{
 const k1=randomBytes(32),k2=randomBytes(32),old=new HmacBusinessOsCursorCodec(new Map([["old",k1]]),"old",()=>1,10000).encode(A,"next");
 const both=new HmacBusinessOsCursorCodec(new Map([["old",k1],["new",k2]]),"new",()=>2,10000);
 assert.equal(both.decode(A,old),"next");const fresh=both.encode(A,"next2");assert.equal(both.decode(A,fresh),"next2");
 const retired=new HmacBusinessOsCursorCodec(new Map([["new",k2]]),"new",()=>2,10000);assert.equal(retired.decode(A,old),undefined);assert.equal(retired.decode(A,fresh),"next2");
});
test("R5 keyring and cursor bounds reject weak key, TTL and excessive cursor",()=>{
 assert.throws(()=>new HmacBusinessOsCursorCodec(new Map([["bad",Buffer.alloc(8)]]),"bad"),/INVALID_CURSOR_KEYRING/);
 assert.throws(()=>new HmacBusinessOsCursorCodec(new Map([["good",randomBytes(32)]]),"good",()=>1,0),/INVALID_CURSOR_TTL/);
 const codec=new HmacBusinessOsCursorCodec(new Map([["good",randomBytes(32)]]),"good",()=>1);
 assert.throws(()=>codec.encode(A,"x".repeat(4097)),/INVALID_UPSTREAM_CURSOR/);
 assert.equal(codec.decode(A,"x".repeat(4097)),undefined);
});
