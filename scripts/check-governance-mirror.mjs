/** M-07: enforce current governance mirror consistency without advancing feature STATE. */
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";

const fail=(reason)=>{throw Error("GOVERNANCE_MIRROR_INVALID:"+reason);};
export function verifyGovernanceMirror(state,handoff){
 if(!state||typeof state!=="object"||typeof handoff!=="string")fail("SHAPE");
 const id=/^CIGO-P([1-9][0-9]*)-BLOCK([1-9][0-9]*)$/.exec(state.current_task_id||"");
 if(!id||Number(id[1])!==state.current_major_part)fail("TASK_ID");
 if(!["READY_FOR_EXECUTOR","IN_PROGRESS"].includes(state.status))fail("TASK_STATUS");
 if(!Array.isArray(state.completed)||state.completed.length===0)fail("MISSING_COMPLETION");
 const previous=state.completed.at(-1),last=/CIGO-P([1-9][0-9]*)-BLOCK([1-9][0-9]*)/.exec(previous||"");
 if(!last||!/scoped verified/i.test(previous))fail("LAST_COMPLETION");
 if(!/^[a-f0-9]{40}$/.test(state.last_verified_commit||"")||!previous.includes(state.last_verified_commit))fail("LAST_SHA");
 if(!handoff.includes(state.last_verified_commit))fail("HANDOFF_LAST_SHA");
 if(!handoff.includes("Next "+state.current_task_id))fail("HANDOFF_TASK");
 if(typeof state.reconciliation_note!=="string"||!state.reconciliation_note.includes("Part"+last[1]+" Block"+last[2])||
    !state.reconciliation_note.includes("Block"+id[2]+" "+(state.status==="READY_FOR_EXECUTOR"?"READY":"IN_PROGRESS")))fail("STALE_RECONCILIATION");
 if(state.remaining?.length===0)fail("EMPTY_ACTIVE_SCOPE");
 return {task:state.current_task_id,lastVerified:state.last_verified_commit};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const state=JSON.parse(readFileSync("ops/STATE.json","utf8"));
 const handoff=readFileSync("ops/HANDOFF.md","utf8");
 const ok=verifyGovernanceMirror(state,handoff);
 process.stdout.write("M-07 governance mirror verified: "+ok.task+" / "+ok.lastVerified+"\\n");
}
