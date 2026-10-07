// Build-time presentation composition. No live adapter, credentials, receipts or effect APIs.
import {analyzeBusinessMetrics} from '../../dist/src/analysis/business-metrics.js';
import {analyzeCrossDomain} from '../../dist/src/analysis/cross-domain.js';
import {proposeRecommendation} from '../../dist/src/recommendation/proposal.js';
import {evaluateRecommendation} from '../../dist/src/recommendation/evaluation.js';
import {prepareDecisionReview} from '../../dist/src/recommendation/decision-review.js';
import {InMemoryEvidenceLedger} from '../../dist/src/evidence/intake.js';
import {InMemoryBusinessMemory} from '../../dist/src/memory/in-memory-business-memory.js';
import {queryBusinessKnowledge} from '../../dist/src/memory/knowledge-view.js';
import {analyzeKnowledge} from '../../dist/src/analysis/evidence-grounded.js';

export const SNAPSHOT='2026-10-07T12:00:00.000Z';
export const SCENARIOS=Object.freeze(['balanced','capacity','limited']);
const context={workspaceId:'workspace:codeedge-preview',actorId:'server:synthetic-demo',authorizedAt:SNAPSHOT};
const definitions=[
 ['LEADS','leads-created','Lead intelligence','Leads received','lead','COUNT',148],
 ['CONVERSION','lead-conversion','Conversion intelligence','Lead conversion','lead','COUNT',42,148],
 ['APPOINTMENTS','appointment-attendance-rate','Appointment intelligence','Appointment attendance','booking','COUNT',63,72],
 ['MISSED_ENQUIRIES','missed-enquiries','Communication intelligence','Unanswered enquiries','inbox_summary','COUNT',12],
 ['REVENUE_COST','revenue-gross','Revenue / cost intelligence','Recorded revenue','finance_summary','MINOR_CURRENCY_UNITS',1840000],
 ['MARKETING','marketing-spend','Marketing outcomes','Recorded marketing spend','demo_marketing_projection','MINOR_CURRENCY_UNITS',125000],
 ['RETENTION','customer-retention','Customer retention','Returning customers','customer','COUNT',46,64],
 ['CAPACITY','available-slots','Capacity intelligence','Available slots','demo_capacity_projection','COUNT',18],
];
const explanations={
 LEADS:['148 enquiries appear in the seeded reporting window.','A consistent definition gives the team a useful starting point for reviewing demand.','Review qualification criteria before comparing channels.','Lead quality and lead source attribution are not established.'],
 CONVERSION:['42 of 148 eligible seeded leads converted.','Reviewing the cohort can identify questions about follow-up and service fit.','Compare follow-up timing for the same cohort.','No causal relationship between follow-up and conversion is established.'],
 APPOINTMENTS:['63 of 72 seeded appointments were attended.','Attendance affects how available time translates into completed appointments.','Review cancellation reasons before considering a reminder change.','Cancellation reasons and customer preferences are missing.'],
 MISSED_ENQUIRIES:['12 seeded enquiries have no answer recorded.','Unanswered enquiries may represent an opportunity for a staff-led review.','Check business-hour coverage and consent before proposing follow-up.','Delivery outcomes, consent and enquiry urgency are not established.'],
 REVENUE_COST:['The seed records £18,400 in gross revenue.','Gross revenue alone does not establish profit or cash position.','Reconcile revenue with an independently verified ledger.','Costs, cash collection and external ledger reconciliation are missing.'],
 MARKETING:['The illustrative projection contains £1,250 in marketing spend.','Spend should be reviewed alongside attribution and eligible outcomes.','Gather campaign attribution before estimating return on spend.','This is a demo projection, not a live Business OS marketing endpoint.'],
 RETENTION:['46 of 64 eligible seeded customers returned.','Cohort consistency matters when reviewing repeat business.','Review comparable cohorts before considering a retention program.','Customer identities, churn causes and consent are not included.'],
 CAPACITY:['The illustrative projection contains 18 available slots.','Demand and capacity can be compared without assuming causation.','Confirm staffing and schedule availability before considering promotion.','This is a demo projection; staffing and actual schedule constraints are unverified.'],
};

