import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {checkRepositoryProvenance} from "./check-provenance.mjs";

/** Validate independently generated npm CycloneDX output against the exact lockfile package/version inventory. */
export function inspectSbom(bom,inventory){
 const root=bom?.metadata?.component;
 const expectedRoot=inventory.root.startsWith("@")?inventory.root.split("/"):["",inventory.root];
 const rootMatches=!!root&&root.version===inventory.rootVersion&&(
   root.name===inventory.root||(root.group===expectedRoot[0]&&root.name===expectedRoot[1]));
 if(!bom||bom.bomFormat!=="CycloneDX"||!/^1\.[4-9]$/.test(bom.specVersion)||
   !Array.isArray(bom.components)||!rootMatches)throw Error("INVALID_SBOM_HEADER");
 const components=new Set();
 for(const entry of bom.components){
  if(!entry||typeof entry.name!=="string"||typeof entry.version!=="string")throw Error("INVALID_SBOM_COMPONENT");
  components.add(entry.name+"@"+entry.version);
 }
 for(const entry of inventory.components){
  if(!components.has(entry.name+"@"+entry.version))throw Error("SBOM_LOCK_MISMATCH");
 }
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
 }catch(error){process.stderr.write(`SBOM_CHECK_FAILED: ${error.message}\n`);process.exitCode=1;}
}
