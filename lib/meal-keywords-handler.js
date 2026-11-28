'use strict';
const crypto = require('node:crypto');
const core = require('./meal-keywords'), apns = require('./parking-apns');
const {validSubscription: validWebSubscription} = require('./parking-core');
const {storage, update} = require('./parking-store');

function webSettings(body) {
    const mode = body.mode ?? 'always', meals = body.meals ?? core.WEB_MEALS;
    if (!['always', 'work'].includes(mode) || !Array.isArray(meals) || !meals.length || meals.length > core.WEB_MEALS.length ||
        meals.some(meal => !core.WEB_MEALS.includes(meal)) || (mode === 'work' && !core.validWorkWindow(body.workWindow))) return null;
    const workWindow = mode === 'work' ? {start: body.workWindow.start, days: body.workWindow.days} : undefined;
    return {meals: [...new Set(meals)], mode, ...(workWindow ? {workWindow} : {})};
}

function browserSubscription(input) {
    if (!validWebSubscription(input)) return null;
    return {endpoint: input.endpoint, keys: {p256dh: input.keys.p256dh, auth: input.keys.auth}};
}

function webState(item, config, now) {
    const enabled = !!core.activeWeb(item, now);
    return {
        available: !!config,
        publicKey: config?.publicKey ?? null,
        enabled,
        keywords: enabled ? item.keywords : [],
        meals: enabled ? item.meals : core.WEB_MEALS,
        mode: enabled ? item.mode : 'always'
    };
}

async function changeWeb(store, owner, body, config, now, reply) {
    const action = body.action;
    const removing = action === 'removeKeyword' || action === 'unsubscribe';
    const refreshing = action === 'refreshWorkWindow';
    if (!removing && !refreshing && !['addKeyword', 'subscribe', 'updatePreferences'].includes(action)) return reply(400, {message: '설정을 확인해 주세요.'});
    if (!removing && !config) return reply(503, {message: '웹 식단 알림을 준비 중이에요.'});
    const word = (action === 'addKeyword' || action === 'removeKeyword') ? core.keywords([body.keyword])?.[0] : null;
    if ((action === 'addKeyword' || action === 'removeKeyword') && !word) return reply(400, {message: '메뉴 이름을 확인해 주세요.'});
    const words = action === 'subscribe' ? core.keywords(body.keywords) : null;
    if (action === 'subscribe' && !words?.length) return reply(400, {message: '메뉴 이름을 하나 이상 등록해 주세요.'});
    if (refreshing && !core.validWorkWindow(body.workWindow)) return reply(400, {message: '근무에 맞춘 알림 설정을 확인해 주세요.'});
    const settings = removing || refreshing ? null : webSettings(body);
    if (!removing && !refreshing && !settings) return reply(400, {message: '식사와 근무 알림 설정을 확인해 주세요.'});
    const subscription = removing || refreshing ? null : browserSubscription(body.subscription);
    const needsSubscription = action === 'subscribe' || action === 'addKeyword' || body.subscription !== undefined;
    if (!removing && !refreshing && needsSubscription && !subscription) return reply(400, {message: '브라우저 알림 연결을 확인해 주세요.'});

    const checkedAt = now();
    try {
        const record = await update(store, core.WEB_PATH, old => {
            const items = Object.fromEntries(Object.entries(old?.items || {}).filter(([, item]) => core.activeWeb(item, checkedAt)));
            const previous = items[owner];
            if (refreshing) {
                if (previous?.mode !== 'work') return null;
                const workWindow = {start: body.workWindow.start, days: body.workWindow.days};
                const sameWindow = previous.workWindow?.start === workWindow.start && previous.workWindow?.days === workWindow.days;
                if (sameWindow && checkedAt - previous.updatedAt < 86400000) return null;
                const {lease, leaseUntil, ...saved} = previous;
                items[owner] = {...saved, workWindow, updatedAt: checkedAt, ...(sameWindow ? {lease, leaseUntil} : {})};
                return {items};
            }
            if (action === 'unsubscribe') {
                if (!previous) return null;
                delete items[owner];
                return {items};
            }
            if (action === 'removeKeyword') {
                if (!previous) return null;
                const filtered = previous.keywords.filter(saved => core.normalize(saved) !== core.normalize(word));
                if (filtered.length === previous.keywords.length) return null;
                if (filtered.length) {
                    const {lease, leaseUntil, ...saved} = previous;
                    items[owner] = {...saved, keywords: filtered, updatedAt: checkedAt};
                } else delete items[owner];
                return {items};
            }
            if (action === 'updatePreferences' && !previous) throw Error('NO_WEB_KEYWORDS');
            let nextWords = action === 'subscribe' ? words : previous?.keywords || [];
            if (action === 'addKeyword' && !nextWords.some(saved => core.normalize(saved) === core.normalize(word))) {
                if (nextWords.length >= 20) throw Error('KEYWORD_LIMIT');
                nextWords = [...nextWords, word];
            }
            const prefs = action === 'addKeyword' && previous
                ? {meals: previous.meals, mode: previous.mode, ...(previous.workWindow ? {workWindow: previous.workWindow} : {})}
                : settings;
            const target = subscription || previous.subscription;
            const encodedTarget = JSON.stringify(target);
            let lastEvent = previous?.lastEvent || null;
            for (const [id, item] of Object.entries(items)) {
                if (id === owner || JSON.stringify(item.subscription) !== encodedTarget) continue;
                lastEvent ||= item.lastEvent || null;
                delete items[id];
            }
            if (!previous && Object.keys(items).length >= 500) throw Error('SUBSCRIPTION_LIMIT');
            const identical = previous && JSON.stringify(previous.subscription) === encodedTarget &&
                JSON.stringify(previous.keywords) === JSON.stringify(nextWords) && JSON.stringify(previous.meals) === JSON.stringify(prefs.meals) &&
                previous.mode === prefs.mode && JSON.stringify(previous.workWindow) === JSON.stringify(prefs.workWindow);
            items[owner] = {subscription: target, keywords: nextWords, ...prefs, updatedAt: checkedAt, lastEvent,
                ...(identical ? {lease: previous.lease, leaseUntil: previous.leaseUntil} : {})};
            return {items};
        });
        return reply(200, {ok: true, ...webState(record?.items?.[owner], config, checkedAt)});
    } catch (error) {
        if (error.message === 'NO_WEB_KEYWORDS') return reply(409, {message: '알림을 받을 메뉴를 다시 선택해 주세요.'});
        if (error.message === 'KEYWORD_LIMIT') return reply(400, {message: '메뉴는 20개까지 등록할 수 있어요.'});
        if (error.message === 'SUBSCRIPTION_LIMIT') return reply(503, {message: '새 구독을 받기 어려워요. 잠시 후 다시 시도해 주세요.'});
        throw error;
    }
}

