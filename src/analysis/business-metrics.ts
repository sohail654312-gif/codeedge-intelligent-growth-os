import type { AuthorizedWorkspaceContext } from "../integration/contracts.js";

export type MetricDomain = "LEADS" | "CONVERSION" | "APPOINTMENTS" | "MISSED_ENQUIRIES" | "REVENUE_COST" | "MARKETING" | "RETENTION" | "CAPACITY";
export type MetricUnit = "COUNT" | "MINOR_CURRENCY_UNITS";
export type MetricAggregation = "SUM" | "RATIO";
export type MetricDefinition = Readonly<{
  domain:MetricDomain;metricKey:string;unit:MetricUnit;aggregation:MetricAggregation;
  numeratorMeaning:string;denominatorMeaning?:string;definitionVersion:"v1";
}>;
/** Deliberately allowlisted semantic catalog; unknown business measures cannot be inferred from caller text. */
export const METRIC_CATALOG:readonly MetricDefinition[] = Object.freeze([
 {domain:"LEADS",metricKey:"leads-created",unit:"COUNT",aggregation:"SUM",numeratorMeaning:"Distinct leads created in reporting window",definitionVersion:"v1"},
 {domain:"CONVERSION",metricKey:"lead-conversion",unit:"COUNT",aggregation:"RATIO",numeratorMeaning:"Eligible leads converted in reporting window",denominatorMeaning:"Eligible leads assessed for conversion in the same reporting window",definitionVersion:"v1"},
 {domain:"APPOINTMENTS",metricKey:"appointments-booked",unit:"COUNT",aggregation:"SUM",numeratorMeaning:"Distinct appointments booked in reporting window",definitionVersion:"v1"},
 {domain:"MISSED_ENQUIRIES",metricKey:"missed-enquiries",unit:"COUNT",aggregation:"SUM",numeratorMeaning:"Distinct enquiries not answered in reporting window",definitionVersion:"v1"},
 {domain:"REVENUE_COST",metricKey:"revenue-gross",unit:"MINOR_CURRENCY_UNITS",aggregation:"SUM",numeratorMeaning:"Gross recorded revenue in stated currency minor units",definitionVersion:"v1"},
 {domain:"REVENUE_COST",metricKey:"cost-total",unit:"MINOR_CURRENCY_UNITS",aggregation:"SUM",numeratorMeaning:"Total recorded costs in stated currency minor units",definitionVersion:"v1"},
 {domain:"MARKETING",metricKey:"marketing-spend",unit:"MINOR_CURRENCY_UNITS",aggregation:"SUM",numeratorMeaning:"Recorded marketing spend in stated currency minor units",definitionVersion:"v1"},
 {domain:"RETENTION",metricKey:"customer-retention",unit:"COUNT",aggregation:"RATIO",numeratorMeaning:"Customers retained from eligible reporting cohort",denominatorMeaning:"Customers in eligible reporting cohort",definitionVersion:"v1"},
 {domain:"CAPACITY",metricKey:"available-slots",unit:"COUNT",aggregation:"SUM",numeratorMeaning:"Available bookable slots in reporting window",definitionVersion:"v1"},
]);
const catalog = new Map(METRIC_CATALOG.map(def=>[def.domain+"|"+def.metricKey,def]));
/** Explicitly supported ISO 4217 currencies; additions require reviewed source/precision contract. */
const currencies = new Set(["GBP","USD","EUR","PKR","AED","CAD","AUD","INR","SGD","NZD"]);
const utc=(s:unknown):s is string=>typeof s==="string"&&/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s;
const utcMidnight=(s:unknown)=>utc(s)&&s.endsWith("T00:00:00.000Z");
export interface MetricProjection {
  readonly workspaceId:string;readonly domain:MetricDomain;readonly metricKey:string;
  readonly metricDefinitionVersion:"v1";readonly sourceContractVersion:"business-os-read-model:v1";
  /** UTC midnight inclusive start, exclusive end. No local/DST ambiguity. */
  readonly windowTimezone:"UTC";readonly periodStart:string;readonly periodEnd:string;readonly observedAt:string;
  readonly unit:MetricUnit;readonly currency?:string;readonly numerator:number;readonly denominator?:number;
  readonly evidenceFingerprints:readonly string[];readonly coverage:"COMPLETE"|"PARTIAL";readonly verification:"UNVERIFIED";
}
export interface MetricRequest {readonly asOf:string;readonly maxEvidenceAgeMs:number;readonly limit?:number}
export interface MetricInsight {
  readonly kind:"ANALYSIS";readonly domain:MetricDomain;readonly metricKey:string;
  readonly metricDefinitionVersion:"v1";readonly sourceContractVersion:"business-os-read-model:v1";
  readonly aggregation:MetricAggregation;readonly numeratorMeaning:string;readonly denominatorMeaning?:string;
  readonly windowTimezone:"UTC";readonly periodStart:string;readonly periodEnd:string;readonly unit:MetricUnit;readonly currency?:string;
  readonly numerator:number;readonly denominator?:number;readonly value:number|null;
  readonly status:"AVAILABLE"|"UNAVAILABLE";readonly limitations:readonly string[];
  readonly evidenceFingerprints:readonly string[];readonly verifiedFact:false;readonly actionable:false;
}
export interface MetricResult {
 readonly workspaceId:string;readonly kind:"ANALYSIS";readonly asOf:string;readonly sourceCoverage:"UNVERIFIED";readonly insights:readonly MetricInsight[];
}
/** Trusted server-supplied projections remain UNVERIFIED analysis; no inferred FX or metric semantics. */
export function analyzeBusinessMetrics(context:AuthorizedWorkspaceContext,projections:readonly MetricProjection[],request:MetricRequest):MetricResult{
 if(!context||typeof context.workspaceId!=="string"||!context.workspaceId.trim())throw Error("UNAUTHORIZED_WORKSPACE");
 if(!request||!utc(request.asOf)||!Number.isSafeInteger(request.maxEvidenceAgeMs)||request.maxEvidenceAgeMs<0||
   (request.limit!==undefined&&(!Number.isSafeInteger(request.limit)||request.limit<1||request.limit>100))||
   !Array.isArray(projections)||projections.length>(request.limit??100))throw Error("INVALID_METRIC_REQUEST");
 const keys=new Set<string>();
 const insights:MetricInsight[]=projections.map(p=>{
  if(!p||p.workspaceId!==context.workspaceId)throw Error("UNAUTHORIZED_WORKSPACE");
  const def=catalog.get(p.domain+"|"+p.metricKey);
  if(!def||p.metricDefinitionVersion!==def.definitionVersion||p.sourceContractVersion!=="business-os-read-model:v1"||
    p.windowTimezone!=="UTC"||!utcMidnight(p.periodStart)||!utcMidnight(p.periodEnd)||
    Date.parse(p.periodStart)>=Date.parse(p.periodEnd)||!utc(p.observedAt)||
    p.unit!==def.unit||!Number.isSafeInteger(p.numerator)||p.numerator<0||
    (def.aggregation==="RATIO"?
      !Number.isSafeInteger(p.denominator)||p.denominator!<0||p.numerator>p.denominator!:
      p.denominator!==undefined)||
    (p.unit==="MINOR_CURRENCY_UNITS"?!currencies.has(p.currency??""):p.currency!==undefined)||
    !Array.isArray(p.evidenceFingerprints)||!p.evidenceFingerprints.length||
    p.evidenceFingerprints.some(fp=>typeof fp!=="string"||!fp.trim()||fp.length>200)||
    new Set(p.evidenceFingerprints).size!==p.evidenceFingerprints.length||
    !["COMPLETE","PARTIAL"].includes(p.coverage)||p.verification!=="UNVERIFIED")throw Error("INVALID_METRIC_PROJECTION");
  const key=[p.domain,p.metricKey,p.periodStart,p.periodEnd].join("|");
  // Currency/unit are not allowed to disambiguate conflicting projections of the same metric/window.
  if(keys.has(key))throw Error("CONFLICTING_METRIC_PROJECTIONS");
  keys.add(key);
  const age=Date.parse(request.asOf)-Date.parse(p.observedAt);
  const limitations:string[]=["SOURCE_UNVERIFIED"];
  if(age<0)limitations.push("FUTURE_OBSERVATION");
  else if(age>request.maxEvidenceAgeMs)limitations.push("STALE_EVIDENCE");
  if(p.coverage!=="COMPLETE")limitations.push("PARTIAL_COVERAGE");
  if(def.aggregation==="RATIO"&&p.denominator===0)limitations.push("ZERO_DENOMINATOR");
  const available=limitations.length===1;
  return {kind:"ANALYSIS",domain:p.domain,metricKey:p.metricKey,metricDefinitionVersion:def.definitionVersion,
    sourceContractVersion:p.sourceContractVersion,aggregation:def.aggregation,numeratorMeaning:def.numeratorMeaning,
    ...(def.denominatorMeaning===undefined?{}:{denominatorMeaning:def.denominatorMeaning}),
    windowTimezone:"UTC",periodStart:p.periodStart,periodEnd:p.periodEnd,unit:p.unit,
    ...(p.currency===undefined?{}:{currency:p.currency}),numerator:p.numerator,
    ...(p.denominator===undefined?{}:{denominator:p.denominator}),
    value:available?(def.aggregation==="RATIO"?p.numerator/p.denominator!:p.numerator):null,
    status:available?"AVAILABLE":"UNAVAILABLE",limitations,evidenceFingerprints:[...p.evidenceFingerprints],
    verifiedFact:false,actionable:false};
 });
 return structuredClone({workspaceId:context.workspaceId,kind:"ANALYSIS" as const,asOf:request.asOf,sourceCoverage:"UNVERIFIED" as const,insights});
}
