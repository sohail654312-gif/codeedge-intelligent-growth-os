import type { ReadResult } from "../integration/contracts.js";
import { stableSerialize } from "./normalize.js";

/** Binds the full observed page, including its order, completeness and continuation. */
export async function fingerprintReadPage(page: ReadResult): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(
    stableSerialize({ schema: "cigo-source-page:v1", page }),
  ));
  return `cigo:page:v1:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
