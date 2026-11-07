'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const {source, target} = require('../origin-migration-config.json');
const loginPath = '/api/apple-account?action=login';
const callbackPath = '/api/apple-account?action=callback';
const client = 'synthetic.service';
const ecKey = crypto.generateKeyPairSync('ec', {namedCurve: 'prime256v1'}).privateKey;
const identityKeys = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
const jwk = {...identityKeys.publicKey.export({format: 'jwk'}), kid: 'synthetic-identity', alg: 'RS256'};
Object.assign(process.env, {
    APP_URL: source,
    GOOGLE_CALENDAR_SESSION_SECRET: 'synthetic-session-key'.repeat(3),
    APPLE_CLIENT_ID: client,
    APPLE_NOTIFICATION_AUDIENCE: 'synthetic.primary',
    APPLE_TEAM_ID: 'SYNTHETIC',
    APPLE_KEY_ID: 'SYNTHETIC',
    APPLE_PRIVATE_KEY: ecKey.export({type: 'pkcs8', format: 'pem'}),
    BLOB_READ_WRITE_TOKEN: 'synthetic-test-only'
});
const erasureRecords = new Map();
const {storage} = require('../lib/parking-store.js');
storage.read = async key => erasureRecords.get(key) || null;
storage.write = async (key,value) => {erasureRecords.set(key,structuredClone(value));};
const apple = require('../api/apple-account.js');
const native = require('../api/native-account.js');

function idToken(nonce) {
    const now = Math.floor(Date.now() / 1000);
    const header = {kid: jwk.kid, alg: 'RS256'};
    const claims = {iss: 'https://appleid.apple.com', aud: client, sub: 'synthetic-user', nonce, iat: now, exp: now + 300};
    const signed = [header, claims].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    return signed + '.' + crypto.sign('sha256', Buffer.from(signed), identityKeys.privateKey).toString('base64url');
}

async function call(handler, url, {method = 'GET', headers = {}, body} = {}) {
    const response = {headers: {}, setHeader(key, value) { this.headers[key] = value; }, getHeader(key) { return this.headers[key]; }, end(value) { this.body = value ? JSON.parse(value) : null; }};
    await handler({url, method, headers, body}, response);
    return response;
}

async function start(url = loginPath) {
    const response = await call(apple, url);
    assert.equal(response.statusCode, 302);
    const authorize = new URL(response.headers.Location);
    assert.equal(authorize.origin, 'https://appleid.apple.com');
    assert.equal(authorize.searchParams.get('redirect_uri'), source + callbackPath);
    assert.equal(authorize.searchParams.get('response_mode'), 'form_post');
    const flowCookie = response.headers['Set-Cookie'][0];
    assert.match(flowCookie, /^__Host-shiftcal-apple-flow=/);
    assert.match(flowCookie, /HttpOnly; Secure; SameSite=None/);
    assert.doesNotMatch(flowCookie, /Domain=/i);
    return {state: authorize.searchParams.get('state'), nonce: authorize.searchParams.get('nonce'), cookie: flowCookie.split(';')[0]};
}

async function finish(flow, fields = {code: 'synthetic-code'}) {
    return call(apple, callbackPath, {
        method: 'POST',
        headers: {origin: 'https://appleid.apple.com', cookie: flow.cookie},
        body: new URLSearchParams({state: flow.state, ...fields}).toString()
    });
}

async function browserLogin() {
    const script = fs.readFileSync(require.resolve('../origin-bridge.js'), 'utf8');
    let click, assigned, saved;
    const context = {
        URL, TextEncoder, crypto: crypto.webcrypto, window: {},
        location: {origin: target, href: target + '/', assign(url) { assigned = url; }},
        localStorage: {getItem: () => '1'},
        document: {documentElement: {hasAttribute: () => false}, addEventListener(name, listener) { if (name === 'click') click = listener; }},
        sessionStorage: {setItem(key, value) { assert.equal(key, 'origin-auth-flow'); saved = JSON.parse(value); }}
    };
    vm.runInNewContext(script, context);
    let disabledPrevented = false;
    await click({target: {closest: () => ({href: target + loginPath, getAttribute: () => 'true'})}, preventDefault() { disabledPrevented = true; }, stopImmediatePropagation() {}});
    assert(disabledPrevented);
    assert.equal(assigned, undefined, 'unconfigured Apple login must not start an OAuth redirect');
    assert.equal(saved, undefined, 'disabled login must not overwrite a pending account flow');
    await click({target: {closest: () => ({href: target + loginPath, getAttribute: () => null})}, preventDefault() {}, stopImmediatePropagation() {}});
    assert.equal(saved.intent, 'account', 'Apple return triggers the account restore screen');
    const entry = new URL(assigned);
    assert.equal(entry.origin, source);
    assert.equal(entry.searchParams.get('web_return'), target);
    assert.equal(entry.searchParams.get('native_state'), saved.state);
    assert.equal(entry.searchParams.get('native_challenge'), crypto.createHash('sha256').update(saved.verifier).digest('hex'));
    return {login: entry.pathname + entry.search, ...saved};
}

