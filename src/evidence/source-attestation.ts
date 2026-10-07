import type { OperationalRecord, ReadResult } from "../integration/contracts.js";
import { fingerprintOperationalRecord } from "./fingerprint.js";
import { validateOperationalRecord } from "./validation.js";
import { fingerprintReadPage } from "./read-page-fingerprint.js";

/** Source provenance is independently attested by a server-owned adapter; never by a caller flag. */
export interface SourceAttestation {
 readonly workspaceId: OperationalRecord["workspaceId"];
 readonly sourceSystem: OperationalRecord["reference"]["sourceSystem"];
 readonly externalReference: string;
 readonly fingerprint: string;
 readonly fetchedAt: string;
 readonly adapterId: string;
 readonly receiptId: string;
 /** Production Business OS receipts bind the entire page, not only one row. */
 readonly pageFingerprint?: string;
 readonly expiresAt?: string;
}
export interface TrustedSourceAuthority {
 /** Must consult authenticated adapter receipt storage, not the request payload. */
 verifyReceipt(attestation: SourceAttestation): Promise<boolean>;
}
const fail=():never=>{throw Error("UNTRUSTED_SOURCE_PROVENANCE");};
/** A source receipt MUST describe exactly one actual record in its complete read page, not
 * merely share fetchedAt with an unrelated or empty caller-assembled result. This remains a
 * verification port; authorities must consult server-owned receipt state. */
export async function requireAttestedObservation(record:OperationalRecord,result:ReadResult,
 attestation:SourceAttestation|undefined,authority?:TrustedSourceAuthority):Promise<SourceAttestation> {
 try {
  if(!authority||!attestation||!record||!result)throw Error("UNTRUSTED_SOURCE_PROVENANCE");
  if(typeof authority.verifyReceipt!=="function")fail();
  // Snapshot all three untrusted arguments before fingerprinting or invoking an async authority.
  const observation=structuredClone(record),page=structuredClone(result),receipt=structuredClone(attestation);
  if(!receipt.adapterId?.trim()||!receipt.receiptId?.trim()||!page.fetchedAt||
     page.completeness!=="COMPLETE"||!Array.isArray(page.errors)||page.errors.length!==0||
     !Array.isArray(page.records)||page.records.length<1||page.records.length>100||
     !validateOperationalRecord(observation,{workspaceId:observation.workspaceId} as Parameters<typeof validateOperationalRecord>[1]).ok||
     receipt.workspaceId!==observation.workspaceId||receipt.sourceSystem!==observation.reference.sourceSystem||
     receipt.externalReference!==observation.reference.externalReference||receipt.fetchedAt!==page.fetchedAt)fail();
  const fingerprint=await fingerprintOperationalRecord(observation);
  if(receipt.fingerprint!==fingerprint)fail();
  if(receipt.pageFingerprint!==undefined && receipt.pageFingerprint!==await fingerprintReadPage(page))fail();
  let matches=0;
  for(const candidate of page.records){
   if(!validateOperationalRecord(candidate,{workspaceId:observation.workspaceId} as Parameters<typeof validateOperationalRecord>[1]).ok||
      candidate.workspaceId!==observation.workspaceId||candidate.reference?.sourceSystem!==observation.reference.sourceSystem||
      candidate.resourceKind!==observation.resourceKind)fail();
   // A COMPLETE page cannot contain two conflicting snapshots for the same
   // source identity/version and still authenticate one arbitrarily chosen record.
   if(candidate.reference.externalReference===observation.reference.externalReference &&
      candidate.reference.version===observation.reference.version){
    if(await fingerprintOperationalRecord(candidate)!==fingerprint)fail();
    matches++;
   }
  }
  if(matches!==1||await authority.verifyReceipt(structuredClone(receipt))!==true)fail();
  return structuredClone(receipt);
 }catch{return fail();}
}
