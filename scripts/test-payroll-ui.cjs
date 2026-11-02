const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),elements=new Map(),saved=new Map();
function elem(id){
    if(!elements.has(id))elements.set(id,{value:'',checked:false,hidden:false,open:false,style:{},handlers:{},attributes:{},setAttribute(k,v){this.attributes[k]=String(v)},_text:'',
        get innerText(){return this._text},set innerText(v){this._text=String(v)},get textContent(){return this._text},set textContent(v){this._text=String(v)},
        classList:{add(){},remove(){},toggle(){}},addEventListener(k,f){(this.handlers[k]||=[]).push(f)},focus(){},showModal(){this.open=true},close(){this.open=false;for(const f of this.handlers.close||[])f()}});
    return elements.get(id);
}
for(const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){
    const el=elem(match[1]),tag=match[0];el.value=/\bvalue="([^"]*)"/.exec(tag)?.[1]||'';el.hidden=/\bhidden\b/.test(tag);
}
const ctx={document:{getElementById:elem,querySelector:()=>null},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)},TextEncoder,URLSearchParams,Date,alert:()=>{},confirm:()=>true,setTimeout:()=>0};
ctx.window=ctx;vm.createContext(ctx);
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))if(match[1].trim())vm.runInContext(match[1],ctx);
ctx.PayrollSMS=require('../payroll-sms.js');ctx.ShiftPlannerCore=require('../planner-core.js');
vm.runInContext(fs.readFileSync(require.resolve('../payroll-estimate.js'),'utf8'),ctx);
const evaluate=code=>vm.runInContext(code,ctx),click=id=>{for(const f of elem(id).handlers.click||[])f()};
evaluate(`currentPayDate=new Date(2026,9,1);currentCalDate=new Date(2026,9,1);config={hireDate:'2017-01-01',totalLeave:0,leaveByYear:{},baseHourly:10000,ordinaryHourly:12000,baseHours:209,dutyPay:0,seniorityPay:0,holidayBonus:0,applyRetroPay:false};`);
elem('inp-night-days').value='2';elem('inp-bonus-check').checked=false;
evaluate('calculatePayrollFromInputs()');
assert.equal(elem('tr-other-pay').hidden,false,'Other pay is automatic even if a legacy saved flag is false');
assert.equal(elem('row-other-pay').innerText,'30,000');
evaluate("config.hireDate='2018-01-01';calculatePayrollFromInputs()");assert.equal(elem('row-other-pay').innerText,'12,000');
evaluate("config.hireDate='2020-01-01';config.applyRetroPay=true;calculatePayrollFromInputs()");assert.equal(elem('tr-other-pay').hidden,true);
evaluate("config.hireDate='';calculatePayrollFromInputs()");assert.equal(elem('tr-other-pay').hidden,true);
elem('input-base-hourly').value='999999';elem('input-ordinary-hourly').value='999999';
elem('input-duty-pay').value='999999';elem('input-seniority-pay').value='999999';
evaluate('saveWageConfig()');assert.equal(evaluate('config.baseHourly'),10000);assert.equal(evaluate('config.ordinaryHourly'),12000);
assert.equal(evaluate('config.dutyPay'),0);assert.equal(evaluate('config.seniorityPay'),0);assert.equal(evaluate('config.baseHours'),209);
evaluate('loadConfig()');assert.equal(elem('wage-allowance-settings').hidden,true);
evaluate('applyPayrollStatement({dutyPay:70000,seniorityPay:0})');
assert.equal(elem('wage-allowance-settings').hidden,false);assert.equal(elem('duty-pay-setting').hidden,false);assert.equal(elem('seniority-pay-setting').hidden,true);
assert.equal(elem('tr-duty-pay').hidden,false);assert.equal(elem('tr-seniority-pay').hidden,true);
evaluate('applyPayrollStatement({dutyPay:0,seniorityPay:70000})');
assert.equal(elem('duty-pay-setting').hidden,true);assert.equal(elem('seniority-pay-setting').hidden,true);
assert.equal(elem('tr-duty-pay').hidden,true);assert.equal(elem('tr-seniority-pay').hidden,true);
evaluate(`syncedUnpaidDays=1;config.hireDate='2017-01-01';calculatePayrollFromInputs()`);
elem('inp-bonus-check').checked=true;evaluate('calculatePayrollFromInputs()');
const payAmount=id=>Number(elem(id).innerText.replace(/[−,]/g,''));
const itemSum=['row-base-pay','row-duty-pay','row-seniority-pay','row-ot-pay','row-night-pay','row-hol-pay','row-hol-ot-pay','row-hol-night-pay','row-other-pay','row-holiday-bonus','row-bonus-pay','row-entry-bonus'].reduce((sum,id)=>sum+payAmount(id),0);
assert.equal(itemSum-payAmount('row-attendance-deduction'),payAmount('row-gross-pay'),'SMS-style gross items minus attendance deduction must reconcile to the total, including bonus deductions');
assert.equal(elem('tr-attendance-deduction').hidden,false);
evaluate("syncedUnpaidDays=0;config.hireDate=''");elem('inp-bonus-check').checked=false;
evaluate('applyPayrollStatement({dutyPay:0,seniorityPay:0})');assert.equal(elem('wage-allowance-settings').hidden,true);
const gross=Number(elem('row-gross-pay').innerText.replace(/,/g,''));
elem('payroll-estimate-toggle').checked=true;for(const f of elem('payroll-estimate-toggle').handlers.change)f();
const expected=ctx.PayrollEstimate.estimate(gross);
assert.equal(elem('hero-gross-pay').innerText,expected.net.toLocaleString('ko-KR')+' 원');
assert.equal(elem('row-gross-pay').innerText,expected.net.toLocaleString('ko-KR'));
assert.equal(elem('tr-estimated-deduction').hidden,false);assert.match(elem('row-pay-label').innerText,/세후 추정/);
assert.equal(elem('tr-payment-subtotal').hidden,false);assert.equal(payAmount('row-payment-subtotal'),gross);
evaluate('calculatePayrollFromInputs()');assert.equal(elem('row-gross-pay').innerText,expected.net.toLocaleString('ko-KR'),'Recalculation must not overwrite net total');
elem('payroll-estimate-toggle').checked=false;for(const f of elem('payroll-estimate-toggle').handlers.change)f();
assert.equal(elem('row-gross-pay').innerText,gross.toLocaleString('ko-KR'));assert.equal(elem('tr-estimated-deduction').hidden,true);
assert.equal(elem('tr-payment-subtotal').hidden,true);
// Manual wages are primary; importing a statement changes only the pending personal deduction profile.
evaluate('applyPayrollStatement({baseHourly:11050,ordinaryHourly:14482,dutyPay:70000,fixedAllowances:{qualification:0,job:0,family:0,duty:70000,legacy:0},seniorityPayOverride:70000})');
ctx.PayrollEstimate.open();const wageBefore=evaluate('JSON.stringify(config)');
elem('payroll-sms-text').value='성명 합성테스트\n사번 123456\n기본시급 99,999\n통상시급 98,888\n지급내역\n직책 999999\n근속 888888\n소계(ⓐ) 2,000,000\n공제내역\n소계(ⓑ) 300,000';
for(const f of elem('payroll-sms-text').handlers.input||[])f({});
assert.equal(elem('wage-manual-base').value,'11,050');assert.equal(elem('wage-duty').value,'70,000');assert.equal(elem('wage-seniority').value,'70,000');
assert.equal(evaluate('JSON.stringify(config)'),wageBefore);assert.equal(saved.get('shift_payroll_sms_reference_v1'),undefined);
click('payroll-sms-apply');assert.equal(evaluate('JSON.stringify(config)'),wageBefore);assert.deepEqual(JSON.parse(saved.get('shift_payroll_sms_reference_v1')),{rate:.15});
assert.equal(elem('payroll-sms-text').value,'');assert.ok(![...saved.values()].join('').includes('합성테스트'));assert.ok(![...saved.values()].join('').includes('123456'));
elem('payroll-estimate-toggle').checked=true;for(const f of elem('payroll-estimate-toggle').handlers.change)f();assert.match(elem('payroll-estimate-basis').textContent,/15.00%/);
elem('inp-bonus-check').checked=true;evaluate('calculatePayrollFromInputs()');assert.match(elem('payroll-estimate-basis').textContent,/상여:.*기준 명세서.*2.41%/);assert.equal(saved.get('shift_bonus_sms_reference_v1'),undefined);
ctx.PayrollEstimate.open();ctx.PayrollEstimate.importText('bonus','성명 비공개상여테스트\n기본시급 999999\n지급내역\n소계 1000000\n공제내역\n소계 50000');click('payroll-sms-apply');
assert.equal(evaluate('config.baseHourly'),11050);assert.deepEqual(JSON.parse(saved.get('shift_bonus_sms_reference_v1')),{rate:.05});assert.ok(![...saved.values()].join('').includes('비공개상여테스트'));
const before=saved.get('shift_payroll_sms_reference_v1'),bonusBefore=saved.get('shift_bonus_sms_reference_v1');
ctx.PayrollEstimate.open();elem('wage-manual-base').value='22000';assert.equal(ctx.PayrollEstimate.importText('salary','기본시급 33000'),false);assert.match(elem('payroll-sms-status').textContent,/기존 공제 기준은 유지/);assert.equal(ctx.PayrollEstimate.importText('bonus','상여 읽을 수 없음'),false);click('payroll-sms-apply');
assert.equal(evaluate('config.baseHourly'),22000);assert.equal(saved.get('shift_payroll_sms_reference_v1'),before);assert.equal(saved.get('shift_bonus_sms_reference_v1'),bonusBefore);
ctx.PayrollEstimate.clearDraft();
elem('payroll-sms-text').value='another private draft';ctx.PayrollEstimate.open();elem('payroll-sms-dialog').close();assert.equal(elem('payroll-sms-text').value,'');
evaluate('renderCalendar=()=>{};resetDefaults()');assert.equal(saved.get('shift_payroll_sms_reference_v1'),undefined);assert.equal(saved.get('shift_bonus_sms_reference_v1'),undefined);assert.equal(evaluate('config.baseHourly'),0);assert.match(elem('payroll-estimate-basis').textContent,/상여:.*기준 명세서.*2.41%/);
assert.match(elem('payroll-estimate-basis').textContent,/18\.09%/);
assert.equal(/inp-retro-check|disp-retro-status|toggleRetroCheck|근속수당 가산/.test(html),false);
for(const id of ['input-base-hourly','input-ordinary-hourly','input-duty-pay','input-seniority-pay'])assert.match(html.match(new RegExp('<input[^>]+id="'+id+'"[^>]*>'))[0],/\breadonly\b/);
assert.equal(/calendar-export|내 변경사항 포함해서 가져오기|하루 일정\(ICS\)|input-base-hours/.test(html),false);
assert.ok(!html.slice(html.indexOf('<dialog id="leave-settings-dialog"'),html.indexOf('</dialog>',html.indexOf('<dialog id="leave-settings-dialog"'))).includes('account-email'));
assert.ok(html.includes('aria-controls="view-all"'));
vm.runInContext(fs.readFileSync(require.resolve('../calendar-integration.js'),'utf8'),ctx);
ctx.document.getElementById=id=>elements.get(id)||null;
evaluate('openCalendarIntegration();closeCalendarIntegration()');
assert.equal(typeof ctx.exportPersonalCalendar,'undefined');assert.equal(typeof ctx.exportSelectedCalendarDay,'undefined');
const leaveMarkup=html.slice(html.indexOf('<dialog id="leave-settings-dialog"'),html.indexOf('</dialog>',html.indexOf('<dialog id="leave-settings-dialog"')));
assert.equal(/1일 연차 단가|매년 1월 1일|근속수당은/.test(leaveMarkup),false);
assert.match(leaveMarkup,/1년 미만은 매월 개근 시 1일씩 최대 11일/);
assert.ok(leaveMarkup.includes('<span>1일 연차수당</span>'));
const leaveFormMarkup=leaveMarkup.replace(/<details class="leave-policy">[\s\S]*?<\/details>/,'');
assert.equal(/<details\b|<summary\b/.test(leaveFormMarkup),false,'Leave balance and editable settings stay visible; only policy explanation may collapse');
assert.ok(html.includes('정규직 전환일 (연차, 지원금 판정)'));
assert.equal(elem('leave-year-label').textContent,'2026년');
const detailLabels=[...html.slice(html.indexOf('<table class="pay-table">'),html.indexOf('</table>',html.indexOf('<table class="pay-table">'))).matchAll(/<tr[^>]*>\s*<td[^>]*>([^<]+)<\/td>/g)].map(m=>m[1]);
assert.deepEqual(detailLabels.slice(0,9),['기본','고정수당','근속','연장','야간','휴근','휴연','휴야','상여금']);
console.log('PASS: automatic other pay thresholds/visibility, manual wages and tax-only imports and conditional read-only allowances, preserved hidden base hours, net/gross recalculation, private draft clearing, compact account placement, ICS removal and calendar dialog opening.');

