'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require('playwright');
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();
 for(const theme of ['current','test3','test4']){
  const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul'});page.setDefaultTimeout(10000);
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+09:00'));
  await page.addInitScript(theme=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme',theme);localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));const viewport=Object.assign(new EventTarget(),{width:390,height:844,offsetTop:0,offsetLeft:0,scale:1});Object.defineProperty(window,'visualViewport',{get:()=>viewport});window.testViewport=viewport;},theme);
  await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:8771/');await page.locator('.cal-day[data-date="2026-10-20"] .day-num').click();await page.locator('.design-memo-link').click();await page.locator('#memo-compose-open').click();await page.locator('#memo-compose-input').fill('키보드 테스트\n'+'긴 메모 '.repeat(120));
  for(const [height,top]of [[425,70],[300,160],[220,200],[844,0]]){
   await page.evaluate(({height,top})=>{Object.assign(testViewport,{height,offsetTop:top});testViewport.dispatchEvent(new Event('resize'));testViewport.dispatchEvent(new Event('scroll'));},{height,top});
   await page.waitForFunction(h=>document.getElementById('memo-compose-dialog').style.getPropertyValue('--compose-height')===h+'px',height);
   const geometry=await page.evaluate(selector=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,right:r.right}};return {sheet:rect('#memo-compose-dialog'),save:rect(selector),input:rect('#memo-compose-input'),overflow:document.documentElement.scrollWidth>innerWidth,font:getComputedStyle(document.getElementById('memo-compose-input')).fontSize};},'#memo-compose-save');
   assert(geometry.sheet.top>=top-1&&geometry.sheet.bottom<=top+height+1,JSON.stringify(geometry));assert(geometry.save.top>=top&&geometry.save.bottom<=top+height+1,JSON.stringify(geometry));assert(geometry.input.height>=44&&geometry.input.right<=391);assert.equal(geometry.font,'16px');assert.equal(geometry.overflow,false);
  }
  // Language changes cannot collapse user-opened details or create a render loop.
  await page.locator('#memo-compose-save').click();await page.locator('#design-back').click();await page.evaluate(()=>AppI18n.setLanguage('zh'));await page.waitForTimeout(150);await page.locator('.design-attendance>summary').evaluate(e=>e.parentElement.open=true);await page.waitForTimeout(150);assert(await page.locator('.design-attendance').evaluate(e=>e.open));assert.match(await page.locator('#design-title').textContent(),/班|考勤|我的一天/);
  if(theme==='current'){for(const t of ['test','toss','gpt','dark','test1']){await page.evaluate(t=>document.body.dataset.prefTheme=t,t);await page.waitForTimeout(50);assert.equal(await page.locator('#modal-override').getAttribute('data-editor-design'),'toss');}}
  console.log(engine.name(),theme,'PASS keyboard resize/pan, 220px viewport, localization, stable details and theme mapping');await page.close();
 }
 await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
