import {makeMetricFixture} from "./metric-fixture.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCrossDomain } from "../dist/src/analysis/cross-domain.js";
const now="2026-10-01T00:00:00.000Z", context={workspaceId:"tenant-a",actorId:"owner",authorizedAt:now};
const p=(domain,changes={})=>makeMetricFixture(domain,context.workspaceId,now,changes,"e-");
const request={asOf:now,maxEvidenceAgeMs:86400000,domains:["LEADS","APPOINTMENTS"]};
test("cross-domain results preserve individual evidence, periods, units and non-actionable uncertainty",()=>{
 const input=[p("LEADS"),p("APPOINTMENTS",{metricKey:"appointments-booked",denominator:undefined})];
 const r=analyzeCrossDomain(context,input,request);
 assert.equal(r.status,"AVAILABLE");assert.equal(r.confidence,"INSUFFICIENT");assert.equal(r.verifiedFact,false);assert.equal(r.actionable,false);
 assert.deepEqual(r.evidenceFingerprints,["e-APPOINTMENTS","e-LEADS"]);
 assert.equal(r.insights[0].value,.5);assert.equal(r.insights[1].value,4);
 assert.deepEqual(r,analyzeCrossDomain(context,input,request));
 r.insights[0].evidenceFingerprints.push("mutated");
 assert.deepEqual(analyzeCrossDomain(context,input,request).insights[0].evidenceFingerprints,["e-LEADS"]);
});
test("partial and stale observations remain explicitly partial, not invented",()=>{
 const r=analyzeCrossDomain(context,[p("LEADS",{coverage:"PARTIAL"}),p("APPOINTMENTS",{observedAt:"2026-08-01T00:00:00.000Z"})],request);
 assert.equal(r.status,"PARTIAL");assert.ok(r.insights.every(i=>i.value===null));
 assert.ok(r.limitations.includes("STALE_EVIDENCE"));assert.ok(r.limitations.includes("PARTIAL_COVERAGE"));
});
test("foreign tenancy, missing domains, conflicting projections and incompatible periods fail closed",()=>{
 assert.throws(()=>analyzeCrossDomain(context,[p("LEADS"),p("APPOINTMENTS",{workspaceId:"tenant-b"})],request),/UNAUTHORIZED_WORKSPACE/);
 assert.throws(()=>analyzeCrossDomain(context,[p("LEADS")],request),/INCOMPLETE_CROSS_DOMAIN_INPUT/);
 assert.throws(()=>analyzeCrossDomain(context,[p("LEADS"),p("LEADS",{numerator:3}),p("APPOINTMENTS")],request),/CONFLICTING_METRIC_PROJECTIONS/);
 assert.throws(()=>analyzeCrossDomain(context,[p("LEADS"),p("APPOINTMENTS",{periodStart:"2026-09-02T00:00:00.000Z"})],request),/INCOMPATIBLE_CROSS_DOMAIN_PERIODS/);
 assert.throws(()=>analyzeCrossDomain(context,[p("LEADS"),p("APPOINTMENTS",{verification:"VERIFIED"})],request),/INVALID_METRIC_PROJECTION/);
});
test("request domain uniqueness, bounds and unexpected domains rejected",()=>{
 for(const domains of [[],["LEADS"],["LEADS","LEADS"],["LEADS","OTHER"]])
 assert.throws(()=>analyzeCrossDomain(context,[p("LEADS"),p("APPOINTMENTS")],{...request,domains}),/INVALID_CROSS_DOMAIN_REQUEST/);
 assert.throws(()=>analyzeCrossDomain(context,[p("LEADS"),p("APPOINTMENTS")],{...request,limit:1}),/INVALID_METRIC_REQUEST/);
});
