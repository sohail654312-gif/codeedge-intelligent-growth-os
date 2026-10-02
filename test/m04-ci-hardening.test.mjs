import test from "node:test";
import assert from "node:assert/strict";
import {inspectTestSummary} from "../scripts/check-test-summary.mjs";
const good="ℹ tests 213\nℹ pass 213\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\n";
test("M-04 mandatory summary accepts complete non-skipped test run",()=>{
 assert.equal(inspectTestSummary(good,213).pass,213);
 assert.equal(inspectTestSummary("# tests 12\n# pass 12\n# fail 0\n# skipped 0\n",12).pass,12);
});
test("M-04 mandatory summary rejects skips, missing suites and false success",()=>{
 for(const bad of [good.replace("skipped 0","skipped 1"),good.replace("tests 213","tests 0").replace("pass 213","pass 0"),
 good.replace("tests 213","tests 212").replace("pass 213","pass 212"),good.replace("fail 0","fail 1"),
 good.replace("ℹ skipped 0",""),good.replace("ℹ pass 213",""),good+good,""]){
  assert.throws(()=>inspectTestSummary(bad,213),/TEST_SUMMARY|MANDATORY_TESTS/);
 }
});
