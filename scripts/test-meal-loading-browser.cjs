'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const today='2026-11-02', tomorrow='2026-11-03';
const menu=date=>({status:'ok',date,checkedAt:'2026-11-02T07:00:00+09:00',meals:['조식','중식','석식','야식'].map(name=>({name,groups:[{title:'한식',items:[date+' 제육볶음','미역국','쌀밥']}]}))});
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul'});
  await page.clock.install({time:new Date('2026-11-02T12:00:00+09:00')});
  const requests=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');});
  await page.route('**/api/**',route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/today-menu'){requests.push({route,date:url.searchParams.get('date'),done:false});return;}
   if(url.pathname==='/api/meal-votes')return route.fulfill({json:{date:today,mine:{},totals:Object.fromEntries(['조식','중식','석식','야식'].map(m=>[m,{up:0,down:0}]))}});
   return route.fulfill({json:{configured:false}});
  });
  async function pending(date){for(let i=0;i<100;i++){const req=requests.find(r=>r.date===date&&!r.done);if(req)return req;await new Promise(r=>setTimeout(r,20));}throw Error('Missing request: '+date);}
  async function respond(date,json,status=200){const req=await pending(date);req.done=true;await req.route.fulfill({status,json});}
  await page.goto(process.env.CHECK_URL||'http://127.0.0.1:8773');
  await page.locator('#bnav-menu').click();await pending(today);
  assert(await page.locator('#today-menu-loading').isVisible());
  assert.equal(await page.locator('.meal-art-bowl').evaluate(e=>getComputedStyle(e).animationName),'meal-bowl-float');
  assert.equal(await page.locator('#today-menu-panel').getAttribute('aria-busy'),'true');
  assert.equal(await page.locator('.meal-art-bowl').evaluate(e=>getComputedStyle(e).animationIterationCount),'infinite');
  assert.equal(await page.locator('.meal-art-steam path').count(),3);
  for(const width of[320,390])for(const theme of['current','dark']){
   await page.setViewportSize({width,height:844});await page.evaluate(t=>{const input=document.getElementById('pref-theme');input.value=t;input.dispatchEvent(new Event('change'));},theme);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(theme==='dark')assert(await page.locator('#today-menu-loading strong').evaluate(e=>getComputedStyle(e).color.match(/\d+/g).slice(0,3).every(v=>Number(v)>220)));
   if(width===390)await page.screenshot({path:'/tmp/meal-story-'+engine.name()+'-'+theme+'.png'});
  }
  await page.locator('#bnav-cal').click();assert.equal(await page.locator('.meal-art-bowl').evaluate(e=>getComputedStyle(e).animationPlayState),'paused');await page.locator('#bnav-menu').click();

  await page.clock.fastForward(8100);
  assert.match(await page.locator('#today-menu-loading small').textContent(),/식당 응답/);
  await page.locator('#today-menu-next').click();await pending(tomorrow);
  await respond(today,menu(today)); // Late earlier date must not hide the current loader.
  assert(await page.locator('#today-menu-loading').isVisible());
  assert.equal(await page.locator('.meal-card').count(),0);
  await respond(tomorrow,menu(tomorrow));
  await page.locator('#today-menu-loading').waitFor({state:'hidden'});
  assert.match(await page.locator('.meal-items').first().textContent(),/2026-11-03/);
  const count=requests.length;
  await page.locator('#today-menu-prev').click();
  assert.equal(requests.length,count,'Cached meals load immediately without a request');
  assert.equal(await page.locator('#today-menu-loading').isVisible(),false);
  await page.locator('#today-menu-refresh').click();await pending(today);
  assert.equal(await page.locator('.meal-card').count(),4,'Refresh keeps the existing meals visible');
  assert(await page.locator('#today-menu-loading').evaluate(e=>e.classList.contains('is-refreshing')));
  await respond(today,{status:'error',message:'식단을 불러오지 못했어요.'},503);
  await page.locator('#today-menu-loading').waitFor({state:'hidden'});
  assert(await page.locator('#today-menu-empty').isVisible());
  assert.equal(await page.locator('#today-menu-refresh').isDisabled(),false);
  await page.locator('#today-menu-refresh').click();await respond(today,menu(today));
  await page.locator('.meal-card').first().waitFor();
  await page.clock.fastForward(8100);
  assert.equal(await page.locator('#today-menu-status').textContent(),'','Completed requests clear the slow-response timer');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#today-menu-next').click();await page.locator('#today-menu-next').click();
  assert.equal(await page.locator('.meal-art-bowl').evaluate(e=>getComputedStyle(e).animationName),'none');
  await respond('2026-11-04',{status:'not_published',date:'2026-11-04',message:'아직 등록되지 않은 식단이에요.'});
  await page.locator('#today-menu-loading').waitFor({state:'hidden'});
  assert.match(await page.locator('#today-menu-empty').textContent(),/아직 등록/);
  // Secondary information stays on the right, including small screens and dark mode.
  await page.locator('#account-menu-button').click();
  for(const width of [320,390,412])for(const theme of ['current','toss','gpt','test','test1','test3','test4','dark']){
   await page.setViewportSize({width,height:844});
   await page.evaluate(t=>{const input=document.getElementById('pref-theme');input.value=t;input.dispatchEvent(new Event('change'));},theme);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   for(const selector of ['#lost-found-open','#commute-open','#parking-open','#view-all .lab-entry']){
    const row=page.locator(selector);if(!await row.count())continue;
    const title=await row.locator('strong').boundingBox(),caption=await row.locator('small').boundingBox();
    assert(caption.x>=title.x+title.width-1,'Caption sits beside the title: '+width+' '+theme+' '+selector);
    assert(Math.abs(caption.y+caption.height/2-title.y-title.height/2)<2,'Rows remain vertically centered');
    assert(await row.evaluate(e=>e.scrollWidth<=e.clientWidth),'No row overflow');
    assert.equal(await row.locator('small').evaluate(e=>getComputedStyle(e).color),theme==='dark'?'rgb(141, 187, 255)':'rgb(49, 130, 246)');
   }
   assert.equal(await page.locator('.group-summary-chevron').isVisible(),false);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS',engine.name(),'loading / stale response / cache / refresh / retry / slow state cleanup / unpublished / reduced motion / 3 widths × 8 themes');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1});
