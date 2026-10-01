import type { AuthorizedWorkspaceContext, OperationalRecord, ValidationResult } from "../integration/contracts.js";

export function validateOperationalRecord(record: OperationalRecord, context: AuthorizedWorkspaceContext): ValidationResult {
  const errors: string[] = [];
  if (!record.workspaceId) errors.push("WORKSPACE_REQUIRED");
  if (record.workspaceId !== context.workspaceId) errors.push("CROSS_WORKSPACE_RECORD");
  if (!record.reference?.sourceSystem) errors.push("SOURCE_SYSTEM_REQUIRED");
  if (!record.reference?.externalReference?.trim()) errors.push("EXTERNAL_REFERENCE_REQUIRED");
  if (!record.resourceKind?.trim()) errors.push("RESOURCE_KIND_REQUIRED");
  if (!record.observedAt) errors.push("OBSERVED_AT_REQUIRED");
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
