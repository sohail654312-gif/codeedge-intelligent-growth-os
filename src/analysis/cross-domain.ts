import type { AuthorizedWorkspaceContext } from "../integration/contracts.js";
import { analyzeBusinessMetrics, type MetricProjection, type MetricRequest, type MetricInsight } from "./business-metrics.js";

export interface CrossDomainRequest extends MetricRequest {
  readonly domains: readonly MetricProjection["domain"][];
}
export interface CrossDomainResult {
  readonly workspaceId: string;
  readonly kind: "ANALYSIS";
  readonly asOf: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly sourceCoverage: "UNVERIFIED";
  readonly confidence: "INSUFFICIENT";
  readonly status: "AVAILABLE" | "PARTIAL";
  readonly limitations: readonly string[];
  readonly domains: readonly MetricProjection["domain"][];
  readonly insights: readonly MetricInsight[];
  readonly evidenceFingerprints: readonly string[];
  readonly verifiedFact: false;
  readonly actionable: false;
}
/** Comparison of independently supplied projections only: no causation, verification or authority. */
export function analyzeCrossDomain(
  context: AuthorizedWorkspaceContext,
  projections: readonly MetricProjection[],
  request: CrossDomainRequest,
): CrossDomainResult {
  if (!request || !Array.isArray(request.domains) || request.domains.length < 2 || request.domains.length > 8 ||
    new Set(request.domains).size !== request.domains.length ||
    !request.domains.every(d => ["LEADS","CONVERSION","APPOINTMENTS","MISSED_ENQUIRIES","REVENUE_COST","MARKETING","RETENTION","CAPACITY"].includes(d)))
    throw new Error("INVALID_CROSS_DOMAIN_REQUEST");
  // The underlying analyzer validates every source and workspace before any result is constructed.
  const analyzed = analyzeBusinessMetrics(context, projections, request);
  if (!analyzed.insights.length || analyzed.insights.length < request.domains.length ||
    analyzed.insights.some(i => !request.domains.includes(i.domain)) ||
    request.domains.some(d => !analyzed.insights.some(i => i.domain === d)))
    throw new Error("INCOMPLETE_CROSS_DOMAIN_INPUT");
  const first = analyzed.insights[0];
  if (analyzed.insights.some(i => i.periodStart !== first.periodStart || i.periodEnd !== first.periodEnd))
    throw new Error("INCOMPATIBLE_CROSS_DOMAIN_PERIODS");
  // Comparison carries units per metric; no sum, ratio across metrics or currency conversion is attempted.
  const evidence = [...new Set(analyzed.insights.flatMap(i => i.evidenceFingerprints))].sort();
  const limitations = [...new Set(["SOURCE_UNVERIFIED","NO_CAUSAL_INFERENCE",...analyzed.insights.flatMap(i => i.limitations)])];
  return structuredClone({
    workspaceId: analyzed.workspaceId,kind:"ANALYSIS" as const,asOf:analyzed.asOf,
    periodStart:first.periodStart,periodEnd:first.periodEnd,sourceCoverage:"UNVERIFIED" as const,
    confidence:"INSUFFICIENT" as const,
    status:analyzed.insights.every(i => i.status === "AVAILABLE") ? "AVAILABLE" as const : "PARTIAL" as const,
    limitations,domains:[...request.domains],insights:analyzed.insights,
    evidenceFingerprints:evidence,verifiedFact:false as const,actionable:false as const,
  });
}
