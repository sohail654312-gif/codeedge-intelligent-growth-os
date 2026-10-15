import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';import path from 'node:path';
/** Explicitly disposable acceptance only. Never run backups/restore against a hosted,
 * customer or production database through this harness. No credentials are logged. */
export function disposableConfiguration(env=process.env){
 const u=new URL(env.CIGO_R4_DISPOSABLE_DATABASE_URL??'invalid:');
 if(env.CIGO_R4_DISPOSABLE_TEST_CONFIRM!=='I_CONFIRM_DISPOSABLE_ONLY'||
  !['localhost','127.0.0.1'].includes(u.hostname)||u.pathname!=='/cigo_r4_disposable_ci')throw Error('DISPOSABLE_RECOVERY_ONLY');
 return {host:u.hostname,port:u.port||'5432',database:'cigo_r4_disposable_ci',user:env.PGUSER??'postgres',password:env.PGPASSWORD??''};
}
export function sealBackup(bytes,key){
 if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>8388608||!Buffer.isBuffer(key)||key.length!==32)throw Error('INVALID_BACKUP_INPUT');
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce),digest=createHash('sha256').update(bytes).digest();
 cipher.setAAD(Buffer.from('CIGO-DISPOSABLE-RECOVERY-v1'));
 const payload=Buffer.concat([digest,bytes]);return Buffer.concat([Buffer.from('CIGOBK01'),nonce,cipher.update(payload),cipher.final(),cipher.getAuthTag()]);
}
export function openBackup(bytes,key){
 try{if(!Buffer.isBuffer(bytes)||bytes.length<68||bytes.length>8388700||!Buffer.isBuffer(key)||key.length!==32||bytes.subarray(0,8).toString()!=='CIGOBK01')throw Error('INVALID');
  const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(8,20));cipher.setAAD(Buffer.from('CIGO-DISPOSABLE-RECOVERY-v1'));cipher.setAuthTag(bytes.subarray(-16));
  const plain=Buffer.concat([cipher.update(bytes.subarray(20,-16)),cipher.final()]),data=plain.subarray(32);
  if(!createHash('sha256').update(data).digest().equals(plain.subarray(0,32)))throw Error('INVALID');return data;
 }catch{throw Error('BACKUP_AUTHENTICATION_FAILED');}
}
function tool(name,args,config,input,env){
 const pgEnv={...env,PGHOST:config.host,PGPORT:config.port,PGUSER:config.user,PGPASSWORD:config.password,PGDATABASE:config.database};
 let command=path.join(env.CIGO_OPS_PG_BIN??'',name+(process.platform==='win32'?'.exe':'')),argv=args;
 if(env.CIGO_OPS_PG_CONTAINER_ID){if(!/^[a-f0-9]{12,64}$/.test(env.CIGO_OPS_PG_CONTAINER_ID))throw Error('INVALID_DISPOSABLE_CONTAINER');
  // --version is an offline metadata query; keep it free of database credentials and
  // session flags. Actual dump/restore calls still run with the pinned disposable identity.
  const versionOnly=args.length===1&&args[0]==='--version';
  command='docker';argv=['exec',...(versionOnly?[]:['-i','-e','PGPASSWORD='+config.password]),env.CIGO_OPS_PG_CONTAINER_ID,name,...(versionOnly?[]:['-U',config.user]),...args];}
 try{return execFileSync(command,argv,{env:pgEnv,input,windowsHide:true,maxBuffer:8388608,timeout:45000,stdio:['pipe','pipe','pipe']});}
 catch{throw Error('DISPOSABLE_RECOVERY_TOOL_FAILED');}
}
export function captureDisposableBackup(env=process.env){const c=disposableConfiguration(env);return tool('pg_dump',['--format=custom','--no-owner',c.database],c,undefined,env);}
export function restoreDisposableBackup(bytes,env=process.env){const c=disposableConfiguration(env);
 return tool('pg_restore',['--no-owner','--exit-on-error','--dbname=cigo_closure_restore_ci'],c,bytes,env);}
export function recoveryToolVersions(env=process.env){const c=disposableConfiguration(env);
 return {dump:tool('pg_dump',['--version'],c,undefined,env).toString().trim(),restore:tool('pg_restore',['--version'],c,undefined,env).toString().trim()};}

/** An archive plan only. Immutable history is never deleted by application code.
 * Owner/legal policy and a verified encrypted archive are prerequisites to later maintenance. */
export function planRetention({asOf,retainDays,entries,archiveVerified=false,legalHold=false}){
 if(!Number.isSafeInteger(retainDays)||retainDays<1||retainDays>36500||!Number.isFinite(Date.parse(asOf))||
  !Array.isArray(entries)||entries.length>10000||entries.some(e=>!e||!Number.isFinite(Date.parse(e.createdAt))||typeof e.revocationLinked!=='boolean'))throw Error('INVALID_RETENTION_PLAN');
 const cutoff=Date.parse(asOf)-retainDays*86400000;
 return {kind:'ARCHIVE_PLAN_ONLY',cutoff:new Date(cutoff).toISOString(),archivable:entries.filter(e=>Date.parse(e.createdAt)<cutoff&&!e.revocationLinked).length,
  held:entries.filter(e=>e.revocationLinked||Date.parse(e.createdAt)>=cutoff).length,ownerMaintenancePermitted:archiveVerified&&!legalHold,
  deletionEnabled:false,legalHold,archiveVerified};
}
