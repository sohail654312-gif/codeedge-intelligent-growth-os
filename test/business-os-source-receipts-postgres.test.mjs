import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {createPostgresSourceAuthority} from '../dist/src/integration/attested-business-os-reader.js';
import {requireAttestedObservation} from '../dist/src/evidence/source-attestation.js';
import {A,B,composition,record,request} from './source-receipt-fixture.mjs';
const url=process.env.CIGO_R4_DISPOSABLE_DATABASE_URL;
const enabled=process.env.CIGO_R4_DISPOSABLE_TEST_CONFIRM==='I_CONFIRM_DISPOSABLE_ONLY'&&!!url;
if(process.env.CIGO_R4_REQUIRE_POSTGRES_TESTS==='true'&&!enabled)throw Error('R4_POSTGRES_TESTS_REQUIRED_NOT_SKIPPED');
if(enabled){const u=new URL(url);if(u.pathname!=='/cigo_r4_disposable_ci'||!['localhost','127.0.0.1','[::1]'].includes(u.hostname)||u.username!=='cigo_r4_app')throw Error('R4_DISPOSABLE_DATABASE_IDENTITY_MISMATCH');}
const skip=!enabled&&'Explicit disposable PostgreSQL required';
function poolFor(user,password){const u=new URL(url);u.username=user;u.password=password;return new pg.Pool({connectionString:u.toString(),max:3});}
test('actual PostgreSQL receipts: durable restart, exact page binding, RLS, verifier least privilege and conflict rollback',{skip},async()=>{
 const issuer=poolFor('cigo_source_issuer_a','source_issuer_a_ephemeral_only'),verifier=poolFor('cigo_source_verifier_a','source_verifier_a_ephemeral_only'),foreign=poolFor('cigo_source_verifier_b','source_verifier_b_ephemeral_only');
 try {
  const server=composition(issuer),page=await server.reader.read(request());assert.equal(page.completeness,'COMPLETE');const receipt=await server.attestationFor(page,page.records[0]);
  const restarted=createPostgresSourceAuthority(verifier,A);assert.equal(await restarted.verifyReceipt(receipt),true);await requireAttestedObservation(page.records[0],page,receipt,restarted);
  for(const key of ['workspaceId','sourceSystem','externalReference','fingerprint','fetchedAt','adapterId','receiptId','pageFingerprint','expiresAt'])assert.equal(await restarted.verifyReceipt({...receipt,[key]:key==='receiptId'?crypto.randomUUID():'forged'}),false,key);
  assert.equal(await createPostgresSourceAuthority(foreign,B).verifyReceipt(receipt),false);assert.equal((await foreign.query('SELECT * FROM cigo.source_receipts')).rows.length,0);
  await assert.rejects(verifier.query('INSERT INTO cigo.source_receipts(workspace_id,receipt_id,attestation,expires_at) VALUES($1,$2,$3,$4)',[A,crypto.randomUUID(),receipt,receipt.expiresAt]),/permission denied/);
  await assert.rejects(issuer.query('UPDATE cigo.source_receipts SET expires_at=now()'),/permission denied/);
  await assert.rejects(issuer.query('DELETE FROM cigo.source_receipts'),/permission denied/);
  await assert.rejects(issuer.query('TRUNCATE cigo.source_receipts'),/permission denied/);
  await assert.rejects(issuer.query('INSERT INTO cigo.source_receipts(workspace_id,receipt_id,attestation,expires_at) VALUES($1,$2,$3,$4)',[B,crypto.randomUUID(),{...receipt,workspaceId:B},receipt.expiresAt]),/row-level security|check constraint/);
  const before=Number((await issuer.query('SELECT count(*) AS n FROM cigo.source_receipts')).rows[0].n);
  const conflict=composition(issuer,{records:[record({reference:{sourceSystem:'BUSINESS_OS',externalReference:'lead:new-before-conflict',version:'1'}}),record({value:{status:'changed'}})]});
  assert.equal((await conflict.reader.read(request())).completeness,'PARTIAL');assert.equal(Number((await issuer.query('SELECT count(*) AS n FROM cigo.source_receipts')).rows[0].n),before);
  assert.equal((await issuer.query("SELECT * FROM cigo.source_observation_identities WHERE external_reference='lead:new-before-conflict'")).rows.length,0);
 }finally{await Promise.all([issuer.end(),verifier.end(),foreign.end()]);}
});
test('actual PostgreSQL receipt revocation and expiry are server-owned and fail closed',{skip},async()=>{
 const issuer=poolFor('cigo_source_issuer_a','source_issuer_a_ephemeral_only');const admin=new pg.Pool({host:process.env.PGHOST??'localhost',port:Number(process.env.PGPORT??5432),database:'cigo_r4_disposable_ci',user:process.env.PGUSER??'postgres',password:process.env.PGPASSWORD,max:1});
 try {
  const server=composition(issuer,{records:[record({reference:{sourceSystem:'BUSINESS_OS',externalReference:'lead:revoked',version:'1'}})]}),page=await server.reader.read(request()),receipt=await server.attestationFor(page,page.records[0]);
  await assert.rejects(issuer.query('INSERT INTO cigo.source_receipt_revocations(workspace_id,receipt_id) VALUES($1,$2)',[A,receipt.receiptId]),/permission denied/);
  await admin.query('INSERT INTO cigo.source_receipt_revocations(workspace_id,receipt_id) VALUES($1,$2)',[A,receipt.receiptId]);
  assert.equal(await server.authority.verifyReceipt(receipt),false);await assert.rejects(requireAttestedObservation(page.records[0],page,receipt,server.authority),/UNTRUSTED/);
  const short=composition(issuer,{input:{receiptTtlMs:1000},records:[record({reference:{sourceSystem:'BUSINESS_OS',externalReference:'lead:expires',version:'1'}})]});const shortPage=await short.reader.read(request()),expired=await short.attestationFor(shortPage,shortPage.records[0]);
  await new Promise(resolve=>setTimeout(resolve,1100));assert.equal(await short.authority.verifyReceipt(expired),false);
 }finally{await issuer.end();await admin.end();}
});
