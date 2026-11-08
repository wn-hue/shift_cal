'use strict';

const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {DatabaseSync} = require('node:sqlite');
const blob = require('@vercel/blob');
const storage = require('../lib/object-storage');
const {createStore, isConflict} = require('../lib/blob-json-store');

async function main() {
    const {default: bridge} = await import('../cloudflare/d1-bridge.mjs');
    const db = new DatabaseSync(':memory:');
    for (const file of ['0001_objects.sql', '0002_storage_activation.sql']) {
        db.exec(readFileSync(require.resolve('../cloudflare/migrations/' + file), 'utf8'));
    }
    const env = {
        STATE: {prepare(sql) {
            const statement = db.prepare(sql);
            return {first: () => statement.get(), bind: (...params) => ({
                first: () => statement.get(...params),
                all: () => ({results: statement.all(...params)}),
                run: () => ({meta: statement.run(...params)})
            })};
        }},
        SHIFT_D1_BRIDGE_SECRET: 'a synthetic test secret'
    };
    const url = 'https://storage.test/v1/objects';
    const bareRequest = new Request(url, {method: 'POST', body: '{"op":"health"}'});
    assert.equal((await bridge.fetch(bareRequest, env)).status, 401);
    process.env.SHIFT_D1_BRIDGE_URL = url;
    process.env.SHIFT_D1_BRIDGE_SECRET = env.SHIFT_D1_BRIDGE_SECRET;
    const original = {fetch: global.fetch, head: blob.head, get: blob.get};
    const path = 'schedules/' + 'a'.repeat(64) + '.json';
    const calls = [];
    global.fetch = async (endpoint, options) => {
        calls.push(JSON.parse(options.body).op);
        return bridge.fetch(new Request(endpoint, options), env);
    };
    let legacyReads = 0;
    blob.head = async () => ({url: 'https://legacy.test/' + path, etag: '"old"'});
    blob.get = async () => {
        legacyReads++;
        return {stream: new Response('{"memo":"기존"}').body, blob: {etag: 'W/"old"'}};
    };
    const store = createStore();
    try {
        assert.equal(await storage.backendStatus(), 'copy-pending');
        assert.deepEqual(await store.read(path), {memo: '기존', _etag: '"old"'});
        await assert.rejects(store.write(path, {memo: 'blocked'}, '"old"'), error => error.status === 503);
        assert.equal(legacyReads, 1);

        db.exec("INSERT INTO storage_activation (id) VALUES (1)");
        assert.equal(await storage.backendStatus(), 'd1');
        assert.equal(await store.read(path), null);
        await store.write(path, {memo: '변경 😀'});
        const count = calls.length;
        const before = await store.read(path);
        assert.equal(before.memo, '변경 😀');
        assert.deepEqual(calls.slice(count), ['get']);
        await assert.rejects(store.write(path, {memo: 'duplicate'}), isConflict);
        const updates = await Promise.allSettled([
            store.write(path, {memo: 'second'}, before._etag),
            store.write(path, {memo: 'third'}, before._etag)
        ]);
        assert.equal(updates.filter(x => x.status === 'fulfilled').length, 1);
        assert(isConflict(updates.find(x => x.status === 'rejected').reason));
        await assert.rejects(storage.del(path, {ifMatch: before._etag}), isConflict);
        const list = await storage.list({prefix: 'schedules/', limit: 10});
        assert.deepEqual(list.blobs.map(item => item.pathname), [path]);
        await storage.del(path, {ifMatch: list.blobs[0].etag});
        assert.equal(await store.read(path), null);
        assert.equal(legacyReads, 1, 'a missing active D1 record must never restore old Blob data');
        global.fetch = async () => Response.json({}, {status: 503});
        await assert.rejects(store.read(path), /D1_STORAGE_UNAVAILABLE/);
        assert.equal(legacyReads, 1, 'an active D1 outage must not fall back to Blob');
    } finally {
        global.fetch = original.fetch;
        blob.head = original.head;
        blob.get = original.get;
        delete process.env.SHIFT_D1_BRIDGE_URL;
        delete process.env.SHIFT_D1_BRIDGE_SECRET;
        db.close();
    }
    console.log('PASS D1 bridge authorization, write freeze, single reads, version conflicts, scoped listing and no stale backup on outage');
}

main().catch(error => {console.error(error); process.exitCode = 1;});
