import type { ReadRequest, ReadError } from "./contracts.js";
import { validateReadRequest, type SourceReader } from "./source-reader.js";
import { InMemoryEvidenceLedger, type IntakeReport } from "../evidence/intake.js";

export interface OrchestrationResult {
  readonly pages: number;
  readonly accepted: number;
  readonly duplicates: number;
  readonly completeness: "COMPLETE" | "PARTIAL";
  readonly errors: readonly ReadError[];
  readonly reports: readonly IntakeReport[];
  readonly nextCursor?: string;
}
/** Bounded read-only orchestration. Caller supplies server-authorized context and a workspace-bound ledger. */
export async function orchestrateEvidenceIntake(
  reader: SourceReader, ledger: InMemoryEvidenceLedger, request: ReadRequest, maxPages = 10,
): Promise<OrchestrationResult> {
  const errors: ReadError[] = [], reports: IntakeReport[] = [];
  const fail = (code: string, message: string): void => { errors.push({ code, message, retryable: false }); };
  const validation = validateReadRequest(request);
  if (!validation.ok || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100 ||
      reader.sourceSystem !== request.sourceSystem || (request.cursor !== undefined && !request.cursor.trim())) {
    fail("INVALID_ORCHESTRATION_REQUEST", "Reader, request or page bound is invalid");
    return { pages: 0, accepted: 0, duplicates: 0, completeness: "PARTIAL", errors, reports };
  }
  let cursor = request.cursor;
  const seen = new Set<string>();
  if (cursor !== undefined) seen.add(cursor);
  let accepted = 0, duplicates = 0, nextCursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    let response;
    try {
      response = await reader.read({ ...request, ...(cursor === undefined ? {} : { cursor }) });
    } catch {
      fail("SOURCE_READ_FAILED", "Source read failed; no further pages were consumed");
      break;
    }
    if (!response || !Array.isArray(response.records) || !Array.isArray(response.errors) ||
        !response.fetchedAt || !["COMPLETE", "PARTIAL"].includes(response.completeness)) {
      fail("INVALID_SOURCE_RESPONSE", "Source returned an invalid read result");
      break;
    }
    if (response.records.some(record => !record || typeof record !== "object" || typeof record.resourceKind !== "string")) {
      fail("INVALID_SOURCE_RESPONSE", "Source returned malformed records");
      break;
    }
    if (response.records.some(record => record.resourceKind !== request.resourceKind)) {
      fail("RESOURCE_SCOPE_MISMATCH", "Source returned a record outside the requested resource kind");
      break;
    }
    let report: IntakeReport;
    try { report = await ledger.ingest(request.context, response, request.sourceSystem); }
    catch {
      fail("INTAKE_FAILED", "Evidence intake failed");
      break;
    }
    reports.push(report); accepted += report.accepted.length; duplicates += report.duplicates.length;
    errors.push(...report.errors);
    nextCursor = response.nextCursor;
    if (report.completeness === "PARTIAL") break; // Never treat a partial page as a complete snapshot.
    if (nextCursor === undefined) break;
    if (typeof nextCursor !== "string" || !nextCursor.trim() || seen.has(nextCursor)) {
      fail("INVALID_NEXT_CURSOR", "Source returned an empty or repeated cursor");
      break;
    }
    seen.add(nextCursor);
    cursor = nextCursor;
    if (page === maxPages - 1) fail("PAGE_BOUND_REACHED", "More source pages remain than allowed");
  }
  return {
    pages: reports.length, accepted, duplicates,
    completeness: errors.length ? "PARTIAL" : "COMPLETE",
    errors, reports,
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}
