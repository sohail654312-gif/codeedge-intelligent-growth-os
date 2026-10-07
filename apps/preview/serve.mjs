import http from 'node:http';
import fs from 'node:fs/promises';
const root=new URL('./site/',import.meta.url);
const allowed=new Map([['/','index.html'],['/index.html','index.html'],['/app.js','app.js'],['/styles.css','styles.css'],['/demo-data.js','demo-data.js'],['/assets/logo.svg','assets/logo.svg']]);
const types={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml'};
http.createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,file=allowed.get(pathname);
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});return res.end();}
 if(!file){res.writeHead(404);return res.end('Not found');}
 try{const content=await fs.readFile(new URL(file,root));res.writeHead(200,{'Content-Type':types[file.split('.').at(-1)]+'; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:content);}catch{res.writeHead(503);res.end('Preview unavailable');}
}).listen(Number(process.env.PORT??4173),'127.0.0.1',()=>console.log('Read-only synthetic preview: http://127.0.0.1:'+(process.env.PORT??4173)));