// Explicit presentation allowlist: raw records, fingerprints, receipts, identities and connection config stay server-side.
export function projectMetric(insight,definition){
 if(insight.verifiedFact!==false||insight.actionable!==false||insight.domain!==definition[0]||insight.metricKey!==definition[1])throw Error('UNSAFE_PREVIEW_METRIC');
 const copy=explanations[insight.domain];
 return {id:insight.domain,title:definition[2],label:definition[3],unit:insight.unit,currency:insight.currency??null,
  value:insight.value,numerator:insight.numerator,denominator:insight.denominator??null,status:insight.status,
  limitations:[...insight.limitations],verifiedFact:false,actionable:false,confidence:'INSUFFICIENT',
  observation:`The synthetic seed records ${insight.currency?new Intl.NumberFormat('en-GB',{style:'currency',currency:insight.currency,maximumFractionDigits:0}).format(insight.numerator/100):insight.numerator}${insight.denominator===undefined?'':` of ${insight.denominator} eligible observations`} for ${definition[3].toLowerCase()}.`,why:copy[1],consideration:copy[2],missing:copy[3],
  source:definition[4].startsWith('demo_')?'Illustrative demo projection':'Synthetic Business OS-shaped seed',
  sourceResource:definition[4],evidenceId:'DEMO-'+insight.domain,verification:'UNVERIFIED',
  assumptions:['The seeded cohort is illustrative and contains no real customer data.','Source authenticity and semantic truth are not established by demo transport.']};
}

