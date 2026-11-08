'use strict';

const {writeFile} = require('node:fs/promises');
const {downloadPdf} = require('../api/today-menu.js');
const {extractSchedule} = require('../lib/today-menu.cjs');
const {PUBLISH_URL, MAX_BYTES, validSnapshot} = require('../lib/prepared-meal.cjs');

async function prepare(previous, fetcher = fetch) {
    let etag = null, lastModified = null;
    const unchanged = new Error('MENU_UNCHANGED');
    const headers = {};
    if (previous?.etag) headers['If-None-Match'] = previous.etag;
    if (previous?.lastModified) headers['If-Modified-Since'] = previous.lastModified;
    let snapshot;
    try {
        const pdf = await downloadPdf(async (url, options) => {
            const response = await fetcher(url, {...options, headers: {...options.headers, ...headers}});
            if (response.status === 304 && previous) throw unchanged;
            etag = response.headers.get('etag');
            lastModified = response.headers.get('last-modified');
            return response;
        });
        snapshot = {schema: 1, etag, lastModified, menus: extractSchedule(pdf)};
    } catch (error) {
        if (error !== unchanged) throw error;
        snapshot = previous;
    }
    snapshot = {...snapshot, checkedAt: new Date().toISOString()};
    if (!validSnapshot(snapshot) || Buffer.byteLength(JSON.stringify(snapshot)) > MAX_BYTES) {
        throw new Error('MENU_INVALID_SNAPSHOT');
    }
    return snapshot;
}

async function publisherToken() {
    const url = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
    const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (!requestToken || url.protocol !== 'https:' || !url.hostname.endsWith('.actions.githubusercontent.com')) {
        throw new Error('MENU_ACTIONS_IDENTITY');
    }
    url.searchParams.set('audience', PUBLISH_URL);
    const response = await fetch(url, {
        headers: {Authorization: 'Bearer ' + requestToken}, redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error('MENU_ACTIONS_IDENTITY_' + response.status);
    const token = (await response.json()).value;
    if (typeof token !== 'string' || !token) throw new Error('MENU_ACTIONS_IDENTITY');
    return token;
}

async function main() {
    if (process.argv[2] === '--snapshot') {
        if (!process.argv[3]) throw new Error('MENU_SNAPSHOT_PATH_REQUIRED');
        await writeFile(process.argv[3], JSON.stringify(await prepare(null)), {mode: 0o600});
        return;
    }
    const authorization = 'Bearer ' + await publisherToken();
    const options = {headers: {Authorization: authorization}, redirect: 'error'};
    const current = await fetch(PUBLISH_URL, {...options, signal: AbortSignal.timeout(15000)});
    if (!current.ok && current.status !== 404) throw new Error('MENU_SNAPSHOT_READ_' + current.status);
    const snapshot = await prepare(current.ok ? await current.json() : null);
    const response = await fetch(PUBLISH_URL, {
        ...options, method: 'PUT',
        headers: {...options.headers, 'Content-Type': 'application/json'},
        body: JSON.stringify(snapshot), signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error('MENU_SNAPSHOT_WRITE_' + response.status);
    console.log('Updated prepared menus for %d dates.', snapshot.menus.length);
}

if (require.main === module) main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
module.exports = {prepare};
