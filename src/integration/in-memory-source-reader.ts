import type { WorkspaceId } from "../domain/truth/types.js";
import { validateOperationalRecord } from "../evidence/validation.js";
import type { OperationalRecord, ReadError, ReadRequest, ReadResult } from "./contracts.js";
import { validateReadRequest, type SourceReader } from "./source-reader.js";

const DEFAULT_PAGE_SIZE = 100;

/** A deterministic, read-only projection for one server-authorized workspace. */
export class InMemorySourceReader implements SourceReader {
  private readonly snapshot: readonly OperationalRecord[];

  constructor(
    readonly sourceSystem: ReadRequest["sourceSystem"],
    private readonly workspaceId: WorkspaceId,
    records: readonly OperationalRecord[],
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {
    // Do not allow a caller to mutate a seed or a returned record into another tenant.
    this.snapshot = structuredClone(records);
  }

  async read(request: ReadRequest): Promise<ReadResult> {
    const fetchedAt = this.clock();
    const failure = (errors: ReadError[]): ReadResult => ({
      records: [], fetchedAt, completeness: "PARTIAL", errors,
    });
    const invalidRequest = validateReadRequest(request);
    if (!invalidRequest.ok) {
      return failure(invalidRequest.errors.map((message) => ({
        code: "INVALID_READ_REQUEST", message, retryable: false,
      })));
    }
    // The workspace must originate in the trusted server-side context, never a request override.
    if (request.context.workspaceId !== this.workspaceId) {
      return failure([{
        code: "WORKSPACE_SCOPE_MISMATCH", message: "Reader is not authorized for this workspace", retryable: false,
      }]);
    }
    if (request.sourceSystem !== this.sourceSystem) {
      return failure([{
        code: "SOURCE_SCOPE_MISMATCH", message: "Reader does not own the requested source projection", retryable: false,
      }]);
    }
    const limit = request.limit ?? DEFAULT_PAGE_SIZE;
    if (!Number.isSafeInteger(limit) || limit > DEFAULT_PAGE_SIZE) {
      return failure([{
        code: "INVALID_PAGE_LIMIT", message: "Limit must be a safe integer between 1 and 100", retryable: false,
      }]);
    }
    const cursor = request.cursor ?? "0";
    if (!/^(0|[1-9][0-9]*)$/.test(cursor) || !Number.isSafeInteger(Number(cursor))) {
      return failure([{
        code: "INVALID_CURSOR", message: "Cursor must be a non-negative safe offset", retryable: false,
      }]);
    }

    const valid: OperationalRecord[] = [];
    const errors: ReadError[] = [];
    for (const record of this.snapshot) {
      // Validate before filtering. A defective or foreign seed must never leak as evidence.
      const validation = validateOperationalRecord(record, request.context);
      for (const code of validation.errors) {
        errors.push({ code, message: "Projection record failed the evidence boundary", retryable: false });
      }
      if (record.reference?.sourceSystem !== this.sourceSystem) {
        errors.push({
          code: "SOURCE_SCOPE_MISMATCH", message: "Projection record has an unexpected source", retryable: false,
        });
      }
      if (validation.ok && record.reference.sourceSystem === this.sourceSystem &&
          record.resourceKind === request.resourceKind) {
        valid.push(record);
      }
    }
    const offset = Number(cursor);
    if (offset > valid.length) {
      return failure([{
        code: "INVALID_CURSOR", message: "Cursor is outside the available projection", retryable: false,
      }]);
    }
    const end = offset + limit;
    return {
      records: structuredClone(valid.slice(offset, end)),
      ...(end < valid.length ? { nextCursor: String(end) } : {}),
      fetchedAt,
      completeness: errors.length ? "PARTIAL" : "COMPLETE",
      errors,
    };
  }
}
