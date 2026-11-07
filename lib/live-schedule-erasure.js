'use strict';

const {createHash} = require('node:crypto');
const blob = require('@vercel/blob');
const {createStore, isConflict} = require('./blob-json-store');

const schedulePrefix = 'schedules/';
const schedulePath = /^schedules\/[a-f0-9]{64}\.json$/;

async function listSchedulePaths(sdk) {
    const paths = new Set();
    const seenCursors = new Set();
    let cursor;
    for (;;) {
        const page = await sdk.list({prefix: schedulePrefix, limit: 1000, cursor});
        if (!Array.isArray(page?.blobs) || typeof page.hasMore !== 'boolean') {
            throw new Error('Invalid schedule inventory');
        }
        for (const item of page.blobs) {
            if (typeof item?.pathname === 'string' && schedulePath.test(item.pathname)) paths.add(item.pathname);
        }
        if (!page.hasMore) return [...paths];
        if (typeof page.cursor !== 'string' || !page.cursor || seenCursors.has(page.cursor)) {
            throw new Error('Invalid schedule pagination');
        }
        cursor = page.cursor;
        seenCursors.add(cursor);
    }
}

async function removeOwnedSchedule(path, owner, store, sdk) {
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const record = await store.read(path);
            if (record?.owner !== owner) return;
            if (typeof record._etag !== 'string' || !record._etag) throw new Error('Missing schedule version');
            await sdk.del(path, {ifMatch: record._etag});
            return;
        } catch (error) {
            if (error instanceof blob.BlobNotFoundError || error?.name === 'BlobNotFoundError') return;
            if (!isConflict(error) || attempt === 4) throw error;
        }
    }
}

async function removeOwnedSchedules(sub, sdk = blob) {
    if (typeof sub !== 'string' || !sub) throw new TypeError('Missing account identity');
    const owner = createHash('sha256').update(sub).digest('hex');
    const store = createStore(sdk);
    // Finish listing before deleting so a cursor can never skip records we shifted.
    const paths = await listSchedulePaths(sdk);
    const batchSize = 8;
    for (let start = 0; start < paths.length; start += batchSize) {
        const results = await Promise.allSettled(paths.slice(start, start + batchSize)
            .map(path => removeOwnedSchedule(path, owner, store, sdk)));
        const failure = results.find(result => result.status === 'rejected');
        if (failure) throw failure.reason;
    }
}

module.exports = {removeOwnedSchedules};
