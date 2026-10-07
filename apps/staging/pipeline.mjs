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
/** Only this server composition accepts infrastructure dependencies, never HTTP JSON.
 * One complete bounded page/resource. Continuation is coverage unavailable, never a guessed total.
 * No caches, polling, operational writes, action ports or reviewer authority exist. */
export async function loadStagingSnapshot({workspaceId,label,authority,tenantPools,env,transport,now=()=>new Date()}){
 const identity=createStagingIdentity(authority,workspaceId,now),context=await identity.authorize();
 const pool=await tenantPools.resolveServerHeldTenantPool(workspaceId);
 if(!pool)throw Error('UNAUTHORIZED_STAGING');
 const server=createAttestedBusinessOsHttpReader({workspaceId,env,receiptPool:pool,
  authorization:{assertAuthorized:async input=>{if(input.actorId!==context.actorId||input.workspaceId!==workspaceId||!RESOURCES.includes(input.resourceKind))throw Error('UNAUTHORIZED_STAGING');await identity.authorize();}},
  dependencies:transport?{fetch:transport}:undefined});
 const ledger=new InMemoryEvidenceLedger(workspaceId,()=>now().toISOString());
 const memory=new InMemoryBusinessMemory(workspaceId,ledger,()=>now().toISOString());
 const storeForWorkspace=createTenantBoundEvidenceStoreFactory(tenantPools);
 const pages=[],attested=[],coverage=[];
 for(const resourceKind of RESOURCES){
  const page=await server.reader.read({context,sourceSystem:'BUSINESS_OS',resourceKind,limit:100});
  if(page.completeness!=='COMPLETE'||page.errors.length)throw Error('STAGING_SOURCE_UNAVAILABLE');
  pages.push(page);
  coverage.push({resource:resourceKind,status:page.nextCursor?'BOUNDED_PARTIAL':page.records.length?'COMPLETE':'EMPTY',count:page.records.length});
  // Receipt validation is mandatory before any durable intake, truth or memory use.
  for(const record of page.records)attested.push({page,record,receipt:await server.attestationFor(page,record)});
  if(page.records.length){
   await identity.authorize();
   const key='staging-v1:'+createHash('sha256').update(JSON.stringify(page.records)).digest('hex');
   await ingestWithTrustedIdentity({...identity,storeForWorkspace,now},{workspaceId,idempotencyKey:key,records:page.records});
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
 for(const {page,record} of attested)await server.attestationFor(page,record);
 if(authority.refreshServerVerification)await authority.refreshServerVerification();
 await identity.authorize();
 return projectStagingSnapshot({label,asOf,coverage,metrics:metrics.insights,analysis,attestedCount:attested.length,
  period:month.toISOString().slice(0,7)+' UTC',entries});
}
