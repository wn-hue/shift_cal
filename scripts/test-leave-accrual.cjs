'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
let now=Date.parse('2026-10-16T03:00:00Z');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
const els=new Map();const el=id=>{if(!els.has(id))els.set(id,{value:'',innerText:'',textContent:'',hidden:false,style:{},classList:{add(){},remove(){}}});return els.get(id)};
const saved=new Map();const ctx={Date:Clock,document:{getElementById:el,querySelector:()=>null},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},alert(){},confirm(){return true},setTimeout(){}};ctx.window=ctx;vm.createContext(ctx);
for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(m[1].trim())vm.runInContext(m[1],ctx);
const run=code=>vm.runInContext(code,ctx);
run("currentCalDate=new Date(2026,9,1);config.hireDate='2026-06-16';config.leaveByYear={};overrides={};config.ordinaryHourly=10000;");
const calc=(hire,year,asof)=>ctx.calculateFiscalYearLeave(hire,year,asof);
assert.equal(calc('2026-06-16',2026,'2026-07-15').leave,0);
assert.equal(calc('2026-06-16',2026,'2026-07-16').leave,1);
assert.equal(calc('2026-06-16',2026,'2026-10-16').leave,4);
assert.equal(calc('2026-01-01',2026,'2026-01-01').leave,0);
assert.equal(calc('2026-01-01',2026,'2026-02-01').leave,1);
assert.equal(calc('2026-01-01',2026,'2026-12-31').leave,11);
assert.equal(calc('2026-01-01',2027,'2027-01-01').leave,15);
assert.equal(calc('2026-12-01',2026,'2026-10-16').leave,0);
assert.equal(calc('2026-02-30',2026,'2026-10-16').leave,0);
assert.equal(calc('',2026,'2026-10-16').leave,0);
assert.equal(calc('2026-01-31',2026,'2026-02-28').monthlyGenerated,0);
assert.equal(calc('2026-01-31',2026,'2026-03-01').monthlyGenerated,1);
assert.equal(calc('2024-02-29',2025,'2025-02-28').monthlyGenerated,11);
assert.equal(calc('2024-02-29',2025,'2025-03-01').monthly,0);
assert.equal(calc('2015-06-16',2026,'2026-10-16').leave,19);
assert.equal(calc('1990-01-01',2026,'2026-10-16').leave,25);
assert.equal(calc('2026-06-16',2027,'2026-10-16').leave,0,'Future years do not pre-grant unearned leave');
assert.equal(calc('2026-06-16',2026,'2027-02-01').leave,6,'Past years stop at December 31');
// Fiscal grant and first-year monthly leave coexist; December hires receive a nonzero proration.
assert.equal(calc('2025-12-16',2026,'2026-01-16').regular,0.7);
assert.equal(calc('2025-12-16',2026,'2026-01-16').monthly,1);
run("overrides={'2025-08-01':'LEAVE','2025-09-01':'HALF_PRE','2025-09-02':'HALF_POST','2026-01-10':'LEAVE','2026-03-02':'HALF_POST','2026-03-03':'HALF_PRE'}");
const jan=calc('2025-06-16',2026,'2026-01-16');assert.equal(jan.regular,8.2);assert.equal(jan.monthly,5);assert.equal(jan.leave,13.2);
const expired=calc('2025-06-16',2026,'2026-06-16');assert.equal(expired.monthly,2);assert.equal(expired.leave,10.2,'Used monthly leave remains in the total; unused monthly leave expires');
// An automatically saved legacy zero recovers, explicit zero and nonzero manual totals survive.
run("overrides={};config.leaveByYear={2026:0};updateLeaveStats()");
assert.equal(el('stat-total-leave').innerText,'4일');assert.equal(el('stat-remain-leave').innerText,'4일');assert.equal(el('val-total-leave-pay').innerText,'320,000원');assert.match(el('leave-accrual-basis').textContent,/개근 가정/);
el('input-total-leave').value='0';ctx.saveLeaveConfig();assert.equal(ctx.getGrantedLeave(2026),0);assert.equal(el('leave-restore-auto').hidden,false);
ctx.restoreAutomaticLeave();assert.equal(ctx.getGrantedLeave(2026),4);assert.equal(el('leave-restore-auto').hidden,true);
el('input-total-leave').value='8.5';ctx.saveLeaveConfig();assert.equal(ctx.getGrantedLeave(2026),8.5);ctx.restoreAutomaticLeave();
// Payroll's save button must not freeze the monthly accrual.
run("saveWageConfig=function(){};manualSaveData()");assert.equal(run("Object.hasOwn(config.leaveByYear,2026)"),false);
now=Date.parse('2026-11-15T15:00:00Z');ctx.updateLeaveStats();assert.equal(el('stat-total-leave').innerText,'5일','Korean midnight advances the monthly grant');
run("overrides={'2026-10-20':'LEAVE','2026-10-21':'HALF_POST','2026-10-22':'HALF_PRE'};updateLeaveStats()");assert.equal(el('stat-used-leave').innerText,'2일');assert.equal(el('stat-remain-leave').innerText,'3일');
el('input-total-leave').value='5';ctx.saveLeaveConfig();assert.equal(run("Object.hasOwn(config.leaveByYear,2026)"),false,'Saving the automatic value keeps future accrual dynamic');
run("config.leaveByYear={2026:0};config.leaveManualYears={};config.hireDate='2015-06-16'");assert.equal(ctx.getGrantedLeave(2026),0,'Legacy zero correction applies only to the monthly-accrual period');
console.log('PASS first-year monthly leave / exact due dates / fiscal proration / carry+expiry / half-day use / Korean midnight / legacy zero recovery / manual restore / payroll save');