assert.equal(html.includes('id="payroll-sms-read"'),false);assert.equal(html.includes('app-brand-summary'),false);

// The date already entered in leave settings determines seniority.
evaluate("config.hireDate='2017-12-20';currentPayDate=new Date(2018,10,1);calculatePayrollFromInputs()");assert.equal(elem('row-seniority-pay').innerText,'0');
evaluate("currentPayDate=new Date(2018,11,1);calculatePayrollFromInputs()");assert.equal(elem('row-seniority-pay').innerText,'10,000');
evaluate("currentPayDate=new Date(2026,9,1);calculatePayrollFromInputs()");assert.equal(elem('row-seniority-pay').innerText,'70,000');
evaluate("config.hireDate='2018-01-20';calculatePayrollFromInputs()");assert.equal(elem('row-seniority-pay').innerText,'0');

// Manual wage changes preserve allowances, employment date and SMS deduction references.
evaluate("applyPayrollStatement({dutyPay:70000})");
saved.set('shift_payroll_sms_reference_v1',JSON.stringify({rate:.15}));
saved.set('shift_bonus_sms_reference_v1',JSON.stringify({rate:.05}));
ctx.PayrollEstimate.reloadReference();ctx.PayrollEstimate.open();
const preserved=evaluate('JSON.stringify(config)');
for(const value of ['-1','12.5','1,23','1000000001','1e4']){
 elem('wage-manual-base').value=value;elem('wage-manual-ordinary').value='14,482';click('payroll-sms-apply');
 assert.equal(evaluate('JSON.stringify(config)'),preserved);assert.match(elem('wage-manual-status').textContent,/기본시급/);
}
elem('wage-manual-base').value='11,050';elem('wage-manual-ordinary').value='-1';click('payroll-sms-apply');
assert.equal(evaluate('JSON.stringify(config)'),preserved);assert.match(elem('wage-manual-status').textContent,/통상시급/);
elem('wage-manual-ordinary').value='14482';click('payroll-sms-apply');
assert.equal(evaluate('config.baseHourly'),11050);assert.equal(evaluate('config.ordinaryHourly'),14482);
const manualExpected=JSON.parse(preserved);manualExpected.baseHourly=11050;manualExpected.ordinaryHourly=14482;manualExpected.fixedAllowances={qualification:0,job:0,family:0,duty:0,legacy:70000};
assert.deepEqual(JSON.parse(evaluate('JSON.stringify(config)')),manualExpected);
assert.equal(saved.get('shift_payroll_sms_reference_v1'),JSON.stringify({rate:.15}));assert.equal(saved.get('shift_bonus_sms_reference_v1'),JSON.stringify({rate:.05}));
assert.equal(elem('payroll-sms-dialog').open,false);assert.equal(elem('wage-manual-base').value,'');
ctx.PayrollEstimate.open();assert.equal(elem('wage-manual-base').value,'11,050');
elem('wage-manual-base').value='22000';elem('payroll-sms-dialog').close();
assert.equal(evaluate('config.baseHourly'),11050);assert.equal(elem('wage-manual-base').value,'');
console.log('PASS manual wage modes, integer validation, preserved allowances/date/deductions, cancellation and private draft clearing');

