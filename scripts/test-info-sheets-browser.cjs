'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.TEST_URL||'http://127.0.0.1:8768/';
async function swipe(page,selector){
 await page.locator(selector).evaluate(el=>{
  const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
  for(const [type,dy] of [['touchstart',0],['touchmove',110],['touchend',110]]){
   const point={clientX:x,clientY:y+dy},event=new Event(type,{bubbles:true,cancelable:true});
   Object.defineProperties(event,{touches:{value:type==='touchend'?[]:[point]},changedTouches:{value:[point]}});el.dispatchEvent(event);
  }
 });
}
async function settled(page,id){
 await page.waitForFunction(id=>document.getElementById(id).open,id);
 await page.evaluate(async id=>{
  // AppSheets starts entry on the next frame after measuring the final contents.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  await Promise.all(document.getElementById(id).getAnimations().map(a=>a.finished.catch(()=>{})));
 },id);
}
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();try{for(const [width,reducedMotion] of [[320,'reduce'],[390,'no-preference']]){
  const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.clock.setFixedTime(new Date('2026-11-07T12:00:00+09:00'));
  await page.route('**/api/**',route=>route.fulfill({json:{configured:false}}));
  await page.context().addCookies([{name:'__Host-work-routine-ready',value:'1',url:'https://20261104.xyz',secure:true,sameSite:'Lax'}]);
  await page.addInitScript(()=>{
   localStorage.setItem('shift_origin_ready_v1','1');localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');
   localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-01-01',baseHourly:11050,ordinaryHourly:14482}));
  });
  await page.goto(url);assert.equal(await page.locator('dialog.info-sheet:visible').count(),0);
  await page.evaluate(()=>{switchView('all');SettingsUI.openLeave();});await settled(page,'leave-settings-dialog');
  const opener=page.locator('#leave-policy-open'),sheet=page.locator('#leave-policy-dialog');
  assert.equal(await page.locator('#leave-settings-dialog details').count(),0);
  await opener.scrollIntoViewIfNeeded();
  const snapshot=()=>page.evaluate(()=>{
   const parent=document.getElementById('leave-settings-dialog'),box=parent.getBoundingClientRect();
   return{top:box.top,height:box.height,scroll:parent.scrollTop,bodyScroll:scrollY,hire:document.getElementById('input-hire-date').value,total:document.getElementById('input-total-leave').value,config:localStorage.getItem('shift_salary_config_master')};
  });
  const before=await snapshot();
  for(const theme of ['current','toss','gpt','dark']){
   await page.evaluate(t=>{document.body.dataset.prefTheme=t;},theme);
   await opener.click();await settled(page,'leave-policy-dialog');
   const box=await sheet.boundingBox();assert(box.y>=55&&box.y+box.height<=845,'Explanation stays in a bottom sheet: '+JSON.stringify(box));
   assert.equal(await sheet.evaluate(d=>d.scrollWidth<=d.clientWidth),true);
   assert.equal(await page.locator('#leave-settings-dialog').evaluate(d=>d.open),true);
   assert.equal(await page.locator('#leave-policy-title').evaluate(h=>h===document.activeElement),true);
   assert.match(await sheet.textContent(),/최대 11일/);
   await sheet.locator('.info-sheet-done').click();await sheet.waitFor({state:'hidden'});
   assert.equal(await opener.evaluate(b=>b===document.activeElement),true);
   // Different themes can use different font metrics; opening the explanation must not change saved settings.
   const after=await snapshot();assert.equal(after.hire,before.hire);assert.equal(after.total,before.total);assert.equal(after.config,before.config);
  }
  await page.evaluate(()=>{document.body.dataset.prefTheme='current';});await opener.scrollIntoViewIfNeeded();
  const stable=await snapshot();
  for(const method of ['swipe','escape','backdrop']){
   await opener.click();await settled(page,'leave-policy-dialog');
   assert.deepEqual(await snapshot(),stable,'Opening the policy preserves the parent layout and scroll');
   if(method==='swipe')await swipe(page,'#leave-policy-dialog .sheet-dismiss-handle');
   if(method==='escape')await page.keyboard.press('Escape');
   if(method==='backdrop')await page.mouse.click(10,20);
   await sheet.waitFor({state:'hidden'});
   assert.equal(await page.locator('#leave-settings-dialog').evaluate(d=>d.open),true,'Only the explanation closes');
   assert.deepEqual(await snapshot(),stable,'Closing the policy preserves input, layout, scroll and saved data');
  }
  if(width===390){await opener.click();await settled(page,'leave-policy-dialog');await page.screenshot({path:'/tmp/work-routine-leave-policy-'+engine.name()+'.png'});await sheet.locator('.info-sheet-done').click();await sheet.waitFor({state:'hidden'});}
  assert.deepEqual(errors,[]);await page.close();console.log('PASS',engine.name(),width,reducedMotion,'explanation sheets / nested form preservation / four themes / confirm, swipe, Escape and backdrop');
 }}finally{await browser.close();}
}})().catch(error=>{console.error(error);process.exitCode=1;});
