import type { OperationalRecord, ReadResult } from "../integration/contracts.js";
import { fingerprintOperationalRecord } from "./fingerprint.js";

/** Source provenance is independently attested by a server-owned adapter; never by a caller flag. */
export interface SourceAttestation {
 readonly workspaceId: OperationalRecord["workspaceId"];
 readonly sourceSystem: OperationalRecord["reference"]["sourceSystem"];
 readonly externalReference: string;
 readonly fingerprint: string;
 readonly fetchedAt: string;
 readonly adapterId: string;
 readonly receiptId: string;
}
export interface TrustedSourceAuthority {
 /** Must consult authenticated adapter receipt storage, not the request payload. */
 verifyReceipt(attestation: SourceAttestation): Promise<boolean>;
}
export async function requireAttestedObservation(record: OperationalRecord, result: ReadResult,
 attestation: SourceAttestation | undefined, authority?: TrustedSourceAuthority): Promise<SourceAttestation> {
 if (!authority || !attestation || !attestation.adapterId?.trim() || !attestation.receiptId?.trim() ||
     !result.fetchedAt || result.completeness !== "COMPLETE" || result.errors.length !== 0 ||
     attestation.workspaceId !== record.workspaceId ||
     attestation.sourceSystem !== record.reference?.sourceSystem ||
     attestation.externalReference !== record.reference?.externalReference ||
     attestation.fetchedAt !== result.fetchedAt ||
     attestation.fingerprint !== await fingerprintOperationalRecord(record) ||
     await authority.verifyReceipt(attestation) !== true) throw new Error("UNTRUSTED_SOURCE_PROVENANCE");
 return attestation;
}