// Manual allowance edits remain named; text cannot silently replace them or infer an hourly amount.
ctx.PayrollEstimate.open();elem('wage-qualification').value='10000';elem('wage-job').value='25000';elem('wage-legacy').value='0';click('payroll-sms-apply');assert.equal(evaluate('config.dutyPay'),35000);
ctx.PayrollEstimate.open();elem('wage-job').value='30000';assert.equal(ctx.PayrollEstimate.importText('salary','기본급 2156880\n직무 999999'),false);click('payroll-sms-apply');assert.equal(evaluate('config.dutyPay'),40000);assert.equal(evaluate('config.baseHourly'),11050);assert.equal(evaluate('config.ordinaryHourly'),14482);
console.log('PASS manual allowance persistence, tax-only imports and no automatic hourly conversion');

// Summary lists paid allowance items, never attributes an old total to unknown categories.
assert.equal(elem('allowance-qualification-setting').hidden,false);
assert.equal(elem('display-allowance-qualification').value,'10,000원');
assert.equal(elem('allowance-job-setting').hidden,false);
assert.equal(elem('display-allowance-job').value,'30,000원');
assert.equal(elem('allowance-family-setting').hidden,true);
assert.equal(elem('allowance-duty-setting').hidden,true);
assert.equal(elem('duty-pay-setting').hidden,true);
evaluate('applyPayrollStatement({dutyPay:70000})');
assert.equal(elem('duty-pay-setting').hidden,false);
for(const k of ['qualification','job','family','duty','legacy'])assert.equal(elem('allowance-'+k+'-setting').hidden,true);
evaluate('applyPayrollStatement({dutyPay:0})');
assert.equal(elem('duty-pay-setting').hidden,true);
console.log('PASS only paid allowance names and amounts, neutral legacy total and zero allowance hiding');

