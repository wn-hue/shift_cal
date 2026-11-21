'use strict';
const assert = require('node:assert/strict');
const {handlerFor, mealDate} = require('../api/meal-votes')._test;
const {seal} = require('../api/google-calendar')._test;
const secret = 'test-only-meal-key';
process.env.GOOGLE_CALENDAR_SESSION_SECRET = secret;
const origin = 'https://app.test';
let record = null, version = 0, reads = 0;
const storage = {
  async read() {
    reads++;
    await Promise.resolve();
    return record ? {...structuredClone(record), _etag: String(version)} : null;
  },
  async write(_path, data, etag) {
    await Promise.resolve();
    if (etag !== (record ? String(version) : undefined)) {
      throw Object.assign(Error('Fixture conflict'), {name: 'BlobPreconditionFailedError'});
    }
    record = structuredClone(data);
    version++;
  }
};
let now = Date.parse('2026-10-14T12:00:00+09:00');
const handler = handlerFor(storage, {secret, origin, now: () => now});
function account(provider, sub, expires = Date.now() + 60000) {
  const session = {sub, csrf: 'test-csrf', exp: expires};
  if (provider === 'apple') session.provider = 'apple';
  return '__Host-shiftcal-' + provider + '=' + seal(session, secret);
}
async function request(method, cookie, body, requestOrigin = origin, query = '') {
  const out = {headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(s) { this.data = JSON.parse(s); }};
  await handler({method, url: '/api/meal-votes' + query, headers: {cookie, origin: requestOrigin, 'content-type': 'application/json'}, body}, out);
  assert.equal(out.headers['Cache-Control'], 'no-store');
  return out;
}
(async () => {
  const a = account('google', 'member-a');
  const aSecondDevice = account('google', 'member-a');
  const b = account('apple', 'member-b');
  const vote = {date: '2026-10-14', meal: '중식', vote: 'up'};
  const food = (cookie, period = 'this') => request('GET', cookie, null, origin, '?context=local-food&period=' + period);
  for (const guest of [undefined, '__Host-shift-meal=' + 'a'.repeat(32) + '.' + 'b'.repeat(64),
    '__Host-shiftcal-google=invalid', account('google', 'expired', Date.now()-10000), b.replace('shiftcal-apple', 'shiftcal-google')]) {
    assert.equal((await request('POST', guest, vote)).statusCode, 401);
    assert.equal((await food(guest)).statusCode, 401);
  }
  assert.equal(reads, 0, 'Reject unauthenticated writes without touching vote storage');
  const who = (await food(a)).data;
  assert.match(who.voter, /^[a-f0-9]{64}$/);
  assert.equal(who.week, '2026-10-12');
  assert.deepEqual(who, (await food(aSecondDevice)).data);
  assert.notEqual(who.voter, (await food(b)).data.voter);
  assert.notEqual(who.voter, (await food(a, 'last')).data.voter);
  assert.equal((await food(a, 'last')).data.week, '2026-10-05');
  assert.equal((await food(a, 'other')).statusCode, 400);
  assert.equal(reads, 0, 'Local-food identities do not read meal storage');
  const guest = await request('GET');
  assert.equal(guest.headers['Set-Cookie'], undefined);
  assert.deepEqual(guest.data.mine, {});
  record = {date: vote.date, votes: {'old-opaque-device-id': {'석식':'up'}}};
  const results = await Promise.all([request('POST', a, vote), request('POST', b, {...vote, vote: 'down'})]);
  assert.deepEqual(results.map(r => r.statusCode), [200, 200]);
  const mine = (await request('GET', aSecondDevice)).data;
  assert.deepEqual(mine.totals['중식'], {up: 1, down: 1});
  assert.deepEqual(mine.totals['석식'], {up: 1, down: 0});
  assert.deepEqual(mine.mine, {'중식':'up'});
  await request('POST', aSecondDevice, vote);
  assert.equal((await request('GET')).data.totals['중식'].up, 1);
  await request('POST', aSecondDevice, {...vote, vote: 'down'});
  assert.deepEqual((await request('GET')).data.totals['중식'], {up:0, down:2});
  await request('POST', a, {...vote, vote: null});
  assert.equal((await request('GET')).data.totals['중식'].down, 1);
  assert.equal((await request('POST', b, vote, 'https://other.test')).statusCode, 403);
  assert.equal(mealDate(Date.parse('2026-10-15T02:59:00+09:00')), '2026-10-14');
  now = Date.parse('2026-10-15T03:00:00+09:00');
  assert.deepEqual((await request('GET', a)).data.totals['중식'], {up:0, down:0});
  await request('POST', a, {...vote,date:'2026-10-15'});
  assert.equal(Object.keys(record.votes).length, 1);
  assert.equal(record.date, '2026-10-15');
  assert(!JSON.stringify(record).includes('member-a'));
  assert(!JSON.stringify(record).includes(who.voter));
  console.log('PASS public ratings, authenticated account votes, cross-device idempotency, legacy totals, weekly scoped identities, origin, concurrency, 03:00 rollover');
})().catch(e => {console.error(e);process.exit(1);});
