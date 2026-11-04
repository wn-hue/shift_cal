'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../origin-auth.js'),'utf8');
(async()=>{
 for(const [intent,review,expected]of[['login',false,'/'],['account',false,'/?cloud=connected'],['calendar',false,'/?google=connected'],['external',false,'/?external=connected'],['external',true,'/?external=connected&oauth-review=1'],['https://attacker.invalid',false,'/']]){
  const requests=[],flow={state:'test-state',verifier:'test-verifier',expires:Date.now()+60000,intent,review};let target,ready=false,removed=false;
  const context={URLSearchParams,Date,JSON,location:{hash:'#ticket=test-ticket&state=test-state',pathname:'/origin-auth.html',replace:v=>target=v},history:{replaceState(){}},sessionStorage:{getItem:()=>JSON.stringify(flow),removeItem:()=>removed=true},localStorage:{setItem:()=>ready=true},document:{getElementById:()=>({})},fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body),headers:options.headers});return{ok:true,json:async()=>({token:'synthetic-session-token'})}}};
  await vm.runInNewContext(source,context);assert.equal(target,expected);assert(ready&&removed);assert.equal(requests.length,2);assert.equal(requests[0].body.verifier,flow.verifier);assert.equal(requests[1].headers.Authorization,'Bearer synthetic-session-token');assert.match(context.document.cookie,/Secure; SameSite=Lax/);
  flow.state='wrong-state';target=undefined;requests.length=0;let message='';context.document.getElementById=()=>({set textContent(v){message=v;}});await vm.runInNewContext(source,context);assert.equal(target,undefined);assert.equal(requests.length,0);assert.match(message,/만료/);
 }
 console.log('PASS fixed feature return routes, review intent, PKCE exchange, one-use flow and mismatch rejection');
})().catch(e=>{console.error(e);process.exitCode=1});
