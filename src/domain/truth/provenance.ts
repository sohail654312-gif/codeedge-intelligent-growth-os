import type { Evidence,TruthRecord } from "./types.js";
export function evidenceBelongsToRecord(record:TruthRecord,evidence:Evidence):boolean { return record.workspaceId===evidence.workspaceId }
export function preservesHistory(previous:TruthRecord,next:TruthRecord):boolean { return previous.id!==next.id&&next.supersedes===previous.id&&previous.workspaceId===next.workspaceId }
