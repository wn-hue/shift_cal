'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sdk = require('@vercel/blob');

const origin = 'https://notifications.example';
const audience = 'com.example.primary-app';
const servicesId = 'com.example.login-service';
const secret = 'synthetic-apple-notification-secret'.repeat(2);
const signer = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
const untrustedSigner = crypto.generateKeyPairSync('rsa', {modulusLength: 2048});
const jwk = {...signer.publicKey.export({format: 'jwk'}), kid: 'notification-key', alg: 'RS256', use: 'sig'};
const clientKey = crypto.generateKeyPairSync('ec', {namedCurve: 'prime256v1'}).privateKey;
Object.assign(process.env, {
    APP_URL: origin,
    GOOGLE_CALENDAR_SESSION_SECRET: secret,
    APPLE_NOTIFICATION_AUDIENCE: audience,
    APPLE_CLIENT_ID: servicesId,
    APPLE_TEAM_ID: 'SYNTHETIC',
    APPLE_KEY_ID: 'SYNTHETIC',
    APPLE_PRIVATE_KEY: clientKey.export({type: 'pkcs8', format: 'pem'}),
    BLOB_READ_WRITE_TOKEN: 'synthetic-no-network',
});
delete process.env.GOOGLE_OAUTH_REDIRECT_ORIGIN;

const documents = new Map();
let version = 0;
let failedDeletePath;
let beforeDelete;
const pathFor = value => value.startsWith('https:') ? new URL(value).pathname.slice(1) : value;
const metadata = (pathname, record) => ({pathname, etag: record.etag, url: 'https://blobs.example/' + pathname});
const fixtureError = name => Object.assign(new Error(name), {name});
function write(path, data) {
    documents.set(path, {data: structuredClone(data), etag: 'v' + (++version)});
}
function read(path) {
    return documents.get(path)?.data;
}
require.cache[require.resolve('@vercel/blob')].exports = {
    ...sdk,
    async head(value) {
        const path = pathFor(value);
        const record = documents.get(path);
        if (!record) throw fixtureError('BlobNotFoundError');
        return metadata(path, record);
    },
    async get(value) {
        const path = pathFor(value);
        const record = documents.get(path);
        return record ? {blob: metadata(path, record), stream: Response.json(record.data).body} : null;
    },
    async put(path, body, {allowOverwrite, ifMatch} = {}) {
        const record = documents.get(path);
        if (ifMatch && record?.etag !== ifMatch) throw fixtureError('BlobPreconditionFailedError');
        if (record && !allowOverwrite) throw fixtureError('BlobAlreadyExistsError');
        write(path, JSON.parse(body));
        return metadata(path, documents.get(path));
    },
    async del(path, {ifMatch} = {}) {
        await beforeDelete?.(path);
        if (path === failedDeletePath) throw new Error('Synthetic storage outage');
        const record = documents.get(path);
        if (!record) throw fixtureError('BlobNotFoundError');
        if (ifMatch && record.etag !== ifMatch) throw fixtureError('BlobPreconditionFailedError');
        documents.delete(path);
    },
    async list({prefix, cursor}) {
        const paths = [...documents.keys()].filter(path => path.startsWith(prefix)).sort();
        const offset = Number(cursor || 0);
        const next = offset + 1;
        return {
            blobs: paths.slice(offset, next).map(path => metadata(path, documents.get(path))),
            hasMore: next < paths.length,
            cursor: String(next),
        };
    },
};

const apple = require('../api/apple-account');
const {seal} = require('../api/google-calendar')._test;
const accountErasure = require('../lib/account-erasure');
const lostFound = require('../lib/lost-found');
const accountData = require('../account-data-core');
const applePath = '/api/apple-account';
const notificationPath = applePath + '?action=notification';
const originalNow = Date.now;
const originalFetch = global.fetch;
let clock = Math.floor(Date.now() / 1000) * 1000;
let jwksUnavailable = false;
const providerRequests = [];
Date.now = () => clock;
global.fetch = async value => {
    providerRequests.push(String(value));
    assert.equal(String(value), 'https://appleid.apple.com/auth/keys', 'the signed callback needs only Apple public keys');
    if (jwksUnavailable) throw new Error('Synthetic JWKS outage');
    return Response.json({keys: [jwk]});
};

