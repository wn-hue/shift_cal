'use strict';
const {update} = require('./parking-store'), web = require('./parking-core'), apns = require('./parking-apns');
const validSubscription = value => apns.validSubscription(value) || web.validSubscription(value);
const PATH = 'parking/subscriptions.json';

async function dispatch(store, event, send, now = () => Date.now()) {
    const started = Date.now();
    // Claim a small batch in one atomic write. Per-recipient claims would compete
    // with each other for the same registry and exhaust its retry budget.
    while (Date.now() - started < 45000 && now() < event.at + 600000) {
        const token = require('node:crypto').randomUUID();
        let claimed = [];
        await update(store, PATH, old => {
            claimed = [];
            const next = structuredClone(old || {items: {}});
            for (const [owner, item] of Object.entries(next.items)) {
                if (claimed.length >= 20) break;
                if (item.lastEvent === event.id || item.leaseUntil > now() || now() - (item.updatedAt || 0) >= 30 * 86400000 || !validSubscription(item.subscription)) continue;
                item.leaseUntil = now() + 90000; item.leaseToken = token;
                claimed.push([owner, structuredClone(item.subscription)]);
            }
            if (!claimed.length) return null;
            delete next._etag; return next;
        });
        if (!claimed.length) return;
        const results = await Promise.all(claimed.map(async ([owner, subscription]) => {
            // Respect an opt-out or a token rotation that happened after claiming.
            const current = (await store.read(PATH))?.items?.[owner];
            if (current?.leaseToken !== token || now() >= event.at + 600000) return [owner, 'skip'];
            try {
                await send(subscription, {title: '🔴 주차장 만차', body: '최근 10분 동안 만차 제보가 5건 이상입니다.', tag: 'parking-full-' + event.id, url: '/?parking=1', expiresAt: event.at + 600000});
                return [owner, 'sent'];
            } catch (error) { return [owner, [404, 410].includes(error.statusCode) ? 'invalid' : 'retry']; }
        }));
        await update(store, PATH, old => {
            const next = structuredClone(old || {items: {}});
            let changed = false;
            for (const [owner, result] of results) {
                const item = next.items[owner];
                if (item?.leaseToken !== token) continue;
                changed = true;
                if (result === 'invalid') { delete next.items[owner]; continue; }
                if (result === 'sent') item.lastEvent = event.id;
                // Avoid repeatedly hammering APNs/Web Push during a provider error.
                if (result === 'retry') item.leaseUntil = now() + 60000; else delete item.leaseUntil;
                delete item.leaseToken;
            }
            if (!changed) return null;
            delete next._etag; return next;
        });
    }
}
async function send(subscription, payload) {
    if (subscription?.kind === 'apns') return apns.send(subscription, payload);
    const webpush = require('web-push');
    return webpush.sendNotification(subscription, JSON.stringify(payload), {vapidDetails: {subject: process.env.APP_URL, publicKey: process.env.PARKING_VAPID_PUBLIC_KEY, privateKey: process.env.PARKING_VAPID_PRIVATE_KEY}, TTL: 600, urgency: 'high', timeout: 3000, topic: 'parking-full'});
}
module.exports = {dispatch, send, PATH};
