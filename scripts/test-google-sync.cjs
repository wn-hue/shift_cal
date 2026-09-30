const assert = require('node:assert/strict');
const C = require('../google-sync-core.js');
const handler = require('../api/google-calendar.js');
const S = handler._test;
const copy = x => JSON.parse(JSON.stringify(x));
function event(memo='',title='C조 주간 1일차') {
    return {id:'sc2c20260909',etag:'"v1"',summary:title,description:C.PREFIX+memo,start:{date:'2026-09-09'},end:{date:'2026-09-10'},
        extendedProperties:{private:{app:'shift_cal_v2',kind:'shift',group:'C',originDate:'2026-09-09',override:'BASE'}}};
}
const value=C.local(), original=event(), record={id:original.id,etag:original.etag,signature:C.signature(original),summary:original.summary,local:value};
assert.equal(C.plan(value,null,null,original),'insert');
assert.equal(C.plan(value,null,original,original),'adopt');
assert.equal(C.plan(C.local('BASE','local'),record,original,event('local')),'patch');
assert.equal(C.plan(value,record,event('remote'),original),'inbound');
assert.equal(C.plan(C.local('BASE','local'),record,event('remote'),event('local')),'conflict');
assert.equal(C.plan(C.local('BASE','same'),record,event('same'),event('same')),'adopt');
assert.equal(C.plan(value,record,null,original),'deleted');
assert.equal(C.plan(value,record,{id:original.id,status:'cancelled'},original),'deleted');
assert.equal(C.plan(value,record,original,event('','C조 야간 1일차')),'patch','Changed baseline must be sent');
assert.equal(C.origin({id:'sc2c20260909r0123456789abcdef'}),'2026-09-09');
assert.equal(C.memo(event('메모\n둘째 줄')),'메모\n둘째 줄');
assert.equal(C.memo({...original,description:'구글에서 자유롭게 변경'}),'구글에서 자유롭게 변경');
assert.equal(C.memo({...original,description:(C.PREFIX+'메모').replace(/\n/g,'\r\n')}),'메모');
assert.equal(C.infer('C조 연차 · 주간','DAY'),'LEAVE');
assert.equal(C.infer('C조 야간 특근','OFF'),'SPECIAL_NIGHT');
assert.equal(C.infer('C조 주간 · O.T해제','DAY'),'NO_OT');
assert.equal(C.infer('C조 주간 · O.T해제','OFF'),null);
assert.equal(C.infer('C조 무급 반차(후)','NIGHT'),'UNPAID_HALF_POST');
assert.equal(C.infer('병원 예약','DAY'),null);
assert.equal(C.infer('야간','DAY'),null,'Never infer a forbidden shift swap');
assert.equal(S.dateOK('2026-02-30'),false);
assert.equal(S.dateOK('2028-02-29'),true);
const secret='unit-test-secret-not-a-real-credential-0123456789';
const session={sub:'user-1',email:'test@example.com',refresh:'fixture-refresh',csrf:'fixture-csrf',exp:Date.now()+60000};
const encrypted=S.seal(session,secret);
assert.deepEqual(S.unseal(encrypted,secret),session);
assert.ok(!encrypted.includes('fixture-refresh'));
assert.equal(S.unseal(encrypted,'another-secret'),null);
assert.equal(S.unseal(encrypted.slice(0,-4)+'AAAA',secret),null);
assert.equal(S.unseal(S.seal({...session,exp:1},secret),secret),null);
assert.equal(S.eventBody(original,'C',original.id).extendedProperties.private.override,'BASE');
assert.throws(()=>S.eventBody({...original,end:{date:'2026-09-09'}},'C',original.id));
assert.throws(()=>S.eventBody(original,'A',original.id));
assert.throws(()=>S.eventBody(original,'C',original.id,{recurrence:['RRULE:FREQ=DAILY']}));
assert.throws(()=>S.eventBody({...original,extendedProperties:{private:{kind:'shift',override:'MALFORMED',originDate:'2026-09-09'}}},'C',original.id));
class ResponseMock {
    headers={}; statusCode=200; result=null;
    setHeader(name,value){this.headers[name]=value;} getHeader(name){return this.headers[name];}
    end(body=''){this.body=body;try{this.result=JSON.parse(body);}catch{}}
}
const envKeys=['GOOGLE_CALENDAR_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_CALENDAR_SESSION_SECRET','APP_URL'];
const previous=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
let fetchOriginal=global.fetch;
let calls=[], mode='normal';
async function invoke(action,{method='POST',body={},cookie=encrypted,origin='https://shift.example',csrf='fixture-csrf',query=''}={}) {
    const response=new ResponseMock();
    await handler({url:'/api/google-calendar?action='+action+query,method,body,headers:{cookie:cookie?'__Host-shiftcal-google='+cookie:'',origin,'x-shift-csrf':csrf}},response);
    return response;
}
async function run() {
    try {
        for(const k of envKeys)delete process.env[k];
        let res=await invoke('status',{method:'GET',cookie:null});
        assert.equal(res.result.configured,false);assert.equal(res.result.missing.length,4);
        process.env.GOOGLE_CALENDAR_CLIENT_ID='fixture-id';process.env.GOOGLE_CALENDAR_CLIENT_SECRET='fixture-secret';
        process.env.GOOGLE_CALENDAR_SESSION_SECRET=secret;process.env.APP_URL='https://shift.example';
        res=await invoke('status',{method:'GET'});
        assert.equal(res.result.connected,true);assert.equal(res.result.csrf,'fixture-csrf');
        assert.ok(!res.body.includes('fixture-refresh'),'Token must never reach browser JS');
        assert.equal(res.headers['Cache-Control'],'no-store');
        res=await invoke('login',{method:'GET'});
        assert.equal(res.statusCode,302);
        const login=new URL(res.headers.Location);
        assert.equal(login.searchParams.get('access_type'),'offline');assert.ok(login.searchParams.get('state'));assert.equal(login.searchParams.get('code_challenge_method'),'S256');
        assert.ok(res.headers['Set-Cookie'][0].includes('HttpOnly; Secure; SameSite=Lax'));
        const flowCookie=res.headers['Set-Cookie'][0].split(';')[0];
        res=await invoke('callback',{method:'GET',query:'&code=fake&state=wrong'});
        assert.match(res.headers.Location,/reason=STATE/);
        res=await invoke('write',{csrf:'bad',body:{group:'C'}});assert.equal(res.statusCode,403);
        res=await invoke('read',{origin:'https://attacker.example',body:{group:'C'}});assert.equal(res.statusCode,403);
        res=await invoke('read',{cookie:null,body:{group:'C'}});assert.equal(res.statusCode,401);
        global.fetch=async(url,options={})=>{
            const u=new URL(url);calls.push({url:u,options});
            const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
            if(u.hostname==='oauth2.googleapis.com') {
                const params=new URLSearchParams(options.body);
                if(params.get('grant_type')==='authorization_code')return response({access_token:'fixture-access',refresh_token:'fixture-new-refresh',scope:mode==='partial-scope'?'openid email':'openid email https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.calendarlist.readonly'});
                return response({access_token:'fixture-access'});
            }
            if(u.hostname==='openidconnect.googleapis.com')return response({sub:'user-1',email:'test@example.com',email_verified:true});
            if(u.pathname==='/calendar/v3/calendars/cal-1')return response({id:'cal-1',description:mode==='foreign'?'some other calendar':S.marker('user-1','C')});
            if(u.pathname.endsWith('/users/me/calendarList'))return response({items:[{id:'cal-1',description:S.marker('user-1','C')}]});
            if(u.pathname.endsWith('/events')&&options.method==='GET')return response(u.searchParams.get('pageToken')?{items:[{id:'personal2',summary:'second page'}]}:{items:[original],nextPageToken:'page2'});
            if(u.pathname.endsWith('/events/sc2c20260910'))return response({error:{code:404}},404);
            if(u.pathname.endsWith('/events/'+original.id)&&options.method==='GET')return response(original);
            if(u.pathname.endsWith('/events/'+original.id)&&options.method==='PATCH'){
                if(mode==='race')return response({error:{code:412}},412);
                assert.equal(options.headers['If-Match'],'"v1"');return response({...JSON.parse(options.body),id:original.id,etag:'"v2"'});
            }
            if(u.pathname.endsWith('/events')&&options.method==='POST')return response({...JSON.parse(options.body),etag:'"new"'});
            throw Error('Unexpected mocked request '+u.pathname);
        };
        res=new ResponseMock();
        await handler({url:'/api/google-calendar?action=callback&code=fixture&state='+encodeURIComponent(login.searchParams.get('state')),method:'GET',headers:{cookie:flowCookie}},res);
        assert.equal(res.headers.Location,'https://shift.example/?google=connected');
        const sessionCookie=res.headers['Set-Cookie'].find(c=>c.startsWith('__Host-shiftcal-google='));
        assert.equal(S.unseal(sessionCookie.split(';')[0].split('=')[1],secret).refresh,'fixture-new-refresh');
        assert.ok(!res.body.includes('fixture-new-refresh'));
        mode='partial-scope';res=new ResponseMock();
        await handler({url:'/api/google-calendar?action=callback&code=fixture&state='+encodeURIComponent(login.searchParams.get('state')),method:'GET',headers:{cookie:flowCookie}},res);
        assert.match(res.headers.Location,/reason=SCOPE/);mode='normal';
        res=await invoke('calendar',{body:{group:'C'}});assert.equal(res.result.calendar.id,'cal-1');
        res=await invoke('read',{body:{group:'C',calendarId:'cal-1',start:'2026-09-01',end:'2026-10-01',knownIds:['sc2c20260910']}});
        assert.equal(res.result.items.length,3);assert.ok(res.result.items.some(e=>e.id==='sc2c20260910'&&e.status==='cancelled'));
        const input={group:'C',calendarId:'cal-1',operations:[{id:original.id,type:'patch',etag:'"v1"',event:event('new memo')}]};
        res=await invoke('write',{body:input});assert.equal(res.result.results[0].ok,true);
        const stale=copy(input);stale.operations[0].etag='"old"';
        res=await invoke('write',{body:stale});assert.equal(res.result.results[0].status,412);
        mode='race';res=await invoke('write',{body:input});assert.equal(res.result.results[0].status,412);mode='normal';
        const del=copy(input);del.operations[0].type='delete';
        res=await invoke('write',{body:del});assert.equal(res.result.results[0].code,'SHIFT_DELETE');
        mode='foreign';res=await invoke('read',{body:{group:'C',calendarId:'cal-1',start:'2026-09-01',end:'2026-10-01'}});assert.equal(res.statusCode,403);mode='normal';
        res=await invoke('logout');assert.match(res.headers['Set-Cookie'][0],/Max-Age=0/);
        assert.ok(!calls.some(c=>c.url.pathname.includes('/primary')));
        console.log('PASS: merge/conflict/deletion model, baseline changes, title parsing, encrypted sessions, OAuth state/PKCE, CSRF, calendar ownership, pagination, moved/deleted lookups, ETag races, protected shift deletion.');
    } finally {
        global.fetch=fetchOriginal;
        for(const k of envKeys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}
    }
}
run().catch(e=>{console.error(e);process.exit(1);});
