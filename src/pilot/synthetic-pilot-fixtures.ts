import type {SyntheticPilotSeed,PilotMode} from "./r9-synthetic-pilot.js";
import type {WorkspaceId} from "../domain/truth/types.js";
/** Publicly inspectable fixtures contain no real patient, trades customer, credentials, contact details or live operations. */
export function syntheticLeadSeed(kind:"UK_TRADES"|"CLINIC",mode:PilotMode,workspaceId:string):SyntheticPilotSeed {
 if(!["UK_TRADES","CLINIC"].includes(kind)||!["DEMO","SANDBOX"].includes(mode)||
  typeof workspaceId!=="string"||!/^workspace:[a-zA-Z0-9_-]{1,60}$/.test(workspaceId))throw Error("INVALID_SYNTHETIC_FIXTURE");
 const trades=kind==="UK_TRADES";
 return {workspaceId,actorId:"owner:synthetic",sessionId:"session:synthetic",mode,records:[{
  workspaceId:workspaceId as WorkspaceId,
  reference:{sourceSystem:"BUSINESS_OS",externalReference:trades?"lead:fictional-boiler-enquiry":"lead:fictional-clinic-enquiry",version:"v1"},
  resourceKind:"lead",value:trades?{sector:"UK_TRADES",service:"boiler-check",status:"new",synthetic:true}:
   {sector:"CLINIC",service:"general-enquiry",status:"new",synthetic:true},
  observedAt:"2026-10-01T12:00:00.000Z"
 }]};
}
