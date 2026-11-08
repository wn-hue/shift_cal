import {createObjectStore} from './d1-store.mjs';
import stores from '../lib/blob-json-store.js';
import weekly from '../lib/meal-weekly.js';
import dates from '../lib/today-menu.cjs';
import prepared from '../lib/prepared-meal.cjs';

const {PATH, PUBLISH_URL, MAX_BYTES, validSnapshot} = prepared;
const ISSUER = 'https://token.actions.githubusercontent.com';
const WORKFLOW = 'wn-hue/shift_cal/.github/workflows/cloudflare-menu.yml@refs/heads/main';
const EVENTS = new Set(['push', 'schedule', 'workflow_dispatch']);
const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
const reply = (status, value) => Response.json(value, {status, headers});
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytes(segment) {
    return Uint8Array.from(atob(segment.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
}

export async function isPublisher(request, {fetcher = fetch, now = Date.now()} = {}) {
    const authorization = request.headers.get('Authorization') || '';
    if (authorization.length > 8192) return false;
    const token = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(authorization);
    if (!token) return false;
    const [, encodedHeader, encodedClaims, encodedSignature] = token;
    let header, claims, signature;
    try {
        header = JSON.parse(decoder.decode(bytes(encodedHeader)));
        claims = JSON.parse(decoder.decode(bytes(encodedClaims)));
        signature = bytes(encodedSignature);
    } catch {
        return false;
    }
    const time = now / 1000;
    if (header?.alg !== 'RS256' || !/^[A-Za-z0-9_-]{1,160}$/.test(header.kid || '') ||
        claims?.iss !== ISSUER || claims.aud !== PUBLISH_URL || claims.repository_id !== '1374753004' ||
        claims.workflow_ref !== WORKFLOW || claims.ref !== 'refs/heads/main' || !EVENTS.has(claims.event_name) ||
        !Number.isFinite(claims.exp) || !Number.isFinite(claims.nbf) || claims.exp <= time ||
        claims.nbf > time + 30 || claims.exp - claims.nbf > 900) return false;
    const response = await fetcher(ISSUER + '/.well-known/jwks', {
        redirect: 'error', signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error('MENU_PUBLISHER_KEYS');
    const {keys} = await response.json();
    const jwk = keys.find(key => key.kid === header.kid && key.kty === 'RSA' && key.use === 'sig');
    if (!jwk) return false;
    const algorithm = {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'};
    const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
    return crypto.subtle.verify(algorithm, key, signature, encoder.encode(encodedHeader + '.' + encodedClaims));
}

export async function readSnapshot(db) {
    const row = await db.prepare('SELECT body FROM objects WHERE path = ?').bind(PATH).first();
    return row ? JSON.parse(row.body) : null;
}

async function readPublication(request) {
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) return null;
    const length = Number(request.headers.get('Content-Length'));
    if (!Number.isSafeInteger(length) || length < 1 || length > MAX_BYTES) return null;
    const body = await request.arrayBuffer();
    if (body.byteLength !== length) return null;
    try {
        const value = JSON.parse(decoder.decode(body));
        return validSnapshot(value) ? value : null;
    } catch {
        return null;
    }
}

export async function publishMenu(request, env, ctx) {
    if (!['GET', 'PUT'].includes(request.method)) return reply(405, {error: 'METHOD_NOT_ALLOWED'});
    try {
        if (!await isPublisher(request)) return reply(401, {error: 'MENU_PUBLISHER_UNAUTHORIZED'});
        if (request.method === 'GET') {
            const snapshot = await readSnapshot(env.STATE);
            return snapshot ? reply(200, snapshot) : reply(404, {error: 'MENU_SNAPSHOT_MISSING'});
        }
        const snapshot = await readPublication(request);
        const now = Date.now();
        if (!snapshot || Date.parse(snapshot.checkedAt) < now - 30 * 60_000 ||
            Date.parse(snapshot.checkedAt) > now + 2 * 60_000) return reply(400, {error: 'MENU_INVALID_SNAPSHOT'});
        if (!await env.STATE.prepare('SELECT id FROM storage_activation WHERE id = 1').first()) {
            return reply(503, {error: 'D1_COPY_PENDING'});
        }
        const result = await env.STATE.prepare(
            'INSERT INTO objects (path, body, version, content_type, updated_at) VALUES (?, ?, ?, ?, ?) ' +
            'ON CONFLICT(path) DO UPDATE SET body = excluded.body, version = excluded.version, updated_at = excluded.updated_at ' +
            'WHERE excluded.updated_at > objects.updated_at'
        ).bind(PATH, JSON.stringify(snapshot), crypto.randomUUID(), 'application/json', snapshot.checkedAt).run();
        const menu = snapshot.menus.find(item => item.date === dates.menuDate(new Date(now)));
        if (result.meta.changes && menu) {
            const store = stores.createStore({...createObjectStore(env.STATE), directReads: true});
            ctx.waitUntil(weekly.saveMenu(menu, store).catch(() => console.error('meal_vote_snapshot_failed')));
        }
        return reply(200, {dates: snapshot.menus.length, updated: !!result.meta.changes});
    } catch {
        console.error('prepared_menu_publication_failed');
        return reply(503, {error: 'MENU_PUBLISHER_UNAVAILABLE'});
    }
}
