'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../origin-welcome.js'), 'utf8');

async function check(response, {origin = 'https://20261104.xyz', search = '', hash = '', offline = false, oldButton = false} = {}) {
    const attrs = new Map([['aria-disabled', 'true']]);
    const apple = {hidden: true, setAttribute: (key, value) => attrs.set(key, value), removeAttribute: key => attrs.delete(key)};
    const feedback = {hidden: true};
    const status = {hidden: true, textContent: ''};
    const retry = {hidden: true, addEventListener(event, handler) { assert.equal(event, 'click'); this.click = handler; }};
    const start = oldButton ? {disabled: true, textContent: '앱 시작하기'} : null;
    const stored = new Map();
    let target;
    let requested;
    const elements = {'start-app': start, 'welcome-apple-login': apple, 'welcome-feedback': feedback, 'welcome-login-status': status, 'welcome-retry': retry};
    const document = {getElementById: id => elements[id]};
    vm.runInNewContext(source, {
        URLSearchParams,
        document,
        localStorage: {getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value)},
        location: {origin, search, hash, assign: value => { target = value; }},
        fetch: async url => { requested = url; if (offline) throw Error('offline'); return response; }
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(requested, '/api/apple-account?action=status');
    if (oldButton && origin !== 'https://20261104.xyz') {
        assert.equal(start.disabled, false);
        start.onclick();
        assert.equal(target, '/');
        assert.equal(stored.get('shift_origin_ready_v1'), '1');
        assert.match(document.cookie, /Secure; SameSite=Lax/);
    } else {
        assert.equal(start?.onclick, undefined, 'An old guest button cannot open the primary workspace');
        assert.equal(document.cookie, undefined);
        assert.equal(stored.size, 0);
    }
    return {apple, feedback, status, retry, attrs, get target() { return target; }};
}

(async () => {
    const configured = {ok: true, json: async () => ({configured: true})};
    const available = await check(configured);
    assert.equal(available.apple.hidden, false);
    assert.equal(available.attrs.has('aria-disabled'), false);
    assert.equal((await check({ok: true, json: async () => ({configured: false})})).apple.hidden, true);
    assert.equal((await check({ok: false})).apple.hidden, true);
    assert.equal((await check(null, {offline: true, oldButton: true})).apple.hidden, true);
    assert.equal((await check({ok: true, json: async () => ({configured: 'true'})})).apple.hidden, true);
    assert.match((await check(configured, {search: '?apple=denied'})).status.textContent, /취소/);
    assert.match((await check(configured, {search: '?google=error'})).status.textContent, /완료하지 못했어요/);
    const outage = await check(configured, {search: '?login=unavailable'});
    assert.equal(outage.feedback.hidden, false);
    assert.equal(outage.status.hidden, false);
    assert.equal(outage.retry.hidden, false);
    outage.retry.click();
    assert.equal(outage.target, '/');
    const shared = await check(configured, {search: '?login=unavailable&entry=shared-schedule', hash: '#live=' + 'a'.repeat(64)});
    shared.retry.click();
    assert.equal(shared.target, '/?entry=shared-schedule#live=' + 'a'.repeat(64));
    await check(null, {origin: 'https://work-routine.shift-cal.workers.dev', offline: true, oldButton: true});
    console.log('PASS public welcome statuses, optional Apple sign-in, and legacy-only guest entry');
})().catch(error => { console.error(error); process.exitCode = 1; });
