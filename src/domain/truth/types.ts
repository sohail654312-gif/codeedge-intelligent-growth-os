export type WorkspaceId = string & { readonly __brand: "WorkspaceId" };
export type CanonicalId = string & { readonly __brand: "CanonicalId" };
export type TruthClass = "FACT"|"ASSUMPTION"|"ANALYSIS"|"PREDICTION"|"RECOMMENDATION"|"DECISION"|"ACTION";
export type SourceSystem = "CIGO"|"BUSINESS_OS"|"MVP"|"HUMAN"|"EXTERNAL";
export type Ownership = "CIGO_OWNED"|"EXTERNAL_OPERATIONAL";
export type VerificationStatus = "VERIFIED"|"UNVERIFIED"|"DISPUTED";
export interface Evidence { id:CanonicalId; workspaceId:WorkspaceId; sourceSystem:SourceSystem; externalReference:string; observedAt:string; recordedAt:string; verification:VerificationStatus }
export interface Authority { actorId:string; actorType:"HUMAN"|"POLICY"|"SYSTEM"; approved:boolean; approvedAt?:string; evidenceReference:string }
export interface LineageLink { recordId:CanonicalId; workspaceId:WorkspaceId }
export interface TruthRecord { id:CanonicalId; workspaceId:WorkspaceId; truthClass:TruthClass; sourceSystem:SourceSystem; ownership:Ownership; subjectRef:string; value:unknown; evidence:Evidence[]; lineage:LineageLink[]; confidence?:number; authority?:Authority; supersedes?:CanonicalId; createdAt:string }
