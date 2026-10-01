import type { AuthorizedWorkspaceContext } from "../integration/contracts.js";
import type { InMemoryEvidenceLedger } from "../evidence/intake.js";
import { stableSerialize } from "../evidence/normalize.js";

export type MemoryKind = "FACT" | "ASSUMPTION" | "ANALYSIS";
export interface MemoryDraft {
  readonly key: string;
  readonly kind: MemoryKind;
  readonly value: unknown;
  readonly evidenceFingerprints: readonly string[];
  readonly verification?: { readonly reviewerActorId: string; readonly verifiedAt: string; readonly evidenceFingerprint: string };
}
export interface MemoryEntry {
  readonly id: string;
  readonly workspaceId: AuthorizedWorkspaceContext["workspaceId"];
  readonly key: string;
  readonly kind: MemoryKind;
  readonly value: unknown;
  readonly evidenceFingerprints: readonly string[];
  readonly status: "VERIFIED" | "UNVERIFIED";
  readonly createdAt: string;
  readonly supersedes?: string;
  readonly verification?: MemoryDraft["verification"];
}
/** In-memory reference model only; context must be supplied by a trusted server. */
export class InMemoryBusinessMemory {
  private readonly entries: MemoryEntry[] = [];
  constructor(
    private readonly workspaceId: AuthorizedWorkspaceContext["workspaceId"],
    private readonly evidence: InMemoryEvidenceLedger,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}
  private authorize(context: AuthorizedWorkspaceContext): void {
    if (!context?.workspaceId || context.workspaceId !== this.workspaceId || !context.actorId?.trim() || !context.authorizedAt)
      throw new Error("UNAUTHORIZED_WORKSPACE");
  }
  list(context: AuthorizedWorkspaceContext): readonly MemoryEntry[] {
    this.authorize(context);
    return structuredClone(this.entries);
  }
  add(context: AuthorizedWorkspaceContext, draft: MemoryDraft): MemoryEntry {
    this.authorize(context);
    if (!draft || !draft.key?.trim() || !["FACT","ASSUMPTION","ANALYSIS"].includes(draft.kind) ||
        !Array.isArray(draft.evidenceFingerprints) || !draft.evidenceFingerprints.length ||
        draft.evidenceFingerprints.some(fp => typeof fp !== "string" || !fp.trim()) ||
        new Set(draft.evidenceFingerprints).size !== draft.evidenceFingerprints.length ||
        draft.value === undefined || stableSerialize(draft.value) === undefined)
      throw new Error("INVALID_MEMORY_DRAFT");
    const evidence = this.evidence.list(context);
    if (draft.evidenceFingerprints.some(fp => !evidence.some(item => item.fingerprint === fp)))
      throw new Error("EVIDENCE_LINEAGE_NOT_FOUND");
    if (draft.kind === "FACT") {
      // Part2 evidence is UNVERIFIED; external attestation is deliberately not accepted as a shortcut.
      throw new Error("FACT_VERIFICATION_GATE_UNAVAILABLE");
    }
    if (draft.verification) throw new Error("VERIFICATION_NOT_ALLOWED_FOR_UNVERIFIED_MEMORY");
    const key = draft.key.trim();
    const previous = [...this.entries].reverse().find(item => item.key === key);
    const canonical = stableSerialize({ key, kind:draft.kind, value:draft.value, evidenceFingerprints:[...draft.evidenceFingerprints].sort() });
    if (previous && stableSerialize({ key:previous.key,kind:previous.kind,value:previous.value,evidenceFingerprints:[...previous.evidenceFingerprints].sort() }) === canonical)
      return structuredClone(previous);
    const entry: MemoryEntry = {
      id: `memory:${this.entries.length+1}`, workspaceId:this.workspaceId, key, kind:draft.kind,
      value:structuredClone(draft.value), evidenceFingerprints:[...draft.evidenceFingerprints],
      status:"UNVERIFIED", createdAt:this.clock(), ...(previous ? {supersedes:previous.id}:{}),
    };
    this.entries.push(entry);
    return structuredClone(entry);
  }
}
