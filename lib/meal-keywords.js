'use strict';
const crypto = require('node:crypto');
const {update} = require('./parking-store');
const apns = require('./parking-apns');
const PATH = 'meal-keywords/subscriptions.json';
const MEALS = ['중식', '석식', '야식'];
const MAX_AGE = 90 * 86400000;
function normalize(text) { return String(text || '').normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase('ko'); }
function keywords(values) {
    if (!Array.isArray(values) || values.length > 20 || values.some(v => typeof v !== 'string' || !v.trim() || v.length > 30 || /[\x00-\x1f]/.test(v))) return null;
    return [...new Map(values.map(v => [normalize(v), v.trim()])).values()];
}
function matches(menu, words, mealName) {
    if (menu?.status !== 'ok') return [];
    const items = menu.meals?.find(m => m.name === mealName)?.groups?.flatMap(g => g.items || []) || [];
    return words.filter(word => items.some(item => normalize(item).includes(normalize(word))));
}
function clock(now) {
    const korea = new Date(now + 9 * 3600000), date = korea.toISOString().slice(0, 10), minute = korea.getUTCHours() * 60 + korea.getUTCMinutes();
    // Night meal at 01:20 belongs to the preceding menu date. First-round meal times.
    if (minute >= 50 && minute < 80) return {date: new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10), meal: '야식', expiresAt: now + (80 - minute) * 60000 - korea.getUTCSeconds() * 1000};
    if (minute >= 690 && minute < 720) return {date, meal: '중식', expiresAt: now + (720 - minute) * 60000 - korea.getUTCSeconds() * 1000};
    if (minute >= 1020 && minute < 1050) return {date, meal: '석식', expiresAt: now + (1050 - minute) * 60000 - korea.getUTCSeconds() * 1000};
    return null;
}
function active(item, now) { return item && now - item.updatedAt < MAX_AGE && apns.validSubscription(item.subscription); }
function identity(req, res, secret) {
    const cookie = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('__Host-meal-keywords='))?.slice('__Host-meal-keywords='.length) || '';
    let [id, signature] = cookie.split('.');
    const sign = id => crypto.createHmac('sha256', secret).update('meal-keywords:' + id).digest('hex');
    if (!/^[a-f0-9]{32}$/.test(id || '') || !/^[a-f0-9]{64}$/.test(signature || '') || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(id)))) {
        if (req.method !== 'GET') return null;
        id = crypto.randomBytes(16).toString('hex');
        res.setHeader('Set-Cookie', `__Host-meal-keywords=${id}.${sign(id)}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=31536000`);
    }
    return crypto.createHmac('sha256', secret).update('meal-keywords-owner:' + id).digest('hex');
}
async function dispatch(store, menu, event, send = apns.send, now = Date.now) {
    const eventID = event.date + ':' + event.meal, started = Date.now();
    let sent = 0;
    while (Date.now() - started < 40000 && now() < event.expiresAt) {
        const lease = crypto.randomUUID(); let batch = [];
        await update(store, PATH, old => {
            batch = []; const next = structuredClone(old || {items: {}});
            for (const [owner, item] of Object.entries(next.items)) {
                if (batch.length >= 20) break;
                if (!active(item, now()) || item.lastEvent === eventID || item.leaseUntil > now() || !item.meals.includes(event.meal)) continue;
                const found = matches(menu, item.keywords, event.meal); if (!found.length) continue;
                item.lease = lease; item.leaseUntil = now() + 90000;
                batch.push({owner, subscription: item.subscription, words: found});
            }
            if (!batch.length) return null;
            delete next._etag; return next;
        });
        if (!batch.length) break;
        const results = await Promise.all(batch.map(async item => {
            const current = (await store.read(PATH))?.items?.[item.owner];
            if (current?.lease !== lease || now() >= event.expiresAt) return [item.owner, 'skip'];
            try {
                await send(item.subscription, {route: 'meal', date: event.date, meal: event.meal, title: '좋아하는 메뉴가 나와요', body: `${event.meal} · ${item.words.join(', ')} 메뉴가 있어요. 오늘 식단을 확인해 보세요.`, tag: 'meal-' + eventID, expiresAt: event.expiresAt});
                sent++; return [item.owner, 'sent'];
            } catch (error) { return [item.owner, error.statusCode === 410 ? 'invalid' : 'retry']; }
        }));
        await update(store, PATH, old => {
            const next = structuredClone(old || {items: {}}); let changed = false;
            for (const [owner, result] of results) {
                const item = next.items[owner]; if (item?.lease !== lease) continue;
                changed = true;
                if (result === 'invalid') { delete next.items[owner]; continue; }
                if (result === 'sent') item.lastEvent = eventID;
                item.leaseUntil = result === 'retry' ? now() + 300000 : 0; delete item.lease;
            }
            if (!changed) return null;
            delete next._etag; return next;
        });
    }
    return sent;
}
module.exports = {PATH, MEALS, MAX_AGE, normalize, keywords, matches, clock, active, identity, dispatch};
