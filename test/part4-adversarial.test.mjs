import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBusinessMetrics } from "../dist/src/analysis/business-metrics.js";
import { analyzeCrossDomain } from "../dist/src/analysis/cross-domain.js";
const now="2026-10-01T00:00:00.000Z";
const ctx={workspaceId:"clinic",actorId:"owner",authorizedAt:now};
const metric=(domain,changes={})=>({workspaceId:"clinic",domain,metricKey:domain.toLowerCase(),periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-09-30T00:00:00.000Z",observedAt:now,unit:"COUNT",numerator:4,denominator:8,evidenceFingerprints:["source-"+domain],coverage:"COMPLETE",verification:"UNVERIFIED",...changes});
const req={asOf:now,maxEvidenceAgeMs:86400000,domains:["LEADS","APPOINTMENTS"]};
test("adversarial: no mixed tenant, fabricated verification or missing provenance",()=>{
 for(const changes of [{workspaceId:"other"},{verification:"VERIFIED"},{evidenceFingerprints:[]},{evidenceFingerprints:["same","same"]}])
  assert.throws(()=>analyzeCrossDomain(ctx,[metric("LEADS"),metric("APPOINTMENTS",changes)],req));
});
test("adversarial: incomplete, contradictory and incompatible windows never produce cross-domain output",()=>{
 assert.throws(()=>analyzeCrossDomain(ctx,[metric("LEADS")],req),/INCOMPLETE/);
 assert.throws(()=>analyzeCrossDomain(ctx,[metric("LEADS"),metric("LEADS",{numerator:7}),metric("APPOINTMENTS")],req),/CONFLICTING/);
 assert.throws(()=>analyzeCrossDomain(ctx,[metric("LEADS"),metric("APPOINTMENTS",{periodEnd:"2026-09-29T00:00:00.000Z"})],req),/INCOMPATIBLE/);
 assert.throws(()=>analyzeCrossDomain(ctx,[metric("LEADS"),metric("APPOINTMENTS"),metric("MARKETING")],req),/INCOMPLETE/);
});
test("adversarial: stale, partial and zero denominator retain uncertainty and null values",()=>{
 const result=analyzeCrossDomain(ctx,[metric("LEADS",{coverage:"PARTIAL"}),metric("APPOINTMENTS",{denominator:0})],req);
 assert.equal(result.status,"PARTIAL");assert.ok(result.insights.every(i=>i.value===null));
 assert.equal(result.sourceCoverage,"UNVERIFIED");assert.equal(result.actionable,false);
 assert.ok(result.limitations.includes("PARTIAL_COVERAGE"));assert.ok(result.limitations.includes("ZERO_DENOMINATOR"));
 assert.equal(analyzeBusinessMetrics(ctx,[metric("LEADS",{observedAt:"2026-01-01T00:00:00.000Z"})],req).insights[0].value,null);
});
test("adversarial: bounded, deterministic, defensive output and no provider dependency",()=>{
 const inputs=[metric("LEADS"),metric("APPOINTMENTS")];
 const a=analyzeCrossDomain(ctx,inputs,req),b=analyzeCrossDomain(ctx,inputs,req);
 assert.deepEqual(a,b);assert.equal(a.verifiedFact,false);assert.equal(a.confidence,"INSUFFICIENT");
 a.evidenceFingerprints.push("injected");a.insights[0].limitations.push("injected");
 assert.deepEqual(analyzeCrossDomain(ctx,inputs,req),b);
 assert.throws(()=>analyzeCrossDomain(ctx,inputs,{...req,limit:1}),/INVALID_METRIC_REQUEST/);
 assert.throws(()=>analyzeCrossDomain(ctx,inputs,{...req,domains:["LEADS","APPOINTMENTS","MARKETING"]}),/INCOMPLETE/);
});
