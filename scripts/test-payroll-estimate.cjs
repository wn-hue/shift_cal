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
assert.equal(estimatePayments({regular:1000000,bonus:1000000}).bonus.total,180000);
