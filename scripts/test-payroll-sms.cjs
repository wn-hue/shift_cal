const assert = require('node:assert/strict');
const { parse } = require('../payroll-sms.js');
const { estimate } = require('../payroll-estimate.js');
const sample = '기본시급 10,000\n통상시급 12,000\n지급내역\n직책 30,000\n근속 40,000\n소계(ⓐ) 2,000,000\n공제내역\n근로소득세 100,000\n지방소득세 10,000\n연금 90,000\n건강 70,000\n고용 18,000\n기타 12,000\n소계(ⓑ) 300,000';
const result = parse(sample);
assert.deepEqual(result.wages, {baseHourly:10000,ordinaryHourly:12000,dutyPay:30000,seniorityPay:40000});
assert.deepEqual(result.profile,{gross:2000000,total:300000});
assert.equal(result.deductions.health,70000);
assert.equal(estimate(2000000,result.profile).net,1700000);
assert.equal(estimate(1000000,result.profile).total,150000);
assert.deepEqual(parse('기본시급:\n10,000원').wages,{baseHourly:10000});
assert.deepEqual(parse('기본시급 10,000\n지급내역\n기본 2,090,000\n소계(ⓐ) 2,090,000').wages,
    {baseHourly:10000,dutyPay:0,seniorityPay:0},'A complete payment section without allowances clears previous allowance values');
assert.deepEqual(parse('기본시급 10,000\n지급내역\n기본 2,090,000').wages,
    {baseHourly:10000},'A partial statement cannot establish absent allowances');
assert.deepEqual(parse('기본시급 10,000\n지급내역\n직책 읽을수없음\n소계(ⓐ) 2,090,000').wages,
    {baseHourly:10000,seniorityPay:0},'An unreadable allowance must not silently replace a saved amount with zero');
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
