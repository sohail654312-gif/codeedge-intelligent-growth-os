import type { ReadRequest, ReadResult, ValidationResult } from "./contracts.js";

export interface SourceReader {
  readonly sourceSystem: ReadRequest["sourceSystem"];
  read(request: ReadRequest): Promise<ReadResult>;
}

export function validateReadRequest(request: ReadRequest): ValidationResult {
  const errors: string[] = [];
  if (!request.context?.workspaceId) errors.push("Authorized workspace context is required");
  if (!request.context?.actorId?.trim()) errors.push("Authorized actor is required");
  if (!request.context?.authorizedAt) errors.push("Authorization timestamp is required");
  if (!request.sourceSystem) errors.push("Source system is required");
  if (!request.resourceKind?.trim()) errors.push("Resource kind is required");
  if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit <= 0)) {
    errors.push("Limit must be a positive integer");
  }
  return { ok: errors.length === 0, errors };
}
