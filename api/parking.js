'use strict';
const {storage, update} = require('../lib/parking-store');
const core = require('../lib/parking-core'), push = require('../lib/parking-push'), apns = require('../lib/parking-apns');
const PATH = 'parking/current.json';
const active = (item, now) => !!item && now - (item.updatedAt || 0) < 30 * 86400000;

function handlerFor(store, opts = {}) {
    return async (req, res) => {
        const reply = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
        try {
            const now = opts.now ? opts.now() : Date.now(), secret = opts.secret || process.env.GOOGLE_CALENDAR_SESSION_SECRET;
            const origin = opts.origin || process.env.APP_URL?.replace(/\/$/, '');
            const nativeAvailable = opts.nativeAvailable ? opts.nativeAvailable() : !!apns.configuration();
            if (!secret) return reply(503, {message: '주차장 연결을 준비 중입니다.'});
            if (!['GET', 'POST'].includes(req.method)) return reply(405, {message: '지원하지 않는 요청입니다.'});
            const owner = core.identity(req, res, secret);
            if (!owner) return reply(401, {message: '주차장 화면을 새로고침해 주세요.'});
            let record;
            if (req.method === 'POST') {
                if (!origin || req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return reply(403, {message: '앱에서 투표해 주세요.'});
                let body = req.body;
                if (typeof body === 'string') { if (body.length > 8192) return reply(413, {message: '요청이 너무 큽니다.'}); body = JSON.parse(body); }
                if (!body || typeof body !== 'object' || JSON.stringify(body).length > 8192) return reply(400, {message: '요청 내용을 확인해 주세요.'});
                if (['subscribe', 'native-subscribe', 'unsubscribe'].includes(body.action)) {
                    let subscription;
                    if (body.action === 'native-subscribe') {
                        if (!nativeAvailable) return reply(503, {message: 'iPhone 만차 알림을 준비 중이에요. 지금은 주차 현황을 확인할 수 있어요.'});
                        if (!apns.validSubscription(body.subscription)) return reply(400, {message: 'iPhone 알림 연결을 확인해 주세요.'});
                        subscription = {kind: 'apns', token: body.subscription.token, environment: body.subscription.environment};
                    } else if (body.action === 'subscribe') {
                        if (!core.validSubscription(body.subscription) || !process.env.PARKING_VAPID_PUBLIC_KEY) return reply(400, {message: '지원하지 않는 알림 구독입니다.'});
                        subscription = {endpoint: body.subscription.endpoint, keys: {p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth}};
                    }
                    await update(store, push.PATH, old => {
                        const items = Object.fromEntries(Object.entries(old?.items || {}).filter(([, item]) => active(item, now)));
                        if (body.action === 'unsubscribe') delete items[owner];
                        else {
                            // One APNs device token has one active anonymous participation record.
                            if (subscription.kind === 'apns') for (const [id, item] of Object.entries(items)) {
                                if (id !== owner && item.subscription?.kind === 'apns' && item.subscription.token === subscription.token && item.subscription.environment === subscription.environment) delete items[id];
                            }
                            if (!items[owner] && Object.keys(items).length >= 500) throw Error('SUBSCRIPTION_LIMIT');
                            const previous = items[owner], sameTarget = JSON.stringify(previous?.subscription) === JSON.stringify(subscription);
                            // Foreground renewals must not cancel an in-flight delivery lease.
                            items[owner] = {...(sameTarget ? previous : {}), subscription, updatedAt: now, lastEvent: previous?.lastEvent || null};
                        }
                        return {items};
                    });
                    return reply(200, {ok: true, subscribed: body.action !== 'unsubscribe', nativeAvailable});
                }
                if (!core.clock(now).open) return reply(403, {message: '평일 06:50~07:30에 제보할 수 있습니다.'});
                if (!['free', 'busy', 'full', null].includes(body.vote) || !['A', 'B', 'C'].includes(body.group)) return reply(400, {message: '교대조와 주차 상태를 확인해 주세요.'});
                const locationError = core.locationError(body.location, now);
                if (locationError) return reply(403, {message: locationError});
                const participant = (await store.read(push.PATH))?.items?.[owner];
                if (!active(participant, now) || (participant.subscription?.kind === 'apns' && !nativeAvailable)) return reply(403, {message: '제보 참여와 만차 알림을 먼저 켜 주세요.'});
                record = await update(store, PATH, old => {
                    const date = core.clock(now).date, next = old?.date === date ? {date, votes: {...old.votes}, alert: old.alert || null} : {date, votes: {}, alert: null};
                    next.votes = Object.fromEntries(Object.entries(next.votes).filter(([, vote]) => vote.at > now - 600000));
                    const voter = require('node:crypto').createHash('sha256').update(date + owner).digest('hex');
                    if (body.vote === null) delete next.votes[voter]; else next.votes[voter] = {value: body.vote, at: now};
                    if (Object.keys(next.votes).length > 10000) throw Error('VOTE_LIMIT');
                    if (core.summary(next, voter, now).status === 'full' && !next.alert) next.alert = {id: date, at: now};
                    return next;
                });
            } else record = await store.read(PATH);
            const voter = require('node:crypto').createHash('sha256').update(core.clock(now).date + owner).digest('hex');
            const result = core.summary(record, voter, now), registry = await store.read(push.PATH), participant = registry?.items?.[owner];
            if (result.open && result.status === 'full' && record?.alert && now - record.alert.at < 600000 && (process.env.PARKING_VAPID_PRIVATE_KEY || nativeAvailable)) {
                const job = push.dispatch(store, record.alert, opts.send || push.send, opts.now || Date.now).catch(() => {});
                if (opts.defer) opts.defer(job); else require('@vercel/functions').waitUntil(job);
            }
            return reply(200, {...result, subscribed: active(participant, now), subscriptionKind: active(participant, now) ? participant.subscription?.kind === 'apns' ? 'apns' : 'web' : null,
                nativeAvailable, publicKey: process.env.PARKING_VAPID_PUBLIC_KEY || null});
        } catch { return reply(503, {message: '주차장 정보를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'}); }
    };
}
module.exports = handlerFor(storage);
module.exports._test = {handlerFor};
