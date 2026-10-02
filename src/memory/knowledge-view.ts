import type { AuthorizedWorkspaceContext } from "../integration/contracts.js";
import type { InMemoryEvidenceLedger } from "../evidence/intake.js";
import type { InMemoryBusinessMemory, MemoryEntry, MemoryKind } from "./in-memory-business-memory.js";

export interface KnowledgeEvidence {
  readonly fingerprint: string;
  readonly sourceSystem: string;
  readonly externalReference: string;
  readonly observedAt: string;
  readonly ingestedAt: string;
  readonly verification: "UNVERIFIED";
  readonly freshness: "CURRENT" | "STALE" | "UNKNOWN";
}
export interface KnowledgeView {
  readonly memory: MemoryEntry;
  readonly isCurrentRevision: boolean;
  readonly evidence: readonly KnowledgeEvidence[];
  readonly limitations: readonly string[];
}
export interface MemoryQuery {
  readonly key?: string;
  readonly kind?: MemoryKind;
  readonly view?: "CURRENT" | "HISTORY";
  readonly limit?: number;
  readonly offset?: number;
  readonly asOf: string;
  readonly maxEvidenceAgeMs?: number;
}
export interface MemoryQueryResult {
  /** asOf affects evidence freshness only; this result is NEVER a historical snapshot. */
  readonly asOfSemantics: "EVIDENCE_FRESHNESS_ONLY";
  readonly items: readonly KnowledgeView[];
  readonly total: number;
  readonly nextOffset?: number;
}
/** Read-only, bounded reference projection. Neither read results nor freshness imply verified truth. */
export function queryBusinessKnowledge(
  context: AuthorizedWorkspaceContext,
  memory: InMemoryBusinessMemory,
  ledger: InMemoryEvidenceLedger,
  query: MemoryQuery,
): MemoryQueryResult {
  // Authorize both stores before any read; the stores are each independently workspace-bound.
  const entries = memory.list(context);
  const evidence = ledger.list(context);
  if (!query || !Number.isFinite(Date.parse(query.asOf)) ||
      (query.key !== undefined && (typeof query.key !== "string" || !query.key.trim())) ||
      (query.kind !== undefined && !["FACT", "ASSUMPTION", "ANALYSIS"].includes(query.kind)) ||
      (query.view !== undefined && !["CURRENT", "HISTORY"].includes(query.view)) ||
      (query.limit !== undefined && (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100)) ||
      (query.offset !== undefined && (!Number.isSafeInteger(query.offset) || query.offset < 0)) ||
      (query.maxEvidenceAgeMs !== undefined && (!Number.isSafeInteger(query.maxEvidenceAgeMs) || query.maxEvidenceAgeMs < 0)))
    throw new Error("INVALID_MEMORY_QUERY");
  const latest = new Map<string, string>();
  for (const entry of entries) latest.set(entry.key, entry.id);
  const filtered = entries.filter(entry =>
    (query.key === undefined || entry.key === query.key.trim()) &&
    (query.kind === undefined || entry.kind === query.kind) &&
    (query.view === "HISTORY" || latest.get(entry.key) === entry.id));
  const offset = query.offset ?? 0, limit = query.limit ?? 20;
  const byFingerprint = new Map(evidence.map(item => [item.fingerprint, item]));
  const items: KnowledgeView[] = filtered.slice(offset, offset + limit).map(entry => {
    const limitations: string[] = [];
    const linked: KnowledgeEvidence[] = [];
    // Current revision selection deliberately uses all recorded revisions, not an asOf snapshot.
    if(Date.parse(entry.createdAt)>Date.parse(query.asOf))limitations.push("REVISION_POSTDATES_AS_OF");
    for (const fp of entry.evidenceFingerprints) {
      const item = byFingerprint.get(fp);
      if (!item) { limitations.push("EVIDENCE_MISSING"); continue; }
      const observed = Date.parse(item.observation.observedAt);
      const age = Date.parse(query.asOf) - observed;
      const freshness = !Number.isFinite(observed) || age < 0 ? "UNKNOWN" :
        query.maxEvidenceAgeMs !== undefined && age > query.maxEvidenceAgeMs ? "STALE" : "CURRENT";
      if (freshness !== "CURRENT") limitations.push(freshness === "STALE" ? "EVIDENCE_STALE" : "FRESHNESS_UNKNOWN");
      linked.push({
        fingerprint: fp, sourceSystem: item.observation.sourceSystem,
        externalReference: item.observation.externalReference, observedAt: item.observation.observedAt,
        ingestedAt: item.ingestedAt, verification: item.verification, freshness,
      });
    }
    if (entry.status !== "VERIFIED") limitations.push("MEMORY_UNVERIFIED");
    if (entry.kind !== "FACT") limitations.push("INTERPRETIVE_NOT_FACT");
    return { memory: entry, isCurrentRevision: latest.get(entry.key) === entry.id,
      evidence: linked, limitations: [...new Set(limitations)] };
  });
  return structuredClone({ asOfSemantics:"EVIDENCE_FRESHNESS_ONLY" as const,items, total: filtered.length,
    ...(offset + limit < filtered.length ? { nextOffset: offset + limit } : {}) });
}
