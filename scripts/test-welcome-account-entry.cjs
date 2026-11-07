'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../origin-welcome.js'), 'utf8');
async function check(result, fail = false) {
    let resolveStatus, target;
    const status = new Promise(resolve => { resolveStatus = resolve; });
    const start = {disabled: true, textContent: '앱 시작하기'};
    const apple = {hidden: true};
    const stored = new Map();
    const document = {getElementById: id => id === 'start-app' ? start : apple};
    vm.runInNewContext(source, {
        document,
        localStorage: {getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value)},
        location: {assign: value => { target = value; }},
        fetch: async () => { await status; if (fail) throw Error('offline'); return result; }
    });
    assert.equal(start.disabled, false, 'starting without an account must not wait for Apple status');
    assert.equal(apple.hidden, true, 'do not offer an unconfirmed login');
    start.onclick();
    assert.equal(target, '/');
    assert.equal(stored.get('shift_origin_ready_v1'), '1');
    assert.match(document.cookie, /Secure; SameSite=Lax/);
    resolveStatus();
    await new Promise(resolve => setImmediate(resolve));
    return apple;
}
(async () => {
    assert.equal((await check({ok: true, json: async () => ({configured: true})})).hidden, false);
    assert.equal((await check({ok: true, json: async () => ({configured: false})})).hidden, true);
    assert.equal((await check({ok: false})).hidden, true);
    assert.equal((await check(null, true)).hidden, true);
    assert.equal((await check({ok: true, json: async () => ({configured: 'true'})})).hidden, true);
    console.log('PASS optional Apple welcome entry: configured only, no startup blocking, HTTP and offline failures preserve guest start');
})().catch(error => { console.error(error); process.exitCode = 1; });
