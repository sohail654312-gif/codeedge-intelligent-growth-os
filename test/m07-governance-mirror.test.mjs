import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {verifyGovernanceMirror} from "../scripts/check-governance-mirror.mjs";
const state=JSON.parse(readFileSync("ops/STATE.json","utf8"));
const handoff=readFileSync("ops/HANDOFF.md","utf8");
test("M-07 authoritative current state agrees with handoff and completed evidence",()=>{
 assert.equal(verifyGovernanceMirror(state,handoff).task,state.current_task_id);
});
test("M-07 drift cannot silently pass even with green unrelated unit suites",()=>{
 for(const [changed,mirror] of [
  [{...state,current_task_id:"CIGO-P9-BLOCK1"},handoff],
  [{...state,current_major_part:8},handoff],
  [{...state,last_verified_commit:"a".repeat(40)},handoff],
  [{...state,reconciliation_note:"Part7 Block1 READY"},handoff],
  [{...state,reconciliation_note:state.reconciliation_note.replace("Block2 READY","Block1 READY")},handoff],
  [{...state,completed:[...state.completed.slice(0,-1),"CIGO-P9-BLOCK1 scoped verified Builder "+"b".repeat(40)]},handoff],
  [state,handoff.replace("Next CIGO-P9-BLOCK2","Next CIGO-P9-BLOCK1")],
  [state,handoff.replaceAll(state.last_verified_commit,"<missing-checkpoint>")]
 ])assert.throws(()=>verifyGovernanceMirror(changed,mirror),/GOVERNANCE_MIRROR_INVALID/);
});
