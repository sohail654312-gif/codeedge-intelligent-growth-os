import {InMemorySourceReader} from '../integration/in-memory-source-reader.js';
import {InMemoryEvidenceLedger} from '../evidence/intake.js';
import {InMemoryBusinessMemory} from '../memory/in-memory-business-memory.js';
import {analyzeKnowledge} from '../analysis/evidence-grounded.js';
import {validateTruthRecord} from '../domain/truth/validation.js';
import type {OperationalRecord} from '../integration/contracts.js';
import type {WorkspaceId,CanonicalId} from '../domain/truth/types.js';
export const JOURNEY_VERTICALS=['CLINIC','TRADES'] as const;
export const JOURNEY_MODES=['DEMO','SANDBOX'] as const;
export const JOURNEY_CASES=['STANDARD','CANCELLED','MISSING_HANDOFF'] as const;
type Vertical=typeof JOURNEY_VERTICALS[number];type Mode=typeof JOURNEY_MODES[number];type Scenario=typeof JOURNEY_CASES[number];
const stamp='2026-10-01T12:00:00.000Z';
/** Fixed fictional local projections, never Business OS v1 invoice/call API claims.
 * No connector, provider, finance, approval or effect dependency can be supplied. */
export async function runSyntheticJourney(input:{vertical:Vertical;mode:Mode;scenario:Scenario}){
 if(!input||Object.keys(input).sort().join()!=='mode,scenario,vertical'||!JOURNEY_VERTICALS.includes(input.vertical)||
  !JOURNEY_MODES.includes(input.mode)||!JOURNEY_CASES.includes(input.scenario))throw Error('INVALID_SYNTHETIC_JOURNEY');
 const {vertical,mode,scenario}=structuredClone(input),clinic=vertical==='CLINIC';
 const workspaceId=('workspace:journey-'+vertical+'-'+mode) as WorkspaceId;
 const context={workspaceId,actorId:'synthetic:journey-owner',authorizedAt:stamp};
 const cancelled=scenario==='CANCELLED',missing=scenario==='MISSING_HANDOFF';
 const definitions=[
  {resource:'lead',label:'Lead enquiry',state:'SYNTHETIC_RECEIVED',summary:clinic?'Fictional consultation enquiry':'Fictional inspection enquiry'},
  {resource:'booking',label:'Booking projection',state:cancelled?'CANCELLED_LOCAL':'PROVISIONAL_LOCAL',summary:cancelled?'Local fixture cancelled; no provider booking exists.':'A fictional local slot is provisional; no provider booking was created.'},
  {resource:'invoice_projection',label:'Invoice projection',state:cancelled?'VOID_DRAFT':'DRAFT_ONLY',summary:cancelled?'Draft fixture voided; no credit, invoice or payment issued.':`Illustrative draft: ${clinic?'65':'120'} GBP. No invoice was issued or money moved.`},
  {resource:'call_summary',label:'Call handoff',state:missing?'MISSING_CONTEXT':'NOT_PLACED',summary:missing?'The fixture has no call context. No contact or recording is invented.':'A staff review is proposed. No number, recording, customer message or outbound call exists.'},
 ];
 const records:OperationalRecord[]=definitions.map((d,i)=>({workspaceId,reference:{sourceSystem:'CIGO',externalReference:'synthetic:'+d.resource,version:'synthetic-workflow:v1'},
  resourceKind:d.resource,value:{synthetic:true,label:d.label,state:d.state,summary:d.summary,ordinal:i},observedAt:stamp}));
 const reader=new InMemorySourceReader('CIGO',workspaceId,records,()=>stamp),ledger=new InMemoryEvidenceLedger(workspaceId,()=>stamp);
 for(const d of definitions){const page=await reader.read({context,sourceSystem:'CIGO',resourceKind:d.resource,limit:10});
  if(page.completeness!=='COMPLETE'||page.errors.length||page.records.length!==1||page.nextCursor)throw Error('SYNTHETIC_JOURNEY_READ_FAILED');
  const intake=await ledger.ingest(context,page,'CIGO');if(intake.accepted.length!==1||intake.errors.length)throw Error('SYNTHETIC_JOURNEY_INTAKE_FAILED');
 }
 const entries=ledger.list(context),memory=new InMemoryBusinessMemory(workspaceId,ledger,()=>stamp);
 for(const [i,d]of definitions.entries())memory.add(context,{key:d.label,kind:'ASSUMPTION',value:d.summary,evidenceFingerprints:[entries[i].fingerprint]});
 const analysis=analyzeKnowledge(context,memory,ledger,{asOf:stamp,maxEvidenceAgeMs:86400000});
 const truth=validateTruthRecord({id:'synthetic:journey' as CanonicalId,workspaceId,truthClass:'ANALYSIS',sourceSystem:'CIGO',ownership:'CIGO_OWNED',subjectRef:'synthetic:journey',value:'Local non-actionable workflow',
  evidence:entries.map(e=>({id:e.fingerprint as CanonicalId,workspaceId,sourceSystem:'CIGO',externalReference:e.observation.externalReference,observedAt:stamp,recordedAt:stamp,verification:'UNVERIFIED'})),lineage:[],createdAt:stamp});
 if(!truth.ok||analysis.insights.some(i=>i.actionable||i.verifiedFact))throw Error('UNSAFE_SYNTHETIC_JOURNEY');
 // Public DTO allowlist: no identities, private records, receipts or infrastructure.
 return {kind:'SYNTHETIC_WORKFLOW_JOURNEY' as const,vertical,mode,scenario,synthetic:true,asOf:stamp,
  title:clinic?'Fictional clinic journey':'Fictional trades journey',sourceContract:'cigo-synthetic-workflow:v1',
  stages:definitions.map(d=>({label:d.label,state:d.state,observation:d.summary,evidence:'UNVERIFIED',actionable:false})),
  handoff:{status:cancelled?'CANCELLED':missing?'UNAVAILABLE':'PROPOSED_ONLY',summary:cancelled?'Review cancellation locally.':missing?'Gather missing context before making a proposal.':'Owner may review the linked fictional observations.',approved:false,executable:false},
  memory:analysis.insights.map(i=>({kind:i.sourceKind,observation:String(i.observation),confidence:i.confidence,verifiedFact:false,actionable:false})),
  evidenceCount:entries.length,verifiedFact:false,actionable:false,providerCalls:0,financialEffects:0,performedEffects:0};
}
