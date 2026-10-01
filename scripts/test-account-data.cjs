const assert=require('node:assert/strict');
const C=require('../account-data-core.js');
const D=require('../lib/account-drive.js');
const handler=require('../api/google-calendar.js');
const crypto=require('node:crypto');
const revision=()=>crypto.randomUUID().replace(/-/g,'');
const blank=C.normalize({});
const data=memos=>C.normalize({shift_day_memos:memos});
assert.throws(()=>C.normalize({oauth_token:'secret'}));
assert.throws(()=>C.normalize({shift_day_memos:{'2026-02-30':'bad'}}));
assert.throws(()=>C.normalize({shift_salary_config_master:{unknown:1}}));
assert.throws(()=>C.normalize({shift_payroll_sms_reference_v1:{gross:100,total:101}}));
assert.throws(()=>C.normalize({shift_overrides_C:{'2026-10-01':'DAY'}}));
assert.throws(()=>C.normalize({shift_day_memos:{'2026-10-01':'x'.repeat(16001)}}));
assert.throws(()=>C.normalize(JSON.parse('{"__proto__":{"polluted":true}}')));
assert.equal(C.normalize({shift_overrides_C:{'2026-10-01':'HALF_LEAVE'}}).shift_overrides_C['2026-10-01'],'HALF_POST');
assert.ok(C.meaningful(C.normalize({shift_salary_config_master:{leaveByYear:{2026:12}}})));
assert.equal(C.meaningful(C.normalize({shift_salary_config_master:{baseHours:209,baseHourly:0}})),false);
let merged=C.merge(blank,data({'2026-10-01':'a'}),data({'2026-10-02':'b'}));
assert.deepEqual(merged.conflicts,[]);assert.deepEqual(merged.data.shift_day_memos,{'2026-10-01':'a','2026-10-02':'b'});
assert.equal(C.merge(data({'2026-10-01':'base'}),data({'2026-10-01':'local'}),data({'2026-10-01':'remote'})).conflicts.length,1);
assert.deepEqual(C.merge(data({'2026-10-01':'a','2026-10-02':'b'}),data({'2026-10-02':'b'}),data({'2026-10-01':'a','2026-10-02':'c'})).data.shift_day_memos,{'2026-10-02':'c'});

