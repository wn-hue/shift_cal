'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {BlobNotFoundError, BlobPreconditionFailedError} = require('@vercel/blob');
const {removeOwnedSchedules} = require('../lib/live-schedule-erasure');

const sub = 'apple:owner';
const owner = createHash('sha256').update(sub).digest('hex');
const other = createHash('sha256').update('different-owner').digest('hex');
const path = n => 'schedules/' + n.toString(16).padStart(64, '0') + '.json';
const record = (owner, etag = 'v1') => ({owner, etag});

async function run() {
    const missingAtRead = path(3);
    const missingAtDelete = path(4);
    const updated = path(5);
    const replaced = path(6);
    const records = new Map([
        [path(1), record(owner)], [path(2), record(other)],
        [missingAtRead, record(owner)], [missingAtDelete, record(owner)],
        [updated, record(owner)], [replaced, record(owner)],
        [path(7), record(owner)], [path(8), record(other)],
        ['schedules/unrelated.json', record(owner)],
    ]);
    const pages = [];
    const deletions = [];
    const sdk = {
        async list({prefix, cursor}) {
            assert.equal(prefix, 'schedules/');
            const start = Number(cursor ?? 0);
            pages.push(start);
            // Offset-style pagination would skip paths if deletion began during listing.
            const keys = [...records.keys()].filter(key => key.startsWith(prefix)).sort();
            const end = start + 2;
            return {
                blobs: keys.slice(start, end).map(pathname => ({pathname})),
                hasMore: end < keys.length,
                cursor: String(end),
            };
        },
        async head(pathname) {
            if (pathname === missingAtRead) records.delete(pathname);
            const value = records.get(pathname);
            if (!value) throw new BlobNotFoundError();
            return {url: 'https://test.private.blob.vercel-storage.com/' + pathname, etag: value.etag};
        },
        async get(value, options) {
            assert.deepEqual(options, {access: 'private', useCache: false});
            const url = new URL(value);
            const current = records.get(url.pathname.slice(1));
            if (!current) return null;
            assert.equal(url.searchParams.get('version'), current.etag);
            return {
                blob: {etag: '"' + current.etag + '"'},
                stream: new Response(JSON.stringify({owner: current.owner})).body,
            };
        },
        async del(pathname, {ifMatch}) {
            assert.ok(ifMatch, 'deletion must use the verified ETag');
            deletions.push([pathname, ifMatch]);
            if (pathname === missingAtDelete) {
                records.delete(pathname);
                throw new BlobNotFoundError();
            }
            if (pathname === updated && ifMatch === 'v1') {
                records.set(pathname, record(owner, 'v2'));
                throw new BlobPreconditionFailedError();
            }
            if (pathname === replaced) {
                assert.equal(ifMatch, 'v1');
                records.set(pathname, record(other, 'v2'));
                throw new BlobPreconditionFailedError();
            }
            const current = records.get(pathname);
            assert.equal(current.etag, ifMatch);
            assert.equal(current.owner, owner);
            records.delete(pathname);
        },
    };

    await removeOwnedSchedules(sub, sdk);
    assert.deepEqual(pages, [0, 2, 4, 6, 8]);
    assert.deepEqual([...records], [
        [path(2), record(other)], [replaced, record(other, 'v2')],
        [path(8), record(other)], ['schedules/unrelated.json', record(owner)],
    ]);
    assert.deepEqual(deletions.filter(([pathname]) => pathname === updated), [[updated, 'v1'], [updated, 'v2']]);
    assert.deepEqual(deletions.filter(([pathname]) => pathname === replaced), [[replaced, 'v1']]);
    const count = deletions.length;
    await removeOwnedSchedules(sub, sdk);
    assert.equal(deletions.length, count, 'an already completed deletion is safe to retry');

    await assert.rejects(() => removeOwnedSchedules(sub, {
        async list() { return {blobs: [{pathname: path(9)}], hasMore: true, cursor: 'stuck'}; },
        async head() { assert.fail('incomplete inventory must not start deleting'); },
    }), /Invalid schedule pagination/);

    console.log('PASS: live schedule erasure pagination, owner isolation, concurrent updates, already absent records and retry');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
