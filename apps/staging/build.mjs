import fs from 'node:fs/promises';
const root=new URL('./site/',import.meta.url),demo=new URL('../preview/site/',import.meta.url);
await fs.mkdir(new URL('assets/',root),{recursive:true});
for(const file of ['index.html','app.js','styles.css','assets/logo.svg','demo-data.js'])await fs.copyFile(new URL(file,demo),new URL(file,root));
for(const file of ['staging.js','staging.css'])await fs.copyFile(new URL('public/'+file,import.meta.url),new URL(file,root));
let html=await fs.readFile(new URL('index.html',demo),'utf8');
html=html.replace(/\s*<button data-view="journeys">[\s\S]*?<\/button>/,'').replace('<body>','<body data-mode="staging">').replace('<script type="module" src="/app.js"></script>','<link rel="stylesheet" href="/staging.css"><script type="module" src="/staging.js"></script>')
 .replace('Synthetic business observations, transparent evidence and read-only decision support.','Authenticated read-only synthetic staging workspace.').replaceAll('Codeedge Preview','Codeedge Staging')
 .replace('Northstar Care','Staging workspace').replaceAll('Synthetic demo workspace','Authenticated staging').replaceAll('>NC<','>ST<')
 .replace('<span class="demo-badge">Synthetic demo</span>','<span class="staging-badge">Authenticated staging</span>')
 .replace(/<label class="scenario-label">[\s\S]*?<\/label>/,'<label class="workspace-picker">Workspace<select id="workspace-select" aria-label="Staging workspace" disabled></select></label>')
 .replace('Fictional business. Synthetic September 2026 observations. No live customer data.','Authenticated staging data • synthetic tenants only • read-only.')
 .replace('About this preview','About staging')
 .replace(/<label>Preview state[\s\S]*?<\/label>/,'<div class="staging-controls"><a class="staging-link" href="/">Demo / Sandbox</a><button class="text-button" id="refresh-staging">Refresh observation</button><button class="text-button" id="signout" disabled>Sign out</button></div>')
 .replace('Preparing demo intelligence','Preparing staging intelligence').replace('Loading a bounded set of synthetic observations.','Verifying session before reading staging observations.')
 .replace('Enable JavaScript to explore the synthetic preview. No live data is loaded.','Enable JavaScript for authenticated staging.');
await fs.writeFile(new URL('staging.html',root),html);
const files=['index.html','app.js','styles.css','assets/logo.svg','demo-data.js','staging.html','staging.js','staging.css'];
const total=(await Promise.all(files.map(f=>fs.stat(new URL(f,root))))).reduce((n,s)=>n+s.size,0);
if(total>150000)throw Error('STAGING_ASSET_BUDGET');console.log('Staging browser allowlist: '+files.length+' files, '+total+' bytes. No server modules published.');
