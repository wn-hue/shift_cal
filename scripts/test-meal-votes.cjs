'use strict';
const assert = require('node:assert/strict');
const {createHmac} = require('node:crypto');
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
    const bootstrap = await request('POST', guest, vote);
    assert.equal(bootstrap.statusCode, 409);
    assert.equal(bootstrap.data.error, 'VOTE_SESSION_REFRESH');
    assert.match(bootstrap.headers['Set-Cookie'], /^__Host-shift-meal=[a-f0-9]{32}\.[a-f0-9]{64};/);
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
  assert.match(guest.headers['Set-Cookie'], /Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000$/);
  assert.deepEqual(guest.data.mine, {});
  const browser = guest.headers['Set-Cookie'].split(';')[0];
  const browser2 = (await request('GET')).headers['Set-Cookie'].split(';')[0];
  assert.notEqual(browser, browser2);
  assert.equal((await request('GET', browser)).headers['Set-Cookie'], undefined);
  assert.equal((await request('POST', browser, vote, 'https://other.test')).statusCode, 403);
  const deviceId = browser.split('=')[1].split('.')[0];
  const oldKey = createHmac('sha256', secret).update(vote.date + ':' + deviceId).digest('hex');
  record = {date: vote.date, votes: {[oldKey]: {'중식':'up', '석식':'down'}}};
  assert.deepEqual((await request('GET', browser)).data.mine, {'중식':'up', '석식':'down'});
  await request('POST', browser, {...vote, vote:'down'});
  assert.deepEqual((await request('GET', browser2)).data.mine, {});
  assert.deepEqual((await request('GET', a+'; '+browser)).data.mine, {'중식':'down', '석식':'down'});
  await request('POST', a+'; '+browser, vote);
  assert.deepEqual((await request('GET', browser)).data.mine, {'석식':'down'});
  assert.deepEqual((await request('GET', aSecondDevice)).data.mine, {'중식':'up'});
  assert.deepEqual((await request('GET')).data.totals['중식'], {up:1,down:0});
  await request('POST', browser2, {...vote, vote:'down'});
  let merged = await request('POST', a+'; '+browser2, vote);
  assert.deepEqual(merged.data.totals['중식'], {up:1,down:0});
  await request('POST', a+'; '+browser, {...vote, meal:'석식', vote:null});
  assert.deepEqual((await request('GET', browser)).data.mine,{});
  await request('POST', browser, vote);
  merged = await request('POST', a+'; '+browser, {...vote,vote:null});
  assert.deepEqual(merged.data.totals['중식'], {up:0,down:0});
  assert.deepEqual((await request('GET', aSecondDevice)).data.mine,{});
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
  console.log('PASS guest votes, legacy cookie editing, per-item guest/account merge, public ratings, authenticated account votes, cross-device idempotency, legacy totals, weekly scoped identities, origin, concurrency, 03:00 rollover');
})().catch(e => {console.error(e);process.exit(1);});
