import {mountStagingSnapshot,clearStagingSnapshot,initializeStagingShell,escapeHtml} from '/app.js';
const $=id=>document.getElementById(id);let generation=0,busy=false;
async function request(path,options={}){
 const response=await fetch('/api/staging/'+path,{...options,credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(65000),headers:{'Content-Type':'application/json',...(options.headers??{})}});
 if(!response.ok)throw Error([401,403].includes(response.status)?'SESSION':'UNAVAILABLE');
 const value=await response.json();return value;
}
function clear(){generation++;clearStagingSnapshot();$('detail').close();$('content').innerHTML='';$('content').setAttribute('aria-busy','false');}
function state(title,text,error=false){$('content').innerHTML='<section class="state-panel" role="'+(error?'alert':'status')+'"><h2>'+escapeHtml(title)+'</h2><p>'+escapeHtml(text)+'</p>'+(error?'<button class="button" id="retry-staging">Retry staging read</button>':'<span class="loading-ring" aria-hidden="true"></span>')+'</section>';$('retry-staging')?.addEventListener('click',load);}
function loginScreen(message='Use your synthetic staging account. No signup, recovery email or provider actions are available.'){
 clear();$('workspace-select').disabled=true;$('signout').disabled=true;$('content').innerHTML='<section class="panel login-panel"><h2>Sign in to staging</h2><p id="login-message" role="status">'+escapeHtml(message)+'</p><form id="staging-login"><label>Staging email<input id="login-email" type="email" autocomplete="username" required maxlength="254"></label><label>Password<input id="login-password" type="password" autocomplete="current-password" required minlength="8" maxlength="256"></label><button class="button" type="submit">Sign in</button></form><p><a href="/">Open Demo / Sandbox</a></p></section>';
 $('staging-login').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;busy=true;const button=event.submitter;button.disabled=true;$('login-message').textContent='Verifying server session…';
  try{await request('session',{method:'POST',body:JSON.stringify({email:$('login-email').value,password:$('login-password').value})});$('login-password').value='';await establish();}
  catch{$('login-password').value='';$('login-message').textContent='Sign-in denied or unavailable. Check your staging account and retry.';button.disabled=false;}finally{busy=false;}
 });
}
async function establish(){
 const session=await request('session');if(!session.authenticated||!session.workspaces?.length)throw Error('SESSION');
 const select=$('workspace-select');select.replaceChildren(...session.workspaces.map(w=>{const option=document.createElement('option');option.value=w.id;option.textContent=w.label;return option;}));select.disabled=false;$('signout').disabled=false;await load();
}
async function load(){
 clear();const current=generation,workspace=$('workspace-select').value;if(!workspace)return loginScreen();
 state('Loading staging intelligence','Reading bounded observations and verifying current access and durable source evidence.');$('content').setAttribute('aria-busy','true');
 try{const snapshot=await request('snapshot?workspace='+encodeURIComponent(workspace));if(current!==generation)return;
  mountStagingSnapshot(snapshot);$('content').setAttribute('aria-busy','false');}
 catch(error){if(current!==generation)return;clearStagingSnapshot();$('content').setAttribute('aria-busy','false');if(error.message==='SESSION')loginScreen('Session or workspace access expired or was revoked. Sign in again.');else state('Staging observations unavailable','No previous or demo values are displayed. Current source, receipt or database verification could not complete.',true);}
}
$('workspace-select').addEventListener('change',load);
$('refresh-staging').addEventListener('click',load);
$('signout').addEventListener('click',async()=>{clear();try{await request('session',{method:'DELETE'});loginScreen('Signed out. Server session revoked.');}catch{loginScreen('Sign-out could not be confirmed. This view is cleared; retry sign-out or wait for session expiry.');}});
initializeStagingShell();
// A restored document must not redisplay a prior tenant's observation after logout.
// This is navigation-driven revalidation, not polling or a data cache.
window.addEventListener('pagehide',clear);
window.addEventListener('pageshow',event=>{if(event.persisted){clear();establish().catch(()=>loginScreen());}});
state('Checking staging session','Verifying server identity and current workspace access.');
establish().catch(()=>loginScreen());
