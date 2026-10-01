import type { OperationalRecord } from "../integration/contracts.js";
import { normalizeOperationalRecord, stableSerialize } from "./normalize.js";

/** SHA-256 identity for one JSON-safe observation, including source and tenant context. */
export async function fingerprintOperationalRecord(record: OperationalRecord): Promise<string> {
  const payload = stableSerialize({
    schema: "cigo-observation-v1",
    observation: normalizeOperationalRecord(record),
  });
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return `cigo:observation:v1:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
