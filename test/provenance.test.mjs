import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inspectProvenance,checkRepositoryProvenance} from "../scripts/check-provenance.mjs";
import {inspectSbom} from "../scripts/check-sbom.mjs";
const manifest=JSON.parse(readFileSync("package.json","utf8"));
const lock=JSON.parse(readFileSync("package-lock.json","utf8"));
const clone=()=>structuredClone(lock);
test("L-02 current locked package inventory has declared license, registry source and SRI",()=>{
 const inventory=checkRepositoryProvenance();
 assert.equal(inventory.root,manifest.name);
 assert.ok(inventory.components.length>0);
 assert.ok(inventory.components.every(p=>p.resolved.startsWith("https://registry.npmjs.org/")&&p.integrity.startsWith("sha512-")));
 assert.ok(inventory.components.every(p=>["MIT","ISC","Apache-2.0"].includes(p.declaredLicense)));
});
test("L-02 reject manifest/lock drift and ambiguous supply chain provenance",()=>{
 for(const mutate of [
  x=>{x.packages[""].devDependencies.pg="0.0.0";},
  x=>{x.packages["node_modules/pg"].license=undefined;},
  x=>{x.packages["node_modules/pg"].license="UNREVIEWED";},
  x=>{x.packages["node_modules/pg"].resolved="https://example.invalid/pg.tgz";},
  x=>{x.packages["node_modules/pg"].integrity=undefined;},
  x=>{x.packages["node_modules/pg"].integrity="sha1-not-accepted";},
  x=>{x.packages["node_modules/pg"].version="unknown";},
 ]){
  const modified=clone();mutate(modified);
  assert.throws(()=>inspectProvenance(manifest,modified),/MANIFEST_LOCK_MISMATCH|UNKNOWN_OR_UNREVIEWED_LICENSE|UNTRUSTED_PACKAGE_LOCATION_OR_INTEGRITY|INVALID_PROVENANCE_COMPONENT/);
 }
 assert.throws(()=>inspectProvenance({...manifest,private:false},lock),/INVALID_PROVENANCE_ROOT/);
});
test("L-02 validated CycloneDX must cover locked name/version identities",()=>{
 const inventory=inspectProvenance(manifest,lock);
 const components=inventory.components.map(x=>({type:"library",name:x.name,version:x.version}));
 const bom={bomFormat:"CycloneDX",specVersion:"1.5",metadata:{component:{name:inventory.root,version:inventory.rootVersion}},components};
 assert.equal(inspectSbom(bom,inventory).coveredLockedPackages,inventory.components.length);
 assert.throws(()=>inspectSbom({...bom,bomFormat:"not-CycloneDX"},inventory),/INVALID_SBOM_HEADER/);
 assert.throws(()=>inspectSbom({...bom,components:[]},inventory),/SBOM_LOCK_MISMATCH/);
 assert.throws(()=>inspectSbom({...bom,components:[{name:"unrelated",version:"0.0.1"}]},inventory),/SBOM_LOCK_MISMATCH/);
 assert.throws(()=>inspectSbom({...bom,components:[...components,{name:"undeclared-package",version:"9.9.9"}]},inventory),/SBOM_LOCK_MISMATCH/);
 assert.throws(()=>inspectSbom({...bom,components:[...components,components[0]]},inventory),/SBOM_LOCK_MISMATCH/);
});

test("L-02 npm private repo root alias must match exact known checkout identity and version",()=>{
 const inventory=inspectProvenance(manifest,lock);
 const components=inventory.components.map(x=>({type:"library",name:x.name,version:x.version}));
 const base={bomFormat:"CycloneDX",specVersion:"1.5",components};
 const alias={...base,metadata:{component:{type:"library",name:"codeedge-intelligent-growth-os",version:inventory.rootVersion}}};
 assert.equal(inspectSbom(alias,inventory).coveredLockedPackages,inventory.components.length);
 assert.throws(()=>inspectSbom({...alias,metadata:{component:{...alias.metadata.component,name:"another-repo"}}},inventory),/INVALID_SBOM_HEADER/);
 assert.throws(()=>inspectSbom({...alias,metadata:{component:{...alias.metadata.component,version:"0.0.0"}}},inventory),/INVALID_SBOM_HEADER/);
});
