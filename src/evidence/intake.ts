import type { AuthorizedWorkspaceContext, OperationalRecord, ReadResult, ReadError, ReadRequest } from "../integration/contracts.js";
import { validateOperationalRecord } from "./validation.js";
import { normalizeOperationalRecord, type NormalizedEvidence } from "./normalize.js";
import { fingerprintOperationalRecord } from "./fingerprint.js";

export interface IntakeEntry {
  readonly fingerprint: string;
  readonly observation: NormalizedEvidence;
  readonly ingestedAt: string;
  readonly supersedes?: string;
  readonly verification: "UNVERIFIED";
}
export interface IntakeReport {
  readonly accepted: readonly IntakeEntry[];
  readonly duplicates: readonly string[];
  readonly errors: readonly ReadError[];
  readonly completeness: ReadResult["completeness"];
  readonly fetchedAt: string;
  readonly nextCursor?: string;
}
/** Append-only, workspace-bound intelligence evidence, never an operational system of record. */
export class InMemoryEvidenceLedger {
  private readonly entries: IntakeEntry[] = [];
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly workspaceId: AuthorizedWorkspaceContext["workspaceId"],
    private readonly clock: () => string = () => new Date().toISOString()) {}
  list(context: AuthorizedWorkspaceContext): readonly IntakeEntry[] {
    if (!context?.workspaceId || context.workspaceId !== this.workspaceId || !context.actorId?.trim() || !context.authorizedAt)
      throw new Error("UNAUTHORIZED_WORKSPACE");
    return structuredClone(this.entries);
  }
  async ingest(context: AuthorizedWorkspaceContext, result: ReadResult, expectedSourceSystem: ReadRequest["sourceSystem"]): Promise<IntakeReport> {
    const prior=this.pending;
    let release!:()=>void;
    this.pending=new Promise<void>(resolve=>{release=resolve;});
    await prior;
    try{return await this.ingestSerialized(context,result,expectedSourceSystem);}finally{release();}
  }
  private async ingestSerialized(context: AuthorizedWorkspaceContext, result: ReadResult, expectedSourceSystem: ReadRequest["sourceSystem"]): Promise<IntakeReport> {
    if (!context?.workspaceId || context.workspaceId !== this.workspaceId || !context.actorId?.trim() || !context.authorizedAt)
      throw new Error("UNAUTHORIZED_WORKSPACE");
    if(!result||!Array.isArray(result.records)||!Array.isArray(result.errors))throw Error("INVALID_INTAKE_BATCH");
    const errors: ReadError[] = [...result.errors.map(e => ({ ...e }))];
    const accepted: IntakeEntry[] = [], duplicates: string[] = [];
    // Stage the complete batch before committing; fatal normalization, hashing or clock failures cannot partially append.
    for (const record of result.records) {
      const validation = validateOperationalRecord(record, context);
      if (!expectedSourceSystem || record?.reference?.sourceSystem !== expectedSourceSystem) {
        errors.push({ code: "SOURCE_SCOPE_MISMATCH", message: "Evidence source does not match authorized intake", retryable: false });
        continue;
      }
      if (!validation.ok) {
        errors.push(...validation.errors.map(code => ({ code, message: "Evidence intake validation failed", retryable: false })));
        continue;
      }
      const fingerprint = await fingerprintOperationalRecord(record);
      if ([...this.entries,...accepted].some(e => e.fingerprint === fingerprint)) { duplicates.push(fingerprint); continue; }
      const observation = normalizeOperationalRecord(record);
      const previous = [...this.entries,...accepted].reverse().find(e =>
        e.observation.workspaceId === observation.workspaceId &&
        e.observation.sourceSystem === observation.sourceSystem &&
        e.observation.externalReference === observation.externalReference &&
        e.observation.resourceKind === observation.resourceKind);
      const entry: IntakeEntry = {
        fingerprint, observation: structuredClone(observation), ingestedAt: this.clock(),
        ...(previous ? { supersedes: previous.fingerprint } : {}), verification: "UNVERIFIED"
      };
      accepted.push(structuredClone(entry));
    }
    this.entries.push(...structuredClone(accepted));
    return {
      accepted, duplicates, errors,
      completeness: result.completeness === "COMPLETE" && errors.length === 0 ? "COMPLETE" : "PARTIAL",
      fetchedAt: result.fetchedAt,
      ...(result.nextCursor === undefined ? {} : { nextCursor: result.nextCursor }),
    };
  }
}