(async () => {
    const originalFetch = global.fetch;
    let nonce, tokenCalls = 0;
    global.fetch = async (url, options) => {
        if (url === 'https://appleid.apple.com/auth/token') {
            tokenCalls++;
            assert.equal(options.body.get('redirect_uri'), source + callbackPath);
            return {ok: true, json: async () => ({id_token: idToken(nonce), refresh_token: 'synthetic-refresh'})};
        }
        assert.equal(url, 'https://appleid.apple.com/auth/keys');
        return {json: async () => ({keys: [jwk]})};
    };
    try {
        const verifier = crypto.randomBytes(32).toString('hex');
        const state = crypto.randomBytes(32).toString('hex');
        const challenge = crypto.createHash('sha256').update(verifier).digest('hex');
        const nativeLogin = loginPath + '&' + new URLSearchParams({native_challenge: challenge, native_state: state});
        const proxied = await call(apple, nativeLogin, {headers: {'x-work-routine-origin': target}});
        assert.equal(proxied.headers.Location, source + nativeLogin);
        assert.equal(proxied.headers['Set-Cookie'], undefined, 'Cloudflare does not receive the callback cookie');
        assert.equal((await call(apple, nativeLogin, {headers: {'x-work-routine-origin': 'https://attacker.invalid'}})).statusCode, 400);
        assert.equal((await call(apple, loginPath, {headers: {'x-work-routine-origin': target}})).statusCode, 400);
        assert.equal((await call(apple, nativeLogin + '&web_return=https://attacker.invalid')).statusCode, 400);

        const nativeFlow = await start(nativeLogin);
        nonce = nativeFlow.nonce;
        const badState = await finish(nativeFlow, {state: 'wrong', code: 'synthetic-code'});
        assert.equal(badState.headers.Location, source + '/?apple=error&reason=STATE');
        assert.equal(badState.headers['Set-Cookie'], undefined);
        assert.equal(tokenCalls, 0);
        const nativeDone = await finish(nativeFlow);
        const [active] = erasureRecords.values();
        assert.equal(active.phase, 'active');
        assert(Number.isSafeInteger(active.appleAuthorizedAt));
        const callback = new URL(nativeDone.headers.Location);
        assert.equal(callback.protocol, 'shiftcal:');
        assert.equal(callback.hostname, 'auth');
        assert.equal(callback.searchParams.get('state'), state);
        assert.equal(nativeDone.headers['Set-Cookie'].length, 1, 'only the flow cookie is cleared on the backend');
        const ticket = callback.searchParams.get('ticket');
        assert.equal((await call(native, '/api/native-account?action=exchange', {method: 'POST', body: {ticket, state, verifier: '0'.repeat(64)}})).statusCode, 401);
        const exchange = await call(native, '/api/native-account?action=exchange', {method: 'POST', body: {ticket, state, verifier}});
        assert.equal(exchange.statusCode, 200);
        const installed = await call(native, '/api/native-account?action=web-session', {method: 'POST', headers: {authorization: 'Bearer ' + exchange.body.token}});
        assert.equal(installed.statusCode, 200);
        assert.match(installed.headers['Set-Cookie'][0], /^__Host-shiftcal-apple=.+; Path=\/; HttpOnly; Secure; SameSite=Lax/);

        const web = await browserLogin();
        const browserFlow = await start(web.login);
        nonce = browserFlow.nonce;
        const browserDone = await finish(browserFlow);
        const destination = new URL(browserDone.headers.Location);
        assert.equal(destination.origin, target);
        assert.equal(destination.pathname, '/origin-auth.html');
        const params = new URLSearchParams(destination.hash.slice(1));
        assert.equal(params.get('state'), web.state);
        assert.equal((await call(native, '/api/native-account?action=exchange', {method: 'POST', body: {ticket: params.get('ticket'), state: web.state, verifier: web.verifier}})).statusCode, 200);
        assert.equal(browserDone.headers['Set-Cookie'].length, 1);
        assert.equal((await finish(await start(web.login), {error: 'user_cancelled_authorize'})).headers.Location, target + '/?apple=denied');
        assert.equal((await finish(await start(web.login), {})).headers.Location, target + '/?apple=error&reason=CODE');
        assert.equal((await finish(await start(nativeLogin), {error: 'user_cancelled_authorize'})).headers.Location, 'shiftcal://auth?state=' + state + '&error=denied');

        const legacyFlow = await start();
        nonce = legacyFlow.nonce;
        const legacyDone = await finish(legacyFlow);
        assert.equal(legacyDone.headers.Location, source + '/?cloud=connected');
        const legacyCookie = legacyDone.headers['Set-Cookie'][1].split(';')[0];
        assert.match(legacyCookie, /^__Host-shiftcal-apple=.+/);
        const legacyStatus = await call(apple, '/api/apple-account?action=status', {headers: {cookie: legacyCookie}});
        const csrf = legacyStatus.body.csrf;
        assert.equal((await call(apple, '/api/apple-account?action=logout', {method: 'POST', headers: {cookie: legacyCookie, origin: target, 'x-shift-csrf': csrf}})).statusCode, 403);
        assert.equal((await call(apple, '/api/apple-account?action=logout', {method: 'POST', headers: {cookie: legacyCookie, origin: source, 'x-shift-csrf': csrf}})).statusCode, 200);

        const worker = (await import('../cloudflare/app-worker.mjs')).default;
        const foreignPost = await worker.fetch(new Request(target + callbackPath, {method: 'POST', headers: {Origin: 'https://appleid.apple.com'}, body: 'state=synthetic'}), {});
        assert.equal(foreignPost.status, 403);
        const notificationThroughProxy = await worker.fetch(new Request(target + '/api/apple-account', {method:'POST',headers:{'Content-Type':'application/json'},body:'{"payload":"unsigned"}'}),{});
        assert.equal(notificationThroughProxy.status,403,'Apple notifications use the canonical backend, not the origin-guarded proxy');
        console.log('PASS Apple login issues the flow cookie on the callback host; native and browser handoff, denial, same-origin sessions and Cloudflare guard verified');
    } finally {
        global.fetch = originalFetch;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
