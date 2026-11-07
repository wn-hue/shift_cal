'use strict';
const assert=require('node:assert/strict'),P=require('../lib/google-permissions.js'),google=require('../api/google-calendar.js'),{seal,unseal}=google._test;
const AccountDrive=require('../lib/account-drive.js'),AccountErasure=require('../lib/account-erasure.js');
Object.assign(process.env,{APP_URL:'https://permissions.example',GOOGLE_CALENDAR_CLIENT_ID:'synthetic-client',GOOGLE_CALENDAR_CLIENT_SECRET:'synthetic-secret',GOOGLE_CALENDAR_SESSION_SECRET:'synthetic-permission-test-key-'.repeat(3)});
delete process.env.GOOGLE_OAUTH_REDIRECT_ORIGIN;
const secret=process.env.GOOGLE_CALENDAR_SESSION_SECRET,legacy={sub:'legacy-user',email:'legacy@example.com',refresh:'legacy-refresh',csrf:'csrf',drive:true,external:true,exp:Date.now()+600000};
const cookie=session=>session?'__Host-shiftcal-google='+seal(session,secret):'';
async function call(action,{method='GET',query='',session=null,rawCookie,body={}}={}){
 const out={headers:{}};const res={getHeader:k=>out.headers[k],setHeader:(k,v)=>out.headers[k]=v,end:v=>{out.status=res.statusCode;out.body=v;try{out.json=JSON.parse(v)}catch{}}};
 await google({url:'/api/google-calendar?action='+action+query,method,body,headers:{cookie:rawCookie??cookie(session),origin:'https://permissions.example','x-shift-csrf':session?.csrf}},res);return out;
}
const extract=response=>unseal(response.headers['Set-Cookie'].find(x=>x.startsWith('__Host-shiftcal-google=')).split(';')[0].split('=')[1],secret);
const unchanged=response=>assert(!(response.headers['Set-Cookie']||[]).some(x=>x.startsWith('__Host-shiftcal-google=')),'a failed callback must not replace or clear the existing session');
(async()=>{
 for(const [query,expected]of[['',[P.scopes.identity,P.scopes.email]],['&storage=1',[P.scopes.identity,P.scopes.email,P.scopes.storage]],['&calendar=1',[P.scopes.identity,P.scopes.email,P.scopes.calendar,P.scopes.list]]]){
  const login=await call('login',{query,session:legacy}),url=new URL(login.headers.Location);
  assert.deepEqual(url.searchParams.get('scope').split(' '),expected,'grant requests depend on the selected feature, not a previous session');
  assert.equal(url.searchParams.get('include_granted_scopes'),'false','retired granted scopes cannot leak into any new consent request');
 }
 // Native errors must close ASWebAuthenticationSession without replacing a valid session.
 const nativeState='b'.repeat(64),nativeChallenge='c'.repeat(64);
 const nativeQuery='&storage=1&native_state='+nativeState+'&native_challenge='+nativeChallenge;
 async function nativeCallback(query,tail){const login=await call('login',{query,session:legacy}),auth=new URL(login.headers.Location);return call('callback',{query:'&state='+auth.searchParams.get('state')+tail,rawCookie:login.headers['Set-Cookie'][0].split(';')[0]+'; '+cookie(legacy)});}
 let failed=await nativeCallback(nativeQuery,'&error=access_denied');
 let destination=new URL(failed.headers.Location);assert.equal(destination.protocol,'shiftcal:');assert.equal(destination.host,'auth');assert.equal(destination.searchParams.get('state'),nativeState);assert.equal(destination.searchParams.get('error'),'denied');unchanged(failed);
 failed=await nativeCallback(nativeQuery,'');destination=new URL(failed.headers.Location);assert.equal(destination.protocol,'shiftcal:');assert.equal(destination.searchParams.get('error'),'CODE');unchanged(failed);
 failed=await nativeCallback('','&error=access_denied');assert.equal(failed.headers.Location,'https://permissions.example/?google=denied');unchanged(failed);
 const login=await call('login',{query:nativeQuery});failed=await call('callback',{query:'&state=forged&error=access_denied',rawCookie:login.headers['Set-Cookie'][0].split(';')[0]});assert.match(failed.headers.Location,/^https:\/\/permissions\.example\/\?google=error&reason=STATE$/);unchanged(failed);
 assert.equal((await call('login',{query:'&external=1'})).status,410,'retired consent cannot be requested');assert.equal((await call('login',{query:'&external=1&review=1'})).status,410,'retired review entry is closed');
 const realFetch=global.fetch,originalDrive={read:AccountDrive.read,write:AccountDrive.write,remove:AccountDrive.remove},originalErase=AccountErasure.erase;
 const refreshCalls=[],calendarCalls=[],driveCalls=[];
 let granted='openid email',user={sub:'new-user',email:'new@example.com',email_verified:true},refresh='new-refresh',calls=0;
 try{
  global.fetch=async(url,options={})=>{
   calls++;let response;
   if(String(url).includes('userinfo'))response=user;
   else if(String(url)==='https://oauth2.googleapis.com/token'){
    const form=new URLSearchParams(options.body);
    if(form.get('grant_type')==='refresh_token'){const token=form.get('refresh_token');refreshCalls.push(token);response={access_token:'access:'+token,scope:['drive-only','legacy-hidden-drive'].includes(token)?P.scopes.storage:''};}
    else response={access_token:'synthetic-access',refresh_token:refresh,scope:granted};
   }else if(String(url).startsWith('https://www.googleapis.com/calendar/v3/')){
    calendarCalls.push(options.headers.Authorization);
    response=String(url).includes('/events?')?{items:[]}:{id:'owned-calendar',description:google._test.marker(user.sub,'C')};
   }else throw Error('Unexpected network request in isolated test: '+url);
   return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});
  };
  AccountDrive.read=async token=>{driveCalls.push(['read',token]);return {found:false};};
  AccountDrive.write=async token=>{driveCalls.push(['write',token]);return {ok:true};};
  AccountDrive.remove=async token=>{driveCalls.push(['remove',token]);};
  async function callback(query='',previous=null){const login=await call('login',{query,session:previous}),url=new URL(login.headers.Location);return call('callback',{query:'&code=synthetic-code&state='+url.searchParams.get('state'),rawCookie:[login.headers['Set-Cookie'][0].split(';')[0],cookie(previous)].filter(Boolean).join('; ')});}
  let response=await callback(),session=extract(response);assert.equal(session.calendar,false);assert.equal(session.drive,false);assert.equal(session.external,undefined);assert.match(response.headers.Location,/account=connected/);
  calls=0;response=await call('calendar',{method:'POST',session,body:{group:'C'}});assert.equal(response.status,403);assert.equal(response.json.error,'CALENDAR_PERMISSION');assert.equal(calls,0,'unlinked account cannot call Calendar API');
  response=await call('status',{session});assert.equal(response.json.connected,true);assert.equal(response.json.calendarConnected,false);assert(!response.body.includes('new-refresh'));
  response=await callback('&calendar=1');assert.match(response.headers.Location,/reason=SCOPE/);
  granted=[P.scopes.identity,P.scopes.email,P.scopes.storage].join(' ');response=await callback('&storage=1');session=extract(response);assert.equal(session.drive,true);assert.equal(session.calendar,false);assert.match(response.headers.Location,/cloud=connected/);
  calls=0;for(const action of ['external-list','external-read']){const blocked=await call(action,{method:'POST',session:{...legacy,external:true}});assert.equal(blocked.status,410);}assert.equal(calls,0,'old broad grants must not read external calendars');
  granted=Object.values(P.scopes).join(' ');user={sub:legacy.sub,email:legacy.email,email_verified:true};response=await callback('',legacy);session=extract(response);assert.equal(session.calendar,true);assert.equal(session.drive,true);assert.equal(session.external,undefined,'retired grants are not retained as an app feature');
  response=await call('calendar-disconnect',{method:'POST',session});session=extract(response);assert.equal(session.calendar,false);assert.equal(session.drive,true);assert.equal(session.external,undefined);assert.equal(session.refresh,'new-refresh');
  response=await callback('',session);assert.equal(extract(response).calendar,false,'plain sign-in cannot reactivate a disconnected calendar');
  user={sub:'other-user',email:'other@example.com',email_verified:true};response=await callback('',legacy);session=extract(response);assert.equal(session.calendar,false);assert.equal(session.external,undefined);assert.equal(session.drive,false,'account switching never inherits another account intent');
  refresh=undefined;response=await callback('',legacy);assert.match(response.headers.Location,/reason=RECONNECT/,'another account never inherits the previous refresh token');
  unchanged(response);
  assert.equal((await call('status',{session:legacy})).json.calendarConnected,true,'legacy sessions remain compatible');

  // A legacy combined grant must survive a new narrow identity grant.
  user={sub:legacy.sub,email:legacy.email,email_verified:true};granted='openid email';refresh='identity-only';
  session=extract(await callback('',legacy));
  assert.equal(session.refresh,'identity-only');assert.equal(P.refreshFor(session,'drive'),'legacy-refresh');assert.equal(P.refreshFor(session,'calendar'),'legacy-refresh');
  assert.equal(session.drive,true);assert.equal(session.calendar,true);assert.equal(session.driveAuthorized,true);
  // Connecting one feature must keep the other feature's token unchanged.
  granted=[P.scopes.identity,P.scopes.email,P.scopes.storage].join(' ');refresh='drive-only';
  session=extract(await callback('&storage=1',session));assert.equal(P.refreshFor(session,'drive'),'drive-only');assert.equal(session.driveRefresh,undefined,'duplicate tokens are omitted to keep the cookie bounded');assert.equal(P.refreshFor(session,'calendar'),'legacy-refresh');
  granted=[P.scopes.identity,P.scopes.email,P.scopes.calendar,P.scopes.list].join(' ');refresh='calendar-only';
  session=extract(await callback('&calendar=1',session));assert.equal(P.refreshFor(session,'drive'),'drive-only');assert.equal(P.refreshFor(session,'calendar'),'calendar-only');
  granted='openid email';refresh='identity-only';session=extract(await callback('',session));
  const separated=session;
  assert.equal(session.driveRefresh,'drive-only');assert.equal(session.calendarRefresh,'calendar-only');assert.equal(session.driveAuthorized,true);
  for(const action of ['cloud-read','cloud-write'])assert.equal((await call(action,{method:'POST',session})).status,200);
  assert.deepEqual(refreshCalls.slice(-2),['drive-only','drive-only']);assert.deepEqual(driveCalls.slice(-2),[['read','access:drive-only'],['write','access:drive-only']]);
  response=await call('read',{method:'POST',session,body:{group:'C',calendarId:'owned-calendar',start:'2026-11-01',end:'2026-12-01'}});
  assert.equal(response.status,200);assert.equal(refreshCalls.at(-1),'calendar-only');assert.deepEqual(calendarCalls.slice(-2),['Bearer access:calendar-only','Bearer access:calendar-only']);
  response=await call('status',{session});for(const token of ['identity-only','drive-only','calendar-only'])assert(!response.body.includes(token),'status never exposes any refresh token');
  response=await call('calendar-disconnect',{method:'POST',session});session=extract(response);session=extract(await callback('',session));assert.equal(session.calendar,false);assert.equal(P.refreshFor(session,'drive'),'drive-only');

  // Missing or partially granted credentials cannot clobber the existing connection.
  refresh=undefined;session=extract(await callback('',separated));assert.equal(P.refreshFor(session,'drive'),'drive-only');assert.equal(P.refreshFor(session,'calendar'),'calendar-only');
  granted=[P.scopes.identity,P.scopes.email,P.scopes.storage].join(' ');session=extract(await callback('&storage=1',separated));assert.equal(P.refreshFor(session,'drive'),'drive-only');
  const basic={...legacy,drive:false,calendar:false,driveAuthorized:false,refresh:'identity-only'};
  response=await callback('&storage=1',basic);assert.match(response.headers.Location,/reason=RECONNECT/);unchanged(response);
  granted=[P.scopes.identity,P.scopes.email,P.scopes.calendar,P.scopes.list].join(' ');response=await callback('&calendar=1',basic);assert.match(response.headers.Location,/reason=RECONNECT/);unchanged(response);
  granted='openid email';refresh='new-narrow';for(const query of ['&storage=1','&calendar=1']){response=await callback(query,separated);assert.match(response.headers.Location,/reason=(DRIVE_PERMISSION|SCOPE)/);unchanged(response);}
  granted=[P.scopes.identity,P.scopes.email,P.scopes.calendar].join(' ');response=await callback('&calendar=1',separated);assert.match(response.headers.Location,/reason=SCOPE/);unchanged(response);
  granted='openid email';refresh='x'.repeat(4000);response=await callback('',separated);assert.match(response.headers.Location,/reason=SESSION_SIZE/);unchanged(response);

  // Switching Google accounts retains no Drive/Calendar credentials from the old user.
  user={sub:'other-user',email:'other@example.com',email_verified:true};refresh='other-identity';session=extract(await callback('',separated));
  assert.equal(session.drive,false);assert.equal(session.calendar,false);assert.equal(session.driveAuthorized,false);assert.equal(session.driveRefresh,undefined);assert.equal(session.calendarRefresh,undefined);
  granted=[P.scopes.identity,P.scopes.email,P.scopes.storage].join(' ');refresh='other-drive';session=extract(await callback('&storage=1',separated));assert.equal(P.refreshFor(session,'drive'),'other-drive');assert.equal(P.refreshFor(session,'calendar'),null);

  // Deletion must still reach Drive even after an identity-only login or unlink.
  let deletionAccount;
  AccountErasure.erase=async(account,key,callbacks)=>{deletionAccount=account;await callbacks.erasePrivateData(!!(account.drive||account.driveAuthorized));return {ok:true};};
  response=await call('cloud-delete',{method:'POST',session:{...separated,drive:false}});assert.equal(response.status,200);assert.equal(deletionAccount.driveAuthorized,true);assert.equal(refreshCalls.at(-1),'drive-only');assert.deepEqual(driveCalls.at(-1),['remove','access:drive-only']);
  user={sub:legacy.sub,email:legacy.email,email_verified:true};granted='openid email';refresh='new-identity';
  const unknownLegacy={...legacy,drive:false,refresh:'legacy-hidden-drive'};
  session=extract(await callback('',unknownLegacy));assert.equal(session.drive,false);assert.equal(session.driveAuthorized,false);assert.equal(session.driveRefresh,'legacy-hidden-drive');
  session=extract(await callback('',session));assert.equal(session.driveRefresh,'legacy-hidden-drive','unknown legacy authorization survives repeated narrow logins for deletion scope inspection');
  response=await call('cloud-delete',{method:'POST',session});assert.equal(response.status,200);assert.equal(deletionAccount.driveAuthorized,false);assert.equal(refreshCalls.at(-1),'legacy-hidden-drive');assert.deepEqual(driveCalls.at(-1),['remove','access:legacy-hidden-drive']);
  granted=[P.scopes.identity,P.scopes.email,P.scopes.storage].join(' ');refresh=undefined;
  for(const previous of [unknownLegacy,session]){response=await callback('&storage=1',previous);assert.match(response.headers.Location,/reason=RECONNECT/,'unknown legacy token cannot be promoted to an authorized Drive token');unchanged(response);}
  assert.equal(P.refreshFor(legacy,'drive'),'legacy-refresh');assert.equal(P.refreshFor(legacy,'calendar'),'legacy-refresh');
 }finally{global.fetch=realFetch;Object.assign(AccountDrive,originalDrive);AccountErasure.erase=originalErase;}
 console.log('PASS isolated consent, legacy and feature refresh tokens, narrow re-login, Drive/Calendar API token selection, deletion authorization, account isolation, partial grants, missing refresh and bounded session preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
