const assert=require('node:assert/strict'),C=require('../planner-core.js');
assert.deepEqual(C.period('2026-10-16'),{start:'2026-10-16',end:'2026-11-15'});assert.equal(C.range('2026-12-30','2027-01-02').length,4);
const cfg={baseHourly:10000,ordinaryHourly:12000,hireDate:'2020-01-01',dutyPay:100000,seniorityPay:50000};
const a=C.counts([{type:'DAY'},{type:'NIGHT'}]),b=C.counts([{type:'LEAVE'},{type:'NIGHT'}]);assert.equal(C.gross(b,cfg,'2026-11-15')-C.gross(a,cfg,'2026-11-15'),-45000);
assert.equal(C.gross(C.counts([{type:'NO_OT',origType:'NIGHT'}]),cfg,'2026-11-15')-C.gross(C.counts([{type:'NIGHT'}]),cfg,'2026-11-15'),-45000);
assert.equal(C.counts([{type:'UNPAID_HALF_PRE',origType:'NIGHT'}]).night,.5);
const days=[{key:'2026-10-10',rest:true},{key:'2026-10-11',rest:false,eligible:true},{key:'2026-10-12',rest:true}];assert.equal(C.vacations(days,1)[0].days,3);assert.equal(C.vacations(days,0).length,0);assert.equal(C.vacations(days.map(d=>({...d,eligible:false})),1).length,0);
const api=require('../api/live-schedule.js')._test;assert.throws(()=>api.normalize({group:'D'}));const valid=api.normalize({group:'C',month:'2026-10',days:Array.from({length:31},()=>({type:'OFF',label:'secret memo',salary:100}))});assert.equal(valid.days[0].salary,undefined);assert.equal(valid.days[0].label,'');
const records=new Map();process.env.APP_URL='https://test.invalid';process.env.GOOGLE_CALENDAR_SESSION_SECRET='x'.repeat(32);const seal=require('../api/google-calendar.js')._test.seal;
const run=api.handlerFor({read:async p=>records.get(p),write:async(p,d)=>records.set(p,d),remove:async p=>records.delete(p)});
async function call(method,url,user,body,csrf='csrf',target=run){let text;const res={setHeader(){},end(t){text=t}};const session=user?seal({sub:user,csrf:'csrf',exp:Date.now()+10000},process.env.GOOGLE_CALENDAR_SESSION_SECRET):'';await target({method,url,body,headers:{origin:'https://test.invalid','x-shift-csrf':csrf,cookie:'__Host-shiftcal-google='+session}},res);return{status:res.statusCode,data:JSON.parse(text)}}
(async()=>{assert.equal((await call('POST','/',null,valid)).status,401);assert.equal((await call('POST','/','owner',valid,'wrong')).status,403);const created=await call('POST','/','owner',valid);assert.equal(created.status,200);const path='/?id='+created.data.id;assert.equal((await call('GET',path)).status,200);assert.equal((await call('POST',path,'other',valid)).status,403);assert.equal((await call('GET',path)).data.owner,undefined);valid.days[0]={type:'LEAVE'};assert.equal((await call('POST',path,'owner',valid)).status,200);assert.equal((await call('GET',path)).data.days[0].type,'LEAVE');assert.equal((await call('DELETE',path,'owner')).status,200);assert.equal((await call('GET',path)).status,404);console.log('PASS planning, pay differences, leave budgets, share ownership, privacy, update and revoke');})().catch(e=>{console.error(e);process.exitCode=1});
// Compare the pure preview with the actual calculator across payroll periods and hire dates.
const fs=require('node:fs'),vm=require('node:vm'),html=fs.readFileSync(require.resolve('../index.html'),'utf8');
const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,style:{},hidden:false,innerText:'',textContent:'',attributes:{},setAttribute(name,value){this.attributes[name]=String(value)},getAttribute(name){return this.attributes[name]??null},classList:{add(){},remove(){},toggle(){}}});return elements.get(id)};
const ctx={document:{getElementById:el},localStorage:{getItem(){return null},setItem(){}},Date,setTimeout(){},alert(){}};ctx.window=ctx;ctx.HolidayWorkPayCore=require('../holiday-work-pay-core.js');ctx.ShiftPlannerCore=C;vm.createContext(ctx);for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(m[1].trim())vm.runInContext(m[1],ctx);
for(const month of [9,10])for(const hire of ['2017-01-01','2018-01-01','2020-01-01','2026-09-01'])for(const unpaid of [0,.5,1])for(const hourly of [12000,8835,14007]){
const cfg={baseHourly:10000,ordinaryHourly:hourly,baseHours:209,dutyPay:100000,seniorityPay:50000,employmentMonth:hire.slice(0,7),hireDate:hire};const c={day:7,night:8,spDay:2,spNight:1,noOT:1.5,unpaid};vm.runInContext(`config=${JSON.stringify(cfg)};currentPayDate=new Date(2026,${month},1);syncedUnpaidDays=${unpaid}`,ctx);for(const[id,v]of [['inp-day-days',c.day],['inp-night-days',c.night],['inp-daysp-days',c.spDay],['inp-nightsp-days',c.spNight],['inp-no-ot-days',c.noOT]])el(id).value=v;el('inp-bonus-check').checked=(month+1)%2===0;vm.runInContext('calculatePayrollFromInputs()',ctx);const actual=Number(el('hero-gross-pay').innerText.replace(/[^0-9]/g,''));assert.equal(C.gross(c,cfg,`2026-${month+1}-15`),actual,JSON.stringify({month,hire,unpaid}));}
console.log('PASS preview parity with existing payroll calculator (72 cases including fractional won amounts)');

