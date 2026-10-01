'use strict';
const crypto = require('node:crypto');
const AccountDrive = require('../lib/account-drive.js');
const SESSION = '__Host-shiftcal-google';
const FLOW = '__Host-shiftcal-google-flow';
const API = 'https://www.googleapis.com/calendar/v3';
const TYPES = new Set(['BASE','SPECIAL_DAY','SPECIAL_NIGHT','LEAVE','NO_OT','HALF_PRE','HALF_POST','UNPAID_HALF_PRE','UNPAID_HALF_POST','UNPAID_OFF','FORCED_OFF']);
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
function config() {
    const env = process.env;
    const missing = ['GOOGLE_CALENDAR_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_CALENDAR_SESSION_SECRET','APP_URL'].filter(k => !env[k]);
    let origin = '';
    if (env.APP_URL) {
        try { const u = new URL(env.APP_URL); if (u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.username || u.password) throw Error(); origin = u.origin; }
        catch { missing.push('APP_URL 형식(https://도메인)'); }
    }
    if (env.GOOGLE_CALENDAR_SESSION_SECRET && env.GOOGLE_CALENDAR_SESSION_SECRET.length < 32) missing.push('GOOGLE_CALENDAR_SESSION_SECRET 길이(32자 이상)');
    return { origin, missing, clientId: env.GOOGLE_CALENDAR_CLIENT_ID, clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET, secret: env.GOOGLE_CALENDAR_SESSION_SECRET };
}
function seal(value, secret) {
    const iv = crypto.randomBytes(12), key = crypto.createHash('sha256').update(secret).digest();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
function unseal(value, secret) {
    try {
        const b = Buffer.from(value || '', 'base64url');
        const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(secret).digest(), b.subarray(0,12));
        decipher.setAuthTag(b.subarray(12,28));
        const result = JSON.parse(Buffer.concat([decipher.update(b.subarray(28)), decipher.final()]).toString());
        if (!result.exp || result.exp < Date.now()) return null;
        return result;
    } catch { return null; }
}
function cookies(req) {
    return Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=' )).filter(a => a.length === 2));
}
function setCookie(res, name, value, age) {
    const old = res.getHeader('Set-Cookie') || [];
    res.setHeader('Set-Cookie', [...(Array.isArray(old) ? old : [old]), `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`]);
}
function json(res, code, value) { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(value)); }
function redirect(res, url) { res.statusCode = 302; res.setHeader('Location', url); res.end(); }
async function request(url, options = {}) {
    let response;
    try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) }); }
    catch { throw new ApiError(502, 'NETWORK', '구글 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'); }
    const text = await response.text();
    let data = {}; try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) {
        const code = data.error === 'invalid_grant' ? 'RECONNECT' : data.error?.errors?.[0]?.reason || String(response.status);
        const msg = code === 'RECONNECT' ? '구글 연결이 만료되었습니다. 다시 연결하세요.' :
            response.status === 403 ? '구글 캘린더 접근 권한 또는 Calendar API 설정을 확인하세요.' :
            response.status === 412 ? '다른 곳에서 일정이 수정되었습니다. 다시 불러와 확인하세요.' : '구글 캘린더 요청을 완료하지 못했습니다.';
        throw new ApiError(code === 'RECONNECT' ? 401 : response.status, code, msg);
    }
    return data;
}
async function getToken(session, cfg) {
    const data = await request('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, refresh_token: session.refresh, grant_type: 'refresh_token' }) });
    if (!data.access_token) throw new ApiError(401, 'RECONNECT', '구글 계정을 다시 연결하세요.');
    return data.access_token;
}
function google(token, path, method = 'GET', body, etag) {
    const headers = { Authorization: `Bearer ${token}` };
    if (body) headers['Content-Type'] = 'application/json';
    if (etag) headers['If-Match'] = etag;
    return request(API + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
}
function marker(sub, group) { return `Shift_cal v2 | ${sub} | ${group}`; }
function groupOf(value) { if (!['A','B','C'].includes(value)) throw new ApiError(400,'GROUP','근무조를 확인하세요.'); return value; }
function dateOK(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value; }
function safeId(id) { if (typeof id !== 'string' || !/^[a-z0-9_]{5,1024}$/.test(id)) throw new ApiError(400,'EVENT_ID','일정 ID를 확인하세요.'); return id; }
function colorId(value) { if(value === null)return null; if(typeof value !== 'string' || !/^(?:[1-9]|10|11)$/.test(value))throw new ApiError(400,'COLOR','일정 색상을 확인하세요.');return value; }
async function ownedCalendar(token, id, sub, group) {
    if (typeof id !== 'string' || id.length > 512) throw new ApiError(400,'CALENDAR_ID','캘린더를 확인하세요.');
    const cal = await google(token, `/calendars/${encodeURIComponent(id)}`);
    if (cal.description !== marker(sub, group)) throw new ApiError(403,'CALENDAR','앱 전용 캘린더만 연결할 수 있습니다.');
    return cal;
}
async function findCalendar(token, session, group) {
    let page = '', rounds = 0;
    do {
        const params = new URLSearchParams({ minAccessRole:'owner', showHidden:'true', maxResults:'250' });
        if (page) params.set('pageToken', page);
        const data = await google(token, `/users/me/calendarList?${params}`);
        const matches = (data.items || []).filter(c => c.description === marker(session.sub, group));
        if (matches.length) return ownedCalendar(token, matches[0].id, session.sub, group);
        page = data.nextPageToken || '';
        if (++rounds >= 20 && page) throw new ApiError(413,'CALENDAR_LIMIT','캘린더 목록이 너무 많습니다.');
    } while (page);
    return google(token, '/calendars', 'POST', { summary:`Shift_calander ${group}조`, description:marker(session.sub, group), timeZone:'Asia/Seoul' });
}
function eventBody(input, group, id, existing = null) {
    if (!input || typeof input !== 'object' || typeof input.summary !== 'string' || !input.summary.trim() || input.summary.length > 2000 ||
        typeof (input.description ?? '') !== 'string' || (input.description || '').length > 16000) throw new ApiError(400,'EVENT','일정 제목과 메모를 확인하세요.');
    const start = input.start, end = input.end;
    if (!start || !end) throw new ApiError(400,'DATE','일정 기간을 확인하세요.');
    let range;
    if (start.date || end.date) {
        if (!dateOK(start.date) || !dateOK(end.date) || end.date <= start.date) throw new ApiError(400,'DATE','일정 기간을 확인하세요.');
        range = { start:{date:start.date}, end:{date:end.date} };
    } else {
        const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
        if (!iso.test(start.dateTime || '') || !iso.test(end.dateTime || '') || !dateOK(start.dateTime.slice(0,10)) || !dateOK(end.dateTime.slice(0,10)) || !Number.isFinite(Date.parse(start.dateTime)) || !Number.isFinite(Date.parse(end.dateTime)) || Date.parse(end.dateTime) <= Date.parse(start.dateTime)) throw new ApiError(400,'DATE','시작·종료 시간을 확인하세요.');
        range = { start:{dateTime:start.dateTime,timeZone:'Asia/Seoul'}, end:{dateTime:end.dateTime,timeZone:'Asia/Seoul'} };
    }
    const props = input.extendedProperties?.private || {};
    if (props.kind === 'shift') {
        if (!dateOK(props.originDate) || !TYPES.has(props.override) || !start.date || start.date !== props.originDate || Date.parse(end.date) - Date.parse(start.date) !== 86400000 || !new RegExp('^sc2'+group.toLowerCase()+props.originDate.replace(/-/g,'')+'(?:r[a-f0-9]{16})?$').test(id)) throw new ApiError(400,'SHIFT','근무 일정 형식이 올바르지 않습니다.');
    } else if (props.kind !== 'personal') throw new ApiError(400,'KIND','일정 종류를 확인하세요.');
    if(props.kind==='personal' && /^sc2[a-c]\d{8}/.test(id))throw new ApiError(400,'SHIFT','근무 일정을 개인 일정으로 변경할 수 없습니다.');
    if (existing?.recurrence || existing?.recurringEventId) throw new ApiError(409,'RECURRING','반복 일정은 구글 캘린더에서 수정하세요.');
    const privateProps = { ...(existing?.extendedProperties?.private || {}), app:'shift_cal_v2', group, kind:props.kind };
    if (props.kind === 'shift') Object.assign(privateProps, { originDate:props.originDate, override:props.override });
    return { summary:input.summary.trim(), description:input.description || '', ...range,
        extendedProperties:{private:privateProps}, ...(input.colorId !== undefined ? {colorId:colorId(input.colorId)} : {}), ...(props.kind === 'shift' ? { transparency:'transparent',visibility:'private' } : {}) };
}
async function listEvents(token, id, body) {
    if (!dateOK(body.start) || !dateOK(body.end) || body.end <= body.start || Date.parse(body.end) - Date.parse(body.start) > 62 * 86400000) throw new ApiError(400,'RANGE','조회 기간은 최대 두 달입니다.');
    const items = [], seen = new Set();
    let page = '', rounds = 0;
    do {
        const params = new URLSearchParams({ timeMin:`${body.start}T00:00:00+09:00`, timeMax:`${body.end}T00:00:00+09:00`, singleEvents:'true', showDeleted:'true', maxResults:'2500' });
        if (page) params.set('pageToken',page);
        const data = await google(token, `/calendars/${encodeURIComponent(id)}/events?${params}`);
        for (const item of data.items || []) { items.push(item); seen.add(item.id); }
        page = data.nextPageToken || '';
        if (++rounds >= 10 && page) throw new ApiError(413,'EVENT_LIMIT','한 달 일정이 너무 많아 조회를 중단했습니다.');
    } while (page);
    const known = [...new Set(body.knownIds || [])];
    if (known.length > 62) throw new ApiError(400,'KNOWN_IDS','조회 일정을 줄여 주세요.');
    for (let i = 0; i < known.length; i += 4) {
        const extra = await Promise.all(known.slice(i,i+4).filter(x => !seen.has(x)).map(async idValue => {
            safeId(idValue);
            try { return await google(token, `/calendars/${encodeURIComponent(id)}/events/${encodeURIComponent(idValue)}`); }
            catch (e) { if ([404,410].includes(e.status)) return {id:idValue,status:'cancelled'}; throw e; }
        })); items.push(...extra);
    }
    return items;
}
async function writes(token, calendarId, group, operations) {
    if (!Array.isArray(operations) || operations.length > 10) throw new ApiError(400,'BATCH','한 번에 최대 10개 일정만 변경할 수 있습니다.');
    const results = [];
    // Bound concurrency and report every operation; a partially successful batch is retryable.
    for (let i = 0; i < operations.length; i += 3) {
        const chunk = await Promise.all(operations.slice(i,i+3).map(async op => {
            try {
                const id = safeId(op.id), path = `/calendars/${encodeURIComponent(calendarId)}/events`;
                if (!['insert','patch','color','delete'].includes(op.type)) throw new ApiError(400,'OPERATION','지원하지 않는 변경입니다.');
                if (op.type === 'insert') {
                    if (!/^(sc2[a-c]\d{8}(?:r[a-f0-9]{16})?|scp[a-f0-9]{32})$/.test(id)) throw new ApiError(400,'EVENT_ID','새 일정 ID를 확인하세요.');
                    const data = eventBody(op.event, group, id);
                    const event = await google(token, path, 'POST', {id,...data});
                    return {id,ok:true,event};
                }
                if (typeof op.etag !== 'string' || op.etag.length > 512 || !op.etag) throw new ApiError(400,'ETAG','최신 일정을 다시 불러와 주세요.');
                const old = await google(token, `${path}/${encodeURIComponent(id)}`);
                if (old.etag !== op.etag) throw new ApiError(412,'CONFLICT','일정이 다른 곳에서 변경되었습니다.');
                if (old.recurrence || old.recurringEventId) throw new ApiError(409,'RECURRING','반복 일정은 구글 캘린더에서 수정하세요.');
                if (op.type === 'color') {
                    if(old.extendedProperties?.private?.app !== 'shift_cal_v2' || old.extendedProperties.private.kind !== 'shift' || old.extendedProperties.private.group !== group)throw new ApiError(403,'COLOR_OWNER','앱 근무 일정의 색상만 변경할 수 있습니다.');
                    const event=await google(token,`${path}/${encodeURIComponent(id)}`,'PATCH',{colorId:colorId(op.colorId),visibility:'private'},op.etag);
                    return {id,ok:true,event};
                }
                if (op.type === 'delete') {
                    if (old.extendedProperties?.private?.kind === 'shift' || /^sc2[a-c]\d{8}/.test(id)) throw new ApiError(400,'SHIFT_DELETE','근무 일정 삭제는 구글 캘린더에서 진행하고 웹앱에서 확인하세요.');
                    await google(token, `${path}/${encodeURIComponent(id)}`, 'DELETE', undefined, op.etag);
                    return {id,ok:true,event:{id,status:'cancelled'}};
                }
                const event = await google(token, `${path}/${encodeURIComponent(id)}`, 'PATCH', eventBody(op.event,group,id,old), op.etag);
                return {id,ok:true,event};
            } catch (e) { return { id:op?.id || '', ok:false, status:e.status || 500, code:e.code || 'ERROR', message:e.message }; }
        })); results.push(...chunk);
    }
    return results;
}
async function handler(req, res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const cfg = config();
    const url = new URL(req.url,'https://local.invalid');
    const action = url.searchParams.get('action') || 'status';
    let session = cfg.secret ? unseal(cookies(req)[SESSION], cfg.secret) : null;
    try {
        if (action === 'status' && req.method === 'GET') return json(res,200,{configured:!cfg.missing.length,missing:cfg.missing,connected:!!session,cloudConnected:!!session?.drive,
            ...(session ? {user:{id:session.sub,email:session.email},csrf:session.csrf} : {}), ...(cfg.origin ? {redirectUri:cfg.origin+'/api/google-calendar?action=callback'} : {})});
        if (cfg.missing.length) throw new ApiError(503,'SETUP','관리자가 구글 연동 설정을 완료해야 합니다.');
        if (action === 'login' && req.method === 'GET') {
            const state = crypto.randomBytes(32).toString('base64url'), verifier = crypto.randomBytes(32).toString('base64url');
            const storage = url.searchParams.get('storage') === '1';
            setCookie(res,FLOW,seal({state,verifier,storage,exp:Date.now()+600000},cfg.secret),600);
            const params = new URLSearchParams({ client_id:cfg.clientId, redirect_uri:cfg.origin+'/api/google-calendar?action=callback', response_type:'code',
                scope:'openid email https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.calendarlist.readonly'+(storage ? ' https://www.googleapis.com/auth/drive.appdata' : ''),
                include_granted_scopes:'true',
                access_type:'offline', prompt:'consent select_account', state, code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'), code_challenge_method:'S256' });
            return redirect(res,'https://accounts.google.com/o/oauth2/v2/auth?'+params);
        }
        if (action === 'callback' && req.method === 'GET') {
            const flow = unseal(cookies(req)[FLOW],cfg.secret);
            setCookie(res,FLOW,'',0);
            if (!flow || !url.searchParams.get('state') || flow.state !== url.searchParams.get('state')) throw new ApiError(400,'STATE','로그인 요청을 확인할 수 없습니다. 다시 연결하세요.');
            if (url.searchParams.get('error')) return redirect(res,cfg.origin+'/?google=denied');
            const code = url.searchParams.get('code');
            if (!code) throw new ApiError(400,'CODE','로그인 코드를 확인할 수 없습니다.');
            const data = await request('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({
                code, client_id:cfg.clientId, client_secret:cfg.clientSecret, redirect_uri:cfg.origin+'/api/google-calendar?action=callback', grant_type:'authorization_code',code_verifier:flow.verifier })});
            const scopes = new Set((data.scope || '').split(' '));
            if (!scopes.has('https://www.googleapis.com/auth/calendar.app.created') || !scopes.has('https://www.googleapis.com/auth/calendar.calendarlist.readonly')) throw new ApiError(403,'SCOPE','캘린더 연결 권한을 모두 허용해 주세요.');
            if (flow.storage && !scopes.has('https://www.googleapis.com/auth/drive.appdata')) throw new ApiError(403,'DRIVE_PERMISSION','계정 저장 권한을 허용해주세요.');
            const user = await request('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${data.access_token}`}});
            if (!user.sub || !user.email || !user.email_verified) throw new ApiError(403,'USER','구글 계정을 확인할 수 없습니다.');
            const refresh = data.refresh_token || (session?.sub === user.sub ? session.refresh : null);
            if (!refresh) throw new ApiError(401,'RECONNECT','지속 연결 권한을 받지 못했습니다. 다시 연결하세요.');
            session = { sub:user.sub,email:user.email,refresh,drive:scopes.has('https://www.googleapis.com/auth/drive.appdata'),csrf:crypto.randomBytes(24).toString('base64url'),exp:Date.now()+30*86400000 };
            const cookie = seal(session,cfg.secret);
            if (cookie.length > 3700) throw new ApiError(502,'SESSION_SIZE','로그인 정보를 저장하지 못했습니다.');
            setCookie(res,SESSION,cookie,30*86400);
            return redirect(res,cfg.origin+(flow.storage ? '/?cloud=connected' : '/?google=connected'));
        }
        if (req.method !== 'POST') throw new ApiError(405,'METHOD','지원하지 않는 요청 방식입니다.');
        if (!session) throw new ApiError(401,'RECONNECT','구글 계정을 연결해 주세요.');
        if (req.headers.origin !== cfg.origin || req.headers['x-shift-csrf'] !== session.csrf) throw new ApiError(403,'CSRF','요청을 확인하지 못했습니다. 웹앱을 새로고침하세요.');
        if (action === 'logout') { setCookie(res,SESSION,'',0); return json(res,200,{ok:true}); }
        let body = req.body;
        if (typeof body === 'string') { if (body.length > 250000) throw new ApiError(413,'BODY','요청이 너무 큽니다.'); try { body = JSON.parse(body); } catch { throw new ApiError(400,'JSON','요청 형식을 확인하세요.'); } }
        if (!body || typeof body !== 'object' || JSON.stringify(body).length > 250000) throw new ApiError(400,'BODY','요청 데이터를 확인하세요.');
        if (action === 'cloud-read' || action === 'cloud-write') {
            if (!session.drive) throw new ApiError(403,'DRIVE_PERMISSION','계정 저장 권한을 추가해주세요.');
            const token = await getToken(session,cfg);
            return json(res,200,action === 'cloud-read' ? await AccountDrive.read(token) : await AccountDrive.write(token,body));
        }
        const group = groupOf(body.group), token = await getToken(session,cfg);
        if (action === 'calendar') {
            let calendar;
            if(body.calendarId){try{calendar=await ownedCalendar(token,body.calendarId,session.sub,group);}catch(e){if(![404,410].includes(e.status))throw e;}}
            calendar ||= await findCalendar(token,session,group);
            return json(res,200,{calendar:{id:calendar.id,summary:calendar.summary}});
        }
        await ownedCalendar(token,body.calendarId,session.sub,group);
        if (action === 'read') return json(res,200,{items:await listEvents(token,body.calendarId,body)});
        if (action === 'write') return json(res,200,{results:await writes(token,body.calendarId,group,body.operations)});
        throw new ApiError(400,'ACTION','지원하지 않는 요청입니다.');
    } catch (e) {
        if (action === 'callback' && cfg.origin) return redirect(res,cfg.origin+'/?google=error&reason='+encodeURIComponent(e.code || 'ERROR'));
        return json(res,e.status || 500,{error:e.code || 'ERROR',message:e.status ? e.message : '서버 요청을 처리하지 못했습니다.'});
    }
}
module.exports = handler;
module.exports._test = { seal,unseal,config,eventBody,dateOK,marker,writes,listEvents };
