'use strict';
const crypto = require('node:crypto');
const core = require('./meal-keywords'), apns = require('./parking-apns');
const {storage, update} = require('./parking-store');
function handlerFor(store, opts = {}) {
    return async (req, res) => {
        const reply = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
        try {
            const now = opts.now || Date.now;
            const nativeAvailable = opts.available ? opts.available() : !!apns.configuration();
            if (req.query?.action === 'dispatch') {
                const expected = opts.cronSecret || process.env.MEAL_KEYWORDS_CRON_SECRET;
                const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
                if (req.method !== 'POST' || !expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return reply(401, {message: 'Unauthorized'});
                const event = core.clock(now());
                if (!event || !nativeAvailable) return reply(200, {ok: true, sent: 0});
                const registry = await store.read(core.PATH);
                const waiting = Object.values(registry?.items || {}).some(item => core.active(item, now()) && item.meals.includes(event.meal) && item.lastEvent !== event.date + ':' + event.meal);
                if (!waiting) return reply(200, {ok: true, sent: 0});
                const menus = opts.loadMenus ? await opts.loadMenus() : (await require('../api/today-menu').loadPdf(300000)).menus;
                const menu = menus.find(m => m.date === event.date);
                if (!menu || menu.status !== 'ok') return reply(200, {ok: true, sent: 0, pending: true});
                const sent = await core.dispatch(store, menu, event, opts.send || apns.send, now);
                return reply(200, {ok: true, sent});
            }
            if (!['GET', 'POST'].includes(req.method)) return reply(405, {message: '지원하지 않는 요청이에요.'});
            const secret = opts.secret || process.env.GOOGLE_CALENDAR_SESSION_SECRET;
            if (!secret) return reply(503, {message: '식단 알림을 준비 중이에요.'});
            const owner = core.identity(req, res, secret);
            if (!owner) return reply(401, {message: '식단 알림 화면을 다시 열어 주세요.'});
            if (req.method === 'GET') { const item = (await store.read(core.PATH))?.items?.[owner]; return reply(200, {available: nativeAvailable, enabled: !!core.active(item, now())}); }
            const origin = opts.origin || process.env.APP_URL?.replace(/\/$/, '');
            if (!origin || req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return reply(403, {message: '앱에서 설정해 주세요.'});
            let body = req.body;
            if (typeof body === 'string') { if (body.length > 4096) return reply(413, {message: '요청이 너무 커요.'}); body = JSON.parse(body); }
            if (!body || JSON.stringify(body).length > 4096) return reply(400, {message: '설정을 확인해 주세요.'});
            const off = body.action === 'unsubscribe';
            if (!off && body.action !== 'subscribe') return reply(400, {message: '설정을 확인해 주세요.'});
            const words = core.keywords(body.keywords), meals = body.meals;
            if (!off && (!nativeAvailable || !apns.validSubscription(body.subscription))) return reply(503, {message: 'iPhone 알림 연결을 확인해 주세요.'});
            if (!off && (!words?.length || !Array.isArray(meals) || !meals.length || meals.length > 3 || meals.some(m => !core.MEALS.includes(m)))) return reply(400, {message: '키워드와 알림 받을 식사를 선택해 주세요.'});
            await update(store, core.PATH, old => {
                const items = Object.fromEntries(Object.entries(old?.items || {}).filter(([, i]) => core.active(i, now())));
                if (off) delete items[owner];
                else {
                    const subscription = {kind: 'apns', token: body.subscription.token, environment: body.subscription.environment};
                    for (const [id, item] of Object.entries(items)) if (id !== owner && JSON.stringify(item.subscription) === JSON.stringify(subscription)) delete items[id];
                    if (!items[owner] && Object.keys(items).length >= 500) throw Error('SUBSCRIPTION_LIMIT');
                    const previous = items[owner];
                    const identical = previous && JSON.stringify(previous.subscription) === JSON.stringify(subscription) && JSON.stringify(previous.keywords) === JSON.stringify(words) && JSON.stringify(previous.meals) === JSON.stringify(meals);
                    items[owner] = {subscription, keywords: words, meals: [...new Set(meals)], updatedAt: now(), lastEvent: previous?.lastEvent || null, ...(identical ? {lease: previous.lease, leaseUntil: previous.leaseUntil} : {})};
                }
                return {items};
            });
            return reply(200, {ok: true, enabled: !off, available: nativeAvailable});
        } catch { return reply(503, {message: '식단 알림 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'}); }
    };
}
module.exports = handlerFor(storage);
module.exports._test = {handlerFor};
