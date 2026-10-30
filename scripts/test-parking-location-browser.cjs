'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {handlerFor}=require('../api/parking')._test,core=require('../lib/parking-core');
(async()=>{for(const engine of [webkit,chromium]){const browser=await engine.launch();for(const width of [320,390]){
 let now=Date.parse('2026-10-27T07:00:00+09:00'),cookie='',posts=[];const records=new Map();
 const store={read:async p=>records.get(p)||null,write:async(p,v)=>records.set(p,structuredClone(v))};
 const handler=handlerFor(store,{secret:'test-secret',origin:'https://parking.test',now:()=>now,defer:()=>{}});
 const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul',reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date(now));
 await page.addInitScript(()=>{
  localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));
  window.gpsMode='inside';window.gpsCalls=0;
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail,options){
   gpsCalls++;window.gpsOptions=options;
   if(gpsMode==='denied'){fail({code:1});return;}
   if(gpsMode==='timeout'){fail({code:3});return;}
   const position={coords:{latitude:gpsMode==='outside'?37.34:37.31804984038408,longitude:126.76420026245084,accuracy:gpsMode==='inaccurate'?700:20},timestamp:Date.now()-(gpsMode==='stale'?70000:0)};
   if(gpsMode==='pending'){window.finishGPS=()=>ok(position);return;}
   ok(position);
  }}});
 });
 await page.route('**/api/**',async route=>{
  const request=route.request();if(!request.url().includes('/api/parking'))return route.fulfill({json:{configured:false}});
  const body=request.postDataJSON();if(body)posts.push(body);
  const headers={},res={setHeader(k,v){headers[k]=v},end(body){this.body=body}};
  await handler({method:request.method(),headers:{cookie,origin:'https://parking.test','content-type':'application/json'},body},res);
  if(headers['Set-Cookie'])cookie=headers['Set-Cookie'].split(';')[0];
  await route.fulfill({status:res.statusCode,contentType:'application/json',body:res.body});
 });
 await page.goto(process.env.TEST_URL||'http://localhost:8772/');
 const open=async()=>{await page.evaluate(()=>{currentGroup='C';getActualShift=()=>({type:'DAY'});switchView('all')});await page.locator('#parking-open').click();await page.waitForFunction(()=>!document.getElementById('parking-refresh').disabled)};
 await open();const free=page.locator('#parking-dialog [data-value=free]'),toggle=page.locator('#parking-prompt-toggle');
 assert.equal(await page.evaluate(()=>gpsCalls),0,'reading parking never asks for location');
 await free.click();await page.waitForFunction(()=>document.querySelector('#parking-dialog [data-value=free]').getAttribute('aria-pressed')==='true');
 assert.equal(posts.at(-1).location.latitude,core.LOCATION_RULE.latitude);
 assert.deepEqual(await page.evaluate(()=>gpsOptions),{enableHighAccuracy:true,maximumAge:0,timeout:12000});
 await free.click();await page.waitForFunction(()=>document.querySelector('#parking-dialog [data-value=free]').getAttribute('aria-pressed')==='false');
 for(const [mode,message] of [['outside','반경 1km'],['inaccurate','위치 오차'],['stale','오래됐어요'],['denied','위치 권한'],['timeout','확인하지 못했어요']]){
  await page.evaluate(mode=>gpsMode=mode,mode);const before=posts.length;
  await free.click();await page.waitForFunction(text=>document.getElementById('parking-status').textContent.includes(text),message);
  assert.equal(await free.getAttribute('aria-pressed'),'false');assert(await free.isEnabled(),'location rejection must allow retry');
  if(['denied','timeout'].includes(mode))assert.equal(posts.length,before,'failed GPS never posts a vote');
 }
 await page.evaluate(()=>gpsMode='inside');await free.click();await page.waitForFunction(()=>document.querySelector('#parking-dialog [data-value=free]').getAttribute('aria-pressed')==='true');
 assert(Object.values(records.get('parking/current.json').votes).every(v=>Object.keys(v).sort().join(',')==='at,value'));
 await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.equal(await page.evaluate(()=>localStorage.getItem('shift_parking_prompt_enabled')),'false');assert.equal(await page.locator('#parking-alert-toggle').getAttribute('aria-checked'),'false');
 await page.reload();await page.evaluate(()=>{getActualShift=()=>({type:'DAY'});document.dispatchEvent(new Event('visibilitychange'))});await page.waitForTimeout(250);assert.equal(await page.locator('#parking-dialog').evaluate(e=>e.open),false);
 await open();assert.equal(await toggle.getAttribute('aria-checked'),'false');await toggle.click();
 await page.locator('#parking-dialog .sheet-dismiss-handle').click();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForFunction(()=>document.getElementById('parking-dialog').open);
 await page.locator('#parking-dialog .sheet-dismiss-handle').click();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await page.waitForTimeout(200);assert.equal(await page.locator('#parking-dialog').evaluate(e=>e.open),false,'at most one reminder per day');
 await open();await page.screenshot({path:`/tmp/parking-location-${engine.name()}-${width}.png`});assert(await page.locator('#parking-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth));
 // Crossing the cutoff while GPS is pending is still rejected using server time.
 await page.evaluate(()=>gpsMode='pending');const before=posts.length;await free.click();assert(await free.isDisabled());assert.equal(posts.length,before);
 now=Date.parse('2026-10-27T07:31:00+09:00');await page.evaluate(()=>finishGPS());await page.waitForFunction(()=>document.getElementById('parking-status').textContent.includes('06:50~07:30'));
 await page.locator('#parking-refresh').click();await page.waitForFunction(()=>document.querySelector('#parking-dialog [data-value=free]').disabled&&!document.getElementById('parking-refresh').disabled);
 const count=await page.evaluate(()=>gpsCalls);await page.locator('#parking-refresh').click();assert.equal(await page.evaluate(()=>gpsCalls),count);
 await page.evaluate(()=>AppI18n.setLanguage('zh'));assert.equal(await page.locator('#parking-prompt-toggle strong').innerText(),'停车反馈提醒');
 assert.deepEqual(errors,[]);console.log(engine.name(),width,'PASS actual handler integration: time+GPS, no saved coordinates, denied/retry, fresh reads, persistent reminder, once daily, independent full alert');await page.close();
 }await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
