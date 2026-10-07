import http from 'node:http';import fs from 'node:fs/promises';import {nodeHandler,CSP} from './runtime.mjs';
const root=new URL('./site/',import.meta.url),allowed=new Set(['index.html','app.js','styles.css','assets/logo.svg','demo-data.js','staging.html','staging.js','staging.css']);
const config=JSON.parse(process.env.CIGO_STAGING_SERVER_JSON??'null');
http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname.startsWith('/api/'))return nodeHandler(req,res,config);
 const file=pathname==='/'?'index.html':pathname==='/staging'?'staging.html':pathname.slice(1);
 if(!['GET','HEAD'].includes(req.method)||!allowed.has(file)){res.writeHead(404);return res.end('Unavailable');}
 try{const content=await fs.readFile(new URL(file,root));res.writeHead(200,{'Content-Type':({html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml'}[file.split('.').at(-1)])+'; charset=utf-8','Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:content);}catch{res.writeHead(503);res.end('Unavailable');}
}).listen(4174,'127.0.0.1',()=>console.log('Read-only staging console listening on loopback port 4174'));
