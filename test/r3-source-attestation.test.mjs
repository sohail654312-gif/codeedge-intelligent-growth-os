import test from "node:test";
import assert from "node:assert/strict";
import {fingerprintOperationalRecord} from "../dist/src/evidence/fingerprint.js";
import {requireAttestedObservation} from "../dist/src/evidence/source-attestation.js";
const now="2026-10-01T12:00:00.000Z", A="workspace:a", B="workspace:b";
const record={workspaceId:A,reference:{sourceSystem:"BUSINESS_OS",externalReference:"lead:1"},resourceKind:"lead",value:{status:"new"},observedAt:now};
const result={records:[record],fetchedAt:now,completeness:"COMPLETE",errors:[]};
test("R3 rejects missing receipt authority, forged tenant, altered observation, partial source and revoked receipt",async()=>{
 const attestation={workspaceId:A,sourceSystem:"BUSINESS_OS",externalReference:"lead:1",fingerprint:await fingerprintOperationalRecord(record),fetchedAt:now,adapterId:"server:adapter",receiptId:"receipt:1"};
 const authority={verifyReceipt:async receipt=>receipt.receiptId==="receipt:1"};
 await assert.rejects(requireAttestedObservation(record,result,attestation),/UNTRUSTED/);
 await assert.rejects(requireAttestedObservation(record,result,{...attestation,workspaceId:B},authority),/UNTRUSTED/);
 await assert.rejects(requireAttestedObservation({...record,value:{status:"changed"}},result,attestation,authority),/UNTRUSTED/);
 await assert.rejects(requireAttestedObservation(record,{...result,completeness:"PARTIAL"},attestation,authority),/UNTRUSTED/);
 await assert.rejects(requireAttestedObservation(record,result,attestation,{verifyReceipt:async()=>false}),/UNTRUSTED/);
 assert.equal((await requireAttestedObservation(record,result,attestation,authority)).receiptId,"receipt:1");
});
