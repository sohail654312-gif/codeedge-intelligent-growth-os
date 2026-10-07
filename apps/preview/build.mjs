import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createDemoSnapshot,SCENARIOS} from './demo-model.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),output=path.join(root,'site');
// Only an explicit static allowlist is published. Never copy dist, environment files or server modules.
await fs.mkdir(path.join(output,'assets'),{recursive:true});
for(const file of ['index.html','app.js','styles.css','assets/logo.svg']){
 const bytes=await fs.readFile(path.join(root,'public',file));
 await fs.writeFile(path.join(output,file),file.endsWith('.svg')?bytes:bytes.toString('utf8').replace(/\r\n/g,'\n'));
}
const snapshots=await Promise.all(SCENARIOS.map(createDemoSnapshot));
await fs.writeFile(path.join(output,'demo-data.js'),'export default '+JSON.stringify(snapshots)+';\n');
const files=['index.html','app.js','styles.css','assets/logo.svg','demo-data.js'];
const total=(await Promise.all(files.map(f=>fs.stat(path.join(output,f))))).reduce((s,x)=>s+x.size,0);
if(total>120000)throw Error('PREVIEW_ASSET_BUDGET_EXCEEDED');
console.log(`Synthetic read-only preview built: ${files.length} files, ${total} bytes; no runtime backend.`);
