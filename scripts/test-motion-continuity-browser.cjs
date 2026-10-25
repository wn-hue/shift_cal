'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of [webkit,chromium]){const browser=await engine.launch();for(const reduced of [false,true]){
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:reduced?'reduce':'no-preference',timezoneId:'Asia/Seoul'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'));await p.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master','{"hireDate":"2015-06-16","baseHourly":10320,"ordinaryHourly":11000}');});
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.route('**/api/today-menu?*',async r=>{await new Promise(r=>setTimeout(r,450));const date=new URL(r.request().url()).searchParams.get('date');await r.fulfill({json:{status:'ok',date,checkedAt:'2026-10-26T03:00:00Z',meals:['조식','중식','석식','야식'].map(name=>({name,groups:[{title:'기본 메뉴',items:['밥','국','반찬']}]}))}});});
 await p.goto(process.env.TEST_URL||'http://127.0.0.1:8770');await p.locator('#account-menu-button').tap();
 for(const [button,page,back]of [['.menu-preferences','#app-preferences-dialog','#settings-back'],['#commute-open','#commute-dialog','#commute-back']]){
  await p.locator(button).tap();await p.waitForTimeout(300);const root=p.locator(page);await p.locator(back).tap();if(!reduced){assert.equal(await root.evaluate(el=>el.hidden),false,'page remains visible during exit');assert(await root.evaluate(el=>el.getAnimations().length>0));}await p.waitForFunction(id=>document.querySelector(id).hidden,page);assert.equal(await p.locator('body>.container').evaluate(e=>e.inert),false);
  // Reverse a back transition before it completes; the cancelled exit must not hide the reopened page.
  await p.locator(button).tap();await p.waitForTimeout(50);await p.goBack();await p.waitForTimeout(30);await p.goForward();await p.waitForTimeout(330);assert.equal(await root.evaluate(el=>el.hidden),false);assert.equal(await root.evaluate(el=>el.getAnimations().length),0);assert(Math.abs((await root.boundingBox()).x)<1);await p.goBack();await p.waitForFunction(id=>document.querySelector(id).hidden,page);
 }
 await p.locator('#menu-group-open').tap();const dialog=p.locator('#settings-options');if(!reduced)assert(await dialog.evaluate(el=>el.getAnimations().some(a=>/28px/.test(a.effect.getKeyframes()[0].translate||''))),'native sheet opens with motion');
 await p.waitForTimeout(240);
 if(!reduced){
  // Pull below the dismissal threshold, then close while the return animation is still running.
  await dialog.evaluate(el=>{const r=el.getBoundingClientRect(),x=r.left+70,y=r.top+70;for(const[type,dy]of [['touchstart',0],['touchmove',55],['touchend',55]]){const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[{clientX:x,clientY:y+dy}]},changedTouches:{value:[{clientX:x,clientY:y+dy}]}});el.dispatchEvent(e);}});
  await p.waitForTimeout(50);const sample=await dialog.evaluate(el=>{const before=el.getBoundingClientRect().top;el.close();return {before,after:el.getBoundingClientRect().top,returning:el.classList.contains('sheet-returning'),duration:getComputedStyle(el).transitionDuration};});assert(Math.abs(sample.before-sample.after)<1,JSON.stringify(sample));assert.equal(sample.returning,false);assert.equal(sample.duration,'0.24s');
 }else await dialog.evaluate(el=>el.close());
 await p.waitForFunction(()=>!document.getElementById('settings-options').open);await p.waitForTimeout(720);
 // A slow menu response reserves all meal slots instead of collapsing the page during the swipe.
 await p.evaluate(()=>switchView('menu'));assert.equal(await p.locator('.meal-placeholder').count(),4);assert((await p.locator('#today-menu-cards').boundingBox()).height>=900);await p.waitForFunction(()=>document.querySelectorAll('.meal-card').length===4);assert.equal(await p.locator('.meal-placeholder').count(),0);
 await p.evaluate(()=>TodayMenu.changeDate(1));await p.waitForFunction(()=>document.querySelectorAll('.meal-card').length===4);assert.equal(await p.locator('#today-menu-panel').getAttribute('aria-busy'),'false');
 assert.equal(await p.locator('.sheet-closing,.sheet-returning,.month-swipe-track').count(),0);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log(engine.name(),reduced?'reduced':'normal','PASS reversible settings/bus exit, interrupted history, sheet entry, return-to-close continuity and stable async menu loading');await p.close();
 }await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
