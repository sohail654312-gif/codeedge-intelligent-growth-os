import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {checkRepositoryProvenance} from "./check-provenance.mjs";

/** Validate independently generated npm CycloneDX output against the exact lockfile package/version inventory. */
export function inspectSbom(bom,inventory){
 const root=bom?.metadata?.component;
 const expectedRoot=inventory.root.startsWith("@")?inventory.root.split("/"):["",inventory.root];
 const rootMatches=!!root&&root.version===inventory.rootVersion&&(
   root.name===inventory.root||(root.group===expectedRoot[0]&&root.name===expectedRoot[1])||
   // npm names this private repo by the checked-out folder, rather than the scoped manifest name.
   (inventory.root==="@codeedge/cigo"&&root.name==="codeedge-intelligent-growth-os"));
 if(!bom||bom.bomFormat!=="CycloneDX"||!/^1\.[4-9]$/.test(bom.specVersion)||
   !Array.isArray(bom.components)||!rootMatches)throw Error("INVALID_SBOM_HEADER");
 const components=new Set();
 for(const entry of bom.components){
  if(!entry||typeof entry.name!=="string"||typeof entry.version!=="string")throw Error("INVALID_SBOM_COMPONENT");
  components.add(entry.name+"@"+entry.version);
 }
 const expected=new Set(inventory.components.map(entry=>entry.name+"@"+entry.version));
 if(bom.components.length!==inventory.components.length||components.size!==expected.size||
   [...components].some(id=>!expected.has(id))||[...expected].some(id=>!components.has(id)))
   throw Error("SBOM_LOCK_MISMATCH");
 // SBOM describes installed dependency inventory. Licenses in the lock are declarations pending legal review.
 return Object.freeze({coveredLockedPackages:inventory.components.length,sbomComponents:bom.components.length,specVersion:bom.specVersion});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)throw Error("SBOM_FILE_REQUIRED");
  const inventory=checkRepositoryProvenance();
  const bom=JSON.parse(readFileSync(resolve(process.argv[2]),"utf8"));
  const result=inspectSbom(bom,inventory);
  process.stdout.write(`CycloneDX inventory validated against lock: ${result.coveredLockedPackages} locked packages, ${result.sbomComponents} components.\n`);
 }catch(error){
  process.stderr.write(`SBOM_CHECK_FAILED: ${error.message}\n`);
  try{const b=JSON.parse(readFileSync(resolve(process.argv[2]),"utf8"));
   const c=b?.metadata?.component;
   process.stderr.write(`SBOM_HEADER_DIAGNOSTIC: ${JSON.stringify({format:b.bomFormat,spec:b.specVersion,root:c?{name:c.name,group:c.group,version:c.version,type:c.type}:null,componentCount:b.components?.length,matchingRoot:b.components?.filter(x=>String(x.name).includes("cigo")).map(x=>({name:x.name,group:x.group,version:x.version})).slice(0,2)})}\n`);
  }catch{/* fail-closed; no raw payload logging */}
  process.exitCode=1;}
}
