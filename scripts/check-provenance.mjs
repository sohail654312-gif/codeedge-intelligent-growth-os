import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

/** Lockfile metadata is evidence of declarations, not legal clearance or downloaded tarball inspection. */
const APPROVED_DECLARATIONS=new Set(["MIT","ISC","Apache-2.0"]);
const fail=(code)=>{throw Error(code);};
const nameFromPath=(path)=>{
 const index=path.lastIndexOf("node_modules/");
 if(index<0)return "";
 const suffix=path.slice(index+"node_modules/".length);
 const parts=suffix.split("/");
 return parts[0]?.startsWith("@")?parts.slice(0,2).join("/"):parts[0];
};
export function inspectProvenance(manifest,lock){
 if(!manifest||!lock||lock.lockfileVersion!==3||!lock.packages||typeof lock.packages!=="object"||
  lock.name!==manifest.name||lock.packages[""]?.name!==manifest.name||
  lock.packages[""]?.version!==manifest.version||manifest.private!==true)fail("INVALID_PROVENANCE_ROOT");
 for(const section of ["dependencies","devDependencies","optionalDependencies"]){
  const declared=manifest[section]??{},locked=lock.packages[""][section]??{};
  if(JSON.stringify(Object.entries(declared).sort())!==JSON.stringify(Object.entries(locked).sort()))fail("MANIFEST_LOCK_MISMATCH");
 }
 const seen=new Set(),components=[];
 for(const [path,pkg] of Object.entries(lock.packages)){
  if(path==="")continue;
  const name=nameFromPath(path);
  if(!/^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/.test(path)||
     !name||!pkg||!pkg.version||!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(pkg.version))fail("INVALID_PROVENANCE_COMPONENT");
  const unique=path+"@"+pkg.version;if(seen.has(unique))fail("DUPLICATE_PROVENANCE_COMPONENT");seen.add(unique);
  // Registry URL and SRI are declared by lockfile. No network fetch or package-content license review is implied.
  if(typeof pkg.resolved!=="string"||!pkg.resolved.startsWith("https://registry.npmjs.org/")||
    !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(pkg.integrity??""))fail("UNTRUSTED_PACKAGE_LOCATION_OR_INTEGRITY");
  if(!APPROVED_DECLARATIONS.has(pkg.license))fail("UNKNOWN_OR_UNREVIEWED_LICENSE");
  components.push(Object.freeze({path,name,version:pkg.version,declaredLicense:pkg.license,resolved:pkg.resolved,integrity:pkg.integrity}));
 }
 if(!components.length)fail("PROVENANCE_INVENTORY_EMPTY");
 return Object.freeze({root:manifest.name,rootVersion:manifest.version,lockfileVersion:3,components:Object.freeze(components.sort((a,b)=>a.path.localeCompare(b.path)))});
}
export function checkRepositoryProvenance(dir="."){
 const read=(file)=>JSON.parse(readFileSync(resolve(dir,file),"utf8"));
 return inspectProvenance(read("package.json"),read("package-lock.json"));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const result=checkRepositoryProvenance();
  process.stdout.write(`Provenance metadata check passed: ${result.components.length} locked packages; declared licenses and registry SRI present. This is not license clearance or tarball verification.\n`);
 }catch(error){process.stderr.write(`PROVENANCE_CHECK_FAILED: ${error.message}\n`);process.exitCode=1;}
}
