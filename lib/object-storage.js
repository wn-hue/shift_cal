'use strict';

const blob = require('@vercel/blob');
const useBridge = () => !!(process.env.SHIFT_D1_BRIDGE_URL || process.env.SHIFT_D1_BRIDGE_SECRET);
const configured = () => useBridge()
    ? !!(process.env.SHIFT_D1_BRIDGE_URL && process.env.SHIFT_D1_BRIDGE_SECRET)
    : !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID || process.env.SHIFT_STORAGE_BACKEND === 'd1');
const etagValue = value => String(value || '').replace(/^W\//, '').replace(/^"|"$/g, '');
const namedError = (Type, name) => Object.assign(new Type(), {name});

// Blob's versioned URL prevents a cached body being paired with a newer write token.
async function readVersionedBlob(sdk, path) {
    for (let attempt = 0; attempt < 5; attempt++) {
        let metadata;
        try { metadata = await sdk.head(path); }
        catch (error) {
            if (error instanceof blob.BlobNotFoundError || error.name === 'BlobNotFoundError') return null;
            throw error;
        }
        const url = new URL(metadata.url);
        url.searchParams.set('version', metadata.etag);
        const result = await sdk.get(url.toString(), {access: 'private', useCache: false});
        if (result?.blob?.etag && etagValue(result.blob.etag) === etagValue(metadata.etag)) {
            return {...result, blob: {...result.blob, etag: metadata.etag}};
        }
    }
    throw new blob.BlobPreconditionFailedError();
}

async function callBridge(op, input, fallback) {
    const url = new URL(process.env.SHIFT_D1_BRIDGE_URL);
    const secret = process.env.SHIFT_D1_BRIDGE_SECRET;
    if (url.protocol !== 'https:' || url.pathname !== '/v1/objects' || url.search || url.hash ||
        url.username || url.password || !secret) throw new Error('D1_STORAGE_SETUP');
    const response = await fetch(url, {
        method: 'POST',
        headers: {Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json'},
        body: JSON.stringify({op, ...input}),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10000)
    });
    if (response.status === 425 && (await response.json()).code === 'D1_COPY_PENDING') {
        if (fallback) return fallback();
        throw Object.assign(new Error('저장소를 옮기고 있어요. 잠시 후 다시 시도해 주세요.'), {status: 503});
    }
    if (response.status === 404 && op === 'get') return null;
    if (response.status === 404 && op === 'head') throw namedError(blob.BlobNotFoundError, 'BlobNotFoundError');
    if (response.status === 412) throw namedError(blob.BlobPreconditionFailedError, 'BlobPreconditionFailedError');
    if (response.status === 409) throw namedError(Error, 'BlobAlreadyExistsError');
    if (!response.ok) throw new Error('D1_STORAGE_UNAVAILABLE');
    if (op === 'get') {
        const metadata = response.headers.get('X-Object-Metadata');
        if (!metadata || !response.body) throw new Error('D1_INVALID_OBJECT');
        const result = JSON.parse(decodeURIComponent(metadata));
        if (result.pathname !== input.path || !result.etag) throw new Error('D1_INVALID_OBJECT');
        return {statusCode: 200, stream: response.body, blob: result};
    }
    return response.json();
}

module.exports = {
    configured,
    readVersionedBlob,
    async backendStatus() {
        if (!useBridge()) return process.env.SHIFT_STORAGE_BACKEND === 'd1' ? 'd1' : 'blob';
        try {
            const response = await callBridge('health', {}, () => ({storage: 'copy-pending'}));
            return response.storage;
        } catch { return 'unavailable'; }
    },
    get directReads() { return useBridge() || process.env.SHIFT_STORAGE_BACKEND === 'd1'; },
    get: (path, options) => useBridge() ? callBridge('get', {path}, () => readVersionedBlob(blob, path)) : blob.get(path, options),
    head: (path) => useBridge() ? callBridge('head', {path}, () => blob.head(path)) : blob.head(path),
    put: (path, body, options) => useBridge() ? callBridge('put', {path, body, ifMatch: options?.ifMatch}) : blob.put(path, body, options),
    del: (path, options) => useBridge() ? callBridge('del', {path, ifMatch: options?.ifMatch}) : blob.del(path, options),
    list: (options) => useBridge() ? callBridge('list', options, () => blob.list(options)) : blob.list(options)
};
