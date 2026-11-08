'use strict';

const crypto = require('node:crypto');
const http2 = require('node:http2');
const TOPIC = 'com.wnhue.workroutine';
let cached;

function configuration(env = process.env) {
    const keyId = env.PARKING_APNS_KEY_ID, teamId = env.PARKING_APNS_TEAM_ID;
    const privateKey = env.PARKING_APNS_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!/^[A-Z0-9]{10}$/.test(keyId || '') || !/^[A-Z0-9]{10}$/.test(teamId || '') || env.PARKING_APNS_TOPIC !== TOPIC || !privateKey) return null;
    try {
        const key = crypto.createPrivateKey(privateKey);
        if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') return null;
        return {keyId, teamId, privateKey, topic: TOPIC};
    } catch { return null; }
}

function validSubscription(value) {
    // Device tokens have variable length; do not assume the current 32-byte size.
    return value?.kind === 'apns' && ['sandbox', 'production'].includes(value.environment) &&
        typeof value.token === 'string' && /^[a-f0-9]{32,512}$/.test(value.token) && value.token.length % 2 === 0;
}

function providerToken(config, now = Date.now()) {
    const fingerprint = crypto.createHash('sha256').update(config.keyId + config.teamId + config.privateKey).digest('hex');
    if (cached?.fingerprint === fingerprint && now >= cached.at && now - cached.at < 50 * 60000) return cached.value;
    const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const unsigned = encoded({alg: 'ES256', kid: config.keyId}) + '.' + encoded({iss: config.teamId, iat: Math.floor(now / 1000)});
    const signature = crypto.sign('sha256', Buffer.from(unsigned), {key: config.privateKey, dsaEncoding: 'ieee-p1363'}).toString('base64url');
    cached = {fingerprint, at: now, value: unsigned + '.' + signature};
    return cached.value;
}

async function send(subscription, payload, options = {}) {
    const config = options.config || configuration();
    if (!config || !validSubscription(subscription)) throw Object.assign(Error('APNS_SETUP'), {statusCode: 503});
    const now = (options.now || Date.now)();
    if (!Number.isFinite(payload.expiresAt) || payload.expiresAt <= now) return;
    const origin = subscription.environment === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
    const meal = payload.route === 'meal';
    const body = JSON.stringify({aps: {alert: {title: payload.title, body: payload.body}, sound: 'default', 'thread-id': meal ? 'meal-keywords' : 'parking-full'}, route: meal ? 'meal' : 'parking', ...(meal ? {date: payload.date, meal: payload.meal} : {}), expiresAt: payload.expiresAt});
    if (Buffer.byteLength(body) > 4096) throw Error('APNS_PAYLOAD');
    return new Promise((resolve, reject) => {
        const client = (options.connect || http2.connect)(origin);
        let request, settled = false, status = 0, response = '';
        const complete = error => {
            if (settled) return;
            settled = true; clearTimeout(timer);
            request?.close(); client.close();
            error ? reject(error) : resolve();
        };
        const timer = setTimeout(() => { complete(Object.assign(Error('APNS_TIMEOUT'), {statusCode: 504})); client.destroy(); }, 5000);
        client.on('error', () => complete(Object.assign(Error('APNS_CONNECTION'), {statusCode: 503})));
        try {
            request = client.request({
                ':method': 'POST', ':path': '/3/device/' + subscription.token,
                authorization: 'bearer ' + providerToken(config, now), 'apns-topic': config.topic,
                'apns-push-type': 'alert', 'apns-priority': '10',
                'apns-expiration': String(Math.floor(payload.expiresAt / 1000)), 'apns-collapse-id': payload.tag.slice(0, 64)
            });
            request.on('response', headers => { status = Number(headers[':status']); });
            request.on('data', chunk => { if (response.length < 2048) response += chunk.toString(); });
            request.on('error', () => complete(Object.assign(Error('APNS_REQUEST'), {statusCode: 503})));
            request.on('end', () => {
                if (status === 200) return complete();
                let reason; try { reason = JSON.parse(response).reason; } catch { /* No tokens or provider response is logged. */ }
                const invalid = status === 410 || ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(reason);
                complete(Object.assign(Error(invalid ? 'APNS_DEVICE_EXPIRED' : 'APNS_DELIVERY'), {statusCode: invalid ? 410 : status || 503}));
            });
            request.end(body);
        } catch { complete(Object.assign(Error('APNS_REQUEST'), {statusCode: 503})); }
    });
}

module.exports = {configuration, validSubscription, send, _test: {providerToken}};
