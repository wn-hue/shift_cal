const assert = require('node:assert/strict');
const { estimate } = require('../payroll-estimate.js');
assert.deepEqual(estimate(2000000), {gross:2000000, total:360000, net:1640000});
assert.deepEqual(estimate(0), {gross:0, total:0, net:0});
assert.deepEqual(estimate(-100), {gross:0, total:0, net:0});
assert.equal(estimate(1000000).total, 180000);
assert.equal(estimate(1).net, 1);
assert.throws(() => estimate(NaN), RangeError);
assert.throws(() => estimate(Infinity), RangeError);
const rounded = estimate(1234567);
assert.equal(rounded.net + rounded.total, rounded.gross);
assert.equal(rounded.total, 222222);
console.log('Payroll estimate: generic rate, zero, rounding and invalid-input checks passed.');

const {estimatePayments}=require('../payroll-estimate.js');
const separate=estimatePayments({regular:4000000,bonus:1000000,support:0},{gross:4000000,total:800000},{gross:1000000,total:50000});
assert.equal(separate.total,850000);assert.equal(separate.net,4150000);assert.equal(separate.gross,separate.total+separate.net);
assert.equal(estimatePayments({regular:4000000,bonus:0,support:300000},{gross:1000000,total:100000},{gross:1000000,total:500000}).support.total,30000);
const reference=estimatePayments({regular:0,bonus:1224725}).bonus;
assert.deepEqual(reference,{gross:1224725,total:29570,net:1195155});
const defaults=estimatePayments({regular:1000000,bonus:1000000,support:100000});
assert.equal(defaults.bonus.total,24144);assert.equal(defaults.regular.total,180000);assert.equal(defaults.support.total,18000);
assert.equal(defaults.net+defaults.total,defaults.gross);
assert.equal(estimatePayments({regular:0,bonus:1154725}).bonus.total,27879,'Do not charge the other payment again or divide by bonus alone');
assert.equal(estimatePayments({regular:0,bonus:1224725},null,{rate:0}).bonus.total,0,'A valid zero personal rate overrides the default');
assert.equal(estimatePayments({regular:0,bonus:1000000},null,{rate:.05}).bonus.total,50000);
assert.deepEqual(estimatePayments({regular:0,bonus:0}).bonus,{gross:0,total:0,net:0});
assert.deepEqual(estimatePayments({regular:0,bonus:-100}).bonus,{gross:0,total:0,net:0});
assert.equal(estimatePayments({regular:0,bonus:1}).bonus.net,1);
assert.throws(()=>estimatePayments({regular:0,bonus:1000},null,{rate:1.1}),RangeError);

assert.deepEqual(require('../payroll-estimate.js').minimalProfile({gross:1000000,total:50000}),{rate:0.05});
assert.equal(estimate(1000000,{rate:0.05}).total,50000);
assert.equal(require('../payroll-estimate.js').validProfile({rate:1.01}),false);

assert.deepEqual(estimate(10.9),{gross:10,total:1,net:9});
assert.equal(estimate(101,{rate:0.5}).total,50);