(async()=>{let stored,version=0,release,entered;const gate=new Promise(r=>release=r),signal=new Promise(r=>entered=r);let pause=false;
const conditional=api.handlerFor({read:async()=>stored?{...stored,_etag:String(version)}:null,write:async(p,d,etag)=>{if(pause&&etag){entered();await gate;}if(etag&&(!stored||etag!==String(version))){const e=Error();e.name='BlobPreconditionFailedError';throw e;}stored=d;version++;},remove:async()=>{stored=null;version++;}});
const created=await call('POST','/','owner',valid,'csrf',conditional);const url='/?id='+created.data.id;pause=true;const update=call('POST',url,'owner',valid,'csrf',conditional);await signal;assert.equal((await call('DELETE',url,'owner',null,'csrf',conditional)).status,200);release();assert.equal((await update).status,409);assert.equal((await call('GET',url,null,null,'csrf',conditional)).status,404);console.log('PASS revoked share cannot be resurrected by an in-flight update');})().catch(e=>{console.error(e);process.exitCode=1});

assert.equal(C.isUnderOneYear('2025-10-16','2026-10-15'),true);
assert.equal(C.isUnderOneYear('2025-10-15','2026-10-15'),false);
assert.equal(C.isUnderOneYear('2026-10-16','2026-10-15'),false);
assert.equal(C.isUnderOneYear('', '2026-10-15'),false);
assert.equal(C.isUnderOneYear('2024-02-29','2025-03-01'),false);
console.log('PASS regular conversion anniversary/support boundary');
// Statistics show only attendance and leave for the viewed pay period.
ctx.ShiftPlannerCore=C;
vm.runInContext('currentCalDate=new Date(2026,11,1);currentPayDate=new Date(2026,10,1);openMonthStatsModal()',ctx);
const statsDays=vm.runInContext("ShiftPlannerCore.range('2026-11-16','2026-12-15').map(k=>getActualShift(ShiftPlannerCore.date(k),currentGroup))",ctx);
assert.equal(el('modal-pill-day').innerText,statsDays.filter(s=>s.type==='DAY'||s.type==='NO_OT'&&s.origType!=='NIGHT').length+'일');
assert.equal(el('modal-pill-leave').innerText,'0일');
assert.equal(el('stat-month-period').textContent,'2026-11-16 – 2026-12-15');
assert.equal(vm.runInContext('currentPayDate.getMonth()',ctx),10,'Statistics do not move the calculator');
for(const id of ['stat-salary','stat-bonus','stat-total','stat-remaining'])assert(!html.includes('id="'+id+'"'));
console.log('PASS viewed-month work and leave statistics without salary or remaining-leave sections');

