'use strict';
const assert = require('node:assert/strict'), crypto = require('node:crypto'), {EventEmitter} = require('node:events');
const apns = require('../lib/parking-apns'), core = require('../lib/parking-core');
const {handlerFor} = require('../api/parking')._test, push = require('../lib/parking-push');
const {privateKey, publicKey} = crypto.generateKeyPairSync('ec', {namedCurve: 'prime256v1'});
const config = {keyId: 'TESTKEY123', teamId: 'TESTTEAM12', privateKey: privateKey.export({type: 'pkcs8', format: 'pem'}), topic: 'com.wnhue.workroutine'};
const env = {PARKING_APNS_KEY_ID: config.keyId, PARKING_APNS_TEAM_ID: config.teamId, PARKING_APNS_PRIVATE_KEY: config.privateKey, PARKING_APNS_TOPIC: config.topic};
const subscription = {kind: 'apns', token: 'ab'.repeat(32), environment: 'production'};
let now = Date.parse('2026-11-09T06:55:00+09:00');
const payload = {title: '주차장 만차', body: '만차 제보가 5건 이상이에요.', tag: 'parking-full-2026-11-09', expiresAt: now + 600000};

async function senderChecks() {
    assert(apns.configuration(env)); assert.equal(apns.configuration({}), null);
    for (const change of [{PARKING_APNS_TOPIC: 'other.app'}, {PARKING_APNS_KEY_ID: 'bad'}, {PARKING_APNS_PRIVATE_KEY: 'bad'}]) assert.equal(apns.configuration({...env, ...change}), null);
    assert(apns.validSubscription(subscription)); assert(apns.validSubscription({...subscription, token: 'ab'.repeat(40)}));
    for (const change of [{token: '../evil'}, {environment: 'http://localhost'}, {token: 'ab'.repeat(300)}, {token: 'a'.repeat(65)}, {kind: 'web'}]) assert(!apns.validSubscription({...subscription, ...change}));
    const jwt = apns._test.providerToken(config, now), parts = jwt.split('.');
    assert.deepEqual(JSON.parse(Buffer.from(parts[0], 'base64url')), {alg: 'ES256', kid: config.keyId});
    assert.deepEqual(JSON.parse(Buffer.from(parts[1], 'base64url')), {iss: config.teamId, iat: now / 1000});
    assert(crypto.verify('sha256', Buffer.from(parts.slice(0, 2).join('.')), {key: publicKey, dsaEncoding: 'ieee-p1363'}, Buffer.from(parts[2], 'base64url')));
    assert.equal(apns._test.providerToken(config, now + 49 * 60000), jwt); assert.notEqual(apns._test.providerToken(config, now + 51 * 60000), jwt);
    let origin, headers, sentBody, closed = 0, outcome = {status: 200, reason: ''};
    const connect = host => {
        origin = host; const client = new EventEmitter(); client.close = () => closed++; client.destroy = () => {};
        client.request = value => {
            headers = value; const request = new EventEmitter(); request.close = () => {};
            request.end = body => { sentBody = JSON.parse(body); queueMicrotask(() => { request.emit('response', {':status': outcome.status}); request.emit('data', Buffer.from(JSON.stringify({reason: outcome.reason}))); request.emit('end'); }); };
            return request;
        }; return client;
    };
    const options = {config, now: () => now, connect};
    await apns.send(subscription, payload, options);
    assert.equal(origin, 'https://api.push.apple.com'); assert.equal(headers['apns-topic'], 'com.wnhue.workroutine'); assert.equal(headers[':path'], '/3/device/' + subscription.token);
    assert.equal(headers['apns-push-type'], 'alert'); assert.equal(headers['apns-expiration'], String((now + 600000) / 1000)); assert(headers.authorization.startsWith('bearer '));
    assert.deepEqual(sentBody, {aps: {alert: {title: payload.title, body: payload.body}, sound: 'default', 'thread-id': 'parking-full'}, route: 'parking', expiresAt: payload.expiresAt}); assert.equal(closed, 1);
    await apns.send({...subscription, environment: 'sandbox'}, payload, options); assert.equal(origin, 'https://api.sandbox.push.apple.com');
    outcome = {status: 400, reason: 'BadDeviceToken'}; await assert.rejects(apns.send(subscription, payload, options), error => error.statusCode === 410);
    outcome = {status: 403, reason: 'InvalidProviderToken'}; await assert.rejects(apns.send(subscription, payload, options), error => error.statusCode === 403);
    let expiredConnect = false; await apns.send(subscription, {...payload, expiresAt: now - 1}, {...options, connect: () => { expiredConnect = true; }}); assert.equal(expiredConnect, false);
}

