/** Minimal Node 24 crypto declarations for this dependency-light project. Runtime is Node, not a browser. */
declare module "node:crypto" {
 export function createHmac(algorithm:string,key:Uint8Array):{update(value:string):{update(value:string):{digest():Uint8Array & {toString(encoding?:string):string}}}};
 export function timingSafeEqual(a:Uint8Array,b:Uint8Array):boolean;
}
declare const Buffer:{
 from(input:string,encoding?:string):Uint8Array & {toString(encoding?:string):string};
 from(input:Uint8Array):Uint8Array & {toString(encoding?:string):string};
 isBuffer(input:unknown):boolean;
};
