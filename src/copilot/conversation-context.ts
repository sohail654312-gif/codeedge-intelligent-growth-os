import type {AuthorizedWorkspaceContext} from "../integration/contracts.js";
import type {ReadOnlyCopilotResponse} from "./review-handoff.js";
const valid=(v:unknown):v is string=>typeof v==="string"&&v.trim().length>0&&v.length<=2000;
/** Caller-provided bounded context is NOT authenticated conversation history. */
export function summarizeCopilotConversation(context:AuthorizedWorkspaceContext,turns:readonly ReadOnlyCopilotResponse[]){
 if(!context||!valid(context.workspaceId)||!Array.isArray(turns)||turns.length<1||turns.length>10)throw Error("INVALID_COPILOT_CONTEXT");
 const ids=new Set<string>(),fingerprints=new Set<string>(),uncertainty=new Set<string>();let proposalId="",planId="";
 for(const t of turns){
 if(!t||t.workspaceId!==context.workspaceId)throw Error("UNAUTHORIZED_COPILOT_CONTEXT");
 if(t.kind!=="COPILOT_READ_ONLY_RESPONSE"||!valid(t.questionId)||ids.has(t.questionId)||!valid(t.proposalId)||!valid(t.planId)||t.approved!==false||t.actionable!==false||t.executable!==false||t.verifiedFact!==false||t.reviewStatus!=="HUMAN_REVIEW_REQUIRED"||!Array.isArray(t.toolCalls)||t.toolCalls.length!==0||!Array.isArray(t.evidenceFingerprints)||t.evidenceFingerprints.length<1||t.evidenceFingerprints.length>100||t.evidenceFingerprints.some(fp=>!valid(fp))||new Set(t.evidenceFingerprints).size!==t.evidenceFingerprints.length||!Array.isArray(t.uncertainty)||!t.uncertainty.includes("SOURCE_UNVERIFIED")||t.uncertainty.length>100||t.uncertainty.some(u=>!valid(u))||!Array.isArray(t.sections)||t.sections.length!==4||t.sections.some(s=>!s||!valid(s.content)||s.verifiedFact!==false||!Array.isArray(s.evidenceFingerprints)||s.evidenceFingerprints.length!==t.evidenceFingerprints.length||!s.evidenceFingerprints.every(fp=>t.evidenceFingerprints.includes(fp))))throw Error("UNSAFE_COPILOT_CONTEXT");
 if(proposalId&&(proposalId!==t.proposalId||planId!==t.planId))throw Error("MIXED_COPILOT_LINEAGE");
 proposalId=t.proposalId;planId=t.planId;ids.add(t.questionId);t.evidenceFingerprints.forEach(fp=>fingerprints.add(fp));t.uncertainty.forEach(u=>uncertainty.add(u));
 }
 return structuredClone({kind:"COPILOT_READ_ONLY_CONTEXT",workspaceId:context.workspaceId,proposalId,planId,questionIds:[...ids],evidenceFingerprints:[...fingerprints],uncertainty:[...uncertainty,"CONVERSATION_NOT_AUTHENTICATED"],status:"UNVERIFIED_CONTEXT",approved:false,actionable:false,executable:false,verifiedFact:false,toolCalls:[]});
}
