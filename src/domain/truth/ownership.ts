import type { Ownership, SourceSystem } from "./types.js";

export function requiredOwnership(sourceSystem: SourceSystem): Ownership {
  return sourceSystem === "BUSINESS_OS" || sourceSystem === "MVP"
    ? "EXTERNAL_OPERATIONAL"
    : "CIGO_OWNED";
}

export function isOperationalSource(sourceSystem: SourceSystem): boolean {
  return sourceSystem === "BUSINESS_OS" || sourceSystem === "MVP";
}
