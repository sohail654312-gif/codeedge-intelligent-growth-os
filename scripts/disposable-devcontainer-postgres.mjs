// Linux devcontainer only. Never accepts an external database URL or container ID.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectTestSummary} from './check-test-summary.mjs';
if(process.argv.slice(2).join(' ')!=='--confirm-disposable')throw Error('EXPLICIT_DISPOSABLE_CONFIRMATION_REQUIRED');
if(process.platform!=='linux')throw Error('LINUX_DEVCONTAINER_REQUIRED');
const image='postgres:16@sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54';
function run(command,args,options={}){
 const result=spawnSync(command,args,{encoding:'utf8',maxBuffer:8*1024*1024,...options});
 if(result.error||result.status!==0)throw Error('DISPOSABLE_COMMAND_FAILED: '+command+' '+(result.stderr??'').slice(0,1000));
 return result.stdout;
}
let id;
try{
 run('docker',['info','--format','{{.ServerVersion}}']);
 id=run('docker',['run','--detach','--label','cigo.disposable=true','--publish','127.0.0.1::5432',
  '--env','POSTGRES_DB=cigo_r4_disposable_ci','--env','POSTGRES_USER=postgres',
  '--env','POSTGRES_PASSWORD=r4_ci_ephemeral_only',image]).trim();
 if(!/^[a-f0-9]{64}$/.test(id))throw Error('INVALID_CREATED_CONTAINER_ID');
 const port=run('docker',['port',id,'5432/tcp']).trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1];
 if(!port)throw Error('DISPOSABLE_LOOPBACK_PORT_REQUIRED');
 const env={...process.env,PGHOST:'127.0.0.1',PGPORT:port,PGDATABASE:'cigo_r4_disposable_ci',PGUSER:'postgres',PGPASSWORD:'r4_ci_ephemeral_only',
  CIGO_R4_DISPOSABLE_TEST_CONFIRM:'I_CONFIRM_DISPOSABLE_ONLY',CIGO_R4_REQUIRE_POSTGRES_TESTS:'true',
  CIGO_R4_DISPOSABLE_DATABASE_URL:`postgres://cigo_r4_app:r4_ci_app_ephemeral_only@127.0.0.1:${port}/cigo_r4_disposable_ci`,
  CIGO_OPS_PG_CONTAINER_ID:id,CIGO_OPS_RECOVERY_EVIDENCE:join(tmpdir(),'cigo-recovery-'+id+'.json')};
 let ready=false;
 for(let n=0;n<40;n++){
  const probe=spawnSync('docker',['exec',id,'pg_isready','-U','postgres','-d',env.PGDATABASE],{stdio:'ignore'});
  if(probe.status===0){ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,500));
 }
 if(!ready)throw Error('DISPOSABLE_DATABASE_NOT_READY');
 const sql=text=>run('docker',['exec','-i',id,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d',env.PGDATABASE],{input:text});
 sql("CREATE ROLE cigo_r4_app LOGIN PASSWORD 'r4_ci_app_ephemeral_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;");
 sql(readFileSync('docs/architecture/sql/R4-REFERENCE-MIGRATION.sql','utf8'));
 sql('GRANT USAGE ON SCHEMA cigo TO cigo_r4_app; GRANT SELECT,INSERT ON cigo.intake_requests,cigo.evidence,cigo.audit_events TO cigo_r4_app;');
 for(const file of ['R4-DISPOSABLE-TENANT-ROLES.sql','BUSINESS-OS-SOURCE-RECEIPTS.sql','BUSINESS-OS-DISPOSABLE-RECEIPT-ROLES.sql'])sql(readFileSync('docs/architecture/sql/'+file,'utf8'));
 run(process.execPath,['node_modules/typescript/bin/tsc'],{env});
 for(const [files,count] of [
  [['test/r4-postgres-integration.test.mjs','test/r4-postgres-concurrency.test.mjs','test/business-os-source-receipts-postgres.test.mjs'],14],
  [['test/staging-postgres.test.mjs'],7],[['test/closure-postgres.test.mjs'],8]]){
  const output=run(process.execPath,['--test',...files],{env});
  inspectTestSummary(output,count);process.stdout.write(output);
 }
}finally{
 if(id&&/^[a-f0-9]{64}$/.test(id))run('docker',['rm','--force',id]);
}
