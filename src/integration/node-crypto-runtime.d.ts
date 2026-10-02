/** Minimal Node 24 crypto declarations for this dependency-light project. Runtime is Node, not a browser. */
declare module "node:crypto" {
 export function createHmac(algorithm:string,key:Uint8Array):{update(value:string):{update(value:string):{digest():Uint8Array & {toString(encoding?:string):string}}}};
 export function randomBytes(size:number):Uint8Array & {toString(encoding?:string):string};
 export function createCipheriv(algorithm:string,key:Uint8Array,iv:Uint8Array):{setAAD(data:Uint8Array):void;update(data:string,encoding:"utf8"):Uint8Array;final():Uint8Array;getAuthTag():Uint8Array & {toString(encoding?:string):string}};
 export function createDecipheriv(algorithm:string,key:Uint8Array,iv:Uint8Array):{setAAD(data:Uint8Array):void;setAuthTag(tag:Uint8Array):void;update(data:Uint8Array):Uint8Array;final():Uint8Array};
 export function timingSafeEqual(a:Uint8Array,b:Uint8Array):boolean;
}
declare const Buffer:{
 from(input:string,encoding?:string):Uint8Array & {toString(encoding?:string):string};
 from(input:Uint8Array):Uint8Array & {toString(encoding?:string):string};
 isBuffer(input:unknown):boolean;
 concat(inputs:readonly Uint8Array[]):Uint8Array & {toString(encoding?:string):string};
};
