'use strict';
const assert = require('node:assert/strict');
const core = require('../lib/meal-keywords');
const {handlerFor} = require('../lib/meal-keywords-handler')._test;
const token = {kind:'apns', token:'ab'.repeat(32), environment:'sandbox'};
let now = Date.parse('2026-11-08T11:30:00+09:00');
const menu = {status:'ok',date:'2026-11-08',meals:[{name:'중식',groups:[{items:['제육 볶음','김치']},{items:['돈까스 정식']}]}]};
function memory() {
  const records = new Map();
  return {
    async read(path = core.PATH) { return structuredClone(records.get(path) || null); },
    async write(path, next, etag) {
      if (etag !== records.get(path)?._etag) {
        const error = Error();
        error.name = 'BlobPreconditionFailedError';
        throw error;
      }
      records.set(path, {...structuredClone(next), _etag: String(Number(etag || 0) + 1)});
    }
  };
}
async function request(handler, method, cookie, body, headers={}, query={}) {
  const res = {headers:{}, setHeader(key,value){this.headers[key]=value;}, end(raw){this.data=JSON.parse(raw);}};
  await handler({method, query, body, headers:{cookie:cookie||'', origin:'https://test.example', 'content-type':'application/json', ...headers}},res);
  return {status:res.statusCode, data:res.data, cookie:res.headers['Set-Cookie']?.split(';')[0]};
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
  const call = (...args) => request(handler, ...args);
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
  const selectedMeals = ['중식', '석식', '야식'];
  const workWindow = {start:'2026-11-07',days:'N0D' + '0'.repeat(88)};
  const work = {...body,meals:selectedMeals,mode:'work',workWindow};
  assert.equal((await call('POST',second.cookie,{...work,workWindow:{...workWindow,start:'2026-11-31'}})).status,400);
  assert.equal((await call('POST',second.cookie,{...work,workWindow:undefined})).status,400);
  assert.equal((await call('POST',second.cookie,work)).data.mode,'work');
  const savedWork = Object.values((await store.read()).items)[0];
  assert.equal(core.eligible(savedWork,{date:'2026-11-07',meal:'야식'}),true);
  assert.equal(core.eligible(savedWork,{date:'2026-11-07',meal:'석식'}),false);
  assert.equal(core.eligible(savedWork,{date:'2026-11-08',meal:'중식'}),false);
  assert.equal(core.eligible(savedWork,{date:'2026-11-09',meal:'중식'}),true);
  assert.equal(core.eligible(savedWork,{date:'2026-11-09',meal:'석식'}),true);
  assert.equal(core.eligible(savedWork,{date:'2026-11-09',meal:'야식'}),false);
  assert.equal(core.eligible(savedWork,{date:'2026-11-06',meal:'야식'}),false);
  await send();assert.equal(sent.length,1,'work mode suppresses an actual off-day dispatch');
  await call('POST',second.cookie,{...work,mode:'always'});
  assert.equal(Object.values((await store.read()).items)[0].workWindow,undefined);
  await send();assert.equal(sent.length,2,'always mode still sends on the same off day');

  const webStore = memory(), deliveries = [];
  const config = {subject:'https://test.example', publicKey:'B'+'a'.repeat(86), privateKey:'b'.repeat(43)};
  const web = {endpoint:'https://web.push.apple.com/synthetic-test', keys:{p256dh:'c'.repeat(87), auth:'d'.repeat(22)}};
  const both = handlerFor(webStore,{now:()=>now,secret:'test-owner-key',cronSecret:'cron-test',available:()=>true,
    webConfiguration:()=>config,origin:'https://test.example',loadMenus:async()=>[menu],
    send:async (s,p)=>deliveries.push({s,p,native:true}), sendWeb:async (s,p)=>deliveries.push({s,p,native:false})});
  const browserCall = (method,cookie,data,headers) => request(both,method,cookie,data,headers,{transport:'web'});
  const browser = await browserCall('GET');
  assert(browser.cookie);
  assert.deepEqual(browser.data,{available:true,publicKey:config.publicKey,enabled:false,keywords:[],meals:core.MEALS,mode:'always'});
  assert.equal((await request(both,'POST',browser.cookie,body)).data.enabled,true);
  const add = {action:'addKeyword',transport:'web',subscription:web,keyword:'제육볶음',...{
    mode:'work',meals:['중식'],workWindow:{start:'2026-11-08',days:'D'.repeat(91)}
  }};
  assert.equal((await browserCall('POST',browser.cookie,add,{origin:'https://other.example'})).status,403);
  assert.equal((await browserCall('POST',browser.cookie,{...add,transport:'apns'})).status,400);
  assert.equal((await browserCall('POST',browser.cookie,{...add,subscription:{...web,endpoint:'https://private.internal/token'}})).status,400);
  const concurrent = await Promise.all([
    browserCall('POST',browser.cookie,add),
    browserCall('POST',browser.cookie,{...add,keyword:'돈까스'})
  ]);
  assert(concurrent.every(response=>response.status===200));
  await browserCall('POST',browser.cookie,{...add,keyword:'제육 볶음',mode:'always'});
  const current = await browserCall('GET',browser.cookie);
  assert.deepEqual([...current.data.keywords].sort(),['돈까스','제육볶음']);
  assert.equal(current.data.mode,'work','adding a keyword preserves the existing work preference');
  assert(!JSON.stringify(current.data).includes(web.endpoint));
  assert(!JSON.stringify(current.data).includes(config.privateKey));
  assert.deepEqual((await browserCall('GET')).data.keywords,[],'another cookie cannot read saved terms');
  const refresh = {action:'refreshWorkWindow',transport:'web',workWindow:{start:'2026-11-07',days:'D'.repeat(91)}};
  assert.equal((await browserCall('POST',browser.cookie,{...refresh,workWindow:{...refresh.workWindow,days:'D'}})).status,400);
  assert.equal((await browserCall('POST',browser.cookie,refresh)).status,200);
  const webItem = async () => Object.values((await webStore.read(core.WEB_PATH)).items)[0];
  assert.deepEqual((await webItem()).workWindow,refresh.workWindow);
  await Promise.all([
    browserCall('POST',browser.cookie,{action:'updatePreferences',transport:'web',mode:'always',meals:['중식']}),
    browserCall('POST',browser.cookie,{action:'removeKeyword',transport:'web',keyword:'돈까스'}),
    browserCall('POST',browser.cookie,{...refresh,workWindow:add.workWindow})
  ]);
  const configured = (await browserCall('GET',browser.cookie)).data;
  assert.deepEqual(configured.keywords,['제육볶음']);
  assert.equal(configured.mode,'always');
  assert.equal((await webItem()).workWindow,undefined,'refresh cannot reactivate work mode');
  assert.equal((await request(both,'GET',browser.cookie)).data.enabled,true,'browser settings do not replace APNs settings');
  const bothDispatch = () => request(both,'POST',null,{}, {authorization:'Bearer cron-test'}, {action:'dispatch'});
  await Promise.all([bothDispatch(),bothDispatch()]);
  assert.equal(deliveries.length,2,'each transport sends once even with overlapping dispatch');
  assert.deepEqual(deliveries.map(delivery=>delivery.native).sort(), [false,true]);
  const removed = await browserCall('POST',browser.cookie,{action:'removeKeyword',transport:'web',keyword:'제육 볶음'});
  assert.equal(removed.data.enabled,false,'removing the last keyword unsubscribes the browser from meal alerts');
  assert.equal((await browserCall('POST',browser.cookie,refresh)).data.enabled,false,'refresh cannot reactivate a removed subscription');
  assert.equal((await request(both,'GET',browser.cookie)).data.enabled,true,'browser opt-out does not disable native alerts');
  assert.equal((await browserCall('POST',browser.cookie,{action:'updatePreferences',mode:'always'})).status,409);

  const retired = memory();
  await retired.write(core.WEB_PATH,{items:{web:{subscription:web,keywords:['제육볶음'],meals:['중식'],updatedAt:now}}});
  await core.dispatch(retired,menu,core.clock(now),async()=>{throw Object.assign(Error(),{statusCode:404});},()=>now,true);
  assert.deepEqual((await retired.read(core.WEB_PATH)).items,{},'retired browser endpoints are purged');
  const sends = [];
  await core.sendWeb(web,{expiresAt:now+12345,title:'Test'},{config,now:()=>now,sendNotification:(...args)=>sends.push(args)});
  assert.equal(sends[0][2].TTL,12);
  assert.equal(sends[0][2].topic,'meal-keywords');
  assert.equal(JSON.parse(sends[0][1]).url,'/app?meal=1');
  assert.equal(core.webConfiguration({APP_URL:config.subject,PARKING_VAPID_PUBLIC_KEY:config.publicKey}),null);
  await core.sendWeb(web,{expiresAt:now-1},{config,now:()=>now,sendNotification:(...args)=>sends.push(args)});
  assert.equal(sends.length,1,'expired Web Push is never attempted');
  // Deleted subscriptions, invalid APNs tokens, expired meal windows, and retries.
  const retryStore=memory();await retryStore.write(core.PATH,{items:{u:{subscription:token,keywords:['돈까스'],meals:['중식'],updatedAt:now}}});
  let attempts=0;const event=core.clock(now);
  await core.dispatch(retryStore,menu,event,async()=>{attempts++;throw Error('transient');},()=>now);
  assert.equal(attempts,1);await core.dispatch(retryStore,menu,event,async()=>{attempts++;},()=>now);assert.equal(attempts,1);
  now+=300000;await core.dispatch(retryStore,menu,event,async()=>{throw Object.assign(Error(),{statusCode:410});},()=>now);
  assert.deepEqual((await retryStore.read()).items,{});
  now=event.expiresAt;await core.dispatch(store,menu,event,async()=>{throw Error('must not send');},()=>now);
  console.log('Meal keyword scheduling, timezone rollover, matching, consent, transport isolation, atomic web preferences, privacy, Web Push TTL and retries passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
