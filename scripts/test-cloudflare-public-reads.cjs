'use strict';

const assert = require('node:assert/strict');
const {generateKeyPairSync, sign} = require('node:crypto');
const {menuDate, SOURCE_URL} = require('../lib/today-menu.cjs');
const {PUBLISH_URL, validSnapshot, MAX_AGE} = require('../lib/prepared-meal.cjs');
const {prepare} = require('./publish-cloudflare-meal.cjs');

async function main() {
    const {default: worker} = await import('../cloudflare/public-reads-worker.mjs');
    const {isPublisher} = await import('../cloudflare/menu-publisher.mjs');
    const today = menuDate();
    const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
    const snapshot = {
        schema: 1, checkedAt: new Date().toISOString(), etag: '"version-1"', lastModified: null,
        menus: [{status: 'ok', date: today, sourceUrl: SOURCE_URL, message: '',
            meals: ['조식', '중식', '석식', '야식'].map(name => ({name, groups: [{title: '기본 메뉴', items: ['밥']}]}))}]
    };
    assert.equal(validSnapshot(snapshot), true);
    assert.equal(validSnapshot({...snapshot, menus: [...snapshot.menus, ...snapshot.menus]}), false);
    let stored = snapshot;
    let fallback;
    const env = {
        STATE: {prepare: () => ({bind: () => ({first: async () => stored ? {body: JSON.stringify(stored)} : null})})},
        APP: {fetch: async request => {fallback = request; return new Response('legacy', {status: 202});}}
    };
    const call = (path, options) => worker.fetch(new Request('https://20261104.xyz' + path, options), env, {});
    const current = await call('/api/today-menu');
    assert.equal(current.headers.get('X-Work-Routine-Backend'), 'cloudflare');
    assert.equal((await current.json()).menus[0].checkedAt, snapshot.checkedAt);
    const absent = await (await call('/api/today-menu?date=' + tomorrow)).json();
    assert.equal(absent.status, 'not_published');
    assert.equal(absent.date, tomorrow);
    assert.equal(absent.menus.length, 1);
    assert.equal((await call('/api/today-menu?date=2026-02-30')).status, 400);
    assert.equal((await call('/api/today-menu?date=' + today + '&date=' + today)).status, 400);
    stored = {...snapshot, checkedAt: new Date(Date.now() - MAX_AGE - 1000).toISOString()};
    assert.equal((await call('/api/today-menu')).status, 202);
    stored = null;
    assert.equal((await call('/api/today-menu')).status, 202);
    assert.equal((await call('/api/today-menu?feature=keywords', {headers: {Cookie: 'session=fixture'}})).status, 202);
    assert.equal(fallback.headers.get('Cookie'), 'session=fixture');
    assert.equal((await call('/api/currency-rates', {headers: {Origin: 'https://outside.invalid'}})).status, 202);
    assert.equal((await call('/api/today-menu-refresh', {method: 'PUT'})).status, 401);

    const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
    const seconds = Math.floor(Date.now() / 1000);
    const claims = {
        iss: 'https://token.actions.githubusercontent.com', aud: PUBLISH_URL, repository_id: '1374753004',
        workflow_ref: 'wn-hue/shift_cal/.github/workflows/cloudflare-menu.yml@refs/heads/main',
        ref: 'refs/heads/main', event_name: 'schedule', nbf: seconds - 10, exp: seconds + 300
    };
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const request = (changes, corrupt = false) => {
        const message = encode({alg: 'RS256', kid: 'test-key'}) + '.' + encode({...claims, ...changes});
        const signature = sign('sha256', Buffer.from(message), privateKey);
        if (corrupt) signature[0] ^= 1;
        return new Request(PUBLISH_URL, {headers: {Authorization: 'Bearer ' + message + '.' + signature.toString('base64url')}});
    };
    const options = {fetcher: async () => Response.json({keys: [{...publicKey.export({format: 'jwk'}), kid: 'test-key', use: 'sig'}]})};
    assert.equal(await isPublisher(request(), options), true);
    assert.equal(await isPublisher(request({}, true), options), false);
    assert.equal(await isPublisher(request({aud: 'https://outside.invalid'}), options), false);
    assert.equal(await isPublisher(request({workflow_ref: 'wn-hue/shift_cal/.github/workflows/other.yml@refs/heads/main'}), options), false);
    assert.equal(await isPublisher(request({event_name: 'pull_request'}), options), false);
    assert.equal(await isPublisher(request({nbf: seconds - 30, exp: seconds - 10}), options), false);

    const refreshed = await prepare(snapshot, async (_url, options) => {
        assert.equal(options.headers['If-None-Match'], snapshot.etag);
        return new Response(null, {status: 304});
    });
    assert.deepEqual(refreshed.menus, snapshot.menus);
    console.log('Cloudflare public reads, fallbacks, PDF cache refresh and publisher identity passed.');
}

main().catch(error => {console.error(error); process.exitCode = 1;});
