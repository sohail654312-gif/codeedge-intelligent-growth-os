import type { CanonicalId,WorkspaceId } from "./types.js";
const VALID=/^[A-Za-z0-9][A-Za-z0-9:_-]{1,127}$/;
export function workspaceId(v:string):WorkspaceId { if(!VALID.test(v)) throw new Error("INVALID_WORKSPACE_ID"); return v as WorkspaceId }
export function canonicalId(v:string):CanonicalId { if(!VALID.test(v)) throw new Error("INVALID_CANONICAL_ID"); return v as CanonicalId }
