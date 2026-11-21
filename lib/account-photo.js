'use strict';

const {createHmac, randomUUID} = require('node:crypto');
const {storage, update} = require('./parking-store');
const {isConflict} = require('./blob-json-store');

const maxBytes = 32 * 1024;
const maxEncoded = 4 * Math.ceil(maxBytes / 3);
const fail = (status, code, message) => Object.assign(new Error(message), {status, code});
const invalidPhoto = () => fail(400, 'PROFILE_PHOTO_INVALID', '프로필 사진을 다시 선택해 주세요.');
const conflict = () => fail(409, 'PROFILE_PHOTO_CONFLICT', '다른 기기에서 사진이 변경됐어요. 다시 확인해 주세요.');

function photoPath(user, secret) {
    const key = createHmac('sha256', secret).update('account-photo:' + user.provider + ':' + user.sub).digest('hex');
    return 'account-photos/v1/' + key + '.json';
}

// Accept a small, single-scan baseline JPEG produced by the native thumbnail encoder.
// Exclude embedded comments and location/camera metadata before private storage.
function thumbnail(value) {
    if (value === null) return null;
    if (typeof value !== 'string' || !value.length) throw invalidPhoto();
    if (value.length > maxEncoded) throw fail(413, 'PROFILE_PHOTO_SIZE', '사진 용량이 너무 커요.');
    const bytes = Buffer.from(value, 'base64');
    if (bytes.length < 12 || bytes.length > maxBytes || bytes.toString('base64') !== value ||
        bytes.readUInt16BE(0) !== 0xffd8 || bytes.readUInt16BE(bytes.length - 2) !== 0xffd9) throw invalidPhoto();
    let at = 2, hasFrame = false;
    const parts = [bytes.subarray(0, 2)];
    while (at + 4 <= bytes.length) {
        if (bytes[at] !== 0xff) throw invalidPhoto();
        const marker = bytes[at + 1], length = bytes.readUInt16BE(at + 2), end = at + 2 + length;
        if (length < 2 || end > bytes.length - 2) throw invalidPhoto();
        if (marker === 0xc0) {
            if (hasFrame || length < 11 || bytes[at + 4] !== 8) throw invalidPhoto();
            const height = bytes.readUInt16BE(at + 5), width = bytes.readUInt16BE(at + 7);
            if (width !== 256 || height !== 256) throw invalidPhoto();
            hasFrame = true;
        } else if (marker === 0xda) {
            if (!hasFrame || end >= bytes.length - 2) throw invalidPhoto();
            // Entropy-coded bytes can contain stuffed FF bytes and restart markers.
            for (let pos = end; pos < bytes.length - 2; pos++) {
                if (bytes[pos] !== 0xff) continue;
                const next = bytes[++pos];
                if (next !== 0 && !(next >= 0xd0 && next <= 0xd7)) throw invalidPhoto();
            }
            parts.push(bytes.subarray(at));
            return Buffer.concat(parts).toString('base64');
        } else if (!(marker === 0xc4 || marker === 0xdb || marker === 0xdd ||
                     marker === 0xfe || (marker >= 0xe0 && marker <= 0xef))) {
            throw invalidPhoto();
        }
        if (marker < 0xe0) parts.push(bytes.subarray(at, end));
        at = end;
    }
    throw invalidPhoto();
}

async function erase(user, secret) {
    // Rotating this record even on first use prevents an in-flight create from
    // restoring a photo after account deletion. No image or account ID is retained.
    await update(storage, photoPath(user, secret), () => ({photo: null, revision: randomUUID(), erased: true}));
}

async function perform(action, body, user, secret) {
    const {requireActive} = require('./account-erasure');
    await requireActive(user, secret);
    const path = photoPath(user, secret);
    const stored = await storage.read(path);
    const current = {photo: stored?.photo ?? null, revision: stored?.erased ? null : stored?.revision ?? null};
    await requireActive(user, secret);
    if (action === 'profile-read') return current;
    if (typeof body === 'string') {
        if (body.length > maxEncoded + 512) throw fail(413, 'PROFILE_PHOTO_SIZE', '사진 용량이 너무 커요.');
        try { body = JSON.parse(body); } catch { throw invalidPhoto(); }
    }
    if (!body || !Object.hasOwn(body, 'expectedRevision') ||
        !(body.expectedRevision === null || (typeof body.expectedRevision === 'string' && body.expectedRevision.length <= 64))) throw invalidPhoto();
    const photo = thumbnail(body.photo);
    if (body.expectedRevision !== current.revision) throw conflict();
    if (photo === current.photo) return current;
    const next = {photo, revision: randomUUID()};
    try { await storage.write(path, next, stored?._etag); }
    catch (error) {
        if (!isConflict(error)) throw error;
        await requireActive(user, secret);
        throw conflict();
    }
    return next;
}

module.exports = {perform, erase};
