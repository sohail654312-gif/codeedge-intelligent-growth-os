const definitions=[['LEADS','Lead intelligence','Leads received','lead'],['CONVERSION','Conversion intelligence','Lead conversion','lead'],
 ['APPOINTMENTS','Appointment intelligence','Appointment attendance','booking'],['MISSED_ENQUIRIES','Communication intelligence','Unanswered enquiries','inbox_summary'],
 ['REVENUE_COST','Revenue / cost intelligence','Recorded revenue','finance_summary'],['MARKETING','Marketing outcomes','Recorded marketing spend','marketing'],
 ['RETENTION','Customer retention','Returning customers','customer'],['CAPACITY','Capacity intelligence','Available slots','capacity']];
/** Explicit projection, no object spreading of records/receipts/claims/analysis internals.
 * Source provenance VERIFIED is a distinct field; semantic evidence never promoted. */
export function projectStagingSnapshot({label,asOf,coverage,metrics,analysis,attestedCount,period,entries}){
 if(analysis.actionable===true||analysis.insights.some(i=>i.actionable!==false||i.verifiedFact!==false))throw Error('UNSAFE_STAGING_DTO');
 const safeMetrics=definitions.map(([id,title,metricLabel,resource])=>{
  const insight=metrics.find(m=>m.domain===id),available=insight?.status==='AVAILABLE';
  if(insight&&(insight.actionable!==false||insight.verifiedFact!==false))throw Error('UNSAFE_STAGING_DTO');
  return {id,title,label:metricLabel,unit:'COUNT',currency:null,value:available?insight.value:null,
   numerator:available?insight.numerator:null,denominator:null,status:available?'AVAILABLE':'UNAVAILABLE',
   limitations:available?[...insight.limitations]:['MISSING_OR_STALE_SEMANTIC_COVERAGE'],verifiedFact:false,actionable:false,confidence:'INSUFFICIENT',
   observation:available?`${insight.numerator} leads created in the current UTC month appear in the complete bounded source projection.`:'The read contract does not establish a complete, fresh eligible measure.',
   why:'A source observation supports review; business meaning requires independent confirmation.',consideration:'Review source coverage and eligible definitions with the workspace owner.',
   missing:available?'Lead quality, attribution and causal explanations are missing.':'A complete eligible reporting cohort or supported aggregate is missing.',
   source:'Business OS staging read model',sourceResource:resource,evidenceId:'READ-'+id,verification:'UNVERIFIED',
   provenance:available?'VERIFIED_SOURCE':'NOT_ESTABLISHED',assumptions:['Only synthetic staging workspaces are enabled.','Authenticated source provenance does not establish semantic FACT truth.']};
 });
 const fresh=entries.every(e=>Date.parse(asOf)-Date.parse(e.observation.observedAt)<=86400000&&Date.parse(e.observation.observedAt)<=Date.parse(asOf));
 return {mode:'AUTHENTICATED_STAGING',businessName:label,businessDescription:'Synthetic staging workspace',snapshotAt:asOf,period,
  connection:{status:'CONNECTED',lastObservation:asOf,freshness:entries.length?(fresh?'FRESH':'STALE'):'NO_OBSERVATIONS',evidenceStatus:'UNVERIFIED',
   provenanceStatus:attestedCount?'VERIFIED_SOURCE':'NO_RECORD_ATTESTATION',liveConnection:true,
   resources:coverage.map(c=>c.resource),coverage:coverage.map(c=>({resource:c.resource,status:c.status,count:c.count})),attestedCount,
   analysisFreshness:asOf,workspaceStatus:'AUTHORIZED'},metrics:safeMetrics,recommendations:[],
  memory:analysis.insights.map(i=>({title:i.memoryKey.replaceAll('_',' '),kind:i.sourceKind,status:'UNVERIFIED',
   observation:String(i.observation),confidence:i.confidence,actionable:false,evidenceId:'READ-'+(definitions.find(d=>d[3]===i.memoryKey)?.[0]??'LEADS'),freshness:fresh?'FRESH':'STALE'})),
  confidence:'INSUFFICIENT',sourceCoverage:'UNVERIFIED',verifiedFact:false,actionable:false,
  safety:{providerCalls:0,productionConnections:0,performedEffects:0,executionEnabled:false}};
}