const fetchOriginal=global.fetch, stores=new Map();let calls=[],gate=null,disabled=false,paginated=false,grantDrive=false;
function store(token){if(!stores.has(token))stores.set(token,[]);return stores.get(token);}
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
global.fetch=async(url,options={})=>{
    const u=new URL(url);calls.push({url:u,options});
    if(u.hostname==='oauth2.googleapis.com'){
        const params=new URLSearchParams(options.body);
        if(params.get('grant_type')==='authorization_code')return response({access_token:'A',refresh_token:'A',scope:'openid email https://www.googleapis.com/auth/calendar.app.created https://www.googleapis.com/auth/calendar.calendarlist.readonly'+(grantDrive?' https://www.googleapis.com/auth/drive.appdata':'')});
        return response({access_token:params.get('refresh_token')});
    }
    if(u.hostname==='openidconnect.googleapis.com')return response({sub:'account-A',email:'fixture@example.com',email_verified:true});
    assert.equal(u.hostname,'www.googleapis.com');
    const token=options.headers.Authorization.replace('Bearer ','');
    if(disabled)return response({error:{errors:[{reason:'accessNotConfigured'}]}},403);
    const files=store(token);
    if(options.method==='POST') {
        const parts=options.body.split(/\r\n\r\n/);
        const metadata=JSON.parse(parts[1].split('\r\n')[0]),doc=JSON.parse(parts[2].split('\r\n')[0]);
        assert.deepEqual(metadata.parents,['appDataFolder']);
        const file={id:'file_'+revision(),size:Buffer.byteLength(JSON.stringify(doc)),appProperties:metadata.appProperties,doc};
        files.unshift(file);return response({id:file.id});
    }
    if(u.pathname==='/drive/v3/files') {
        assert.equal(u.searchParams.get('spaces'),'appDataFolder');
        const snapshot=files.map(({doc,...f})=>f);
        if(gate)await gate();
        if(paginated && !u.searchParams.get('pageToken'))return response({files:snapshot.slice(0,1),nextPageToken:'second'});
        return response({files:paginated?snapshot.slice(1):snapshot});
    }
    const file=files.find(f=>u.pathname.endsWith('/'+f.id));assert.ok(file);return response(file.doc);
};
class Res {
    headers={};statusCode=200;setHeader(k,v){this.headers[k]=v;}getHeader(k){return this.headers[k];}
    end(body=''){this.body=body;this.result=body?JSON.parse(body):null;}
}
const keys=['GOOGLE_CALENDAR_CLIENT_ID','GOOGLE_CALENDAR_CLIENT_SECRET','GOOGLE_CALENDAR_SESSION_SECRET','APP_URL'];
const oldEnv=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
const secret='synthetic-test-secret-abcdefghijklmnopqrstuvwxyz';
async function invoke(action,{drive=true,origin='https://shift.example',csrf='csrf',cookie=true,method='POST',body={},query=''}={}) {
    const sealed=handler._test.seal({sub:'account-A',email:'fixture@example.com',refresh:'A',drive,csrf:'csrf',exp:Date.now()+60000},secret);
    const res=new Res();await handler({url:'/api/google-calendar?action='+action+query,method,body,headers:{origin,'x-shift-csrf':csrf,cookie:cookie?'__Host-shiftcal-google='+sealed:''}},res);return res;
}
async function run(){try{
    assert.deepEqual(await D.read('A'),{versions:[]});
    const r0=revision();await D.write('A',{revision:r0,parents:[],data:blank});
    const r1=revision(),r2=revision();
    // Both devices observe the same parent before either finishes uploading.
    let release;const barrier=new Promise(resolve=>release=resolve);let arrived=0;
    gate=async()=>{if(++arrived===2)release();await barrier;};
    await Promise.all([D.write('A',{revision:r1,parents:[r0],data:data({'2026-10-01':'device1'})}),D.write('A',{revision:r2,parents:[r0],data:data({'2026-10-02':'device2'})})]);
    gate=null;assert.equal((await D.read('A')).versions.length,2,'Concurrent writes retain both snapshots');
    await assert.rejects(D.write('A',{revision:revision(),parents:[r0],data:blank}),e=>e.status===412);
    const joined=revision();await D.write('A',{revision:joined,parents:[r1,r2],data:merged.data});
    assert.equal((await D.read('A')).versions[0].revision,joined);
    const count=store('A').length;await D.write('A',{revision:joined,parents:[r1,r2],data:merged.data});assert.equal(store('A').length,count);
    await assert.rejects(D.write('A',{revision:joined,parents:[r1,r2],data:blank}),e=>e.code==='CLOUD_REVISION');
    assert.equal((await D.read('B')).versions.length,0,'Accounts are isolated by OAuth token');
    paginated=true;assert.equal((await D.read('A')).versions[0].revision,joined);paginated=false;
    disabled=true;await assert.rejects(D.read('A'),e=>e.code==='DRIVE_SETUP');disabled=false;
    process.env.GOOGLE_CALENDAR_CLIENT_ID='fixture';process.env.GOOGLE_CALENDAR_CLIENT_SECRET='fixture';
    process.env.GOOGLE_CALENDAR_SESSION_SECRET=secret;process.env.APP_URL='https://shift.example';
    calls=[];
    assert.equal((await invoke('cloud-read',{drive:false})).statusCode,403);
    assert.equal((await invoke('cloud-read',{csrf:'forged'})).statusCode,403);
    assert.equal((await invoke('cloud-read',{origin:'https://evil.example'})).statusCode,403);
    assert.equal((await invoke('cloud-read',{cookie:false})).statusCode,401);
    assert.equal(calls.length,0,'Unauthorized requests never reach Drive');
    const read=await invoke('cloud-read',{body:{userId:'account-B'}});
    assert.equal(read.result.versions[0].revision,joined,'Client-provided account ID has no authority');
    assert.ok(!read.body.includes('refresh'));
    assert.equal((await invoke('status',{method:'GET'})).result.cloudConnected,true);
    const login=await invoke('login',{method:'GET',query:'&storage=1'});
    const params=new URL(login.headers.Location).searchParams;
    assert.ok(params.get('scope').includes('https://www.googleapis.com/auth/drive.appdata'));
    assert.equal(params.get('include_granted_scopes'),'true');
    const flow=handler._test.unseal(login.headers['Set-Cookie'][0].split(';')[0].split('=')[1],secret);
    assert.equal(flow.storage,true);assert.equal(flow.state,params.get('state'));
    const callbackReq={url:'/api/google-calendar?action=callback&code=fixture&state='+params.get('state'),method:'GET',headers:{cookie:login.headers['Set-Cookie'][0].split(';')[0]}};
    let callback=new Res();await handler(callbackReq,callback);assert.match(callback.headers.Location,/reason=DRIVE_PERMISSION/);
    grantDrive=true;callback=new Res();await handler(callbackReq,callback);
    assert.equal(callback.headers.Location,'https://shift.example/?cloud=connected');
    const sessionCookie=callback.headers['Set-Cookie'].find(c=>c.startsWith('__Host-shiftcal-google='));
    assert.equal(handler._test.unseal(sessionCookie.split(';')[0].split('=')[1],secret).drive,true);
    console.log('PASS: account schema/privacy, merge/deletion, immutable race retention, stale rejection, fork resolution, idempotency, pagination, account isolation, Drive setup errors, OAuth storage scope and CSRF enforcement.');
}finally{global.fetch=fetchOriginal;for(const k of keys){if(oldEnv[k]===undefined)delete process.env[k];else process.env[k]=oldEnv[k];}}}
run().catch(e=>{console.error(e);process.exit(1);});

assert.deepEqual(C.normalize({shift_bonus_sms_reference_v1:{gross:1000000,total:50000}}).shift_bonus_sms_reference_v1,{gross:1000000,total:50000});
assert.throws(()=>C.normalize({shift_bonus_sms_reference_v1:{gross:100,total:101}}));
