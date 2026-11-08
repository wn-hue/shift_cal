'use strict';

const {createHmac, randomUUID} = require('node:crypto');
const {storage, update} = require('./parking-store');
const lostFound = require('./lost-found');
const {removeOwnedSchedules} = require('./live-schedule-erasure');
const {configured} = require('./object-storage');

// The production deletion routes can run for at most 60 seconds.
const leaseDuration = 120000;
const failure = (status, code, message) => Object.assign(Error(message), {status, code});
const unavailable = () => failure(503, 'ACCOUNT_ERASURE_UNAVAILABLE', '계정 삭제 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
const pending = record => ['cleanup','revoke'].includes(record?.phase);
const timestamp = value => Number.isSafeInteger(value) && value > 0;

function pathFor(user, secret) {
    const id = createHmac('sha256', secret).update('account-erasure:' + user.provider + ':' + user.sub).digest('hex');
    return 'account-erasure/v1/' + id + '.json';
}

function expiredAt(user, cutoff, appleEventAt) {
    return !timestamp(user.issuedAt) || user.issuedAt <= cutoff ||
        (user.provider === 'apple' && timestamp(user.appleAuthorizedAt) && user.appleAuthorizedAt <= appleEventAt);
}
function validRecord(record) {
    if (!record || typeof record !== 'object') return false;
    if (record.appleAuthorizedAt !== undefined && !timestamp(record.appleAuthorizedAt)) return false;
    if (record.appleEventAt !== undefined && !timestamp(record.appleEventAt)) return false;
    if (record.previousAppleEventAt !== undefined && !timestamp(record.previousAppleEventAt)) return false;
    if (record.phase === 'active') return timestamp(record.appleAuthorizedAt);
    return typeof record.operation === 'string' && (pending(record) || record.phase === 'complete') &&
        Number.isSafeInteger(record.previousEpoch) && record.previousEpoch >= 0 &&
        (record.phase !== 'complete' || (timestamp(record.completedAt) && record.completedAt > record.previousEpoch));
}

async function updateState(path, change) {
    for (let attempt = 0; attempt < 4; attempt++) {
        let creating = false;
        try {
            return await update(storage, path, record => {
                if (record && !validRecord(record)) throw unavailable();
                const next = change(record);
                creating = !record && next !== null;
                return next;
            });
        } catch (error) {
            if (!creating || attempt === 3) throw error;
            // Blob does not expose a distinct error for concurrent create-only writes.
            const appeared = await storage.read(path).catch(()=>null);
            if (!appeared) throw error;
        }
    }
}

async function access(user, secret, {allowUnavailable = false} = {}) {
    if (!user || !configured()) return {state: 'active'};
    try {
        const record = await storage.read(pathFor(user, secret));
        if (!record) return {state: 'active'};
        if (!validRecord(record)) throw unavailable();
        if (record.phase === 'active') return {state: 'active'};
        if (pending(record)) {
            return record.previousEpoch && expiredAt(user,record.previousEpoch,record.previousAppleEventAt) ?
                {state: 'expired', deletionEpoch: record.previousEpoch} : {state: 'pending'};
        }
        return {state: expiredAt(user,record.completedAt,record.appleEventAt) ? 'expired' : 'active', deletionEpoch: record.completedAt};
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

function newOperation(previous, needsDrive) {
    return {
        operation: randomUUID(), phase: 'cleanup', needsDrive, previousEpoch: previous?.completedAt || 0,
        ...(previous?.appleAuthorizedAt ? {appleAuthorizedAt: previous.appleAuthorizedAt} : {}),
        ...(previous?.appleEventAt ? {appleEventAt: previous.appleEventAt, previousAppleEventAt: previous.appleEventAt} : {})
    };
}

async function recordAppleSignIn(user, secret, authorizedAt) {
    if (!configured() || user.provider !== 'apple' || !timestamp(authorizedAt)) throw unavailable();
    return updateState(pathFor(user,secret), previous => {
        if (previous?.appleEventAt >= authorizedAt) throw failure(401, 'ACCOUNT_ERASED', 'Apple로 다시 로그인해 주세요.');
        if (pending(previous) && previous.providerRevoked) {
            throw failure(503, 'ACCOUNT_ERASURE_PENDING', '계정 삭제를 완료한 뒤 다시 로그인해 주세요.');
        }
        if (previous?.appleAuthorizedAt >= authorizedAt) return null;
        return {...(previous || {phase: 'active'}), appleAuthorizedAt: authorizedAt};
    });
}

async function finish(user, secret, path, record, {erasePrivateData, revoke}) {
    const operation = record.operation, attempt = randomUUID();
    const assertSameOperation = current => {
        if (current?.operation !== operation) throw failure(409, 'ACCOUNT_ERASURE_CHANGED', '계정 삭제 상태가 바뀌었어요. 다시 시도해 주세요.');
    };
    record = await updateState(path, current => {
        assertSameOperation(current);
        if (current.phase === 'complete') return null;
        if (current.leaseUntil > Date.now()) throw failure(503, 'ACCOUNT_ERASURE_BUSY', '계정 삭제를 진행하고 있어요. 잠시 후 다시 시도해 주세요.');
        return {...current, attempt, leaseUntil: Date.now() + leaseDuration};
    });
    if (record.phase === 'complete') return {ok: true, deletionEpoch: record.completedAt};

    function advance(from, to) {
        return updateState(path, current => {
            assertSameOperation(current);
            if (current.attempt !== attempt || current.phase !== from) throw unavailable();
            if (to !== 'complete') return {...current, phase: to};
            const {attempt: ended, leaseUntil, ...data} = current;
            const completedAt = Math.max(Date.now(), current.previousEpoch+1, user.issuedAt||0, current.appleEventAt||0);
            return {...data, phase: to, completedAt};
        });
    }

    try {
        if (record.phase === 'cleanup') {
            const owner = lostFound.identity(user, secret);
            await update(storage, lostFound.PATH, board => lostFound.eraseOwner(board, owner, Date.now()));
            await removeOwnedSchedules(user.sub);
            await erasePrivateData(record.needsDrive);
            // If revocation fails, a retry should not need the old Drive grant again.
            record = await advance('cleanup', 'revoke');
        }
        if (!record.providerRevoked) await revoke();
        record = await advance('revoke', 'complete');
        return {ok: true, deletionEpoch: record.completedAt};
    } catch (error) {
        try {
            await updateState(path, current => {
                if (current?.operation !== operation || current.attempt !== attempt) return null;
                const {attempt: ended, leaseUntil, ...data} = current;
                return data;
            });
        } catch { /* The bounded lease allows a retry after a storage outage. */ }
        throw error;
    }
}

async function erase(user, secret, callbacks) {
    if (!configured()) throw unavailable();
    const path = pathFor(user, secret);
    const needsDrive = !!(user.drive || user.driveAuthorized);
    const record = await updateState(path, previous => {
        if (previous?.phase === 'complete' && expiredAt(user,previous.completedAt,previous.appleEventAt)) return null;
        if (pending(previous)) {
            if (previous.previousEpoch && expiredAt(user,previous.previousEpoch,previous.previousAppleEventAt)) return null;
            if (needsDrive && !previous.needsDrive) return {...previous, needsDrive: true};
            return null;
        }
        return newOperation(previous,needsDrive);
    });
    if (record.phase === 'complete') return {ok: true, deletionEpoch: record.completedAt};
    if (record.previousEpoch && expiredAt(user,record.previousEpoch,record.previousAppleEventAt)) return {ok: true, deletionEpoch: record.previousEpoch};
    return finish(user, secret, path, record, callbacks);
}

async function eraseFromAppleNotification(user, secret, eventAt, erasePrivateData) {
    if (!configured() || user.provider !== 'apple' || !timestamp(eventAt)) throw unavailable();
    const path = pathFor(user, secret);
    const record = await updateState(path, previous => {
        // Apple identity tokens have second precision. A login already recorded
        // in the same provider second wins when the order is ambiguous.
        const eventSecond = Math.floor(eventAt/1000);
        if (Math.floor(previous?.appleAuthorizedAt/1000) >= eventSecond || previous?.appleEventAt >= eventAt) return null;
        if (previous?.phase === 'complete' && eventAt <= previous.completedAt) return null;
        const operation = pending(previous) ? previous : newOperation(previous,false);
        return {...operation, appleEventAt: eventAt, providerRevoked: true};
    });
    if (!pending(record) || !record.providerRevoked || record.appleEventAt !== eventAt) return;
    await finish(user, secret, path, record, {erasePrivateData});
}

module.exports = {access, requireActive, erase, recordAppleSignIn, eraseFromAppleNotification};