const seconds = () => Math.floor(clock / 1000);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function signEvent(type, sub, {claims = {}, event = {}, header = {}, key = signer.privateKey} = {}) {
    const tokenHeader = {alg: 'RS256', kid: jwk.kid, ...header};
    const payload = {
        iss: 'https://appleid.apple.com',
        aud: audience,
        iat: seconds(),
        jti: crypto.randomUUID(),
        events: {type, sub, event_time: seconds(), ...event},
        ...claims,
    };
    const input = [tokenHeader, payload].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    return input + '.' + crypto.sign('RSA-SHA256', Buffer.from(input), key).toString('base64url');
}

async function call(url, {method = 'POST', body, headers = {}} = {}) {
    const response = {
        headers: {},
        setHeader(key, value) { this.headers[key] = value; },
        getHeader(key) { return this.headers[key]; },
        end(value) { this.data = value ? JSON.parse(value) : null; },
    };
    await apple({url, method, body, headers}, response);
    return response;
}

function notify(payload, {url = applePath, contentType = 'application/json', raw = false} = {}) {
    const body = {payload};
    return call(url, {
        body: raw ? JSON.stringify(body) : body,
        headers: contentType ? {'content-type': contentType} : {},
    });
}

function seed(sub, {issuedAt = clock - 60000, accountEpoch = 0} = {}) {
    const user = {provider: 'apple', sub: 'apple:' + sub, issuedAt, exp: clock + 3600000, csrf: 'csrf-' + sub, refresh: 'synthetic-refresh-' + sub};
    const owner = lostFound.identity(user, secret);
    const backup = 'accounts/apple/' + hash(user.sub) + '.json';
    const link = 'schedules/' + crypto.randomBytes(32).toString('hex') + '.json';
    const postId = crypto.randomUUID();
    write(backup, {
        revision: crypto.randomBytes(16).toString('hex'),
        updatedAt: new Date(clock).toISOString(),
        accountEpoch,
        data: accountData.normalize({shift_day_memos: {'2026-11-01': 'Synthetic private memo'}}),
    });
    write(link, {owner: hash(user.sub), schedule: {group: 'C', month: '2026-11', days: []}, updated: new Date(clock).toISOString()});
    const board = read(lostFound.PATH) || {posts: [], reports: {}, blocks: {}, banned: {}, creates: {}, deleted: {}};
    write(lostFound.PATH, {...board, posts: [...board.posts, {id: postId, owner, createdAt: clock, reports: {}}]});
    return {user, owner, backup, link, postId};
}

function assertPresent(fixture) {
    assert(documents.has(fixture.backup), 'account backup remains');
    assert(documents.has(fixture.link), 'shared schedule remains');
    assert(read(lostFound.PATH).posts.some(post => post.id === fixture.postId), 'lost-and-found post remains');
}

function assertErased(fixture) {
    assert(!documents.has(fixture.backup), 'account backup is erased');
    assert(!documents.has(fixture.link), 'shared schedule is erased');
    assert(!JSON.stringify(read(lostFound.PATH)).includes(fixture.owner), 'lost-and-found board no longer identifies the account');
}

function status(user) {
    const cookie = '__Host-shiftcal-apple=' + seal(user, secret);
    return call(applePath + '?action=status', {method: 'GET', headers: {cookie}});
}

