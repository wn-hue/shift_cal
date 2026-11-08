'use strict';
const assert = require('node:assert/strict');
const core = require('../lib/meal-keywords');
const {handlerFor} = require('../lib/meal-keywords-handler')._test;
const token = {kind:'apns', token:'ab'.repeat(32), environment:'sandbox'};
let now = Date.parse('2026-11-08T11:30:00+09:00');
const menu = {status:'ok',date:'2026-11-08',meals:[{name:'중식',groups:[{items:['제육 볶음','김치']},{items:['돈까스 정식']}]}]};
function memory() {
  let record = null, version = 0;
  return {async read(){return record ? {...structuredClone(record),_etag:String(version)} : null;},
    async write(path,next,etag){if(etag !== (record ? String(version) : undefined)){const e=Error();e.name='BlobPreconditionFailedError';throw e;}record=structuredClone(next);version++;},
    async remove(){record=null;version++;}};
}
async function main() {
  assert.deepEqual(core.keywords([' 제육볶음 ','제육 볶음','DON']),['제육 볶음','DON']);
  assert.equal(core.keywords(['x'.repeat(31)]),null); assert.equal(core.keywords(['\n']),null);
  assert.deepEqual(core.matches(menu,['제육볶음','돈까스','삼계탕'],'중식'),['제육볶음','돈까스']);
  assert.deepEqual(core.matches({...menu,status:'empty'},['김치'],'중식'),[]);
  for (const [time,meal,date] of [['11:30','중식','2026-11-08'],['17:00','석식','2026-11-08'],['00:50','야식','2026-11-07'],['01:19','야식','2026-11-07']]) {
    const event=core.clock(Date.parse('2026-11-08T'+time+':00+09:00'));assert.equal(event.meal,meal);assert.equal(event.date,date);
  }
  for(const time of ['00:49','01:20','11:29','12:00','16:59','17:30','23:59']) assert.equal(core.clock(Date.parse('2026-11-08T'+time+':00+09:00')),null);
  assert.equal(core.clock(Date.parse('2027-01-01T00:50:00+09:00')).date,'2026-12-31');
  const store=memory(), sent=[];
  const handler=handlerFor(store,{now:()=>now,secret:'test-owner-key',cronSecret:'cron-test',available:()=>true,origin:'https://test.example',loadMenus:async()=>[menu],send:async(s,p)=>sent.push({s,p})});
  async function call(method,cookie,body,headers={},query={}) {
    const res={headers:{},setHeader(k,v){this.headers[k]=v;},end(raw){this.data=JSON.parse(raw);}};
    await handler({method,query,body,headers:{cookie:cookie||'',origin:'https://test.example','content-type':'application/json',...headers}},res);
    return {status:res.statusCode,data:res.data,cookie:res.headers['Set-Cookie']?.split(';')[0]};
  }
  const first=await call('GET');assert.equal(first.status,200);assert(first.cookie);
  const body={action:'subscribe',keywords:['제육볶음'],meals:['중식'],subscription:token};
  assert.equal((await call('POST',null,body)).status,401);
  assert.equal((await call('POST',first.cookie,body,{origin:'https://other.example'})).status,403);
  assert.equal((await call('POST',first.cookie,{...body,keywords:[]})).status,400);
  assert.equal((await call('POST',first.cookie,{...body,meals:['조식']})).status,400);
  assert.equal((await call('POST',first.cookie,body)).data.enabled,true);
  assert(!JSON.stringify((await call('GET',first.cookie)).data).includes(token.token));
  assert.equal((await call('POST',null,{}, {}, {action:'dispatch'})).status,401);
  assert.equal((await call('POST',null,{}, {authorization:'Bearer 한글한글한'}, {action:'dispatch'})).status,401);
  const send = ()=>call('POST',null,{}, {authorization:'Bearer cron-test'}, {action:'dispatch'});
  await Promise.all([send(),send()]);assert.equal(sent.length,1,'overlapping cron runs deliver once');
  assert.equal(sent[0].p.route,'meal');assert.equal(sent[0].p.date,menu.date);
  await send();assert.equal(sent.length,1);
  await call('POST',first.cookie,{...body,keywords:['돈까스']});await send();assert.equal(sent.length,1,'editing keywords does not re-send same meal');
  await call('POST',first.cookie,{action:'unsubscribe'});assert.equal((await call('GET',first.cookie)).data.enabled,false);
  assert.deepEqual((await store.read()).items,{},'turning off removes keyword/token data');
  // A token renewed under another app cookie must not get duplicate notifications.
  await call('POST',first.cookie,body);const second=await call('GET');await call('POST',second.cookie,body);
  assert.equal(Object.keys((await store.read()).items).length,1);
  assert.equal((await call('GET',first.cookie)).data.enabled,false);
  // Deleted subscriptions, invalid APNs tokens, expired meal windows, and retries.
  const retryStore=memory();await retryStore.write(core.PATH,{items:{u:{subscription:token,keywords:['돈까스'],meals:['중식'],updatedAt:now}}});
  let attempts=0;const event=core.clock(now);
  await core.dispatch(retryStore,menu,event,async()=>{attempts++;throw Error('transient');},()=>now);
  assert.equal(attempts,1);await core.dispatch(retryStore,menu,event,async()=>{attempts++;},()=>now);assert.equal(attempts,1);
  now+=300000;await core.dispatch(retryStore,menu,event,async()=>{throw Object.assign(Error(),{statusCode:410});},()=>now);
  assert.deepEqual((await retryStore.read()).items,{});
  now=event.expiresAt;await core.dispatch(store,menu,event,async()=>{throw Error('must not send');},()=>now);
  console.log('Meal keyword scheduling, timezone rollover, matching, consent, deduplication, privacy and retries passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
