import type { AuthorizedWorkspaceContext } from "../integration/contracts.js";

export type MetricDomain = "LEADS" | "CONVERSION" | "APPOINTMENTS" | "MISSED_ENQUIRIES" | "REVENUE_COST" | "MARKETING" | "RETENTION" | "CAPACITY";
export interface MetricProjection {
  readonly workspaceId: string;
  readonly domain: MetricDomain;
  readonly metricKey: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly observedAt: string;
  readonly unit: "COUNT" | "MINOR_CURRENCY_UNITS";
  readonly numerator: number;
  readonly denominator?: number;
  readonly evidenceFingerprints: readonly string[];
  readonly coverage: "COMPLETE" | "PARTIAL";
  readonly verification: "UNVERIFIED";
}
export interface MetricRequest {
  readonly asOf: string;
  readonly maxEvidenceAgeMs: number;
  readonly limit?: number;
}
export interface MetricInsight {
  readonly kind: "ANALYSIS";
  readonly domain: MetricDomain;
  readonly metricKey: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly unit: MetricProjection["unit"];
  readonly numerator: number;
  readonly denominator?: number;
  readonly value: number | null;
  readonly status: "AVAILABLE" | "UNAVAILABLE";
  readonly limitations: readonly string[];
  readonly evidenceFingerprints: readonly string[];
  readonly verifiedFact: false;
  readonly actionable: false;
}
export interface MetricResult {
  readonly workspaceId: string;
  readonly kind: "ANALYSIS";
  readonly asOf: string;
  readonly sourceCoverage: "UNVERIFIED";
  readonly insights: readonly MetricInsight[];
}
const domains: readonly string[] = ["LEADS","CONVERSION","APPOINTMENTS","MISSED_ENQUIRIES","REVENUE_COST","MARKETING","RETENTION","CAPACITY"];
/** Accepts only a trusted server-supplied projection, never arbitrary model-generated business truth. */
export function analyzeBusinessMetrics(context: AuthorizedWorkspaceContext, projections: readonly MetricProjection[], request: MetricRequest): MetricResult {
  if (!context || typeof context.workspaceId !== "string" || !context.workspaceId.trim()) throw new Error("UNAUTHORIZED_WORKSPACE");
  if (!request || typeof request.asOf !== "string" || !Number.isFinite(Date.parse(request.asOf)) ||
    !Number.isSafeInteger(request.maxEvidenceAgeMs) || request.maxEvidenceAgeMs < 0 ||
    (request.limit !== undefined && (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 100)) ||
    !Array.isArray(projections) || projections.length > (request.limit ?? 100)) throw new Error("INVALID_METRIC_REQUEST");
  const keys = new Set<string>();
  const insights: MetricInsight[] = projections.map(p => {
    if (!p || p.workspaceId !== context.workspaceId) throw new Error("UNAUTHORIZED_WORKSPACE");
    if (!domains.includes(p.domain) || typeof p.metricKey !== "string" || !p.metricKey.trim() ||
      !Number.isFinite(Date.parse(p.periodStart)) || !Number.isFinite(Date.parse(p.periodEnd)) ||
      Date.parse(p.periodStart) >= Date.parse(p.periodEnd) || !Number.isFinite(Date.parse(p.observedAt)) ||
      p.unit !== "COUNT" && p.unit !== "MINOR_CURRENCY_UNITS" ||
      !Number.isSafeInteger(p.numerator) || p.numerator < 0 ||
      (p.denominator !== undefined && (!Number.isSafeInteger(p.denominator) || p.denominator < 0)) ||
      !Array.isArray(p.evidenceFingerprints) || !p.evidenceFingerprints.length ||
      p.evidenceFingerprints.some(fp => typeof fp !== "string" || !fp.trim()) ||
      new Set(p.evidenceFingerprints).size !== p.evidenceFingerprints.length ||
      !["COMPLETE","PARTIAL"].includes(p.coverage) || p.verification !== "UNVERIFIED")
      throw new Error("INVALID_METRIC_PROJECTION");
    const key = [p.domain,p.metricKey,p.periodStart,p.periodEnd,p.unit].join("|");
    if (keys.has(key)) throw new Error("CONFLICTING_METRIC_PROJECTIONS");
    keys.add(key);
    const age = Date.parse(request.asOf) - Date.parse(p.observedAt);
    const limitations: string[] = ["SOURCE_UNVERIFIED"];
    if (age < 0) limitations.push("FUTURE_OBSERVATION");
    else if (age > request.maxEvidenceAgeMs) limitations.push("STALE_EVIDENCE");
    if (p.coverage !== "COMPLETE") limitations.push("PARTIAL_COVERAGE");
    if (p.denominator === 0) limitations.push("ZERO_DENOMINATOR");
    const available = limitations.length === 1 && (p.denominator === undefined || p.denominator > 0);
    // Ratio is dimensionless; counts and currency remain integers in their declared source units.
    return {kind:"ANALYSIS" as const,domain:p.domain,metricKey:p.metricKey,periodStart:p.periodStart,periodEnd:p.periodEnd,
      unit:p.unit,numerator:p.numerator,...(p.denominator === undefined ? {} : {denominator:p.denominator}),
      value:available ? (p.denominator === undefined ? p.numerator : p.numerator / p.denominator) : null,
      status:available ? "AVAILABLE" as const : "UNAVAILABLE" as const,limitations,
      evidenceFingerprints:[...p.evidenceFingerprints],verifiedFact:false as const,actionable:false as const};
  });
  return structuredClone({workspaceId:context.workspaceId,kind:"ANALYSIS" as const,asOf:request.asOf,sourceCoverage:"UNVERIFIED" as const,insights});
}
