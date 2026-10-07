import { AeadBusinessOsCursorCodec } from "./aead-business-os-cursor.js";
import type { WorkspaceId } from "../domain/truth/types.js";
import { validateOperationalRecord } from "../evidence/validation.js";
import type { OperationalRecord, ReadError, ReadRequest, ReadResult } from "./contracts.js";
import { validateReadRequest, type SourceReader } from "./source-reader.js";

/** Server-only, least-privilege Business OS read-model port. No provider SDK, URL or credential comes from the caller. */
export interface BusinessOsReadModelPort {
  readonly version: "v1";
  readPage(input: Readonly<{workspaceId:WorkspaceId; resourceKind:string; limit:number; cursor?:string}>):
    Promise<Readonly<{records:readonly OperationalRecord[]; nextCursor?:string; partial?:boolean; fetchedAt?:string}>>;
}
/** A server-held, opaque cursor registry/codec. Implementations MUST authenticate tenant, source, resource and page size. */
export interface TrustedCursorCodec {
  encode(scope:Readonly<{workspaceId:WorkspaceId; resourceKind:string; limit:number; actorId:string}>, providerCursor:string):string;
  decode(scope:Readonly<{workspaceId:WorkspaceId; resourceKind:string; limit:number; actorId:string}>, token:string):string|undefined;
}
export interface TrustedReadAuthorization {
  assertAuthorized(input:Readonly<{workspaceId:WorkspaceId; actorId:string; authorizedAt:string; resourceKind:string}>):Promise<void>;
}
const MAX_PAGE=100;
const safeError=(code:string,retryable=false):ReadError=>({code,message:"Business OS read boundary denied or unavailable",retryable});
export class BusinessOsReadModelReader implements SourceReader {
 readonly sourceSystem="BUSINESS_OS" as const;
 /** Trusted server composition: this creates the codec; no caller-supplied subclass or mode is accepted. */
 static create(input:Readonly<{workspaceId:WorkspaceId;port:BusinessOsReadModelPort;authorization:TrustedReadAuthorization;
   cursorKeys:ReadonlyMap<string,Uint8Array>;activeKeyId:string;clock?:()=>string;cursorNow?:()=>number;cursorTtlMs?:number}>):BusinessOsReadModelReader{
  if(!input||Object.keys(input).some(k=>!["workspaceId","port","authorization","cursorKeys","activeKeyId","clock","cursorNow","cursorTtlMs"].includes(k)))
   throw Error("INVALID_READ_MODEL_COMPOSITION");
  const codec=new AeadBusinessOsCursorCodec(input.cursorKeys,input.activeKeyId,input.cursorNow,input.cursorTtlMs);
  return new BusinessOsReadModelReader(input.workspaceId,input.port,input.authorization,codec,input.clock);
 }
 constructor(private readonly workspaceId:WorkspaceId,private readonly port:BusinessOsReadModelPort,
  private readonly authorization:TrustedReadAuthorization,private readonly cursors:TrustedCursorCodec,
  private readonly clock:()=>string=()=>new Date().toISOString()) {
  if(port.version!=="v1") throw new Error("UNSUPPORTED_BUSINESS_OS_READ_MODEL");
  // No mode override: synthetic and production readers use the same confidential AEAD boundary.
  if(!cursors||Object.getPrototypeOf(cursors)!==AeadBusinessOsCursorCodec.prototype||
    Object.prototype.hasOwnProperty.call(cursors,"encode")||Object.prototype.hasOwnProperty.call(cursors,"decode"))
    throw Error("CONFIDENTIAL_CURSOR_CODEC_REQUIRED");
 }
 async read(suppliedRequest:ReadRequest):Promise<ReadResult>{
  let fetchedAt=this.clock();
  const denied=(code:string,retryable=false):ReadResult=>({records:[],fetchedAt,completeness:"PARTIAL",errors:[safeError(code,retryable)]});
  let request:ReadRequest;
  try{request=structuredClone(suppliedRequest);}catch{return denied("INVALID_READ_REQUEST");}
  const valid=validateReadRequest(request);
  if(!valid.ok) return denied("INVALID_READ_REQUEST");
  if(request.context.workspaceId!==this.workspaceId) return denied("WORKSPACE_SCOPE_MISMATCH");
  if(request.sourceSystem!=="BUSINESS_OS") return denied("SOURCE_SCOPE_MISMATCH");
  const limit=request.limit??MAX_PAGE;
  if(!Number.isSafeInteger(limit)||limit<1||limit>MAX_PAGE) return denied("INVALID_PAGE_LIMIT");
  const scope={workspaceId:this.workspaceId,resourceKind:request.resourceKind,limit,actorId:request.context.actorId};
  try{await this.authorization.assertAuthorized({workspaceId:this.workspaceId,actorId:request.context.actorId,authorizedAt:request.context.authorizedAt,resourceKind:request.resourceKind});}
  catch{return denied("READ_AUTHORIZATION_DENIED");}
  let cursor:string|undefined;
  if(request.cursor!==undefined){
   if(!request.cursor || request.cursor.length>4096) return denied("INVALID_CURSOR");
   try{cursor=this.cursors.decode(scope,request.cursor);}catch{return denied("INVALID_CURSOR");}
   if(!cursor || cursor.length>4096) return denied("INVALID_CURSOR");
  }
  let page:Awaited<ReturnType<BusinessOsReadModelPort["readPage"]>>;
  try{page=await this.port.readPage({workspaceId:this.workspaceId,resourceKind:request.resourceKind,limit,...(cursor===undefined?{}:{cursor})});}
  catch{return denied("SOURCE_UNAVAILABLE",true);}
  if(page?.fetchedAt!==undefined){
   if(typeof page.fetchedAt!=="string" || !Number.isFinite(Date.parse(page.fetchedAt)) || new Date(page.fetchedAt).toISOString()!==page.fetchedAt)
    return denied("INVALID_SOURCE_PAGE");
   fetchedAt=page.fetchedAt;
  }
  if(!page || !Array.isArray(page.records) || page.records.length>limit ||
    (page.nextCursor!==undefined && (typeof page.nextCursor!=="string" || !page.nextCursor || page.nextCursor.length>4096)))
    return denied("INVALID_SOURCE_PAGE");
  const records:OperationalRecord[]=[];
  let invalid=false;
  for(const record of page.records){
   if(!record || typeof record!=="object" || !validateOperationalRecord(record,request.context).ok ||
      record.reference?.sourceSystem!=="BUSINESS_OS" || record.resourceKind!==request.resourceKind){invalid=true;continue;}
   records.push(structuredClone(record));
  }
  // Do not issue a continuation token for a quarantined or partial page: it could hide missing evidence.
  if(invalid || page.partial) return {records,fetchedAt,completeness:"PARTIAL",errors:[safeError(invalid?"INVALID_SOURCE_RECORD":"PARTIAL_SOURCE_PAGE",!invalid)]};
  let nextCursor:string|undefined;
  if(page.nextCursor!==undefined){
   try{nextCursor=this.cursors.encode(scope,page.nextCursor);if(!nextCursor || nextCursor.length>4096) return denied("INVALID_SOURCE_CURSOR");}
   catch{return denied("INVALID_SOURCE_CURSOR");}
  }
  return {records,fetchedAt,completeness:invalid||page.partial?"PARTIAL":"COMPLETE",
   errors:invalid?[safeError("INVALID_SOURCE_RECORD")]:page.partial?[safeError("PARTIAL_SOURCE_PAGE",true)]:[],
   ...(nextCursor===undefined?{}:{nextCursor})};
 }
}
