import test from 'node:test';
import assert from 'node:assert/strict';
import {requireAttestedObservation} from '../dist/src/evidence/source-attestation.js';
import {fingerprintOperationalRecord} from '../dist/src/evidence/fingerprint.js';
import {createPostgresSourceAuthority} from '../dist/src/integration/attested-business-os-reader.js';
import {InMemoryEvidenceLedger} from '../dist/src/evidence/intake.js';
import {InMemoryBusinessMemory} from '../dist/src/memory/in-memory-business-memory.js';
import {analyzeKnowledge} from '../dist/src/analysis/evidence-grounded.js';
import {validateTruthRecord} from '../dist/src/domain/truth/validation.js';
import {A,B,composition,record,request,unitPool} from './source-receipt-fixture.mjs';

async function observed(){const pool=unitPool(),server=composition(pool),page=await server.reader.read(request());assert.equal(page.completeness,'COMPLETE');const receipt=await server.attestationFor(page,page.records[0]);return {pool,server,page,receipt,row:page.records[0]};}
test('server receipt binds exact authenticated Business OS page and survives a verifier restart',async()=>{
 const {pool,server,page,receipt,row}=await observed();
 assert.equal(receipt.fetchedAt,page.fetchedAt);assert.equal(receipt.sourceSystem,'BUSINESS_OS');assert.ok(receipt.pageFingerprint);assert.ok(receipt.receiptId);
 assert.equal(await createPostgresSourceAuthority(pool,A).verifyReceipt(receipt),true);
 assert.deepEqual(await requireAttestedObservation(row,page,receipt,server.authority),receipt);
 assert.deepEqual(await requireAttestedObservation(row,page,receipt,server.authority),receipt,'verification replay is idempotent and confers no new authority');
 await assert.rejects(requireAttestedObservation(row,page,receipt),/UNTRUSTED/);
 await assert.rejects(server.attestationFor(structuredClone(page),row),/UNTRUSTED/);
});
for(const [name,mutate] of [
 ['workspace',r=>{r.workspaceId=B;}],['source',r=>{r.sourceSystem='MVP';}],['external reference',r=>{r.externalReference='lead:forged';}],
 ['fingerprint',r=>{r.fingerprint='forged';}],['fetchedAt',r=>{r.fetchedAt='2026-10-06T00:00:00.000Z';}],
 ['adapter',r=>{r.adapterId='caller';}],['unknown receipt',r=>{r.receiptId=crypto.randomUUID();}],['page digest',r=>{r.pageFingerprint='forged';}],
 ['expiry extension',r=>{r.expiresAt='2099-01-01T00:00:00.000Z';}],['caller VERIFIED claim',r=>{r.verification='VERIFIED';}],
])test(`durable authority denies altered ${name}`,async()=>{const {server,page,receipt,row}=await observed();mutate(receipt);assert.equal(await server.authority.verifyReceipt(receipt),false);await assert.rejects(requireAttestedObservation(row,page,receipt,server.authority),/UNTRUSTED/);});
test('record and page mutation cannot reuse a valid receipt',async()=>{
 const {server,page,receipt,row}=await observed();const altered=structuredClone(row);altered.value.status='tampered';
 const mutations=[{...page,records:[altered]},{...page,records:[row,record({reference:{...row.reference,externalReference:'lead:other'}})]},{...page,completeness:'PARTIAL'},{...page,errors:[{code:'partial',message:'partial',retryable:false}]},{...page,fetchedAt:'2026-10-06T00:00:00.000Z'},{...page,nextCursor:'forged'}];
 for(const p of mutations)await assert.rejects(requireAttestedObservation(row,p,receipt,server.authority),/UNTRUSTED/);
 await assert.rejects(server.attestationFor(page,altered),/UNTRUSTED/);
});
test('revocation, expired receipt, wrong tenant verifier and unavailable store fail closed',async()=>{
 const {pool,server,page,receipt,row}=await observed();
 assert.equal(await createPostgresSourceAuthority(pool,B).verifyReceipt(receipt),false);
 assert.equal(await createPostgresSourceAuthority(pool,A,()=>Date.parse(receipt.expiresAt)+1).verifyReceipt(receipt),false);
 pool.revoked.add(receipt.receiptId);await assert.rejects(requireAttestedObservation(row,page,receipt,server.authority),/UNTRUSTED/);
 pool.revoked.clear();pool.fail=true;assert.equal(await server.authority.verifyReceipt(receipt),false);
});
test('denied authorization, HTTP failure, partial/error and conflicting pages issue no receipt',async()=>{
 for(const options of [{denied:true},{status:401},{envelope:{completeness:'PARTIAL',errors:[{code:'partial',message:'partial',retryable:false}]}},{envelope:{errors:[{code:'error',message:'error',retryable:false}]}},{records:[record(),record({value:{status:'conflict'}})]},{records:[record(),record()]}]){
  const pool=unitPool(),server=composition(pool,options),page=await server.reader.read(request());assert.equal(page.completeness,'PARTIAL');assert.equal(pool.receipts.size,0);await assert.rejects(server.attestationFor(page,record()),/UNTRUSTED/);
 }
});
test('conflicting same source identity/version on a later read is rejected atomically',async()=>{
 const {pool}=await observed();const server=composition(pool,{records:[record({value:{status:'conflicting'}})]});
 assert.equal((await server.reader.read(request())).completeness,'PARTIAL');assert.equal(pool.receipts.size,1);
});
test('async authorization cannot let caller mutation redirect the authorized HTTP resource',async()=>{
 const mutable=request(),pool=unitPool();
 const server=composition(pool,{input:{authorization:{assertAuthorized:async scope=>{assert.equal(scope.resourceKind,'lead');mutable.resourceKind='customer';mutable.context.workspaceId=B;}}}});
 const page=await server.reader.read(mutable);assert.equal(page.completeness,'COMPLETE');assert.equal(page.records[0].workspaceId,A);assert.equal(page.records[0].resourceKind,'lead');await server.attestationFor(page,page.records[0]);
});
test('HTTP record carrying caller verification, fact or approval fields is rejected',async()=>{
 for(const claim of [{verification:'VERIFIED'},{truthClass:'FACT'},{authority:{approved:true}}]){
  const pool=unitPool(),server=composition(pool,{records:[record(claim)]});assert.equal((await server.reader.read(request())).completeness,'PARTIAL');assert.equal(pool.receipts.size,0);
 }
});
test('source attestation -> truth validation -> memory -> analysis preserves semantic uncertainty and no effects',async()=>{
 const {server,page,receipt,row}=await observed();await requireAttestedObservation(row,page,receipt,server.authority);
 const context=request().context,ledger=new InMemoryEvidenceLedger(A);await ledger.ingest(context,page,'BUSINESS_OS');
 const fingerprint=await fingerprintOperationalRecord(row);assert.equal(ledger.list(context)[0].verification,'UNVERIFIED');
 const truth={id:'truth:1',workspaceId:A,truthClass:'FACT',sourceSystem:'BUSINESS_OS',ownership:'EXTERNAL_OPERATIONAL',subjectRef:row.reference.externalReference,value:row.value,evidence:[{id:'evidence:1',workspaceId:A,sourceSystem:'BUSINESS_OS',externalReference:row.reference.externalReference,observedAt:row.observedAt,recordedAt:page.fetchedAt,verification:'VERIFIED'}],lineage:[],createdAt:page.fetchedAt};
 assert.equal(validateTruthRecord(truth).ok,false);assert.equal(validateTruthRecord(truth,{isVerifiedEvidence:()=>false,isAuthorizedApproval:()=>false}).ok,false);
 const memory=new InMemoryBusinessMemory(A,ledger);assert.throws(()=>memory.add(context,{key:'lead-status',kind:'FACT',value:row.value,evidenceFingerprints:[fingerprint]}),/FACT_VERIFICATION_GATE/);
 memory.add(context,{key:'lead-status',kind:'ASSUMPTION',value:row.value,evidenceFingerprints:[fingerprint]});
 const analysis=analyzeKnowledge(context,memory,ledger,{asOf:page.fetchedAt,maxEvidenceAgeMs:86_400_000});assert.equal(analysis.insights.length,1);assert.equal(analysis.insights[0].verifiedFact,false);assert.equal(analysis.insights[0].actionable,false);
});
