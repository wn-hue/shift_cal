'use strict';

const {createPublicKey, verify} = require('node:crypto');

const issuer = 'https://appleid.apple.com';
const maxBytes = 16000;
const clockSkewMs = 60000;
const types = new Set(['email-disabled','email-enabled','consent-revoked','account-deleted']);
const identifier = value => typeof value === 'string' && /^[\x21-\x7e]{1,255}$/.test(value);
const timestamp = value => Number.isSafeInteger(value) && value > 0;
const fail = (status,code,message) => Object.assign(Error(message),{status,code});
const invalid = () => fail(400,'APPLE_NOTIFICATION_FORMAT','Apple 알림 형식을 확인할 수 없어요.');
const unauthorized = () => fail(401,'APPLE_NOTIFICATION_SIGNATURE','Apple 알림을 확인할 수 없어요.');
const unavailable = () => fail(503,'APPLE_NOTIFICATION_KEYS','Apple 알림을 지금 확인할 수 없어요.');

function decode(segment) {
    if (!/^[A-Za-z0-9_-]+$/.test(segment)) throw invalid();
    const data = Buffer.from(segment,'base64url');
    if (data.toString('base64url') !== segment) throw invalid();
    return data;
}

function objectFrom(json) {
    let value;
    try {value=JSON.parse(json);} catch {throw invalid();}
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    return value;
}

async function notification(req, audience) {
    if (req.method !== 'POST') throw fail(405,'METHOD','지원하지 않는 요청입니다.');
    if (!/^application\/json\s*(?:;|$)/i.test(req.headers['content-type']||'')) throw fail(415,'CONTENT_TYPE','JSON 알림만 받을 수 있어요.');
    if (!audience) throw fail(503,'APPLE_NOTIFICATION_SETUP','Apple 알림 설정이 필요해요.');
    let body = req.body;
    if (typeof body === 'string') {
        if (Buffer.byteLength(body) > maxBytes) throw invalid();
        body = objectFrom(body);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 ||
        typeof body.payload !== 'string' || body.payload.length > maxBytes) throw invalid();
    const segments = body.payload.split('.');
    if (segments.length !== 3) throw invalid();
    const [protectedHeader,payload,signature] = segments.map(decode);
    const header = objectFrom(protectedHeader), claims = objectFrom(payload);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid) ||
        header.crit !== undefined || (header.b64 !== undefined && header.b64 !== true)) throw unauthorized();

    const now = Date.now(), issuedAt = claims.iat * 1000;
    if (claims.iss !== issuer || claims.aud !== audience || !timestamp(claims.iat) || !timestamp(issuedAt) ||
        issuedAt > now + clockSkewMs || !identifier(claims.jti) ||
        (claims.exp !== undefined && (!timestamp(claims.exp) || claims.exp * 1000 <= now)) ||
        (claims.nbf !== undefined && (!timestamp(claims.nbf) || claims.nbf * 1000 > now + clockSkewMs))) throw unauthorized();

    const event = typeof claims.events === 'string' ? objectFrom(claims.events) : claims.events;
    if (!event || typeof event !== 'object' || Array.isArray(event) || !types.has(event.type) ||
        !identifier(event.sub) || !timestamp(event.event_time)) throw invalid();
    // Accept the documented seconds and millisecond timestamps.
    const eventAt = event.event_time < 100000000000 ? event.event_time * 1000 : event.event_time;
    if (eventAt > issuedAt + clockSkewMs || eventAt > now + clockSkewMs) throw invalid();

    let keys;
    try {
        const response = await fetch(issuer + '/auth/keys',{signal:AbortSignal.timeout(8000),redirect:'error'});
        if (!response.ok) throw unavailable();
        const jwks = await response.json();
        if (!Array.isArray(jwks.keys)) throw unavailable();
        keys = jwks.keys;
    } catch { throw unavailable(); }
    const matches = keys.filter(key=>key && key.kid===header.kid && key.kty==='RSA' && key.alg==='RS256' && key.use==='sig');
    if (matches.length !== 1) throw unauthorized();
    try {
        const key = createPublicKey({key:matches[0],format:'jwk'});
        if (!verify('RSA-SHA256',Buffer.from(segments[0]+'.'+segments[1]),key,signature)) throw unauthorized();
    } catch { throw unauthorized(); }
    return {type:event.type,sub:event.sub,eventAt};
}

module.exports = {notification};
