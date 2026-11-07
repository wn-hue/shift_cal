'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../origin-auth.js'),'utf8');
function setup(intent='login') {
 const requests=[],flow={state:'test-state',verifier:'test-verifier',expires:Date.now()+60000,intent};
 const elements=Object.fromEntries(['auth-page','auth-title','status','return-hint'].map(id=>[id,{textContent:'',attributes:{},setAttribute(k,v){this.attributes[k]=v}}]));
 const result={requests,flow,elements,target:undefined,ready:false,removed:false};
 result.context={URLSearchParams,Date,JSON,location:{hash:'#ticket=test-ticket&state=test-state',pathname:'/origin-auth.html',replace:v=>result.target=v},history:{replaceState(){}},sessionStorage:{getItem:()=>JSON.stringify(flow),removeItem:()=>result.removed=true},localStorage:{setItem:()=>result.ready=true},document:{getElementById:id=>elements[id]},fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body),headers:options.headers});return{ok:true,json:async()=>({token:'synthetic-session-token'})}}};
 return result;
}
(async()=>{
 for(const [intent,expected]of[['login','/'],['account','/?cloud=connected'],['calendar','/?google=connected'],['external','/'],['https://attacker.invalid','/']]){
  const r=setup(intent);await vm.runInNewContext(source,r.context);
  assert.equal(r.target,expected);assert(r.ready&&r.removed);assert.equal(r.requests.length,2);assert.equal(r.requests[0].body.verifier,r.flow.verifier);assert.equal(r.requests[1].headers.Authorization,'Bearer synthetic-session-token');assert.match(r.context.document.cookie,/Secure; SameSite=Lax/);
 }
 for(const modify of [r=>r.flow.state='wrong-state',r=>r.flow.expires=Date.now()-1000,r=>r.context.sessionStorage.getItem=()=>'{invalid',r=>r.context.sessionStorage.getItem=()=>null]){
  const r=setup();modify(r);await vm.runInNewContext(source,r.context);
  assert.equal(r.target,undefined);assert.equal(r.requests.length,0);assert.equal(r.ready,false);assert(r.removed);assert.match(r.elements.status.textContent,/만료/);assert.equal(r.elements['auth-page'].attributes['data-state'],'error');assert.match(r.elements['auth-title'].textContent,/다시/);
 }
 for(const failedAction of ['exchange','web-session']){
  const r=setup(),fetch=r.context.fetch;
  r.context.fetch=async(url,options)=>url.endsWith(failedAction)?{ok:false,json:async()=>({message:'로그인을 확인할 수 없어요.'})}:fetch(url,options);
  await vm.runInNewContext(source,r.context);assert.equal(r.ready,false);assert.equal(r.target,undefined);assert.equal(r.context.document.cookie,undefined);assert.equal(r.elements['auth-page'].attributes['data-state'],'error');assert.equal(r.elements.status.textContent,'로그인을 확인할 수 없어요.');
 }
 const offline=setup();offline.context.fetch=async()=>{throw new TypeError('Failed to fetch')};
 await vm.runInNewContext(source,offline.context);assert.match(offline.elements.status.textContent,/연결이 잠시 끊겼어요/);assert.equal(offline.ready,false);
 console.log('PASS feature return routes, PKCE exchange, one-use flow, expired/malformed requests, session failure and offline recovery');
})().catch(e=>{console.error(e);process.exitCode=1});
