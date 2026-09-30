const assert = require('node:assert/strict');
const { estimate, defaults, validProfile } = require('../payroll-estimate.js');
// Synthetic amounts; no personal statement data in the repository.
const profile = { gross: 2000000, income: 100000, local: 10000, pension: 90000, health: 70000, employment: 18000 };
assert.deepEqual(estimate(2000000, profile).items, { income: 100000, local: 10000, pension: 90000, health: 70000, employment: 18000 });
assert.equal(estimate(2000000, profile).total, 288000);
assert.equal(estimate(2000000, profile).net, 1712000);
assert.equal(estimate(1000000, profile).net, 856000);
assert.equal(estimate(0, profile).total, 0);
assert.equal(estimate(-100, profile).net, 0);
assert.equal(validProfile(defaults), false);
assert.equal(validProfile({ ...profile, income: -1 }), false);
assert.equal(validProfile({ ...profile, gross: 1 }), false);
assert.throws(() => estimate(NaN, profile), RangeError);
assert.throws(() => estimate(100), RangeError);
const rounded = estimate(1234567, profile);
assert.equal(rounded.net + rounded.total, rounded.gross);
assert.equal(Object.values(rounded.items).reduce((a, b) => a + b, 0), rounded.total);
console.log('Payroll estimate: scaling, custom profile, rounding and invalid-input checks passed.');