assert.equal(C.seniorityPay('2017-12','2018-11-15'),0);
assert.equal(C.seniorityPay('2017-12','2018-12-15'),10000);
assert.equal(C.seniorityPay('2017-12','2024-11-15'),60000);
assert.equal(C.seniorityPay('2017-12','2024-12-15'),70000);
assert.equal(C.seniorityPay('2017-12','2026-12-15'),70000);
assert.equal(C.seniorityPay('2018-01','2026-12-15'),0);
assert.equal(C.seniorityPay('','2026-12-15'),0);

// Reference ODS examples: same inputs, no attendance deductions, bonus payable.
for(const [hourly,ordinary,hire,duty,day,night,spDay,spNight,total] of [
 [10670,14007,'2015-06-16',70000,9,12,1,1,6002767],
 [8835,8835,'2018-02-16',0,11,8,4,3,4839369],
 [8820,8820,'2020-06-29',0,0,0,0,0,2765070]]) {
 assert.equal(C.gross({day,night,spDay,spNight,noOT:0,unpaid:0},{baseHourly:hourly,ordinaryHourly:ordinary,hireDate:hire,employmentMonth:hire.slice(0,7),dutyPay:duty},'2026-02-15'),total);
}

assert.equal(C.payments({day:0,night:0,spDay:0,spNight:0,noOT:0,unpaid:0},{baseHourly:10000,hireDate:'2017-12-20',employmentMonth:'2020-01'},'2026-11-15').regular,2160000);

ctx.PayrollEstimate=null;
// Special shifts without overtime retain eight holiday hours but omit only holiday overtime; night premium stays at seven hours.
for(const hire of ['2017-01-01','2018-01-01','2020-01-01'])for(const type of ['SPECIAL_DAY_NO_OT','SPECIAL_NIGHT_NO_OT']){
 const c=C.counts([{type}]),cfg={baseHourly:11050,ordinaryHourly:14482,hireDate:hire,dutyPay:0,baseHours:209};
 vm.runInContext(`config=${JSON.stringify(cfg)};currentPayDate=new Date(2026,10,1);syncedUnpaidDays=0;syncedSpecialDayNoOT=${c.spDayNoOT||0};syncedSpecialNightNoOT=${c.spNightNoOT||0}`,ctx);
 for(const[id,v]of [['inp-day-days',0],['inp-night-days',0],['inp-daysp-days',c.spDay],['inp-nightsp-days',c.spNight],['inp-no-ot-days',0]])el(id).value=v;
 el('inp-bonus-check').checked=false;vm.runInContext('calculatePayrollFromInputs()',ctx);
 assert.equal(Number(el('hero-gross-pay').innerText.replace(/[^0-9]/g,'')),C.gross(c,cfg,'2026-11-15'));
 assert.equal(Number(el('row-hol-ot-pay').innerText.replace(/[^0-9]/g,'')),0);
 if(type==='SPECIAL_NIGHT_NO_OT')assert.equal(Number(el('row-hol-night-pay').innerText.replace(/[^0-9]/g,'')),Math.trunc(14482*.5*7));
 const full=C.counts([{type:type==='SPECIAL_NIGHT_NO_OT'?'SPECIAL_NIGHT':'SPECIAL_DAY'}]);
 const removed=Math.trunc(14482*2*2.5)+(type==='SPECIAL_NIGHT_NO_OT'&&hire.startsWith('2017')?14482:0);
 assert.equal(C.gross(full,cfg,'2026-11-15')-C.gross(c,cfg,'2026-11-15'),removed,'only overtime and its pre-2018 overtime supplement are removed');
 const normalized=require('../account-data-core.js').normalize({shift_overrides_C:{'2026-10-03':type}});assert.equal(normalized.shift_overrides_C['2026-10-03'],type);
 assert.equal(api.normalize({group:'C',month:'2026-10',days:Array.from({length:31},()=>({type}))}).days[0].type,type);
}
// Calendar import was retired; this suite checks the remaining outbound mapping.
assert.equal(require('../google-sync-core.js').infer,undefined);
assert.equal(require('../google-sync-core.js').colorId({type:'SPECIAL_NIGHT_NO_OT'}),'1');
console.log('PASS special no-overtime payroll parity, night hours, account/shared storage and Google mapping');

