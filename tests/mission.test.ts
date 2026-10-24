import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from '../src/server/gtm/store';
import {missionConfig,missionTick,missionReport} from '../src/server/gtm/mission';
import {api} from '../src/server/gtm/providers';
import type {LoopRun} from '../src/server/gtm/loop/model';
const original=process.cwd(),config=readFileSync('mission.json','utf8'),dir=mkdtempSync(path.join(os.tmpdir(),'gtm-mission-'));
process.env.GTM_DATA_DIR=path.join(dir,'data');writeFileSync(path.join(dir,'mission.json'),config);process.chdir(dir);
after(async()=>{process.chdir(original);await fs.rm(dir,{recursive:true,force:true});});
test('submission goals are locked before results and missing baseline stays unknown',async()=>{
 const first=await missionConfig();assert.equal(first.goals.attributed_new_activated_users,20);assert.equal(first.baseline.total_users,null);
 const altered={...first,goals:{...first.goals,attributed_new_activated_users:1}};await fs.writeFile('mission.json',JSON.stringify(altered));await assert.rejects(()=>missionConfig(),/제출 목표/);await fs.writeFile('mission.json',config);
});
test('runner starts one root and respects unfinished, paused and deadline states',async(t)=>{
 const m=await missionConfig(),at=Date.parse(m.starts_at)+3600000;t.mock.method(Date,'now',()=>at);
 const id=crypto.randomUUID();store.put('asset',{id,kind:'demo',file:'fixture.mp4',bytes:1,createdAt:at});
 assert.equal(await missionTick(id),true);assert.equal(store.all('loop').length,1);
 await missionTick(id);assert.equal(store.all('loop').length,1);
 const r=store.all<LoopRun>('loop')[0];store.put('loop',{...r,paused:true});await missionTick(id);assert.equal(store.all('loop').length,1);
 t.mock.method(Date,'now',()=>Date.parse(m.ends_at)+1);assert.equal(await missionTick(id),false);assert.equal(store.all('loop').length,1);
});
test('report excludes simulated runs and does not convert shopping clicks into revenue',async()=>{
 const r=store.all<LoopRun>('loop')[0];store.put('loop',{...r,id:crypto.randomUUID(),mode:'test'});
 const report=await missionReport(Date.parse((await missionConfig()).starts_at)+7200000);
 assert.equal(report.metrics.attributed_new_activated_users.value,0);assert.equal(report.testRunsExcluded,1);assert.equal(report.verifiedRevenue.orders,0);assert.equal(report.actualSpendUsd,null);
});
test('new billable and publishing mutations are blocked at the operation deadline',async(t)=>{
 process.env.GTM_OPERATION_ENDS_AT=new Date(Date.now()-1000).toISOString();let called=0;t.mock.method(globalThis,'fetch',async()=>{called++;return Response.json({});});
 await assert.rejects(()=>api('https://api.higgsfield.ai/test',{method:'POST'},true),/마감/);assert.equal(called,0);delete process.env.GTM_OPERATION_ENDS_AT;
});