function handlerFor(store, opts = {}) {
    return async (req, res) => {
        const reply = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)); };
        try {
            const now = opts.now || Date.now;
            const nativeAvailable = opts.available ? opts.available() : !!apns.configuration();
            const webConfig = opts.webConfiguration ? opts.webConfiguration() : core.webConfiguration();
            if (req.query?.action === 'dispatch') {
                const expected = opts.cronSecret || process.env.MEAL_KEYWORDS_CRON_SECRET;
                const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
                if (req.method !== 'POST' || !expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) return reply(401, {message: 'Unauthorized'});
                const event = core.clock(now(), !!webConfig);
                if (!event || (!nativeAvailable && !webConfig)) return reply(200, {ok: true, sent: 0});
                const transports = [];
                if (nativeAvailable && event.meal !== '조식') transports.push({path: core.PATH, active: core.active, send: opts.send || apns.send});
                if (webConfig) transports.push({path: core.WEB_PATH, active: core.activeWeb, web: true, send: opts.sendWeb || ((subscription, payload) => core.sendWeb(subscription, payload, {config: webConfig, now}))});
                const eventID = event.date + ':' + event.meal;
                const checks = await Promise.allSettled(transports.map(async transport => {
                    const registry = await store.read(transport.path);
                    return Object.values(registry?.items || {}).some(item => transport.active(item, now()) && core.eligible(item, event) && item.lastEvent !== eventID);
                }));
                const waiting = transports.filter((_transport, i) => checks[i].status === 'fulfilled' && checks[i].value);
                const checkFailed = checks.some(result => result.status === 'rejected');
                if (!waiting.length) {
                    if (checkFailed) throw Error('MEAL_REGISTRY_UNAVAILABLE');
                    return reply(200, {ok: true, sent: 0});
                }
                const menus = opts.loadMenus ? await opts.loadMenus() : (await require('../api/today-menu').loadPdf(300000)).menus;
                const menu = menus.find(m => m.date === event.date);
                if (!menu || menu.status !== 'ok') return reply(200, {ok: true, sent: 0, pending: true});
                const delivery = await Promise.allSettled(waiting.map(transport => core.dispatch(store, menu, event, transport.send, now, transport.web)));
                if (delivery.every(result => result.status === 'rejected')) throw Error('MEAL_REGISTRY_UNAVAILABLE');
                const sent = delivery.reduce((sum, result) => sum + (result.value || 0), 0);
                const pending = checkFailed || delivery.some(result => result.status === 'rejected');
                return reply(200, {ok: true, sent, ...(pending ? {pending} : {})});
            }
            if (!['GET', 'POST'].includes(req.method)) return reply(405, {message: '지원하지 않는 요청이에요.'});
            const secret = opts.secret || process.env.GOOGLE_CALENDAR_SESSION_SECRET;
            if (!secret) return reply(503, {message: '식단 알림을 준비 중이에요.'});
            const owner = core.identity(req, res, secret);
            if (!owner) return reply(401, {message: '식단 알림 화면을 다시 열어 주세요.'});
            const transport = req.query?.transport;
            if (transport !== undefined && !['apns', 'web'].includes(transport)) return reply(400, {message: '알림 종류를 확인해 주세요.'});
            if (req.method === 'GET') {
                if (transport === 'web') {
                    const item = (await store.read(core.WEB_PATH))?.items?.[owner];
                    return reply(200, webState(item, webConfig, now()));
                }
                const item = (await store.read(core.PATH))?.items?.[owner];
                return reply(200, {available: nativeAvailable, enabled: !!core.active(item, now())});
            }
            const origin = opts.origin || process.env.APP_URL?.replace(/\/$/, '');
            if (!origin || req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) return reply(403, {message: '앱에서 설정해 주세요.'});
            let body = req.body;
            if (typeof body === 'string') { if (body.length > 4096) return reply(413, {message: '요청이 너무 커요.'}); body = JSON.parse(body); }
            if (!body || JSON.stringify(body).length > 4096) return reply(400, {message: '설정을 확인해 주세요.'});
            if ((body.transport !== undefined && !['apns', 'web'].includes(body.transport)) ||
                (transport !== undefined && body.transport !== undefined && transport !== body.transport)) return reply(400, {message: '알림 종류를 확인해 주세요.'});
            if ((body.transport ?? transport) === 'web') return await changeWeb(store, owner, body, webConfig, now, reply);
            const off = body.action === 'unsubscribe';
            if (!off && body.action !== 'subscribe') return reply(400, {message: '설정을 확인해 주세요.'});
            const words = core.keywords(body.keywords), meals = body.meals;
            if (!off && (!nativeAvailable || !apns.validSubscription(body.subscription))) return reply(503, {message: 'iPhone 알림 연결을 확인해 주세요.'});
            if (!off && (!words?.length || !Array.isArray(meals) || !meals.length || meals.length > 3 || meals.some(m => !core.MEALS.includes(m)))) return reply(400, {message: '키워드와 알림 받을 식사를 선택해 주세요.'});
            const mode = body.mode ?? 'always';
            if (!off && (!['always', 'work'].includes(mode) || (mode === 'work' && !core.validWorkWindow(body.workWindow)))) {
                return reply(400, {message: '근무에 맞춘 알림 설정을 확인해 주세요.'});
            }
            const workWindow = !off && mode === 'work' ? {start: body.workWindow.start, days: body.workWindow.days} : undefined;
            await update(store, core.PATH, old => {
                const items = Object.fromEntries(Object.entries(old?.items || {}).filter(([, i]) => core.active(i, now())));
                if (off) delete items[owner];
                else {
                    const subscription = {kind: 'apns', token: body.subscription.token, environment: body.subscription.environment};
                    for (const [id, item] of Object.entries(items)) if (id !== owner && JSON.stringify(item.subscription) === JSON.stringify(subscription)) delete items[id];
                    if (!items[owner] && Object.keys(items).length >= 500) throw Error('SUBSCRIPTION_LIMIT');
                    const previous = items[owner];
                    const selectedMeals = [...new Set(meals)];
                    const identical = previous && JSON.stringify(previous.subscription) === JSON.stringify(subscription) && JSON.stringify(previous.keywords) === JSON.stringify(words) && JSON.stringify(previous.meals) === JSON.stringify(selectedMeals)
                        && (previous.mode ?? 'always') === mode && JSON.stringify(previous.workWindow) === JSON.stringify(workWindow);
                    items[owner] = {subscription, keywords: words, meals: selectedMeals, mode, ...(workWindow ? {workWindow} : {}), updatedAt: now(), lastEvent: previous?.lastEvent || null, ...(identical ? {lease: previous.lease, leaseUntil: previous.leaseUntil} : {})};
                }
                return {items};
            });
            return reply(200, {ok: true, enabled: !off, available: nativeAvailable, ...(off ? {} : {mode})});
        } catch { return reply(503, {message: '식단 알림 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'}); }
    };
}
module.exports = handlerFor(storage);
module.exports._test = {handlerFor};