// Month-end changes belong to the next payroll period, including leap years and year rollover.
for(const [day,start,end] of [
 ['2026-01-31','2026-01-16','2026-02-15'],['2026-10-31','2026-10-16','2026-11-15'],
 ['2024-02-29','2024-02-16','2024-03-15'],['2026-12-31','2026-12-16','2027-01-15'],
 ['2026-11-15','2026-10-16','2026-11-15'],['2026-11-16','2026-11-16','2026-12-15']
])assert.deepEqual(C.period(day),{start,end});
for(const day of C.range('2024-01-01','2028-12-31')){const period=C.period(day);assert(period.start<=day&&day<=period.end,day);assert(period.start.endsWith('-16')&&period.end.endsWith('-15'));}
// Independently calculated OT deductions: 2.5 hours, plus the pre-2018 night 0.5-hour supplement.
for(const hire of ['2017-01-01','2018-01-01','2020-01-01'])for(const type of ['NO_OT','HALF_POST','UNPAID_HALF_POST']){
 const cfg={baseHourly:10000,ordinaryHourly:12000,baseHours:209,dutyPay:100000,hireDate:hire};
 const counts=C.counts([{type,origType:'NIGHT'}]);assert.equal(counts.nightNoOT,type==='UNPAID_HALF_POST'?.5:1);
 vm.runInContext(`config=${JSON.stringify(cfg)};currentGroup='C';currentPayDate=new Date(2026,10,1);overrides={};updateLeaveStats=()=>{};syncFromCalendar()`,ctx);
 const amount=id=>Number(el(id).innerText.replace(/[^0-9.-]/g,''));
 const before={ot:amount('row-ot-pay'),other:amount('row-other-pay'),night:amount('row-night-pay'),gross:amount('hero-gross-pay')};
 vm.runInContext(`overrides={'2026-10-27':'${type}'};syncFromCalendar()`,ctx);
 assert.equal(vm.runInContext('syncedNightNoOT',ctx),type==='UNPAID_HALF_POST'?.5:1);
 assert.equal(before.ot-amount('row-ot-pay'),45000);
 if(type!=='UNPAID_HALF_POST'){
  assert.equal(before.night,amount('row-night-pay'),'only OT is removed; night premium retains the established leave rules');
  assert.equal(before.other-amount('row-other-pay'),hire.startsWith('2017')?9000:0);
  assert.equal(before.gross-amount('hero-gross-pay'),hire.startsWith('2017')?54000:45000);
 }
 const period=C.period('2026-10-27'),days=C.range(period.start,period.end).map(k=>vm.runInContext(`getActualShift(new Date('${k}T12:00:00'),'C')`,ctx));
 assert.equal(C.gross(C.counts(days),cfg,period.end),amount('hero-gross-pay'),'month total matches the preview after each OT/leave change');
}
console.log('PASS 1,827 payroll-date boundaries and independently checked night OT/half-leave deductions');

const experienced={...cfg,hireDate:'2015-01-01',dutyPay:70000};
const automatic=C.payments(C.counts([]),experienced,'2026-10-15');
const imported=C.payments(C.counts([]),{...experienced,seniorityPayOverride:70000},'2026-10-15');assert.deepEqual(imported,automatic,'Imported seniority replaces automatic seniority, never adds it twice');
const zero=C.payments(C.counts([]),{...experienced,seniorityPayOverride:0},'2026-10-15');assert.equal(automatic.regular-zero.regular,70000);assert.equal(automatic.bonus-zero.bonus,70000);
