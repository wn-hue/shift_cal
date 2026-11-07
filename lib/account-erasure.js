'use strict';

const {createHmac, randomUUID} = require('node:crypto');
const {storage, update} = require('./parking-store');
const lostFound = require('./lost-found');
const {removeOwnedSchedules} = require('./live-schedule-erasure');

const configured = () => !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID || process.env.SHIFT_STORAGE_BACKEND === 'd1');
const failure = (status, code, message) => Object.assign(Error(message), {status, code});
const unavailable = () => failure(503, 'ACCOUNT_ERASURE_UNAVAILABLE', '계정 삭제 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');

function pathFor(user, secret) {
    const id = createHmac('sha256', secret).update('account-erasure:' + user.provider + ':' + user.sub).digest('hex');
    return 'account-erasure/v1/' + id + '.json';
}

const olderThanDeletion = (user, cutoff) => !Number.isSafeInteger(user.issuedAt) || user.issuedAt <= cutoff;
const validRecord = record => typeof record.operation==='string' && ['cleanup','revoke','complete'].includes(record.phase) &&
    Number.isSafeInteger(record.previousEpoch) && record.previousEpoch>=0 &&
    (record.phase!=='complete'||(Number.isSafeInteger(record.completedAt)&&record.completedAt>record.previousEpoch));

async function access(user, secret, {allowUnavailable = false} = {}) {
    if (!user || !configured()) return {state: 'active'};
    try {
        const record = await storage.read(pathFor(user, secret));
        if (!record) return {state: 'active'};
        if (!validRecord(record)) throw unavailable();
        if (['cleanup','revoke'].includes(record.phase)) {
            return record.previousEpoch && olderThanDeletion(user,record.previousEpoch) ? {state: 'expired'} : {state: 'pending'};
        }
        return olderThanDeletion(user,record.completedAt) ? {state: 'expired'} : {state: 'active', deletionEpoch: record.completedAt};
    } catch {
        if (allowUnavailable) return {state: 'unavailable'};
        throw unavailable();
    }
}

async function requireActive(user, secret) {
    const result = await access(user, secret);
    if (result.state === 'pending') throw failure(409, 'ACCOUNT_ERASURE_PENDING', '계정 삭제를 완료한 뒤 다시 로그인해 주세요.');
    if (result.state === 'expired') throw failure(401, 'ACCOUNT_ERASED', '계정을 삭제했어요. 다시 로그인해 주세요.');
    return result;
}

async function erase(user, secret, {erasePrivateData, revoke}) {
    if (!configured()) throw unavailable();
    const path = pathFor(user, secret);
    const needsDrive = !!(user.drive || user.driveAuthorized);
    let record = await update(storage, path, previous => {
        if (previous && !validRecord(previous)) throw unavailable();
        if (previous?.phase === 'complete' && olderThanDeletion(user,previous.completedAt)) return null;
        if (previous && previous.phase !== 'complete') {
            if (previous.previousEpoch && olderThanDeletion(user,previous.previousEpoch)) return null;
            if (needsDrive && !previous.needsDrive) return {...previous, needsDrive: true};
            return null;
        }
        return {operation: randomUUID(), phase: 'cleanup', needsDrive, previousEpoch: previous?.completedAt || 0};
    });

    if (record.phase === 'complete') return {ok: true, deletionEpoch: record.completedAt};
    if (record.previousEpoch && olderThanDeletion(user,record.previousEpoch)) return {ok: true, deletionEpoch: record.previousEpoch};
    const operation = record.operation;
    function advance(from, to) {
        return update(storage, path, current => {
            if (current?.operation !== operation) throw failure(409, 'ACCOUNT_ERASURE_CHANGED', '계정 삭제 상태가 바뀌었어요. 다시 시도해 주세요.');
            if (current.phase !== from) return null;
            const completedAt = Math.max(Date.now(), current.previousEpoch+1, user.issuedAt||0);
            return {...current, phase: to, ...(to === 'complete' ? {completedAt} : {})};
        });
    }

    if (record.phase === 'cleanup') {
        const owner = lostFound.identity(user, secret);
        await update(storage, lostFound.PATH, board => lostFound.eraseOwner(board, owner, Date.now()));
        await removeOwnedSchedules(user.sub);
        await erasePrivateData(record.needsDrive);
        // Keep the completed cleanup step so a retry after token revocation
        // never needs to reauthorize a Drive grant just to finish signing out.
        record = await advance('cleanup', 'revoke');
    }
    if (record.phase === 'revoke') {
        await revoke();
        record = await advance('revoke', 'complete');
    }
    return {ok: true, deletionEpoch: record.completedAt};
}

module.exports = {access, requireActive, erase};
