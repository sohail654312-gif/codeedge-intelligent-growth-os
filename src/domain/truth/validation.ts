import { requiredOwnership } from "./ownership.js";
import type { TruthRecord } from "./types.js";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const DERIVED = new Set(["ANALYSIS", "PREDICTION", "RECOMMENDATION"]);
const AUTHORIZED = new Set(["DECISION", "ACTION"]);

/** Trusted verification must be supplied by an independently authenticated boundary. */
export interface TrustedTruthContext {
  isVerifiedEvidence: (evidence: TruthRecord["evidence"][number], record: TruthRecord) => boolean;
  isAuthorizedApproval: (record: TruthRecord) => boolean;
}

export function validateTruthRecord(record: TruthRecord, trusted?: TrustedTruthContext): ValidationResult {
  const errors: string[] = [];

  if (!record.workspaceId) errors.push("WORKSPACE_REQUIRED");
  if (!record.id) errors.push("ID_REQUIRED");
  if (!record.sourceSystem) errors.push("SOURCE_SYSTEM_REQUIRED");
  if (record.ownership !== requiredOwnership(record.sourceSystem)) {
    errors.push("INVALID_SOURCE_OWNERSHIP");
  }

  for (const evidence of record.evidence) {
    if (evidence.workspaceId !== record.workspaceId) {
      errors.push("CROSS_WORKSPACE_EVIDENCE");
    }
    if (!evidence.sourceSystem || !evidence.externalReference) {
      errors.push("INVALID_EVIDENCE_PROVENANCE");
    }
  }

  for (const lineage of record.lineage) {
    if (lineage.workspaceId !== record.workspaceId) {
      errors.push("CROSS_WORKSPACE_LINEAGE");
    }
  }

  if (record.truthClass === "FACT") {
    if (record.evidence.length === 0) errors.push("FACT_EVIDENCE_REQUIRED");
    if (!record.evidence.some((evidence) => evidence.verification === "VERIFIED" && trusted?.isVerifiedEvidence(evidence, record) === true)) {
      errors.push("FACT_VERIFICATION_REQUIRED");
    }
  }

  if (
    DERIVED.has(record.truthClass) &&
    record.lineage.length === 0 &&
    record.evidence.length === 0
  ) {
    errors.push("DERIVED_LINEAGE_REQUIRED");
  }

  if (AUTHORIZED.has(record.truthClass)) {
    if (!record.authority?.actorId || !record.authority.evidenceReference) {
      errors.push("AUTHORITY_EVIDENCE_REQUIRED");
    }
    if (record.authority?.approved !== true) errors.push("ACTION_APPROVAL_REQUIRED");
    if (trusted?.isAuthorizedApproval(record) !== true) {
      errors.push("TRUSTED_APPROVAL_REQUIRED");
    }
    if (record.authority?.actorType === "SYSTEM" && record.authority.approved) {
      errors.push("SYSTEM_CANNOT_SELF_APPROVE");
    }
  }

  if (
    record.confidence !== undefined &&
    (record.confidence < 0 || record.confidence > 1)
  ) {
    errors.push("INVALID_CONFIDENCE");
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function promoteAssumption(
  record: TruthRecord,
  evidence: TruthRecord["evidence"],
  trusted?: TrustedTruthContext,
): TruthRecord {
  if (record.truthClass !== "ASSUMPTION") {
    throw new Error("ONLY_ASSUMPTIONS_CAN_BE_PROMOTED");
  }

  const verified = evidence.filter(
    (item) =>
      item.workspaceId === record.workspaceId &&
      item.verification === "VERIFIED" &&
      trusted?.isVerifiedEvidence(item, record) === true,
  );

  if (!verified.length) throw new Error("VERIFIED_EVIDENCE_REQUIRED");

  const promoted: TruthRecord = { ...record, truthClass: "FACT", evidence: verified };
  if (!validateTruthRecord(promoted, trusted).ok) throw new Error("PROMOTED_FACT_INVALID");
  return promoted;
}
