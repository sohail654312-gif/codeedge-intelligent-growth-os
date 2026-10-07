import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createDemoSnapshot,SCENARIOS,projectMetric} from '../apps/preview/demo-model.mjs';
import {escapeHtml} from '../apps/preview/public/app.js';
const root=new URL('../apps/preview/',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root),'utf8');

test('preview composes eight domains through existing engines without FACT or authority',async()=>{
 const x=await createDemoSnapshot();assert.equal(x.mode,'SYNTHETIC_DEMO');assert.equal(x.metrics.length,8);assert.equal(x.memory.length,3);assert.equal(x.recommendations.length,2);
 assert.deepEqual(x,await createDemoSnapshot());
 for(const item of [...x.metrics,...x.memory,...x.recommendations]){assert.equal(item.actionable,false);assert.equal(item.confidence,'INSUFFICIENT');}
 for(const r of x.recommendations){assert.equal(r.approved,false);assert.equal(r.verifiedFact,false);assert.equal(r.executable,false);assert.equal(r.authority,'NONE');assert.equal(r.reviewStatus,'AWAITING_INDEPENDENT_HUMAN_REVIEW');}
 assert.ok(x.memory.every(m=>m.kind==='ASSUMPTION'&&m.status==='UNVERIFIED'));
});
test('preview only selects fixed synthetic scenarios and preserves no-effect invariants',async()=>{
 for(const scenario of SCENARIOS){const x=await createDemoSnapshot(scenario);assert.equal(x.connection.liveConnection,false);assert.equal(x.connection.provenanceStatus,'SYNTHETIC_NOT_ATTESTED');assert.deepEqual(x.safety,{providerCalls:0,productionConnections:0,performedEffects:0,executionEnabled:false});}
 for(const input of ['production','workspace:other',{secret:'caller-secret'},'https://attacker.example'])await assert.rejects(createDemoSnapshot(input),/INVALID_DEMO_SCENARIO/);
});
test('stale and partial observations suppress values and grounded proposals',async()=>{
 const x=await createDemoSnapshot('limited');assert.equal(x.recommendations.length,0);assert.equal(x.connection.freshness,'PARTIAL_STALE');
 for(const m of x.metrics.filter(m=>['REVENUE_COST','MARKETING','RETENTION','CAPACITY','MISSED_ENQUIRIES'].includes(m.id))){assert.equal(m.status,'UNAVAILABLE');assert.equal(m.value,null);assert.ok(m.limitations.includes('STALE_EVIDENCE')||m.limitations.includes('PARTIAL_COVERAGE'));}
 assert.equal(x.memory.find(m=>m.title==='Finance interpretation').freshness,'STALE');
});
test('capacity scenario explanations describe their actual seeded cohort',async()=>{
 const x=await createDemoSnapshot('capacity');assert.equal(x.metrics.find(m=>m.id==='CAPACITY').value,5);assert.ok(x.metrics.find(m=>m.id==='CONVERSION').observation.includes('49 of 176'));
 assert.ok(x.recommendations.some(r=>r.title.includes('limited capacity')));
});
test('presentation projection drops raw authority, secrets and receipts and rejects truth promotion',()=>{
 const raw={domain:'LEADS',metricKey:'leads-created',verifiedFact:false,actionable:false,unit:'COUNT',value:3,numerator:3,status:'AVAILABLE',limitations:['SOURCE_UNVERIFIED'],secret:'sensitive',receiptId:'private',fingerprint:'private',workspaceId:'private'};
 const def=['LEADS','leads-created','Lead intelligence','Leads','lead'];const dto=projectMetric(raw,def);
 for(const key of ['secret','receiptId','fingerprint','workspaceId'])assert.equal(Object.hasOwn(dto,key),false);
 for(const changes of [{verifiedFact:true},{actionable:true},{domain:'OTHER'}])assert.throws(()=>projectMetric({...raw,...changes},def),/UNSAFE_PREVIEW_METRIC/);
});
test('published files exclude server code and contain only bounded synthetic public DTOs',()=>{
 assert.deepEqual(fs.readdirSync(new URL('site/',root)).sort(),['app.js','assets','demo-data.js','index.html','styles.css']);
 const data=read('site/demo-data.js');for(const forbidden of ['receiptId','fingerprint','DATABASE_URL','CIGO_READ_CREDENTIALS','postgres://','reviewerActorId','approvalId'])assert.ok(!data.includes(forbidden),forbidden);
 const files=['app.js','assets/logo.svg','demo-data.js','index.html','styles.css'];const bytes=files.reduce((n,f)=>n+Buffer.byteLength(read('site/'+f)),0);const compressed=files.reduce((n,f)=>n+gzipSync(read('site/'+f)).length,0);assert.ok(bytes<=120000);assert.ok(compressed<=25000);
 const script=read('public/app.js');assert.ok(!/\bfetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/.test(script));
});
test('official Codeedge wordmark matches released Business OS bytes',()=>{
 const digest=createHash('sha256').update(fs.readFileSync(new URL('public/assets/logo.svg',root))).digest('hex');
 assert.equal(digest,'220e8df319a7910a16531678b061b95665bf8acfabea186dbee1f0cc6db100db');
});
test('escaped content and restrictive deployment policy prevent script/credential/effect exposure',()=>{
 assert.equal(escapeHtml('<img src=x onerror="evil()"> & \'x\''),'&lt;img src=x onerror=&quot;evil()&quot;&gt; &amp; &#39;x&#39;');
 const config=JSON.parse(fs.readFileSync(new URL('../../vercel.json',root)));const csp=config.headers[0].headers.find(h=>h.key==='Content-Security-Policy').value;
 assert.ok(csp.includes("default-src 'none'"));assert.ok(csp.includes("form-action 'none'"));assert.ok(!csp.includes('unsafe-inline'));assert.equal(config.outputDirectory,'apps/preview/site');
 assert.ok(read('public/index.html').includes('Synthetic demo'));assert.ok(read('public/app.js').includes('Execution unavailable'));
});
