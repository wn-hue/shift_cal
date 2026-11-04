'use strict';
const assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
(async()=>{
 for(const [name,engine]of[['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch({headless:true}),context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),calls=[];
  let calendar=false;
  try{
   await context.addInitScript(()=>{localStorage.setItem('shift_origin_ready_v1','1');localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'complete'}));localStorage.setItem('shift_active_group','C');});
   await context.route('**/api/**',async route=>{
    const u=new URL(route.request().url()),action=u.searchParams.get('action');calls.push(action);
    let body={items:[],versions:[]};
    if(u.pathname.includes('google-calendar')||u.pathname==='/api/account'){
     if(action==='status')body={configured:true,connected:true,calendarConnected:calendar,cloudConnected:false,user:{id:'synthetic-review',email:'synthetic@example.invalid'},csrf:'synthetic-csrf'};
     else if(action==='calendar-disconnect'){calendar=false;body={ok:true};}
     else if(action==='read')body={items:[]};
    }else if(u.pathname.includes('apple'))body={configured:false};
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
   });
   await page.goto(process.env.TEST_APP_URL||'http://127.0.0.1:8767/');
   await page.waitForFunction(()=>window.GoogleSync&&window.AccountSync);
   await page.evaluate(()=>GoogleSync.refreshStatus());
   assert.equal(await page.locator('#google-sync-controls').evaluate(el=>el.hidden),true,'basic login cannot enable calendar writes');
   assert.match(await page.locator('#google-sync-user').textContent(),/별도로/);
   assert.equal(new URL(await page.locator('#google-sync-login').getAttribute('href'),'https://local.invalid').searchParams.get('calendar'),'1');
   assert.equal(await page.locator('.external-connect').count(),0,'external calendar import is removed');
   assert(!calls.some(x=>['calendar','read','write'].includes(x)),'basic login triggers no Calendar API calls');
   assert.match(await page.locator('#account-sync-status').textContent(),/로그인/);
   calendar=true;await page.evaluate(()=>GoogleSync.refreshStatus());
   assert.equal(await page.locator('#google-sync-controls').evaluate(el=>el.hidden),false);
   await page.evaluate(()=>GoogleSync.disconnect());assert(calls.includes('calendar-disconnect'));assert(!calls.includes('logout'),'unlinking calendar keeps account login');
   assert.equal(await page.locator('#google-sync-controls').evaluate(el=>el.hidden),true);
   await page.evaluate(()=>SettingsPage.open('calendars'));
   await page.locator('[data-settings-panel="calendars"]').waitFor({state:'visible'});
   await page.getByRole('button',{name:'Google 캘린더에 근무표 보내기',exact:true}).click();await page.locator('#modal-calendar-link.active').waitFor({state:'visible'});assert.equal(await page.locator('#google-sync-login').isVisible(),true);await page.getByRole('button',{name:'닫기',exact:true}).click();
   assert.equal(await page.locator('#external-calendar-list').count(),0);assert.equal(await page.locator('#google-personal-form').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   console.log('PASS '+name+': basic-login separation, no Calendar calls, selective unlink, removed imports and optional outbound entry');
  }finally{await context.close();await browser.close();}
 }
})().catch(e=>{console.error(e);process.exitCode=1});
