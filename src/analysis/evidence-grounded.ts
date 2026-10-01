import type { AuthorizedWorkspaceContext } from "../integration/contracts.js";
import type { InMemoryBusinessMemory } from "../memory/in-memory-business-memory.js";
import type { InMemoryEvidenceLedger } from "../evidence/intake.js";
import { queryBusinessKnowledge, type KnowledgeView } from "../memory/knowledge-view.js";
import { inspectKnowledgeIntegrity, type IntegrityIssue } from "../memory/integrity.js";

export interface AnalysisRequest {
  readonly asOf: string;
  readonly key?: string;
  readonly maxEvidenceAgeMs: number;
  readonly limit?: number;
}
export interface AnalysisInsight {
  readonly kind: "ANALYSIS";
  readonly workspaceId: AuthorizedWorkspaceContext["workspaceId"];
  readonly memoryId: string;
  readonly memoryKey: string;
  readonly sourceKind: "ASSUMPTION" | "ANALYSIS";
  readonly evidenceFingerprints: readonly string[];
  readonly asOf: string;
  readonly confidence: "INSUFFICIENT" | "LIMITED";
  readonly uncertainty: readonly string[];
  readonly observation: unknown;
  readonly verifiedFact: false;
  readonly actionable: false;
}
export interface AnalysisResult {
  readonly workspaceId: AuthorizedWorkspaceContext["workspaceId"];
  readonly kind: "ANALYSIS";
  readonly asOf: string;
  readonly insights: readonly AnalysisInsight[];
  readonly sourceCoverage: "PARTIAL" | "UNVERIFIED";
  readonly limitations: readonly string[];
  readonly nextOffset?: number;
}
/** Deterministic in-memory interpretation, not verification, a recommendation or execution authority. */
export function analyzeKnowledge(
  context: AuthorizedWorkspaceContext,
  memory: InMemoryBusinessMemory,
  ledger: InMemoryEvidenceLedger,
  request: AnalysisRequest,
): AnalysisResult {
  if (!request || typeof request.asOf !== "string" || !Number.isFinite(Date.parse(request.asOf)) ||
    !Number.isSafeInteger(request.maxEvidenceAgeMs) || request.maxEvidenceAgeMs < 0 ||
    (request.key !== undefined && (typeof request.key !== "string" || !request.key.trim())) ||
    (request.limit !== undefined && (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 100)))
    throw new Error("INVALID_ANALYSIS_REQUEST");
  const limit = request.limit ?? 20;
  // Both source APIs authorize independently; do not accept caller-supplied knowledge objects.
  const knowledge = queryBusinessKnowledge(context, memory, ledger, {
    asOf: request.asOf, key: request.key, limit, view: "CURRENT",
    maxEvidenceAgeMs: request.maxEvidenceAgeMs,
  });
  const integrity = inspectKnowledgeIntegrity(context, memory, ledger, {
    asOf: request.asOf, maxEvidenceAgeMs: request.maxEvidenceAgeMs, limit: 100,
  });
  // Integrity is independently paginated; fail closed rather than silently analyze unchecked memory.
  if (integrity.nextOffset !== undefined) throw new Error("INTEGRITY_COVERAGE_INCOMPLETE");
  const byId = new Map(integrity.findings.map(finding => [finding.memoryId, finding]));
  const insights: AnalysisInsight[] = knowledge.items.map((item: KnowledgeView) => {
    const finding = byId.get(item.memory.id);
    if (!finding) throw new Error("INTEGRITY_LINEAGE_MISSING");
    if (item.memory.workspaceId !== context.workspaceId || item.memory.kind === "FACT" ||
      item.memory.status !== "UNVERIFIED" || item.evidence.length !== item.memory.evidenceFingerprints.length ||
      item.evidence.some(e => e.verification !== "UNVERIFIED"))
      throw new Error("UNSAFE_ANALYSIS_SOURCE");
    const uncertainty = [...new Set([...item.limitations, ...finding.issues])];
    if (!item.evidence.length || finding.issues.includes("EVIDENCE_FOREIGN_WORKSPACE") ||
      finding.issues.includes("EVIDENCE_MISSING") || finding.issues.includes("INVALID_MEMORY_LINEAGE"))
      throw new Error("UNSAFE_ANALYSIS_LINEAGE");
    return {
      kind: "ANALYSIS" as const, workspaceId: context.workspaceId,
      memoryId: item.memory.id, memoryKey: item.memory.key,
      sourceKind: item.memory.kind as "ASSUMPTION" | "ANALYSIS",
      evidenceFingerprints: [...item.memory.evidenceFingerprints],
      asOf: request.asOf, confidence: "INSUFFICIENT" as const,
      uncertainty, observation: structuredClone(item.memory.value),
      verifiedFact: false as const, actionable: false as const,
    };
  });
  return structuredClone({
    workspaceId: context.workspaceId, kind: "ANALYSIS" as const, asOf: request.asOf,
    insights, sourceCoverage: "UNVERIFIED" as const,
    limitations: ["SOURCE_OBSERVATIONS_UNVERIFIED", ...(knowledge.nextOffset !== undefined ? ["RESULTS_PAGINATED"] : [])],
    ...(knowledge.nextOffset !== undefined ? { nextOffset: knowledge.nextOffset } : {}),
  });
}
