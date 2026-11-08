'use strict';
const crypto=require('node:crypto');
const {BlobNotFoundError}=require('@vercel/blob');
const {get,put,del,head,configured}=require('../lib/object-storage');
const C=require('../account-data-core.js');
const AccountErasure=require('../lib/account-erasure.js');
const {notification}=require('../lib/apple-notification.js');
const {isConflict}=require('../lib/blob-json-store.js');
const {trusted}=require('../lib/app-origins.js');
const nativeAuth=require('../lib/native-auth.js');
const {seal,unseal,config:googleConfig}=require('./google-calendar.js')._test;
const COOKIE='__Host-shiftcal-apple',FLOW='__Host-shiftcal-apple-flow';
const APPLE_PATH='/api/apple-account';
function config(){const env=process.env;return {...googleConfig(),client:env.APPLE_CLIENT_ID,team:env.APPLE_TEAM_ID,keyId:env.APPLE_KEY_ID,key:env.APPLE_PRIVATE_KEY?.replace(/\\n/g,'\n'),missing:['APPLE_CLIENT_ID','APPLE_TEAM_ID','APPLE_KEY_ID','APPLE_PRIVATE_KEY','GOOGLE_CALENDAR_SESSION_SECRET','APP_URL'].filter(k=>!env[k]).concat(configured()?[]:['BLOB_READ_WRITE_TOKEN'],googleConfig().missing.filter(k=>k.startsWith('APP_URL')||k.startsWith('GOOGLE_CALENDAR_SESSION_SECRET')))};}
function cookie(req,name,secret){const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);return secret?unseal(value,secret):null;}
function session(req){const s=cookie(req,COOKIE,process.env.GOOGLE_CALENDAR_SESSION_SECRET);return s?.provider==='apple'?s:null;}
function setCookie(res,name,value,age,sameSite='Lax'){const old=res.getHeader('Set-Cookie')||[];res.setHeader('Set-Cookie',[...(Array.isArray(old)?old:[old]),`${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=${sameSite}`]);}
function error(status,code,message){return Object.assign(Error(message),{status,code});}
function clientSecret(cfg){const now=Math.floor(Date.now()/1000),h=Buffer.from(JSON.stringify({alg:'ES256',kid:cfg.keyId})).toString('base64url'),p=Buffer.from(JSON.stringify({iss:cfg.team,iat:now,exp:now+300,aud:'https://appleid.apple.com',sub:cfg.client})).toString('base64url');return h+'.'+p+'.'+crypto.sign('sha256',Buffer.from(h+'.'+p),{key:cfg.key,dsaEncoding:'ieee-p1363'}).toString('base64url');}
async function verify(token,nonce,aud,keys){if(typeof token!=='string'||token.length>16000)throw error(400,'TOKEN','Apple 인증 정보를 확인하세요.');const parts=token.split('.');if(parts.length!==3)throw error(400,'TOKEN','Apple 인증 정보를 확인하세요.');let h,p;try{h=JSON.parse(Buffer.from(parts[0],'base64url'));p=JSON.parse(Buffer.from(parts[1],'base64url'));}catch{throw error(400,'TOKEN','Apple 인증 정보를 확인하세요.');}const jwk=keys.find(k=>k.kid===h.kid&&k.kty==='RSA'&&k.alg==='RS256');if(h.alg!=='RS256'||!jwk||!crypto.verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),crypto.createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw error(401,'SIGNATURE','Apple 인증 서명이 올바르지 않습니다.');const now=Date.now()/1000;if(p.iss!=='https://appleid.apple.com'||p.aud!==aud||typeof p.sub!=='string'||!p.sub||!Number.isFinite(p.exp)||p.exp<=now||!Number.isFinite(p.iat)||p.iat>now+60||p.nonce!==nonce)throw error(401,'CLAIMS','Apple 인증 요청이 만료되었거나 올바르지 않습니다.');return p;}
async function cloudRead(user,deletionEpoch) {
    const path='accounts/apple/'+crypto.createHash('sha256').update(user.sub).digest('hex')+'.json';
    const r=await get(path,{access:'private',useCache:false});
    if(!r)return {path,versions:[],etag:null};
    const doc=JSON.parse(await new Response(r.stream).text());
    if(deletionEpoch&&doc.accountEpoch!==deletionEpoch)return {path,versions:[],etag:r.blob.etag};
    doc.data=C.normalize(doc.data);
    return {path,versions:[{revision:doc.revision,updatedAt:doc.updatedAt,data:doc.data}],etag:r.blob.etag};
}
async function erasePrivateData(user) {
    const path = 'accounts/apple/' + crypto.createHash('sha256').update(user.sub).digest('hex') + '.json';
    const missing = e => e instanceof BlobNotFoundError || e?.name === 'BlobNotFoundError';
    for (let attempt = 0; attempt < 5; attempt++) {
        let metadata;
        try { metadata = await head(path); }
        catch (e) { if (missing(e)) return; throw e; }
        try { await del(path, {ifMatch: metadata.etag}); return; }
        catch (e) { if (missing(e)) return; if (!isConflict(e)) throw e; }
    }
    throw error(409, 'CLOUD_CONFLICT', '계정 저장 내용이 바뀌었어요. 삭제를 다시 시도해 주세요.');
}
async function revokeApple(user, cfg) {
    if (!user.refresh) throw error(401, 'RECONNECT', 'Apple로 다시 로그인하세요.');
    const response = await fetch('https://appleid.apple.com/auth/revoke', {
        method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({client_id: cfg.client, client_secret: clientSecret(cfg), token: user.refresh, token_type_hint: 'refresh_token'}),
        signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw error(502, 'REVOKE', 'Apple 연결 해제를 완료하지 못했습니다. 다시 시도하세요.');
}
async function cloudWrite(user,body,secret,deletionEpoch) {
    if(!body||!/^[a-f0-9]{32}$/.test(body.revision||'')||!Array.isArray(body.parents)||body.parents.length>1||body.parents.some(x=>!/^[a-f0-9]{32}$/.test(x)))throw error(400,'CLOUD_REQUEST','저장 버전을 확인하세요.');
    let data;
    try{data=C.normalize(body.data);}catch(e){throw error(400,'CLOUD_DATA',e.message);}
    const old=await cloudRead(user,deletionEpoch);
    if(old.versions[0]?.revision===body.revision){
        if(!C.equal(old.versions[0].data,data))throw error(409,'CLOUD_REVISION','저장 버전이 중복되었습니다.');
        return old.versions[0];
    }
    if(!C.equal(old.versions.map(x=>x.revision),body.parents))throw error(412,'CLOUD_CONFLICT','다른 기기에서 변경되었습니다. 다시 불러오세요.');
    const doc={revision:body.revision,data,updatedAt:new Date().toISOString()};
    await AccountErasure.requireActive(user,secret);
    let written;
    try {
        written=await put(old.path,JSON.stringify({...doc,...(deletionEpoch?{accountEpoch:deletionEpoch}:{})}),{access:'private',addRandomSuffix:false,allowOverwrite:!!old.etag,...(old.etag?{ifMatch:old.etag}:{}),contentType:'application/json',cacheControlMaxAge:60});
    } catch(e) {
        if(isConflict(e)||e.name==='BlobAlreadyExistsError')throw error(412,'CLOUD_CONFLICT','다른 기기에서 변경되었습니다. 다시 불러오세요.');
        throw e;
    }
    try {await AccountErasure.requireActive(user,secret);}
    catch(e) {
        if(written?.etag&&['ACCOUNT_ERASURE_PENDING','ACCOUNT_ERASED'].includes(e.code)){
            try {await del(old.path,{ifMatch:written.etag});}
            catch(cleanupError){if(!(cleanupError instanceof BlobNotFoundError)&&!isConflict(cleanupError))throw cleanupError;}
        }
        throw e;
    }
    return doc;
}
function failureLocation(origin, flow, reason) {
    if (flow?.nativeChallenge && !flow.webReturn) {
        return 'shiftcal://auth?' + new URLSearchParams({state: flow.nativeState, error: reason});
    }
    const destination = trusted(flow?.webReturn) ? flow.webReturn : origin;
    const query = reason === 'denied' ? {apple: 'denied'} : {apple: 'error', reason};
    return destination + '/?' + new URLSearchParams(query);
}
async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const reply = (code, value) => {
        res.statusCode = code;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(value));
    };
    const redirect = url => {
        res.statusCode = 302;
        res.setHeader('Location', url);
        res.end();
    };
    const cfg = config();
    const url = new URL(req.url, 'https://local.invalid');
    const action = url.searchParams.get('action') ?? (req.method === 'POST' ? 'notification' : 'status');
    const audience = process.env.APPLE_NOTIFICATION_AUDIENCE;
    const notificationAudience = /^[A-Za-z0-9.-]{1,255}$/.test(audience||'') ? audience : undefined;
    const user = session(req);
    const callbackUri = cfg.origin + APPLE_PATH + '?action=callback';
    const forwardedOrigin = req.headers['x-work-routine-origin'];
    let verifiedFlow;
    try {
        if (action === 'notification') {
            const event = await notification(req,cfg.secret?.length >= 32 ? notificationAudience : undefined);
            if (event.type === 'consent-revoked' || event.type === 'account-deleted') {
                const account = {provider:'apple',sub:'apple:'+event.sub};
                await AccountErasure.eraseFromAppleNotification(account,cfg.secret,event.eventAt,()=>erasePrivateData(account));
            }
            // The app has no outbound account mail or forwarding preference to change.
            return reply(200,{ok:true});
        }
        if (action === 'status' && req.method === 'GET') {
            const deletion = await AccountErasure.access(user,cfg.secret,{allowUnavailable:true});
            const connected = !!user && deletion.state !== 'expired';
            const missing = notificationAudience ? cfg.missing : [...cfg.missing,'APPLE_NOTIFICATION_AUDIENCE'];
            return reply(200, {configured: !missing.length, connected, cloudConnected: connected && deletion.state === 'active', provider: 'apple',
                ...(connected ? {user: {id: user.sub, email: user.email || 'Apple 계정'}, csrf: user.csrf} : {}),
                ...(deletion.state === 'expired' && deletion.deletionEpoch ? {deletedAccount:user.sub} : {}),
                ...(deletion.deletionEpoch ? {deletionEpoch: deletion.deletionEpoch} : {}),
                ...(deletion.state === 'pending' ? {deletionPending: true} : {}),
                ...(deletion.state === 'unavailable' ? {deletionCheckUnavailable: true} : {}),
                missing});
        }
        if (cfg.missing.length) throw error(503, 'APPLE_SETUP', 'Apple 개발자 계정과 로그인 서비스 설정이 필요합니다.');
        if (action === 'login' && req.method === 'GET') {
            if (!notificationAudience) throw error(503,'APPLE_NOTIFICATION_SETUP','Apple 알림 설정이 필요해요.');
            const handoff = nativeAuth.flow(url);
            if (forwardedOrigin && forwardedOrigin !== cfg.origin) {
                if (!trusted(forwardedOrigin) || !handoff.nativeChallenge || (handoff.webReturn && handoff.webReturn !== forwardedOrigin)) {
                    throw error(400, 'NATIVE_FLOW', '앱에서 Apple 로그인을 다시 시작해 주세요.');
                }
                // Apple posts to the registered callback on the backend origin.
                // Issue the host-only flow cookie there, after the redirect.
                return redirect(cfg.origin + APPLE_PATH + url.search);
            }
            const state = crypto.randomBytes(32).toString('base64url');
            const nonce = crypto.randomBytes(32).toString('base64url');
            setCookie(res, FLOW, seal({state, nonce, ...handoff, exp: Date.now() + 600000}, cfg.secret), 600, 'None');
            const params = new URLSearchParams({client_id: cfg.client, redirect_uri: callbackUri, response_type: 'code', response_mode: 'form_post', scope: 'email', state, nonce});
            return redirect('https://appleid.apple.com/auth/authorize?' + params);
        }
        if (action === 'callback' && req.method === 'POST') {
            const issuedAt = Date.now();
            if (forwardedOrigin && forwardedOrigin !== cfg.origin) throw error(400, 'STATE', '로그인 요청을 확인할 수 없습니다.');
            const flow = cookie(req, FLOW, cfg.secret);
            const body = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : req.body;
            if (!flow || body?.state !== flow.state) throw error(400, 'STATE', '로그인 요청을 확인할 수 없습니다.');
            verifiedFlow = flow;
            setCookie(res, FLOW, '', 0, 'None');
            if (body.error) return redirect(failureLocation(cfg.origin, flow, 'denied'));
            if (typeof body.code !== 'string' || body.code.length > 3000) throw error(400, 'CODE', '로그인 코드를 확인하세요.');
            const r = await fetch('https://appleid.apple.com/auth/token', {
                method: 'POST',
                headers: {'Content-Type': 'application/x-www-form-urlencoded'},
                body: new URLSearchParams({client_id: cfg.client, client_secret: clientSecret(cfg), code: body.code, grant_type: 'authorization_code', redirect_uri: callbackUri}),
                signal: AbortSignal.timeout(15000)
            });
            const data = await r.json();
            if (!r.ok) throw error(401, 'APPLE_TOKEN', 'Apple 로그인에 실패했습니다. 다시 시도하세요.');
            const keys = await (await fetch('https://appleid.apple.com/auth/keys', {signal: AbortSignal.timeout(15000)})).json();
            const claims = await verify(data.id_token, flow.nonce, cfg.client, keys.keys || []);
            const authenticated = {
                provider: 'apple', sub: 'apple:' + claims.sub, email: claims.email || 'Apple 계정',
                refresh: data.refresh_token, csrf: crypto.randomBytes(24).toString('base64url'), appleAuthorizedAt: Math.floor(claims.iat)*1000, issuedAt, exp: issuedAt + 7 * 86400000
            };
            await AccountErasure.recordAppleSignIn(authenticated,cfg.secret,authenticated.appleAuthorizedAt);
            const value = seal(authenticated, cfg.secret);
            // The exchange installs session cookies on the initiating origin.
            if (flow.nativeChallenge) return redirect(nativeAuth.callback(flow, value, 'apple', cfg.secret));
            setCookie(res, COOKIE, value, 7 * 86400);
            setCookie(res, '__Host-shiftcal-google', '', 0);
            return redirect(cfg.origin + '/?cloud=connected');
        }
        if (req.method !== 'POST') throw error(405,'METHOD','지원하지 않는 요청입니다.');
        if (!user) throw error(401,'RECONNECT','Apple로 다시 로그인하세요.');
        if (req.headers.origin !== cfg.origin || req.headers['x-shift-csrf'] !== user.csrf) throw error(403,'CSRF','앱을 새로고침하세요.');
        if (action === 'logout') {
            setCookie(res,COOKIE,'',0);
            return reply(200,{ok:true});
        }
        if (action === 'cloud-delete') {
            const result = await AccountErasure.erase(user,cfg.secret,{
                erasePrivateData: () => erasePrivateData(user),
                revoke: () => revokeApple(user,cfg)
            });
            setCookie(res,COOKIE,'',0);
            return reply(200,result);
        }
        if (['cloud-read','cloud-write'].includes(action)) {
            const access = await AccountErasure.requireActive(user,cfg.secret);
            if (!user.refresh) throw error(401,'RECONNECT','Apple로 다시 로그인하세요.');
            const valid = await fetch('https://appleid.apple.com/auth/token',{
                method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
                body:new URLSearchParams({client_id:cfg.client,client_secret:clientSecret(cfg),refresh_token:user.refresh,grant_type:'refresh_token'}),
                signal:AbortSignal.timeout(15000)
            });
            if (!valid.ok) throw error(401,'RECONNECT','Apple 연결이 해제되었습니다. 다시 로그인하세요.');
            if (action === 'cloud-read') return reply(200,{versions:(await cloudRead(user,access.deletionEpoch)).versions});
            let body = req.body;
            if (typeof body === 'string') {
                if (body.length > 250000) throw error(413,'BODY','요청이 너무 큽니다.');
                body=JSON.parse(body);
            }
            return reply(200,await cloudWrite(user,body,cfg.secret,access.deletionEpoch));
        }
        throw error(400,'ACTION','지원하지 않는 요청입니다.');
    } catch (e) {
        if (action === 'callback' && cfg.origin) return redirect(failureLocation(cfg.origin,verifiedFlow,e.code||'ERROR'));
        return reply(e.status||500,{error:e.code||'ERROR',message:e.status?e.message:'계정 요청을 처리하지 못했습니다.'});
    }
}
module.exports=handler;module.exports.session=session;module.exports._test={verify,config,clientSecret};
