import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

/** Enforce an actual completed, non-skipped mandatory Node test run from its captured stdout. */
export function inspectTestSummary(output, minimumTests) {
 if(typeof output!=="string"||!Number.isSafeInteger(minimumTests)||minimumTests<1)throw Error("INVALID_TEST_SUMMARY_INPUT");
 const lines=output.replace(/\x1b\[[0-9;]*m/g,"").split(/\r?\n/);
 const values=new Map();
 for(const line of lines){
  const m=/^(?:ℹ\s*|#\s*)(tests|pass|fail|skipped|skip|cancelled)\s+(\d+)\s*$/.exec(line.trim());
  if(!m)continue;
  const name=m[1]==="skipped"?"skip":m[1];
  if(values.has(name))throw Error("DUPLICATE_TEST_SUMMARY");
  values.set(name,Number(m[2]));
 }
 for(const key of ["tests","pass","fail","skip"])if(!values.has(key))throw Error("MISSING_TEST_SUMMARY_"+key.toUpperCase());
 if(values.get("tests")<minimumTests||values.get("tests")!==values.get("pass")||
   values.get("fail")!==0||values.get("skip")!==0||(values.has("cancelled")&&values.get("cancelled")!==0))
   throw Error("MANDATORY_TESTS_FAILED_SKIPPED_OR_MISSING");
 return Object.freeze({tests:values.get("tests"),pass:values.get("pass"),fail:0,skipped:0});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==4)throw Error("TEST_LOG_AND_MINIMUM_REQUIRED");
  const checked=inspectTestSummary(readFileSync(resolve(process.argv[2]),"utf8"),Number(process.argv[3]));
  process.stdout.write(`Mandatory test summary verified: ${checked.pass}/${checked.tests} pass, zero failed/skipped.\n`);
 }catch(error){process.stderr.write(`MANDATORY_TEST_SUMMARY_FAILED: ${error.message}\n`);process.exitCode=1;}
}
