import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBusinessMetrics,METRIC_CATALOG } from "../dist/src/analysis/business-metrics.js";
const now="2026-10-01T00:00:00.000Z",ctx={workspaceId:"a",actorId:"owner",authorizedAt:now};
const projection=(changes={})=>({workspaceId:"a",domain:"CONVERSION",metricKey:"lead-conversion",
 metricDefinitionVersion:"v1",sourceContractVersion:"business-os-read-model:v1",windowTimezone:"UTC",
 periodStart:"2026-09-01T00:00:00.000Z",periodEnd:"2026-09-30T00:00:00.000Z",observedAt:now,
 unit:"COUNT",numerator:5,denominator:10,evidenceFingerprints:["fingerprint-1"],coverage:"COMPLETE",verification:"UNVERIFIED",...changes});
const req={asOf:now,maxEvidenceAgeMs:86400000};
test("deterministic ratios retain semantic catalog, provenance and unverified status",()=>{
 const r=analyzeBusinessMetrics(ctx,[projection()],req);
 assert.equal(r.insights[0].value,0.5);assert.equal(r.insights[0].status,"AVAILABLE");
 assert.equal(r.insights[0].aggregation,"RATIO");
 assert.match(r.insights[0].denominatorMeaning,/eligible/i);
 assert.equal(r.insights[0].windowTimezone,"UTC");assert.equal(r.insights[0].metricDefinitionVersion,"v1");
 assert.equal(r.insights[0].verifiedFact,false);assert.equal(r.insights[0].actionable,false);
 assert.deepEqual(r,analyzeBusinessMetrics(ctx,[projection()],req));
 r.insights[0].evidenceFingerprints.push("tamper");
 assert.deepEqual(analyzeBusinessMetrics(ctx,[projection()],req).insights[0].evidenceFingerprints,["fingerprint-1"]);
});
test("partial, stale, future and zero denominator are unavailable",()=>{
 for(const changes of [{coverage:"PARTIAL"},{observedAt:"2026-08-01T00:00:00.000Z"},{observedAt:"2026-11-01T00:00:00.000Z"},{denominator:0}]){
  const r=analyzeBusinessMetrics(ctx,[projection(changes)],req).insights[0];
  assert.equal(r.value,null);assert.equal(r.status,"UNAVAILABLE");assert.ok(r.limitations.length>1);
 }
});
test("reject cross workspace, conflicting metrics and malformed projections",()=>{
 assert.throws(()=>analyzeBusinessMetrics(ctx,[projection({workspaceId:"b"})],req),/UNAUTHORIZED_WORKSPACE/);
 assert.throws(()=>analyzeBusinessMetrics(ctx,[projection(),projection({numerator:8})],req),/CONFLICTING_METRIC_PROJECTIONS/);
 for(const changes of [{numerator:-1},{numerator:11},{denominator:0.5},{evidenceFingerprints:[]},{verification:"VERIFIED"},
  {periodEnd:"2026-08-01T00:00:00.000Z"},{unit:"USD"},{metricKey:"unknown"},{domain:"LEADS"},
  {sourceContractVersion:"v2"},{metricDefinitionVersion:"v2"},{windowTimezone:"Europe/London"},
  {periodStart:"2026-09-01T08:00:00.000Z"},{periodEnd:"2026-09-30T00:00:00+01:00"},
  {periodEnd:"2026-09-30T00:00:00.000Z",currency:"GBP"}])
  assert.throws(()=>analyzeBusinessMetrics(ctx,[projection(changes)],req),/INVALID_METRIC_PROJECTION/);
 for(const bad of [{...req,limit:0},{...req,asOf:"2026-10-01T00:00:00+01:00"},{...req,maxEvidenceAgeMs:-1}])
  assert.throws(()=>analyzeBusinessMetrics(ctx,[projection()],bad),/INVALID_METRIC_REQUEST/);
 assert.throws(()=>analyzeBusinessMetrics(ctx,[projection(),projection({metricKey:"other"})],{...req,limit:1}),/INVALID_METRIC_REQUEST/);
});
test("all domains use named reviewed measures, never arbitrary keys",()=>{
 const measures=METRIC_CATALOG.filter(def=>def.metricKey!=="cost-total");
 const data=measures.map((def,i)=>projection({domain:def.domain,metricKey:def.metricKey,unit:def.unit,
  numerator:5,denominator:def.aggregation==="RATIO"?10:undefined,
  ...(def.unit==="MINOR_CURRENCY_UNITS"?{currency:"GBP"}:{})}));
 const result=analyzeBusinessMetrics(ctx,data,req);
 assert.equal(result.insights.length,measures.length);
 assert.ok(result.insights.every(x=>x.status==="AVAILABLE"&&x.actionable===false));
 assert.ok(result.insights.every(x=>x.value===(x.aggregation==="RATIO"?0.5:5)));
});
test("M-02 monetary metrics require explicit recognized currency and forbid accidental FX/comparability",()=>{
 const money=(currency,metricKey="revenue-gross")=>projection({domain:"REVENUE_COST",metricKey,unit:"MINOR_CURRENCY_UNITS",numerator:12345,
 denominator:undefined,...(currency===undefined?{}:{currency})});
 for(const x of [money(undefined),money("ZZZ"),money("gbp"),money("GBP","lead-conversion"),
   money("GBP","revenue-gross")]) {
  if(x.currency==="GBP"&&x.metricKey==="revenue-gross")continue;
  assert.throws(()=>analyzeBusinessMetrics(ctx,[x],req),/INVALID_METRIC_PROJECTION/);
 }
 const r=analyzeBusinessMetrics(ctx,[money("GBP"),money("PKR","cost-total")],req);
 assert.deepEqual(r.insights.map(x=>x.currency),["GBP","PKR"]);
 assert.deepEqual(r.insights.map(x=>x.value),[12345,12345]);
 assert.equal(r.insights[0].aggregation,"SUM");
 assert.throws(()=>analyzeBusinessMetrics(ctx,[money("GBP"),money("PKR")],req),/CONFLICTING_METRIC_PROJECTIONS/);
 assert.throws(()=>analyzeBusinessMetrics(ctx,[money("GBP",{bad:"key"})],req),/INVALID_METRIC_PROJECTION/);
});
test("M-02 reject ratio arithmetic across semantic units or incompatible cohorts",()=>{
 for(const bad of [
  projection({unit:"MINOR_CURRENCY_UNITS",currency:"GBP"}),
  projection({denominator:undefined}),projection({numerator:6,denominator:5}),
  projection({domain:"RETENTION",metricKey:"customer-retention",unit:"MINOR_CURRENCY_UNITS",currency:"GBP"}),
  projection({domain:"MARKETING",metricKey:"marketing-spend",unit:"MINOR_CURRENCY_UNITS",currency:"GBP",denominator:10}),
 ])assert.throws(()=>analyzeBusinessMetrics(ctx,[bad],req),/INVALID_METRIC_PROJECTION/);
});

test("M-02 exported metric catalog definitions resist mutation and cannot weaken unit semantics",()=>{
 const original=METRIC_CATALOG[0].unit;
 assert.equal(Object.isFrozen(METRIC_CATALOG),true);
 assert.equal(Object.isFrozen(METRIC_CATALOG[0]),true);
 assert.throws(()=>{METRIC_CATALOG[0].unit="MINOR_CURRENCY_UNITS"},TypeError);
 assert.equal(METRIC_CATALOG[0].unit,original);
 assert.throws(()=>analyzeBusinessMetrics(ctx,[projection({domain:"LEADS",metricKey:"leads-created",unit:"MINOR_CURRENCY_UNITS",currency:"GBP",denominator:undefined})],req),/INVALID_METRIC_PROJECTION/);
});
