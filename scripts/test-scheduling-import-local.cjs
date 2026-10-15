'use strict';
// Dedicated, non-default disposable PostgreSQL. Never uses .env or drops databases.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const repo = 'C:/Users/USER/Documents/Claude/Projects/DIIS/smart-ai-school-staging-learner-schedule-fix-20261010';
const evidence = 'C:/Users/USER/Documents/Claude/Projects/DIIS/docs/audits/evidence/jp-presensi-consolidated-local-20261011';
const date = process.argv[2];
if (!['2026-10-06','2026-10-13'].includes(date) || process.argv.length !== 3 || process.env.DATABASE_URL || process.env.WAVE1A_PROOF_DATABASE_URL || process.env.WAVE1B_PROOF_DATABASE_URL) throw new Error('Only explicit fixture date and isolated environment accepted');
if (path.resolve(process.cwd()).toLowerCase() !== path.resolve(repo).toLowerCase()) throw new Error('Exact approved worktree required');
const name = 'diis-wave1b-proof-20261011', label = 'smart-scheduling-wave1b-20261011';
const ownership = path.join(evidence,'wave1b-container-ownership.json');
const startedAtUtc = new Date().toISOString();
const database = 'diis_wave1b_' + date.replaceAll('-','') + '_' + crypto.randomUUID().replaceAll('-','').slice(0,12);
const log = path.join(evidence,database+'.log');
let output = '';
function run(exe,args,env = process.env) {
  const result = spawnSync(exe,args,{cwd:repo,env,windowsHide:true,encoding:'utf8',maxBuffer:32*1024*1024});
  output += JSON.stringify({exe,args:args[0]==='/d'?args.slice(3):args,status:result.status})+'\n'+(result.stdout??'')+(result.stderr??'');
  if(result.error || result.status!==0) { fs.writeFileSync(log,output,{flag:'wx'}); throw new Error('Native command failed: '+exe+' exit '+result.status); }
  return result.stdout.trim();
}
const inventory = run('docker',['ps','-a','--format','{{.Names}}']).split('\n');
function sourceBinding() {
  const changed=run('git',['diff','--name-only','HEAD']).split('\n');
  const added=run('git',['ls-files','--others','--exclude-standard']).split('\n');
  return [...new Set([...changed,...added])].filter(p=>/^(apps\/api\/|packages\/|scripts\/)/.test(p)).sort()
    .map(p=>({path:p,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(repo,p))).digest('hex')}));
}
if(!inventory.includes(name)) {
  if(fs.existsSync(ownership)) throw new Error('Owned target disappeared; no automatic replacement');
  const imageId=run('docker',['image','inspect','--format','{{.Id}}','pgvector/pgvector:pg16']);
  const id=run('docker',['run','-d','--name',name,'--label','diis.task='+label,'-p','127.0.0.1:55443:5432','-e','POSTGRES_USER=wave1b_local','-e','POSTGRES_PASSWORD=wave1b_local','-e','POSTGRES_DB=wave1b_bootstrap',imageId]);
  fs.writeFileSync(ownership,JSON.stringify({id,imageId,label,createdAtUtc:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
}
if(!fs.existsSync(ownership)) throw new Error('No task ownership receipt for existing target');
const own=JSON.parse(fs.readFileSync(ownership,'utf8'));
let binding=JSON.parse(run('docker',['inspect',name]))[0];
const port=binding.NetworkSettings.Ports['5432/tcp'] ?? binding.HostConfig.PortBindings['5432/tcp'];
if(binding.Id!==own.id || binding.Image!==own.imageId || binding.Config.Labels['diis.task']!==label || port.length!==1 || port[0].HostIp!=='127.0.0.1' || port[0].HostPort!=='55443') throw new Error('Target identity/port changed');
if(!binding.State.Running) run('docker',['start',name]);
async function main() {
  let ready=false;
  for(let i=0;i<40;i++) {
    const r=spawnSync('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','wave1b_local','-d','wave1b_bootstrap'],{windowsHide:true,encoding:'utf8'});
    if(r.status===0){ready=true;break;} await new Promise((resolve)=>setTimeout(resolve,250));
  }
  if(!ready) throw new Error('Dedicated PostgreSQL not ready');
  run('docker',['exec',name,'createdb','-U','wave1b_local',database]);
  const url='postgresql://wave1b_local:wave1b_local@127.0.0.1:55443/'+database;
  const env={...process.env,DATABASE_URL:url,WAVE1A_PROOF_DATABASE_URL:url,WAVE1B_PROOF_DATABASE_URL:url,
    WAVE1A_PROOF_CLOCK_DATE:date,SMART_SCHEDULER_ENABLED:'true',SMART_SCHEDULER_IMPORT_ENABLED:'true'};
  const sourceBefore=sourceBinding();
  run('cmd.exe',['/d','/s','/c','npx prisma migrate deploy --schema packages/database/prisma/schema.prisma'],env);
  run('cmd.exe',['/d','/s','/c','npm run test --workspace=@smk/api -- --runInBand --runTestsByPath src/__tests__/scheduling-draft-postgres.spec.ts'],env);
  if(JSON.stringify(sourceBefore)!==JSON.stringify(sourceBinding())) throw new Error('Source changed during the proof');
  fs.writeFileSync(log,output,{flag:'wx'});
  const receipt={database,date,container:name,containerId:own.id,startedAtUtc,finishedAtUtc:new Date().toISOString(),
    nativeExit:0,log,sourceFiles:sourceBefore,sourceUnchangedDuringRun:true,summary:output.match(/(?:Test Suites:|Tests:|Time:).*/g),boundary:'Dedicated disposable local PostgreSQL only; all databases retained; no Git or application runtime mutation'};
  fs.writeFileSync(log+'.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'}); console.log(JSON.stringify(receipt));
}
main().catch((e)=>{if(!fs.existsSync(log))fs.writeFileSync(log,output,{flag:'wx'});console.error(e.message);process.exitCode=1;});
