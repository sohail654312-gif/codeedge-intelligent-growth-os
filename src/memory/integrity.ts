import type { AuthorizedWorkspaceContext } from "../integration/contracts.js";
import type { InMemoryEvidenceLedger } from "../evidence/intake.js";
import type { InMemoryBusinessMemory } from "./in-memory-business-memory.js";

export type IntegrityIssue =
  | "EVIDENCE_MISSING" | "EVIDENCE_FOREIGN_WORKSPACE" | "EVIDENCE_SUPERSEDED"
  | "EVIDENCE_STALE" | "FRESHNESS_UNKNOWN" | "MEMORY_REVISION_CONFLICT"
  | "MEMORY_SUPERSEDED" | "UNVERIFIED_FACT" | "UNVERIFIED_EVIDENCE"
  | "UNVERIFIED_MEMORY" | "INVALID_MEMORY_LINEAGE";
export interface IntegrityFinding {
  readonly memoryId: string;
  readonly key: string;
  readonly issues: readonly IntegrityIssue[];
  readonly evidenceFingerprints: readonly string[];
  readonly eligibleAsVerifiedFact: false;
}
export interface IntegrityReport {
  readonly workspaceId: AuthorizedWorkspaceContext["workspaceId"];
  readonly checked: number;
  readonly findings: readonly IntegrityFinding[];
  readonly nextOffset?: number;
  readonly verificationAuthority: "NOT_CONFIGURED";
}
export interface IntegrityOptions {
  readonly asOf: string;
  readonly maxEvidenceAgeMs: number;
  readonly offset?: number;
  readonly limit?: number;
}
/** Diagnostic only. Fingerprint membership proves neither authenticity nor authorization to verify. */
export function inspectKnowledgeIntegrity(
  context: AuthorizedWorkspaceContext,
  memory: InMemoryBusinessMemory,
  ledger: InMemoryEvidenceLedger,
  options: IntegrityOptions,
): IntegrityReport {
  const entries = memory.list(context);
  const observations = ledger.list(context);
  if (!options || typeof options.asOf !== "string" || !Number.isFinite(Date.parse(options.asOf)) ||
    !Number.isSafeInteger(options.maxEvidenceAgeMs) || options.maxEvidenceAgeMs < 0 ||
    (options.offset !== undefined && (!Number.isSafeInteger(options.offset) || options.offset < 0)) ||
    (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100)))
    throw new Error("INVALID_INTEGRITY_OPTIONS");
  const byFingerprint = new Map(observations.map(item => [item.fingerprint, item]));
  const byId = new Map(entries.map(item => [item.id, item]));
  const latest = new Map<string, string>();
  for (const entry of entries) latest.set(entry.key, entry.id);
  const offset = options.offset ?? 0, limit = options.limit ?? 20;
  const findings: IntegrityFinding[] = entries.slice(offset, offset + limit).map(entry => {
    const issues = new Set<IntegrityIssue>();
    if (entry.status !== "VERIFIED") issues.add("UNVERIFIED_MEMORY");
    if (entry.kind === "FACT" && (entry.status !== "VERIFIED" || !entry.verification)) issues.add("UNVERIFIED_FACT");
    if (latest.get(entry.key) !== entry.id) issues.add("MEMORY_SUPERSEDED");
    if (entry.supersedes) {
      const parent = byId.get(entry.supersedes);
      if (!parent || parent.key !== entry.key || entries.indexOf(parent) >= entries.indexOf(entry))
        issues.add("MEMORY_REVISION_CONFLICT");
    }
    if (!entry.evidenceFingerprints.length || new Set(entry.evidenceFingerprints).size !== entry.evidenceFingerprints.length)
      issues.add("INVALID_MEMORY_LINEAGE");
    for (const fingerprint of entry.evidenceFingerprints) {
      const evidence = byFingerprint.get(fingerprint);
      if (!evidence) { issues.add("EVIDENCE_MISSING"); continue; }
      if (evidence.observation.workspaceId !== context.workspaceId) { issues.add("EVIDENCE_FOREIGN_WORKSPACE"); continue; }
      if (evidence.verification !== "UNVERIFIED") {
        // Part2 ledger's only valid state is UNVERIFIED; do not treat mutated/forged status as proof.
        issues.add("UNVERIFIED_EVIDENCE");
      } else issues.add("UNVERIFIED_EVIDENCE");
      if (observations.some(other => other.supersedes === fingerprint)) issues.add("EVIDENCE_SUPERSEDED");
      const observed = Date.parse(evidence.observation.observedAt);
      const age = Date.parse(options.asOf) - observed;
      if (!Number.isFinite(observed) || age < 0) issues.add("FRESHNESS_UNKNOWN");
      else if (age > options.maxEvidenceAgeMs) issues.add("EVIDENCE_STALE");
    }
    return { memoryId: entry.id, key: entry.key, issues: [...issues],
      evidenceFingerprints: [...entry.evidenceFingerprints], eligibleAsVerifiedFact: false as const };
  });
  return structuredClone({ workspaceId: context.workspaceId, checked: findings.length, findings,
    ...(offset + limit < entries.length ? { nextOffset: offset + limit } : {}),
    verificationAuthority: "NOT_CONFIGURED" as const });
}
