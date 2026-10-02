import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
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

test("M-04 workflows use immutable verified action refs and a pinned test database image",()=>{
 const ci=readFileSync(".github/workflows/ci.yml","utf8");
 const pg=readFileSync(".github/workflows/r4-postgres.yml","utf8");
 const expected={
  "actions/checkout":"11bd71901bbe5b1630ceea73d27597364c9af683",
  "actions/setup-node":"49933ea5288caeca8642d1e84afbd3f7d6820020",
  "actions/upload-artifact":"ea165f8d65b6e75b540449e92b4886f43607fa02"
 };
 for(const flow of [ci,pg]){
  const refs=[...flow.matchAll(/^\s*uses:\s*(actions\/[\w-]+)@([^\s#]+)/gm)];
  assert.ok(refs.length>=2);
  for(const [,name,sha] of refs){
   assert.match(sha,/^[0-9a-f]{40}$/);
   assert.equal(sha,expected[name],"unreviewed workflow action SHA");
  }
  assert.match(flow,/node-version:\s*["']24\.21\.0["']/);
  assert.match(flow,/npm ci --ignore-scripts/);
  assert.match(flow,/scripts\/check-test-summary\.mjs/);
  assert.ok(!flow.includes("npm install --package-lock-only"));
 }
 assert.match(pg,/^  pull_request:\s*$/m);
 assert.ok(!/^\s+paths:\s*$/m.test(pg),"PostgreSQL acceptance cannot be path filtered");
 assert.match(pg,/image:\s*postgres:16@sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54/);
 assert.match(ci,/security:provenance/);
 assert.match(ci,/security:dependencies/);
 assert.match(ci,/check-sbom\.mjs/);
 assert.match(ci,/cigo-cyclonedx-sbom/);
});
