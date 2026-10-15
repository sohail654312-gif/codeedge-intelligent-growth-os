import {createAttestedBusinessOsHttpReader} from '../../dist/src/integration/attested-business-os-reader.js';
import {createStagingIdentity} from '../../dist/src/staging/session.js';
import {createTenantBoundEvidenceStoreFactory} from '../../dist/src/evidence/tenant-bound-postgres.js';
import {ingestWithTrustedIdentity} from '../../dist/src/evidence/trusted-durable-intake.js';
import {InMemoryEvidenceLedger} from '../../dist/src/evidence/intake.js';
import {InMemoryBusinessMemory} from '../../dist/src/memory/in-memory-business-memory.js';
import {analyzeKnowledge} from '../../dist/src/analysis/evidence-grounded.js';
import {analyzeBusinessMetrics} from '../../dist/src/analysis/business-metrics.js';
import {validateTruthRecord} from '../../dist/src/domain/truth/validation.js';
import {createHash} from 'node:crypto';
import {projectStagingSnapshot} from './presentation.mjs';

export const RESOURCES=Object.freeze(['business_profile','service','lead','customer','crm_activity','booking','inbox_summary','finance_summary']);
function atStage(error,stage,resource){
 // Preserve the fail-closed reason, but attach only fixed server-owned context
 // for the log marker. No raw exception data is ever emitted by the HTTP layer.
 const result=error instanceof Error?error:Error('STAGING_SOURCE_UNAVAILABLE');
 Object.defineProperties(result,{stagingStage:{value:stage},stagingResource:{value:resource}});
 return result;
}
/** Only this server composition accepts infrastructure dependencies, never HTTP JSON.
 * One complete bounded page/resource. Continuation is coverage unavailable, never a guessed total.
 * No caches, polling, operational writes, action ports or reviewer authority exist. */