export async function createDemoSnapshot(scenario='balanced'){
 if(!SCENARIOS.includes(scenario))throw Error('INVALID_DEMO_SCENARIO');
 const values=scenario==='capacity'?[176,49,70,19,2060000,160000,52,5]:definitions.map(d=>d[6]);
 const denominators=scenario==='capacity'?{CONVERSION:176,APPOINTMENTS:80,RETENTION:72}:{};
 const ledger=new InMemoryEvidenceLedger(context.workspaceId,()=>SNAPSHOT);
 const records=definitions.map((d,i)=>({workspaceId:context.workspaceId,reference:{sourceSystem:'BUSINESS_OS',externalReference:'synthetic:'+d[0],version:'demo:v1'},
  resourceKind:d[4],value:{synthetic:true,metric:d[1],numerator:values[i],...(d[7]===undefined?{}:{denominator:denominators[d[0]]??d[7]})},
  observedAt:scenario==='limited'&&i>=4?'2026-09-20T12:00:00.000Z':SNAPSHOT}));
 const contextRecords=['business_profile','service','crm_activity'].map(kind=>({workspaceId:context.workspaceId,reference:{sourceSystem:'BUSINESS_OS',externalReference:'synthetic:context:'+kind,version:'demo:v1'},resourceKind:kind,value:{synthetic:true,summary:'Fictional business context only'},observedAt:SNAPSHOT}));
 await ledger.ingest(context,{records:[...records,...contextRecords],fetchedAt:SNAPSHOT,completeness:'COMPLETE',errors:[]},'BUSINESS_OS');
 const entries=ledger.list(context);
 const projections=definitions.map((d,i)=>({workspaceId:context.workspaceId,domain:d[0],metricKey:d[1],metricDefinitionVersion:'v1',sourceContractVersion:'business-os-read-model:v1',
  windowTimezone:'UTC',periodStart:'2026-09-01T00:00:00.000Z',periodEnd:'2026-10-01T00:00:00.000Z',observedAt:records[i].observedAt,
  unit:d[5],...(d[5]==='COUNT'?{}:{currency:'GBP'}),numerator:values[i],...(d[7]===undefined?{}:{denominator:denominators[d[0]]??d[7]}),
  evidenceFingerprints:[entries[i].fingerprint],coverage:scenario==='limited'&&i===3?'PARTIAL':'COMPLETE',verification:'UNVERIFIED'}));
 const request={asOf:SNAPSHOT,maxEvidenceAgeMs:86400000};
 const metrics=analyzeBusinessMetrics(context,projections,request);
 const comparison=analyzeCrossDomain(context,projections,{...request,domains:definitions.map(d=>d[0])});
 const candidates=[
  {title:'Review unanswered enquiries',rationale:'The seed contains unanswered enquiries alongside new lead demand. A staff-led review could clarify coverage gaps.',assumptions:['Consent and staff availability need independent confirmation.'],next:'Review the unanswered cohort with an owner before deciding whether a workflow change is appropriate.'},
  {title:scenario==='capacity'?'Review demand against limited capacity':'Review appointment capacity',rationale:'Demand and available slots can be compared, but this does not establish that more promotion would improve outcomes.',assumptions:['Actual staffing and bookable availability are unverified.'],next:'Confirm the schedule before considering promotion or reallocating staff time.'},
 ];
 const recommendations=comparison.status==='AVAILABLE'?candidates.map((candidate,i)=>{
  const proposal=proposeRecommendation(context,comparison,{proposalId:'demo-proposal-'+i,asOf:SNAPSHOT,title:candidate.title,rationale:candidate.rationale,assumptions:candidate.assumptions,
   alternatives:[{id:'review',description:'Review the evidence with the business owner',tradeOffs:['Requires owner time']},{id:'observe',description:'Gather additional observations first',tradeOffs:['Defers the decision']}],supportingEvidenceFingerprints:comparison.evidenceFingerprints});
  const evaluation=evaluateRecommendation(context,comparison,proposal,{review:['Owner availability'],observe:['Comparable cohort and complete coverage']});
  const packet=prepareDecisionReview(context,evaluation,{recordId:'demo-review-'+i,asOf:SNAPSHOT,expiresAt:'2026-10-08T12:00:00.000Z',purpose:'Illustrative owner review only',reviewerRoleRequired:'OWNER'});
  return {id:proposal.proposalId,title:proposal.title,rationale:proposal.rationale,assumptions:[...proposal.assumptions],confidence:proposal.confidence,status:proposal.status,
   approved:proposal.approved,actionable:proposal.actionable,verifiedFact:proposal.verifiedFact,authority:packet.authority,executable:packet.executable,
   reviewStatus:packet.reviewStatus,alternatives:evaluation.alternatives.map(a=>({description:a.description,tradeOffs:a.tradeOffs,dependencies:a.dependencies})),
   uncertainty:['Source observations are synthetic and unverified.','Candidate rationale is not semantically verified.','No causal inference is established.'],consideration:candidate.next,evidenceIds:definitions.map(d=>'DEMO-'+d[0])};
 }):[];
 const memory=new InMemoryBusinessMemory(context.workspaceId,ledger,()=>SNAPSHOT);
 ['The demo business may benefit from reviewing enquiry coverage.','Capacity should be confirmed before considering more promotion.','Gross revenue does not establish profit or available cash.'].forEach((text,i)=>memory.add(context,{key:['Enquiry coverage','Capacity planning','Finance interpretation'][i],kind:'ASSUMPTION',value:text,evidenceFingerprints:[entries[[3,7,4][i]].fingerprint]}));
 const knowledge=queryBusinessKnowledge(context,memory,ledger,{...request,view:'CURRENT'});
 const analysis=analyzeKnowledge(context,memory,ledger,request);
 return {scenario,mode:'SYNTHETIC_DEMO',businessName:'Northstar Care',businessDescription:'Fictional appointment-led business',snapshotAt:SNAPSHOT,period:'September 2026',
  connection:{status:'DEMO_CONNECTED',lastObservation:SNAPSHOT,freshness:scenario==='limited'?'PARTIAL_STALE':'AT_DEMO_SNAPSHOT',
   evidenceStatus:'UNVERIFIED',provenanceStatus:'SYNTHETIC_NOT_ATTESTED',liveConnection:false,
   resources:['business_profile','service','lead','customer','crm_activity','booking','inbox_summary','finance_summary']},
  metrics:metrics.insights.map((x,i)=>projectMetric(x,definitions[i])),recommendations,
  memory:knowledge.items.map((x,i)=>({title:x.memory.key,kind:x.memory.kind,status:x.memory.status,observation:analysis.insights[i].observation,
   confidence:analysis.insights[i].confidence,actionable:analysis.insights[i].actionable,evidenceId:'DEMO-'+definitions[[3,7,4][i]][0],freshness:x.evidence[0].freshness})),
  confidence:comparison.confidence,sourceCoverage:comparison.sourceCoverage,verifiedFact:false,actionable:false,
  safety:{providerCalls:0,productionConnections:0,performedEffects:0,executionEnabled:false}};
}
