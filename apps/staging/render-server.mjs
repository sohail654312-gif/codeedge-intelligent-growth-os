// Optional CIGO-only staging host adapter. This is NOT a demo or production
// release. No private configuration is embedded in this public Git repository.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {SAFE_HEADERS,nodeHandler,loadServerConfiguration,validateStagingPrivateConfiguration} from './runtime.mjs';

const assets=new Map([
 ['/staging',['staging.html','text/html; charset=utf-8']],
 ['/staging.html',['staging.html','text/html; charset=utf-8']],
 ['/staging.js',['staging.js','text/javascript; charset=utf-8']],
 ['/app.js',['app.js','text/javascript; charset=utf-8']],
 ['/staging.css',['staging.css','text/css; charset=utf-8']],
 ['/styles.css',['styles.css','text/css; charset=utf-8']],
 ['/assets/logo.svg',['assets/logo.svg','image/svg+xml']]
]);
const root=new URL('./site/',import.meta.url);
const headers={'Cache-Control':'private, no-store, max-age=0',
 'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
 'X-Frame-Options':'DENY','Vary':'Cookie'};
const json=(res,status,body)=>{res.writeHead(status,{...SAFE_HEADERS,'X-Frame-Options':'DENY'});res.end(JSON.stringify(body));};
function stagingEnabled(env){
 try{
  // Preflight only. Never log or return config, environment or parse error.
  const config=loadServerConfiguration(env);
  return validateStagingPrivateConfiguration(config)===true;
 }catch{return false;}
}
export function createRenderRequestHandler({env=process.env,staticFiles=root}={}){
 return async (req,res)=>{
  let path;
  try{path=new URL(req.url,'http://localhost').pathname;}catch{return json(res,400,{error:'Invalid request'});}
  if(path==='/__cigo_host_liveness'){
   if(req.method!=='GET')return json(res,405,{error:'Unavailable method'});
   return json(res,200,{service:'CIGO_STAGING_HOST',listener:true,authenticatedSnapshotVerified:false});
  }
  if(path.startsWith('/api/staging/')){
   // Production authentication, tenant grants, no-store and full snapshot
   // pipeline are owned by the exact same existing Vercel nodeHandler.
   return nodeHandler(req,res);
  }
  if(!assets.has(path))return json(res,404,{error:'Unavailable route'});
  if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Unavailable method'});
  if(!stagingEnabled(env))return json(res,503,{error:'Staging unavailable'});
  const [relative,mime]=assets.get(path);
  try{
   // Static allowlist; never expose dist, demo-data.js, repository or .env.
   const bytes=await readFile(new URL(relative,staticFiles));
   res.writeHead(200,{...headers,'Content-Type':mime});
   res.end(req.method==='HEAD'?undefined:bytes);
  }catch{return json(res,503,{error:'Staging unavailable'});}
 };
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const port=Number(process.env.PORT||10000);
 if(!Number.isSafeInteger(port)||port<=0||port>65535)throw Error('INVALID_HOST_PORT');
 const server=createServer(createRenderRequestHandler());
 server.listen(port,'0.0.0.0',()=>console.log('CIGO_STAGING_HOST_READY'));
}
