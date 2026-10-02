import type {SecurityEvent,SecurityEventSink} from "./safe-event.js";
/** R8 synthetic-only bounded collector: no network, filesystem, external alert or customer telemetry. */
export class SyntheticSecurityEventCollector implements SecurityEventSink {
 private readonly events:SecurityEvent[]=[];
 constructor(private readonly capacity=100){
  if(!Number.isSafeInteger(capacity)||capacity<1||capacity>1000)throw Error("INVALID_SYNTHETIC_EVENT_CAPACITY");
 }
 async emit(event:SecurityEvent):Promise<void>{
  // This fixture only accepts exact, already projected events; never store arbitrary caller properties.
  if(!event||!Object.isFrozen(event)||Object.keys(event).sort().join(",")!==["code","correlationId","effectCount","mode","occurredAt","severity","stage"].sort().join(",")||event.effectCount!==0)throw Error("UNSAFE_SYNTHETIC_EVENT");
  if(this.events.length>=this.capacity)throw Error("SYNTHETIC_EVENT_CAPACITY_EXCEEDED");
  this.events.push(Object.freeze({...event}));
 }
 snapshot():readonly SecurityEvent[]{return Object.freeze(this.events.map(e=>Object.freeze({...e})));}
 count(code:SecurityEvent["code"]):number{return this.events.filter(e=>e.code===code).length;}
 /** A local rehearsal only; never claims a deployed alert was delivered. */
 alertCandidates():readonly SecurityEvent[]{return Object.freeze(this.events.filter(e=>e.severity==="ERROR").map(e=>Object.freeze({...e})));}
}