async function endpointChecks() {
    const records = new Map(), versions = new Map();
    const store = {async read(path) { const value = records.get(path); return value ? {...structuredClone(value), _etag: String(versions.get(path))} : null; }, async write(path, value, etag) { if (records.has(path) && etag !== String(versions.get(path))) { const error = Error(); error.name = 'BlobPreconditionFailedError'; throw error; } records.set(path, structuredClone(value)); versions.set(path, (versions.get(path) || 0) + 1); }};
    let nativeAvailable = true; const sent = [], jobs = [];
    const handler = handlerFor(store, {secret: 'synthetic-parking-secret', origin: 'https://parking.test', now: () => now, nativeAvailable: () => nativeAvailable, send: async (s, p) => sent.push({s, p}), defer: p => jobs.push(p)});
    const call = async (method, cookie, body, origin = 'https://parking.test') => {
        const headers = {}, res = {setHeader(k, v) { headers[k] = v; }, end(raw) { this.data = JSON.parse(raw); }};
        await handler({method, headers: {cookie, origin, 'content-type': 'application/json'}, body}, res);
        return {status: res.statusCode, data: res.data, cookie: headers['Set-Cookie']?.split(';')[0]};
    };
    const voters = await Promise.all(Array.from({length: 5}, () => call('GET')));
    nativeAvailable = false;
    const unavailable = await call('POST', voters[0].cookie, {action: 'native-subscribe', subscription}); assert.equal(unavailable.status, 503); assert.equal(records.size, 0);
    assert.equal((await call('GET', voters[0].cookie)).data.nativeAvailable, false);
    nativeAvailable = true;
    assert.equal((await call('POST', voters[0].cookie, {action: 'native-subscribe', subscription}, 'https://foreign.test')).status, 403);
    assert.equal((await call('POST', voters[0].cookie, {action: 'native-subscribe', subscription: {...subscription, token: '../wrong'}})).status, 400);
    for (let index = 0; index < voters.length; index++) {
        const token = index.toString(16).padStart(2, '0').repeat(32);
        assert.equal((await call('POST', voters[index].cookie, {action: 'native-subscribe', subscription: {...subscription, token}})).status, 200);
    }
    const firstOwner = Object.keys(records.get(push.PATH).items)[0];
    const pending = records.get(push.PATH); pending.items[firstOwner].leaseToken = 'pending-send'; pending.items[firstOwner].leaseUntil = now + 90000;
    await store.write(push.PATH, pending, String(versions.get(push.PATH)));
    await call('POST', voters[0].cookie, {action: 'native-subscribe', subscription: {...subscription, token: '00'.repeat(32)}});
    assert.equal(records.get(push.PATH).items[firstOwner].leaseToken, 'pending-send', 'foreground token renewal preserves an in-flight lease');
    const renewed = records.get(push.PATH); delete renewed.items[firstOwner].leaseToken; delete renewed.items[firstOwner].leaseUntil;
    await store.write(push.PATH, renewed, String(versions.get(push.PATH)));
    const status = (await call('GET', voters[0].cookie)).data; assert(status.subscribed); assert.equal(status.subscriptionKind, 'apns'); assert(!JSON.stringify(status).includes('token'));
    const location = {latitude: core.LOCATION_RULE.latitude, longitude: core.LOCATION_RULE.longitude, accuracy: 20, timestamp: now};
    const vote = {vote: 'full', group: 'C', location};
    assert.equal((await call('POST', voters[0].cookie, {...vote, location: {...location, latitude: 0}})).status, 403);
    for (const voter of voters) assert.equal((await call('POST', voter.cookie, vote)).status, 200);
    await Promise.all(jobs); assert.equal(sent.length, 5); assert(sent.every(x => x.s.kind === 'apns')); assert.equal((await call('GET', voters[0].cookie)).data.status, 'full');
    await Promise.all(jobs); assert.equal(sent.length, 5, 'same-day full alert is not duplicated');
    assert(Object.values(records.get('parking/current.json').votes).every(x => Object.keys(x).sort().join(',') === 'at,value'), 'coordinates never persist');
    assert.equal((await call('POST', voters[0].cookie, {action: 'unsubscribe'})).status, 200); assert.equal((await call('POST', voters[0].cookie, vote)).status, 403);
    assert.equal((await call('GET', voters[0].cookie)).data.subscribed, false);
    now = Date.parse('2026-11-09T07:31:00+09:00'); assert.equal((await call('POST', voters[1].cookie, {...vote, location: {...location, timestamp: now}})).status, 403);
    now = Date.parse('2026-11-14T07:00:00+09:00'); assert.equal((await call('POST', voters[1].cookie, {...vote, location: {...location, timestamp: now}})).status, 403);
    const duplicate = await call('GET'); const duplicateToken = '01'.repeat(32);
    assert.equal((await call('POST', duplicate.cookie, {action: 'native-subscribe', subscription: {...subscription, token: duplicateToken}})).status, 200);
    assert.equal((await call('GET', voters[1].cookie)).data.subscribed, false, 'a device token cannot activate multiple cookie owners');
    // Invalid APNs device tokens are removed; provider configuration errors retain subscriptions.
    const invalidOwner = Object.keys(records.get(push.PATH).items)[0];
    const r = records.get(push.PATH); r.items[invalidOwner].lastEvent = null; await store.write(push.PATH, r, String(versions.get(push.PATH)));
    await push.dispatch(store, {id: 'next-event', at: now}, async () => { throw Object.assign(Error('invalid'), {statusCode: 410}); }, () => now);
    assert.equal(Object.keys(records.get(push.PATH).items).length, 0);
}
async function dispatcherChecks() {
    let clock = Date.parse('2026-11-09T07:00:00+09:00'), version = 0, record, removeBeforeSend = false;
    const store = {
        async read() {
            if (removeBeforeSend && record.items.user?.leaseToken) { delete record.items.user; version++; removeBeforeSend = false; }
            return {...structuredClone(record), _etag: String(version)};
        },
        async write(path, next, etag) {
            if (etag !== String(version)) { const error = Error(); error.name = 'BlobPreconditionFailedError'; throw error; }
            record = structuredClone(next); version++;
        }
    };
    const participant = () => ({subscription, updatedAt: clock});
    record = {items: Object.fromEntries(Array.from({length: 45}, (_, n) => ['user' + n, {...participant(), subscription: {...subscription, token: n.toString(16).padStart(2, '0').repeat(32)}}]))};
    const delivered = [], event = {id: 'batch', at: clock};
    const send = async value => { delivered.push(value.token); };
    await Promise.all([push.dispatch(store, event, send, () => clock), push.dispatch(store, event, send, () => clock)]);
    assert.equal(delivered.length, 45); assert.equal(new Set(delivered).size, 45, 'concurrent batches send once per recipient');
    record = {items: {user: participant()}}; version++;
    let attempts = 0;
    await push.dispatch(store, {id: 'retry', at: clock}, async () => { attempts++; throw Object.assign(Error(), {statusCode: 403}); }, () => clock);
    assert(record.items.user); assert.equal(record.items.user.lastEvent, undefined); assert.equal(attempts, 1);
    await push.dispatch(store, {id: 'retry', at: clock}, async () => { attempts++; }, () => clock); assert.equal(attempts, 1, 'provider failures back off without deleting the device');
    clock += 60001;
    await push.dispatch(store, {id: 'retry', at: clock}, async () => { attempts++; }, () => clock); assert.equal(attempts, 2); assert.equal(record.items.user.lastEvent, 'retry');
    record = {items: {user: participant()}}; version++; removeBeforeSend = true;
    let optedOutDeliveries = 0;
    await push.dispatch(store, {id: 'opt-out', at: clock}, async () => { optedOutDeliveries++; }, () => clock);
    assert.equal(record.items.user, undefined); assert.equal(optedOutDeliveries, 0, 'opt-out after claim prevents delivery');
    record = {items: {user: participant()}}; version++;
    let expired = 0;
    await push.dispatch(store, {id: 'expired', at: clock - 600001}, async () => { expired++; }, () => clock); assert.equal(expired, 0);
}
(async () => { await senderChecks(); await endpointChecks(); await dispatcherChecks(); console.log('PASS native APNs configuration/JWT/HTTP2/topic/env/expiration/errors, mutual participation, token isolation, GPS/time gating, privacy and once-per-event delivery'); })().catch(error => { console.error(error); process.exitCode = 1; });
