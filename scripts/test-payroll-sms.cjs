const assert = require('node:assert/strict');
const { parse } = require('../payroll-sms.js');
const { estimate } = require('../payroll-estimate.js');
const sample = '기본시급 10,000\n통상시급 12,000\n지급내역\n직책 30,000\n근속 40,000\n소계(ⓐ) 2,000,000\n공제내역\n근로소득세 100,000\n지방소득세 10,000\n연금 90,000\n건강 70,000\n고용 18,000\n기타 12,000\n소계(ⓑ) 300,000';
const result = parse(sample);
assert.deepEqual(result.wages, {baseHourly:10000,ordinaryHourly:12000,dutyPay:30000});
assert.deepEqual(result.profile,{gross:2000000,total:300000});
assert.equal(result.deductions.health,70000);
assert.equal(estimate(2000000,result.profile).net,1700000);
assert.equal(estimate(1000000,result.profile).total,150000);
assert.deepEqual(parse('기본시급:\n10,000원').wages,{baseHourly:10000});
assert.deepEqual(parse('기본시급 10,000\n지급내역\n기본 2,090,000\n소계(ⓐ) 2,090,000').wages,
    {baseHourly:10000,dutyPay:0},'A complete payment section without allowances clears previous allowance values');
assert.deepEqual(parse('기본시급 10,000\n지급내역\n기본 2,090,000').wages,
    {baseHourly:10000},'A partial statement cannot establish absent allowances');
assert.deepEqual(parse('기본시급 10,000\n지급내역\n직책 읽을수없음\n소계(ⓐ) 2,090,000').wages,
    {baseHourly:10000},'An unreadable allowance must not silently replace a saved amount with zero');
assert.throws(() => parse(sample + '\n기본시급 20,000'), /섞여/);
assert.throws(() => parse('이름 테스트\n사번 123'), /인식/);
assert.throws(() => parse('기본시급 1,00'), /인식/);
const partial = parse('통상시급 12,000\n공제내역\n연금 90,000');
assert.equal(partial.profile,null);
assert.ok(partial.warnings.length);
assert.equal(parse(sample.replace('300,000','200,000')).profile,null);
assert.equal(parse(sample.replace('2,000,000','100,000')).profile,null);
assert.equal(parse(sample.replace(/\n/g,'\r\n')).profile.total,300000);
assert.throws(() => parse('x'.repeat(30001)));
assert.ok(!JSON.stringify(result).includes('사번'));
console.log('Payroll SMS: aliases, sections, Unicode totals, conflicts, partial input and calibrated estimates passed.');

assert.equal(parse('기본시급 11,050\n자격 10,000\n직무 20,000\n가족 30,000\n직책 70,000\n근속 70,000').wages.dutyPay,130000);
assert.throws(()=>parse('직책 70,000\n직책 80,000'));

// Anonymous financial fixture only: no identifying fields or original user message.
const assessed='지급내역\n소계(ⓐ) 4,400,900\n공제내역\n근로소득세 276,320\n지방소득세 27,630\n연금 248,560 법정요율\n건강 215,800 법정요율\n고용 39,600 법정요율\n소계(ⓑ) 807,910';
const monthly=parse(assessed).profile;
assert.equal(monthly.model,'monthly-insurance');assert.equal(monthly.fixedInsurance,464360);assert.equal(monthly.employmentRate,0.009);
assert.equal(estimate(4400900,monthly).total,807910);assert.equal(estimate(4400900,monthly).net,3592990);
assert.equal(estimate(5000000,monthly).total,464360+Math.trunc(5000000*monthly.taxRate)+45000);
assert.equal(parse(assessed,{kind:'bonus'}).profile.model,undefined,'Bonus must not acquire salary monthly insurance');
assert.equal(parse(assessed.replace('39,600','30,000')).profile.employmentRate,30000/4400900,'Different taxable insurance base must retain observed ratio');
const minimal=require('../payroll-estimate.js').minimalProfile(monthly);
assert.deepEqual(require('../account-data-core.js').normalize({shift_payroll_sms_reference_v1:minimal}).shift_payroll_sms_reference_v1,minimal);
const payments=require('../payroll-estimate.js').estimatePayments;
const withSupport=payments({regular:4000000,support:400900,bonus:0},monthly);
assert.equal(withSupport.total,807910,'Monthly assessment deducted once across salary and support');
for(const amounts of [{regular:0,support:100000,bonus:0},{regular:10000,support:10000,bonus:0},{regular:0,support:0,bonus:0}]){
 const x=payments(amounts,monthly);assert.ok(x.regular.net>=0&&x.support.net>=0);assert.equal(x.gross,x.total+x.net);
}
assert.throws(()=>require('../account-data-core.js').normalize({shift_bonus_sms_reference_v1:minimal}));
