import type { OperationalRecord } from "../integration/contracts.js";
import { validateOperationalRecord } from "./validation.js";

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, normalizeValue(item)]),
    );
  }
  return value;
}

export interface NormalizedEvidence {
  workspaceId: OperationalRecord["workspaceId"];
  sourceSystem: OperationalRecord["reference"]["sourceSystem"];
  externalReference: string;
  version?: string;
  resourceKind: string;
  value: unknown;
  observedAt: string;
}

export function normalizeOperationalRecord(record: OperationalRecord): NormalizedEvidence {
  // Structural validation is mandatory even when normalization/fingerprinting is called directly.
  // Matching the record workspace here is NOT authentication; intake independently checks its trusted context.
  if (!validateOperationalRecord(record, { workspaceId: record?.workspaceId } as Parameters<typeof validateOperationalRecord>[1]).ok)
    throw new Error("INVALID_OPERATIONAL_RECORD");
  return {
    workspaceId: record.workspaceId,
    sourceSystem: record.reference.sourceSystem,
    externalReference: record.reference.externalReference.trim(),
    ...(record.reference.version ? { version: record.reference.version.trim() } : {}),
    resourceKind: record.resourceKind.trim(),
    value: normalizeValue(record.value),
    observedAt: record.observedAt,
  };
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}