export async function loadStagingSnapshot({workspaceId,label,authority,tenantPools,env,transport,now=()=>new Date()}){
 const identity=createStagingIdentity(authority,workspaceId,now),context=await identity.authorize();
 let pool;
 try{pool=await tenantPools.resolveServerHeldTenantPool(workspaceId);}catch(error){throw atStage(error,'TENANT_POOL','none');}
 if(!pool)throw Error('UNAUTHORIZED_STAGING');
 let server;
 try{server=createAttestedBusinessOsHttpReader({workspaceId,env,receiptPool:pool,
  authorization:{assertAuthorized:async input=>{if(input.actorId!==context.actorId||input.workspaceId!==workspaceId||!RESOURCES.includes(input.resourceKind))throw Error('UNAUTHORIZED_STAGING');await identity.authorize();}},
  dependencies:transport?{fetch:transport}:undefined});}
 catch(error){throw atStage(error,'SERVER_CONFIGURATION','none');}
 const ledger=new InMemoryEvidenceLedger(workspaceId,()=>now().toISOString());
 const memory=new InMemoryBusinessMemory(workspaceId,ledger,()=>now().toISOString());
 const storeForWorkspace=createTenantBoundEvidenceStoreFactory(tenantPools);
 const pages=[],attested=[],coverage=[];
 for(const resourceKind of RESOURCES){
  let page;
  try{page=await server.reader.read({context,sourceSystem:'BUSINESS_OS',resourceKind,limit:100});}
  catch(error){throw atStage(error,'SOURCE_READ',resourceKind);}
  if(page.completeness!=='COMPLETE'||page.errors.length)throw atStage(Error('STAGING_SOURCE_UNAVAILABLE'),'SOURCE_READ',resourceKind);
  pages.push(page);
  coverage.push({resource:resourceKind,status:page.nextCursor?'BOUNDED_PARTIAL':page.records.length?'COMPLETE':'EMPTY',count:page.records.length});
  // Receipt validation is mandatory before any durable intake, truth or memory use.
  for(const record of page.records){
   try{attested.push({page,record,receipt:await server.attestationFor(page,record)});}
   catch(error){throw atStage(error,'SOURCE_RECEIPT',resourceKind);}
  }
  if(page.records.length){
   await identity.authorize();
   const key='staging-v1:'+createHash('sha256').update(JSON.stringify(page.records)).digest('hex');
   try{await ingestWithTrustedIdentity({...identity,storeForWorkspace,now},{workspaceId,idempotencyKey:key,records:page.records});}
   catch(error){throw atStage(error,'DURABLE_INTAKE',resourceKind);}
   const report=await ledger.ingest(context,page,'BUSINESS_OS');if(report.errors.length)throw Error('STAGING_EVIDENCE_UNAVAILABLE');
  }
 }
 const entries=ledger.list(context),asOf=now().toISOString();
 for(const resourceKind of RESOURCES){
  const evidence=entries.filter(e=>e.observation.resourceKind===resourceKind);
  if(!evidence.length)continue;
  const observation=`${evidence.length} ${resourceKind.replaceAll('_',' ')} observations passed durable source and intake checks. Business interpretation remains unverified.`;
  const truth={id:'staging:'+resourceKind,workspaceId,truthClass:'ANALYSIS',sourceSystem:'CIGO',ownership:'CIGO_OWNED',subjectRef:resourceKind,value:observation,
   evidence:evidence.map(e=>({id:e.fingerprint,workspaceId,sourceSystem:'BUSINESS_OS',externalReference:e.observation.externalReference,
    observedAt:e.observation.observedAt,recordedAt:asOf,verification:'UNVERIFIED'})),lineage:[],createdAt:asOf};
  if(!validateTruthRecord(truth).ok)throw Error('STAGING_TRUTH_UNAVAILABLE');
  memory.add(context,{key:resourceKind,kind:'ANALYSIS',value:observation,evidenceFingerprints:evidence.map(e=>e.fingerprint)});
 }
 const analysis=analyzeKnowledge(context,memory,ledger,{asOf,maxEvidenceAgeMs:86400000,limit:100});
 const leadPage=pages[RESOURCES.indexOf('lead')],leadEvidence=entries.filter(e=>e.observation.resourceKind==='lead');
 const month=new Date(asOf);month.setUTCDate(1);month.setUTCHours(0,0,0,0);const end=new Date(month);end.setUTCMonth(end.getUTCMonth()+1);
 const eligible=leadPage.records.filter(r=>Number.isFinite(Date.parse(r.value?.createdAt))&&Date.parse(r.value.createdAt)>=month.getTime()&&Date.parse(r.value.createdAt)<=Date.parse(asOf));
 const metricInputs=leadEvidence.length&&leadPage.records.every(r=>Number.isFinite(Date.parse(r.value?.createdAt))&&Date.parse(r.value.createdAt)<=Date.parse(asOf)&&
  Date.parse(r.observedAt)<=Date.parse(asOf)&&Date.parse(asOf)-Date.parse(r.observedAt)<=86400000)?[{
  workspaceId,domain:'LEADS',metricKey:'leads-created',metricDefinitionVersion:'v1',sourceContractVersion:'business-os-read-model:v1',windowTimezone:'UTC',
  periodStart:month.toISOString(),periodEnd:end.toISOString(),observedAt:leadEvidence.map(e=>e.observation.observedAt).sort()[0],
  unit:'COUNT',numerator:eligible.length,evidenceFingerprints:leadEvidence.map(e=>e.fingerprint),coverage:leadPage.nextCursor?'PARTIAL':'COMPLETE',verification:'UNVERIFIED'}]:[];
 const metrics=analyzeBusinessMetrics(context,metricInputs,{asOf,maxEvidenceAgeMs:86400000});
 // Re-read durable revocations/expiry after analysis; then reverify provider + membership.
 for(const {page,record} of attested){
  try{await server.attestationFor(page,record);}
  catch(error){throw atStage(error,'SOURCE_RECEIPT',record.resourceKind);}
 }
 try{
  if(authority.refreshServerVerification)await authority.refreshServerVerification();
  await identity.authorize();
 }catch(error){throw atStage(error,'SESSION_RECHECK','none');}
 return projectStagingSnapshot({label,asOf,coverage,metrics:metrics.insights,analysis,attestedCount:attested.length,
  period:month.toISOString().slice(0,7)+' UTC',entries});
}
