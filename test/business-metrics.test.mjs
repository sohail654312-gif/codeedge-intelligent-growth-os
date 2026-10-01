import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBusinessMetrics } from "../dist/src/analysis/business-metrics.js";
const now="2026-10-01T00:00:00.000Z",ctx={workspaceId:"a",actorId:"owner",authorizedAt:now};
const projection=(changes={})=>({workspaceId:"a",domain:"CONVERSION",metricKey:"lead-conversion",periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-09-30T00:00:00.000Z",observedAt:now,unit:"COUNT",numerator:5,denominator:10,evidenceFingerprints:["fingerprint-1"],coverage:"COMPLETE",verification:"UNVERIFIED",...changes});
const req={asOf:now,maxEvidenceAgeMs:86400000};
test("deterministic ratios retain provenance, units, and unverified status",()=>{
 const r=analyzeBusinessMetrics(ctx,[projection()],req);
 assert.equal(r.insights[0].value,0.5);assert.equal(r.insights[0].status,"AVAILABLE");
 assert.equal(r.insights[0].verifiedFact,false);assert.equal(r.insights[0].actionable,false);
 assert.deepEqual(r,analyzeBusinessMetrics(ctx,[projection()],req));
 r.insights[0].evidenceFingerprints.push("tamper");
 assert.deepEqual(analyzeBusinessMetrics(ctx,[projection()],req).insights[0].evidenceFingerprints,["fingerprint-1"]);
});
test("partial, stale, future and zero denominator are unavailable rather than fabricated",()=>{
 for(const changes of [{coverage:"PARTIAL"},{observedAt:"2026-08-01T00:00:00.000Z"},{observedAt:"2026-11-01T00:00:00.000Z"},{denominator:0}]){
  const r=analyzeBusinessMetrics(ctx,[projection(changes)],req).insights[0];
  assert.equal(r.value,null);assert.equal(r.status,"UNAVAILABLE");assert.ok(r.limitations.length>1);
 }
});
test("reject foreign workspace, contradictory metrics and malformed source projections",()=>{
 assert.throws(()=>analyzeBusinessMetrics(ctx,[projection({workspaceId:"b"})],req),/UNAUTHORIZED_WORKSPACE/);
 assert.throws(()=>analyzeBusinessMetrics(ctx,[projection(),projection({numerator:8})],req),/CONFLICTING_METRIC_PROJECTIONS/);
 for(const changes of [{numerator:-1},{denominator:0.5},{evidenceFingerprints:[]},{verification:"VERIFIED"},{periodEnd:"2026-08-01T00:00:00.000Z"},{unit:"USD"}])
  assert.throws(()=>analyzeBusinessMetrics(ctx,[projection(changes)],req),/INVALID_METRIC_PROJECTION/);
 assert.throws(()=>analyzeBusinessMetrics(ctx,[projection()],{...req,limit:0}),/INVALID_METRIC_REQUEST/);
 assert.throws(()=>analyzeBusinessMetrics(ctx,[projection(),projection({metricKey:"other"})],{...req,limit:1}),/INVALID_METRIC_REQUEST/);
});
test("all domains can carry explicitly supplied metrics without inferred missing data",()=>{
 const domains=["LEADS","CONVERSION","APPOINTMENTS","MISSED_ENQUIRIES","REVENUE_COST","MARKETING","RETENTION","CAPACITY"];
 const r=analyzeBusinessMetrics(ctx,domains.map((domain,i)=>projection({domain,metricKey:"metric-"+i,denominator:undefined})),req);
 assert.equal(r.insights.length,8);assert.ok(r.insights.every(x=>x.value===5));
});
