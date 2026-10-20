'use strict';
const assert=require('node:assert/strict');
process.env.GOOGLE_CALENDAR_SESSION_SECRET='s'.repeat(64);
const {seal}=require('../api/google-calendar.js')._test;
const native=require('../api/native-account.js');
const secret=process.env.GOOGLE_CALENDAR_SESSION_SECRET;
async function call(token,method='POST') {
 const headers={};const res={setHeader(k,v){headers[k]=v;},end(body){this.data=JSON.parse(body)},headers};
 await native({method,url:'/?action=web-session',headers:token?{authorization:'Bearer '+token}:{},body:{}},res); return res;
}
function token(provider,exp=Date.now()+60000,innerExp=exp){return seal({provider,exp,session:seal({sub:'test',csrf:'secret-csrf',exp:innerExp},secret)},secret);}
(async()=>{
 for(const provider of ['google','apple']) {
  const result=await call(token(provider));assert.equal(result.statusCode,200);assert.deepEqual(result.data,{ok:true});
  assert.equal(result.headers['Cache-Control'],'no-store');
  const cookies=result.headers['Set-Cookie'];assert.equal(cookies.length,2);
  assert(cookies[0].startsWith('__Host-shiftcal-'+provider+'='));
  for(const text of ['Path=/','HttpOnly','Secure','SameSite=Lax']) assert(cookies[0].includes(text));
  const age=Number(cookies[0].match(/Max-Age=(\d+)/)[1]);assert(age>0&&age<=60);
  assert(cookies[1].includes('Max-Age=0'));assert(!JSON.stringify(result.data).includes('csrf'));
 }
 for(const bad of [null,'invalid',token('unknown'),token('google',Date.now()-10),token('google',Date.now()+60000,Date.now()-10)]) assert.equal((await call(bad)).statusCode,401);
 assert.equal((await call(token('google'),'GET')).statusCode,405);
 const shorter=await call(token('google',Date.now()+10000,Date.now()+60000));
 assert(Number(shorter.headers['Set-Cookie'][0].match(/Max-Age=(\d+)/)[1])<=10);
 console.log('PASS native web session: Google/Apple, HttpOnly cookies, bounded expiry, invalid/expired token rejection');
})().catch(error=>{console.error(error);process.exitCode=1});
