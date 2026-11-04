'use strict';
const assert=require('node:assert/strict'),P=require('../lib/google-permissions.js'),google=require('../api/google-calendar.js'),{seal,unseal}=google._test;
Object.assign(process.env,{APP_URL:'https://permissions.example',GOOGLE_CALENDAR_CLIENT_ID:'synthetic-client',GOOGLE_CALENDAR_CLIENT_SECRET:'synthetic-secret',GOOGLE_CALENDAR_SESSION_SECRET:'synthetic-permission-test-key-'.repeat(3)});
delete process.env.GOOGLE_OAUTH_REDIRECT_ORIGIN;
const secret=process.env.GOOGLE_CALENDAR_SESSION_SECRET,legacy={sub:'legacy-user',email:'legacy@example.com',refresh:'legacy-refresh',csrf:'csrf',drive:true,external:true,exp:Date.now()+600000};
const cookie=session=>session?'__Host-shiftcal-google='+seal(session,secret):'';
async function call(action,{method='GET',query='',session=null,rawCookie,body={}}={}){
 const out={headers:{}};const res={getHeader:k=>out.headers[k],setHeader:(k,v)=>out.headers[k]=v,end:v=>{out.status=res.statusCode;out.body=v;try{out.json=JSON.parse(v)}catch{}}};
 await google({url:'/api/google-calendar?action='+action+query,method,body,headers:{cookie:rawCookie??cookie(session),origin:'https://permissions.example','x-shift-csrf':session?.csrf}},res);return out;
}
const extract=response=>unseal(response.headers['Set-Cookie'].find(x=>x.startsWith('__Host-shiftcal-google=')).split(';')[0].split('=')[1],secret);
(async()=>{
 for(const [query,expected]of[['',[P.scopes.identity,P.scopes.email]],['&storage=1',[P.scopes.identity,P.scopes.email,P.scopes.storage]],['&calendar=1',[P.scopes.identity,P.scopes.email,P.scopes.calendar,P.scopes.list]],['&external=1&review=1',[P.scopes.identity,P.scopes.email,P.scopes.list,P.scopes.external]]]){
  const login=await call('login',{query,session:legacy}),url=new URL(login.headers.Location);
  assert.deepEqual(url.searchParams.get('scope').split(' '),expected,'grant requests depend on the selected feature, not a previous session');
 }
 assert.equal((await call('login',{query:'&external=1'})).status,503,'public login must not request an unverified sensitive scope');
 const realFetch=global.fetch;let granted='openid email',user={sub:'new-user',email:'new@example.com',email_verified:true},refresh='new-refresh',calls=0;
 try{
  global.fetch=async url=>{calls++;return new Response(JSON.stringify(String(url).includes('userinfo')?user:{access_token:'synthetic-access',refresh_token:refresh,scope:granted}),{headers:{'Content-Type':'application/json'}});};
  async function callback(query='',previous=null){const login=await call('login',{query,session:previous}),url=new URL(login.headers.Location);return call('callback',{query:'&code=synthetic-code&state='+url.searchParams.get('state'),rawCookie:[login.headers['Set-Cookie'][0].split(';')[0],cookie(previous)].filter(Boolean).join('; ')});}
  let response=await callback(),session=extract(response);assert.equal(session.calendar,false);assert.equal(session.drive,false);assert.equal(session.external,false);assert.match(response.headers.Location,/account=connected/);
  calls=0;response=await call('calendar',{method:'POST',session,body:{group:'C'}});assert.equal(response.status,403);assert.equal(response.json.error,'CALENDAR_PERMISSION');assert.equal(calls,0,'unlinked account cannot call Calendar API');
  response=await call('status',{session});assert.equal(response.json.connected,true);assert.equal(response.json.calendarConnected,false);assert(!response.body.includes('new-refresh'));
  response=await callback('&calendar=1');assert.match(response.headers.Location,/reason=SCOPE/);
  granted=[P.scopes.identity,P.scopes.email,P.scopes.storage].join(' ');response=await callback('&storage=1');session=extract(response);assert.equal(session.drive,true);assert.equal(session.calendar,false);assert.match(response.headers.Location,/cloud=connected/);
  granted=[P.scopes.identity,P.scopes.email,P.scopes.list,P.scopes.external].join(' ');response=await callback('&external=1&review=1');session=extract(response);assert.equal(session.external,true);assert.equal(session.calendar,false);assert.equal(session.drive,false);assert.match(response.headers.Location,/external=connected/);
  granted=Object.values(P.scopes).join(' ');user={sub:legacy.sub,email:legacy.email,email_verified:true};response=await callback('',legacy);session=extract(response);assert.equal(session.calendar,true);assert.equal(session.drive,true);assert.equal(session.external,true,'previous grants remain usable for the same account');
  response=await call('calendar-disconnect',{method:'POST',session});session=extract(response);assert.equal(session.calendar,false);assert.equal(session.drive,true);assert.equal(session.external,true);assert.equal(session.refresh,'new-refresh');
  response=await callback('',session);assert.equal(extract(response).calendar,false,'plain sign-in cannot reactivate a disconnected calendar');
  user={sub:'other-user',email:'other@example.com',email_verified:true};response=await callback('',legacy);session=extract(response);assert.equal(session.calendar,false);assert.equal(session.external,false);assert.equal(session.drive,false,'account switching never inherits another account intent');
  refresh=undefined;response=await callback('',legacy);assert.match(response.headers.Location,/reason=RECONNECT/,'another account never inherits the previous refresh token');
  assert.equal((await call('status',{session:legacy})).json.calendarConnected,true,'legacy sessions remain compatible');
 }finally{global.fetch=realFetch;}
 console.log('PASS minimum feature scopes, basic/backup/read-only callbacks, permission guards, legacy grants, safe unlink, no reactivation and account isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
