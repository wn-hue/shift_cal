'use strict';
const assert=require('node:assert/strict'),cfg=require('../origin-migration-config.json'),crypto=require('node:crypto');
Object.assign(process.env,{APP_URL:cfg.source,GOOGLE_OAUTH_REDIRECT_ORIGIN:cfg.target,GOOGLE_CALENDAR_SESSION_SECRET:'synthetic-domain-key-'.repeat(4),GOOGLE_CALENDAR_CLIENT_ID:'synthetic-client',GOOGLE_CALENDAR_CLIENT_SECRET:'synthetic-secret'});
const google=require('../api/google-calendar.js'),transfer=require('../api/origin-transfer.js'),native=require('../lib/native-auth');
async function call(handler,url,headers={},body,method='GET'){const out={headers:{}};const res={getHeader:k=>out.headers[k],setHeader:(k,v)=>{out.headers[k]=v;},end:v=>{out.body=v;out.status=res.statusCode;}};await handler({url,headers,body,method},res);return out;}
(async()=>{
 const verifier=crypto.randomBytes(32).toString('hex'),state=crypto.randomBytes(32).toString('hex'),challenge=crypto.createHash('sha256').update(verifier).digest('hex');
 const login='/api/google-calendar?'+new URLSearchParams({action:'login',native_challenge:challenge,native_state:state,web_return:cfg.previous[0]});
 const legacy=await call(google,login);assert.equal(legacy.status,302);assert.equal(legacy.headers.Location,cfg.target+login);
 const canonical=await call(google,login,{'x-work-routine-origin':cfg.target});assert.equal(canonical.status,302);const auth=new URL(canonical.headers.Location);assert.equal(auth.hostname,'accounts.google.com');assert.equal(auth.searchParams.get('redirect_uri'),cfg.target+'/api/google-calendar?action=callback');assert(canonical.headers['Set-Cookie']);
 const status=await call(google,'/api/google-calendar?action=status');assert.equal(JSON.parse(status.body).redirectUri,cfg.target+'/api/google-calendar?action=callback');
 for(const target of[cfg.target,...cfg.previous,cfg.source]){const flow=native.flow(new URL(cfg.source+'?'+new URLSearchParams({native_challenge:challenge,native_state:state,web_return:target})));assert(native.callback(flow,'synthetic-session','google',process.env.GOOGLE_CALENDAR_SESSION_SECRET).startsWith(target+'/origin-auth.html#'));}
 const hdr={origin:cfg.source,'content-type':'application/json'};
 const issued=await call(transfer,'/api/origin-transfer?action=issue',hdr,{challenge,state,target:cfg.target},'POST'),ticket=JSON.parse(issued.body).ticket;
 assert.equal((await call(transfer,'/api/origin-transfer?action=exchange',hdr,{ticket,state,verifier,target:cfg.previous[0]},'POST')).status,401);
 assert.equal((await call(transfer,'/api/origin-transfer?action=exchange',hdr,{ticket,state,verifier,target:cfg.target},'POST')).status,200);
 assert.equal((await call(transfer,'/api/origin-transfer?action=issue',hdr,{challenge,state,target:'https://attacker.invalid'},'POST')).status,400);
 const worker=(await import('../cloudflare/app-worker.mjs')).default;
 const assetRequests=[],env={ASSETS:{fetch:async request=>{assetRequests.push(new URL(request.url).pathname);return new Response('public asset');}}};
 assert.equal((await worker.fetch(new Request(cfg.target+'/'),env)).status,200);assert.equal(assetRequests.pop(),'/welcome');
 await worker.fetch(new Request(cfg.target+'/',{headers:{Cookie:'__Host-work-routine-ready=1'}}),env);assert.equal(assetRequests.pop(),'/');
 assert.equal((await worker.fetch(new Request(cfg.previous[0]+'/'),env)).headers.get('Location'),'/origin-transfer.html');
 const realFetch=global.fetch;let upstream;
 try{global.fetch=async(url,options)=>{upstream={url,options};return new Response('{}',{headers:{'Set-Cookie':'test=1; Secure; HttpOnly'}});};
  const response=await worker.fetch(new Request(cfg.target+'/api/origin-transfer?action=issue',{method:'POST',headers:{Origin:cfg.target,'Content-Type':'application/json','X-Work-Routine-Origin':'https://attacker.invalid'},body:'{}'}),env);
  assert.equal(upstream.options.headers.get('X-Work-Routine-Origin'),cfg.target);assert.equal(upstream.options.headers.get('Origin'),cfg.source);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.match(response.headers.get('Set-Cookie'),/HttpOnly/);
 }finally{global.fetch=realFetch;}
 console.log('PASS canonical OAuth redirect, legacy login handoff, existing return origins, exact-target cookie transfer and untrusted-origin rejection');
 console.log('PASS custom-domain public homepage, existing app gate, proxy origin override and cookie/cache preservation');
})().catch(e=>{console.error(e);process.exitCode=1;});
