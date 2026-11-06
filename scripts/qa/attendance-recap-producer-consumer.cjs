'use strict';
const fs=require('fs'),path=require('path');
process.env.TS_NODE_PROJECT=path.resolve('apps/api/tsconfig.json');require('ts-node/register/transpile-only');
const {readAttendanceRecap}=require(path.resolve('apps/web/src/lib/attendance-recap.ts'));
const root=process.argv[2];if(!root)throw Error('Evidence directory required');
const raw=JSON.parse(fs.readFileSync(path.join(root,'PRODUCER.json'),'utf8'));
const q={academicYear:'2026/2027',semester:1,from:'2026-11-02',to:'2026-11-02',context:'own',jp:1};
const controls=[];const check=(name,ok)=>controls.push({name,pass:!!ok});
check('Real Nest/Fastify/PostgreSQL producer accepted',readAttendanceRecap(raw,q)?.metrics.attendancePct===50);
for(const field of ['H','recorded','attendancePct','coveragePct']){const r=structuredClone(raw);r.metrics[field]=99;check('Reject corrupt '+field,readAttendanceRecap(r,q)===null);}
for(const [name,patch] of Object.entries({foreignClass:{classId:'31000000-0000-4000-8000-000000000099'},foreignPeriod:{semester:2},foreignJp:{jp:2},wrongPage:{page:2},wrongContext:{context:'homeroom'},wrongSearch:{search:'other'}}))check('Reject '+name,readAttendanceRecap(raw,{...q,...patch})===null);
const result={pass:controls.every(c=>c.pass),controls,boundary:'actual Nest/JWT/PG response -> production Web contract',count:controls.length};
fs.writeFileSync(path.join(root,'PRODUCER-CONSUMER.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.pass)process.exitCode=1;