async function run() {
    const sub = 'notification.subject';
    const owner = seed(sub);
    const other = seed('untouched.subject');
    const initial = structuredClone([...documents]);
    const validDeletion = signEvent('account-deleted', sub);
    jwksUnavailable = true;
    assert.equal((await notify(validDeletion)).statusCode, 503, 'a transient key fetch failure is retryable');
    jwksUnavailable = false;
    assert.deepEqual([...documents], initial);

    const email = {email: 'relay@example.test', is_private_email: true};
    const enabled = await notify(signEvent('email-enabled', sub, {event: email}));
    const disabledEvent = JSON.stringify({type: 'email-disabled', sub, event_time: seconds(), ...email});
    const disabled = await notify(signEvent('email-disabled', sub, {claims: {events: disabledEvent}}), {
        url: notificationPath, contentType: 'application/json; charset=UTF-8', raw: true,
    });
    for (const result of [enabled, disabled]) {
        assert.equal(result.statusCode, 200);
        assert.deepEqual(result.data, {ok: true});
        assert.equal(result.headers['Set-Cookie'], undefined);
    }
    assert.deepEqual([...documents], initial, 'email forwarding events must not modify account or content state');

    const invalid = [
        ['missing payload', undefined],
        ['invalid compact serialization', 'invalid-token'],
        ['wrong issuer', signEvent('account-deleted', sub, {claims: {iss: 'https://attacker.invalid'}})],
        ['wrong audience', signEvent('account-deleted', sub, {claims: {aud: 'other.app'}})],
        ['Services ID audience', signEvent('account-deleted', sub, {claims: {aud: servicesId}})],
        ['wrong algorithm', signEvent('account-deleted', sub, {header: {alg: 'HS256'}})],
        ['untrusted key ID', signEvent('account-deleted', sub, {header: {kid: 'unknown'}})],
        ['forged signature with trusted key ID', signEvent('account-deleted', sub, {key: untrustedSigner.privateKey})],
        ['future issue time', signEvent('account-deleted', sub, {claims: {iat: seconds() + 3600}})],
        ['future event time', signEvent('account-deleted', sub, {event: {event_time: seconds() + 3600}})],
        ['fractional issue time', signEvent('account-deleted', sub, {claims: {iat: seconds() + 0.5}})],
        ['missing notification ID', signEvent('account-deleted', sub, {claims: {jti: undefined}})],
        ['missing subject', signEvent('account-deleted', sub, {event: {sub: undefined}})],
        ['missing content type', validDeletion, {contentType: null}],
        ['wrong content type on explicit route', validDeletion, {url: notificationPath, contentType: 'text/plain'}],
    ];
    for (const [label, payload, options] of invalid) {
        const result = await notify(payload, options);
        assert([400, 401, 403, 415].includes(result.statusCode), label + ' must be rejected as a bad request: ' + result.statusCode);
    }
    assert.equal((await call(notificationPath, {method: 'GET'})).statusCode, 405);
    delete process.env.APPLE_NOTIFICATION_AUDIENCE;
    try {
        const serviceToken = signEvent('account-deleted', sub, {claims: {aud: servicesId}});
        const unconfigured = await notify(serviceToken);
        assert.equal(unconfigured.statusCode, 503, 'notification verification requires the configured primary app audience');
    } finally {
        process.env.APPLE_NOTIFICATION_AUDIENCE = audience;
    }
    const ordinary = await call(applePath + '?action=cloud-delete', {
        headers: {
            cookie: '__Host-shiftcal-apple=' + seal(owner.user, secret),
            origin, 'content-type': 'application/json', 'x-shift-csrf': 'incorrect',
        },
        body: {payload: validDeletion},
    });
    assert.equal(ordinary.statusCode, 403, 'an ordinary account mutation cannot bypass CSRF through the notification shape');
    assert.deepEqual([...documents], initial, 'rejected callbacks and mutations have no effects');

    const eventTime = seconds();
    const revocation = signEvent('consent-revoked', sub, {event: {event_time: eventTime}});
    const revoked = await notify(revocation);
    assert.equal(revoked.statusCode, 200);
    assert.deepEqual(revoked.data, {ok: true});
    assert.equal(revoked.headers['Set-Cookie'], undefined, 'a server notification never mutates browser cookies');
    assertErased(owner);
    assertPresent(other);
    const priorStatus = await status(owner.user);
    assert.equal(priorStatus.data.connected, false, 'prior Apple sessions expire');
    assert.equal(priorStatus.data.deletedAccount, owner.user.sub);
    const deletionEpoch = priorStatus.data.deletionEpoch;
    assert(Number.isSafeInteger(deletionEpoch) && deletionEpoch > 0);

    clock += 30000;
    const signedInAt = clock;
    await accountErasure.recordAppleSignIn({provider: 'apple', sub: owner.user.sub}, secret, signedInAt);
    const fresh = seed(sub, {issuedAt: signedInAt, accountEpoch: deletionEpoch});
    assert.equal((await status(fresh.user)).data.connected, true);
    const afterLogin = structuredClone([...documents]);
    assert.equal((await notify(revocation, {url: notificationPath})).statusCode, 200, 'exact replay is acknowledged');
    const sameEventNewEnvelope = signEvent('consent-revoked', sub, {event: {event_time: eventTime}});
    assert.equal((await notify(sameEventNewEnvelope)).statusCode, 200, 'an older event in a new signed envelope is also ignored');
    assertPresent(fresh);
    assert.deepEqual([...documents], afterLogin, 'neither replay touches newly authorized account data');

    clock += 30000;
    const laterDeletion = signEvent('account-deleted', sub);
    failedDeletePath = fresh.link;
    const interrupted = await notify(laterDeletion, {url: notificationPath});
    assert(interrupted.statusCode >= 500 && interrupted.statusCode < 600, 'an interrupted deletion remains retryable');
    assert(documents.has(fresh.link), 'fixture left one schedule delete unfinished');
    assert.equal((await status(fresh.user)).data.deletionPending, true);
    failedDeletePath = undefined;
    assert.equal((await notify(laterDeletion, {url: notificationPath})).statusCode, 200);
    assertErased(fresh);
    assertPresent(other);
    assert.equal((await status(fresh.user)).data.connected, false);

    clock += 30000;
    const racingSub = 'concurrency.subject';
    const racing = seed(racingSub, {issuedAt: clock});
    await accountErasure.recordAppleSignIn({provider: 'apple', sub: racing.user.sub}, secret, clock);
    const activeState = await status(racing.user);
    assert.equal(activeState.data.connected, true);
    assert.equal(activeState.data.deletionEpoch, undefined, 'first authorization records an active generation without erasure');
    const beforeDelayedEvent = structuredClone([...documents]);
    const delayedEvent = signEvent('account-deleted', racingSub, {event: {event_time: seconds() - 15}});
    assert.equal((await notify(delayedEvent)).statusCode, 200);
    assert.deepEqual([...documents], beforeDelayedEvent, 'a notification from before the first recorded authorization is ignored');
    const sameSecondEvent = signEvent('consent-revoked', racingSub, {event: {event_time: seconds()}});
    assert.equal((await notify(sameSecondEvent)).statusCode, 200);
    assert.deepEqual([...documents], beforeDelayedEvent, 'durable authorization wins when Apple reports the same second');

    clock += 30000;
    let releaseDelete, cleanupReached;
    const heldDelete = new Promise(resolve => { releaseDelete = resolve; });
    const cleanupStarted = new Promise(resolve => { cleanupReached = resolve; });
    beforeDelete = async path => {
        if (path !== racing.backup) return;
        beforeDelete = undefined;
        cleanupReached();
        await heldDelete;
    };
    const concurrentNotification = notify(signEvent('consent-revoked', racingSub));
    let explicit;
    try {
        await Promise.race([
            cleanupStarted,
            concurrentNotification.then(result => assert.fail('notification finished before holding the backup delete: ' + result.statusCode)),
        ]);
        explicit = await call(applePath + '?action=cloud-delete', {
            headers: {
                cookie: '__Host-shiftcal-apple=' + seal(racing.user, secret),
                origin, 'content-type': 'application/json', 'x-shift-csrf': racing.user.csrf,
            },
            body: {},
        });
    } finally {
        releaseDelete();
    }
    const completed = await concurrentNotification;
    assert.equal(explicit.statusCode, 503, 'manual erasure must wait for notification cleanup to release its lease');
    assert.equal(explicit.data.error, 'ACCOUNT_ERASURE_BUSY');
    assert.equal(completed.statusCode, 200);
    assertErased(racing);
    assertPresent(other);
    assert(!providerRequests.some(url => url.endsWith('/auth/revoke')), 'an authenticated retry must not revoke Apple tokens during notification cleanup');

    // A callback may record its authorization before a notification, then seal
    // its cookie after cleanup. Its later local issuedAt must not make its old
    // Apple authorization eligible to delete a subsequently recreated account.
    clock += 30000;
    const delayedSub = 'delayed-callback.subject';
    const delayedPrior = seed(delayedSub, {issuedAt: clock - 10000});
    const oldAuthorization = clock - 10000;
    await accountErasure.recordAppleSignIn(delayedPrior.user, secret, oldAuthorization);
    assert.equal((await notify(signEvent('consent-revoked', delayedSub))).statusCode, 200);
    const earlierEpoch = (await status(delayedPrior.user)).data.deletionEpoch;
    const delayedCookie = {...delayedPrior.user, issuedAt: earlierEpoch + 1, appleAuthorizedAt: oldAuthorization};
    clock += 5000;
    await accountErasure.recordAppleSignIn(delayedPrior.user, secret, clock);
    const recreated = seed(delayedSub, {issuedAt: clock, accountEpoch: earlierEpoch});
    const delayedStatus = await status(delayedCookie);
    assert.equal(delayedStatus.data.connected, false);
    assert.equal(delayedStatus.data.deletedAccount, delayedCookie.sub);
    const explicitDelete = user => call(applePath + '?action=cloud-delete', {
        headers: {
            cookie: '__Host-shiftcal-apple=' + seal(user, secret),
            origin, 'content-type': 'application/json', 'x-shift-csrf': user.csrf,
        },
        body: {},
    });
    const recreatedDocuments = structuredClone([...documents]);
    const priorProviderCount = providerRequests.length;
    const delayedRetry = await explicitDelete(delayedCookie);
    assert.equal(delayedRetry.statusCode, 200);
    assert.equal(delayedRetry.data.deletionEpoch, earlierEpoch);
    assert.deepEqual([...documents], recreatedDocuments, 'an expired delayed callback cannot erase a recreated account');
    assert.equal(providerRequests.length, priorProviderCount, 'an expired delayed callback cannot revoke the new grant');
    assertPresent(recreated);

    clock += 30000;
    failedDeletePath = recreated.link;
    const newerExplicitDelete = await explicitDelete(recreated.user);
    assert(newerExplicitDelete.statusCode >= 500);
    assert.equal((await status(recreated.user)).data.deletionPending, true);
    const pendingDocuments = structuredClone([...documents]);
    const pendingProviderCount = providerRequests.length;
    const pendingOldRetry = await explicitDelete(delayedCookie);
    assert.equal(pendingOldRetry.statusCode, 200);
    assert.equal(pendingOldRetry.data.deletionEpoch, earlierEpoch);
    assert.deepEqual([...documents], pendingDocuments, 'an expired callback cannot resume a newer pending deletion');
    assert.equal(providerRequests.length, pendingProviderCount, 'an expired callback never attempts revocation while a newer deletion is pending');
    failedDeletePath = undefined;
    assert.equal((await notify(signEvent('account-deleted', delayedSub))).statusCode, 200);
    assertErased(recreated);
    assertPresent(other);

    console.log('PASS Apple notifications: signed validation, no-op email events, ordinary CSRF, scoped erasure, replay protection, storage retry, and concurrent erasure lease');
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    Date.now = originalNow;
    global.fetch = originalFetch;
});