const input=(id,value)=>{elem(id).value=value;for(const f of elem(id).handlers.input||[])f({});};
ctx.PayrollEstimate.open();input('wage-duty','70000');input('wage-seniority','70000');click('payroll-sms-apply');assert.equal(evaluate('config.seniorityPayOverride'),70000);assert.equal(evaluate('config.dutyPay'),70000);assert.equal(elem('display-allowance-duty').value,'70,000원');
ctx.PayrollEstimate.open();input('wage-seniority','0');click('payroll-sms-apply');assert.equal(evaluate('config.seniorityPayOverride'),0);
ctx.PayrollEstimate.open();click('wage-seniority-reset');click('payroll-sms-apply');assert.equal(evaluate('Object.hasOwn(config,"seniorityPayOverride")'),false);
// Existing detailed and zero profiles retain their exact calculation after manual saves.
for(const profile of [{rate:0},{rate:.12},{rate:.15,model:'monthly-insurance',fixedInsurance:400000,taxRate:.1,employmentRate:.009,otherFixed:5000}]){
 saved.set('shift_payroll_sms_reference_v1',JSON.stringify(profile));ctx.PayrollEstimate.reloadReference();const expected=ctx.PayrollEstimate.estimate(4000000,profile);ctx.PayrollEstimate.open();click('payroll-sms-apply');assert.deepEqual(JSON.parse(saved.get('shift_payroll_sms_reference_v1')),profile);assert.deepEqual(JSON.parse(JSON.stringify(ctx.PayrollEstimate.forParts({regular:4000000,bonus:0}).regular)),JSON.parse(JSON.stringify(expected)));
}
console.log('PASS named seniority, explicit zero, automatic reset and existing personal profile preservation');
