import type { SourceSystem, WorkspaceId } from "../domain/truth/types.js";

export interface AuthorizedWorkspaceContext {
  workspaceId: WorkspaceId;
  actorId: string;
  authorizedAt: string;
}

export interface SourceRecordReference {
  sourceSystem: SourceSystem;
  externalReference: string;
  version?: string;
}

export interface OperationalRecord {
  workspaceId: WorkspaceId;
  reference: SourceRecordReference;
  resourceKind: string;
  value: unknown;
  observedAt: string;
}

export interface ReadRequest {
  context: AuthorizedWorkspaceContext;
  sourceSystem: SourceSystem;
  resourceKind: string;
  cursor?: string;
  limit?: number;
}

export type ReadCompleteness = "COMPLETE" | "PARTIAL";

export interface ReadError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ReadResult {
  records: OperationalRecord[];
  nextCursor?: string;
  fetchedAt: string;
  completeness: ReadCompleteness;
  errors: ReadError[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}
