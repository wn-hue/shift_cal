const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8'),elements=new Map(),saved=new Map();
function elem(id){
    if(!elements.has(id))elements.set(id,{value:'',checked:false,hidden:false,open:false,style:{},handlers:{},_text:'',
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
ctx.PayrollSMS=require('../payroll-sms.js');
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
evaluate('saveWageConfig()');assert.equal(evaluate('config.baseHourly'),10000);assert.equal(evaluate('config.ordinaryHourly'),12000);
const gross=Number(elem('row-gross-pay').innerText.replace(/,/g,''));
elem('payroll-estimate-toggle').checked=true;for(const f of elem('payroll-estimate-toggle').handlers.change)f();
const expected=ctx.PayrollEstimate.estimate(gross);
assert.equal(elem('hero-gross-pay').innerText,expected.net.toLocaleString('ko-KR')+' 원');
assert.equal(elem('row-gross-pay').innerText,expected.net.toLocaleString('ko-KR'));
assert.equal(elem('tr-estimated-deduction').hidden,false);assert.match(elem('row-pay-label').innerText,/세후 추정/);
evaluate('calculatePayrollFromInputs()');assert.equal(elem('row-gross-pay').innerText,expected.net.toLocaleString('ko-KR'),'Recalculation must not overwrite net total');
elem('payroll-estimate-toggle').checked=false;for(const f of elem('payroll-estimate-toggle').handlers.change)f();
assert.equal(elem('row-gross-pay').innerText,gross.toLocaleString('ko-KR'));assert.equal(elem('tr-estimated-deduction').hidden,true);
elem('payroll-sms-text').value='성명 합성테스트\n사번 123456\n기본시급 10,100\n통상시급 12,100\n지급내역\n소계(ⓐ) 2,000,000\n공제내역\n소계(ⓑ) 300,000';
click('payroll-sms-read');click('payroll-sms-apply');
assert.equal(evaluate('config.baseHourly'),10100);assert.equal(evaluate('config.ordinaryHourly'),12100);
assert.equal(elem('payroll-sms-text').value,'');assert.ok(![...saved.values()].join('').includes('합성테스트'));assert.ok(![...saved.values()].join('').includes('123456'));
elem('payroll-estimate-toggle').checked=true;for(const f of elem('payroll-estimate-toggle').handlers.change)f();
assert.match(elem('payroll-estimate-basis').textContent,/15.00%/);
elem('payroll-sms-text').value='another private draft';ctx.PayrollEstimate.open();elem('payroll-sms-dialog').close();assert.equal(elem('payroll-sms-text').value,'');
evaluate('renderCalendar=()=>{};resetDefaults()');assert.equal(saved.get('shift_payroll_sms_reference_v1'),undefined);assert.equal(evaluate('config.baseHourly'),0);
assert.match(elem('payroll-estimate-basis').textContent,/18%/);
assert.equal(/inp-retro-check|disp-retro-status|toggleRetroCheck|근속수당 가산/.test(html),false);
for(const id of ['input-base-hourly','input-ordinary-hourly'])assert.match(html.match(new RegExp('<input[^>]+id="'+id+'"[^>]*>'))[0],/\breadonly\b/);
assert.ok(html.includes('1일 연차 단가:</span>'));
console.log('PASS: automatic other pay thresholds/visibility, manual wage changes ignored, SMS-only wage application, net/gross toggle and recalculation, deduction reconciliation, private draft clearing and UI removals.');
