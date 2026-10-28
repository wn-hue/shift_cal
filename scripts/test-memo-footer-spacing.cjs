'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium,devices}=require('playwright');
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();
 const page=await browser.newPage({...devices['iPhone 13'],timezoneId:'Asia/Seoul'});
 page.setDefaultTimeout(10000);
 await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+09:00'));
 await page.addInitScript(()=>{
  localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme','current');localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));
  window.nativeTestViewport=window.visualViewport;
  const viewport=Object.assign(new EventTarget(),{width:390,height:window.visualViewport.height,offsetTop:0,offsetLeft:0,scale:1});
  Object.defineProperty(window,'visualViewport',{get:()=>viewport});window.testViewport=viewport;
 });
 await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:8771/');
 await page.evaluate(()=>Object.assign(testViewport,{height:nativeTestViewport.height,width:nativeTestViewport.width}));
 await page.locator('.cal-day[data-date="2026-10-20"] .day-num').tap();await page.locator('.design-memo-link').tap();await page.waitForTimeout(300);
 const geometry=()=>page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};return {card:rect('#memo-panel'),footer:rect('.design-footer'),sheet:rect('.override-sheet'),toolbar:rect('.design-toolbar')};});
 const compact=async state=>{const g=await geometry();assert(g.footer.top-g.card.bottom>=0&&g.footer.top-g.card.bottom<=20,`${state}: card-to-Done gap ${JSON.stringify(g)}`);assert(g.sheet.height<550,`${state}: full-height blank sheet ${JSON.stringify(g)}`);assert(g.toolbar.top>=0,`${state}: header clipped`);};
 await compact('open');
 // The layout must not depend on a keyboard-state attribute being initialized or reset first.
 for(const keyboard of [null,'true','false']){
  await page.evaluate(value=>{const o=document.querySelector('#modal-override');if(value===null)delete o.dataset.editorKeyboard;else o.dataset.editorKeyboard=value;o.dataset.editorFocus='';},keyboard);
  await compact('keyboard state '+keyboard);
 }
 await page.locator('#modal-memo-input').fill('Memo line\n'.repeat(100));
 const restingHeight=await page.evaluate(()=>testViewport.height);
 for(const [height,top]of [[425,70],[300,160],[220,200],[restingHeight,0]]){
  await page.evaluate(({height,top})=>{Object.assign(testViewport,{height,offsetTop:top});testViewport.dispatchEvent(new Event('resize'));},{height,top});
  await page.waitForFunction(h=>Math.abs(parseFloat(document.querySelector('#modal-override').style.getPropertyValue('--memo-viewport-height'))-h)<1,height);
  const g=await geometry();assert(g.sheet.top>=top-1&&g.sheet.bottom<=top+height+1,JSON.stringify(g));assert(g.footer.top>=top&&g.footer.bottom<=top+height+1,JSON.stringify(g));
 }
 await page.locator('#modal-memo-input').blur();await compact('keyboard dismissed');
 await page.locator('#modal-memo-input').fill('');await page.locator('#modal-memo-input').blur();
 if(engine===webkit)await page.screenshot({path:'/tmp/memo-spacing-fixed.png',animations:'disabled'});
 await page.locator('#apply-preview').tap();await page.waitForFunction(()=>!document.querySelector('#modal-override').classList.contains('active'));
 console.log(engine.name(),'PASS mobile: card-to-footer spacing, missing/stale keyboard state, typing, dismissal, save');await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
