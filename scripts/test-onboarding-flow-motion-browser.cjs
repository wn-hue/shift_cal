'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of[webkit,chromium]){const browser=await engine.launch();for(const reduced of[false,true]){
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(process.env.TEST_URL||'http://127.0.0.1:8772/');await p.waitForTimeout(300);
 await p.locator('#onboarding-date').evaluate(e=>e.value='2015-06-16');const before=await p.locator('#onboarding-next').boundingBox();await p.locator('#onboarding-next').click();
 assert.equal(await p.locator('.onboarding-scene-copy').count(),reduced?0:1);
 assert.equal(await p.locator('.onboarding-scene-copy [id]').count(),0);
 const after=await p.locator('#onboarding-next').boundingBox();assert(Math.abs(before.y-after.y)<1,'footer stays in place between steps');
 if(!reduced){
  await p.waitForTimeout(60);
  const state=await p.evaluate(()=>{const incoming=document.querySelector('.onboarding-main:not(.onboarding-scene-copy)'),old=document.querySelector('.onboarding-scene-copy');return{coverage:Number(getComputedStyle(incoming).opacity)+Number(getComputedStyle(old).opacity),button:getComputedStyle(document.getElementById('onboarding-next')).backgroundColor,oldTitle:old.querySelector('.onboarding-title').textContent,newTitle:document.getElementById('onboarding-title').textContent};});
  assert(state.coverage>.97,'no blank frame between scenes');assert.equal(state.button,'rgb(49, 130, 246)');assert.match(state.oldTitle,/입사일/);assert.match(state.newTitle,/어느 조/);
 }
 await p.waitForFunction(()=>!document.querySelector('.onboarding-scene-copy'));await p.locator('[data-onboarding-group=C]').click();await p.locator('#onboarding-next').click();await p.waitForFunction(()=>!document.querySelector('.onboarding-scene-copy'));await p.locator('#onboarding-next').click();
 const sheet=p.locator('#payroll-sms-dialog'),start=await sheet.boundingBox();await p.waitForTimeout(380);const end=await sheet.boundingBox();if(!reduced)assert(start.y>end.y+10,'sheet rises from below');else assert(Math.abs(start.y-end.y)<1);
 await p.locator('#wage-manual-base').fill('11050');await p.locator('#payroll-sms-apply').click();if(!reduced){assert.equal(await p.locator('.onboarding-scene-copy [id]').count(),0);assert.equal(await p.locator('#payroll-sms-apply').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(49, 130, 246)');}
 await sheet.locator('.sheet-dismiss-handle').click();await p.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);assert.equal(await p.locator('.onboarding-scene-copy').count(),0);assert.equal(await p.locator('[data-wage-moving]').count(),0);assert.equal(await p.evaluate(()=>config.baseHourly),0);
 assert.deepEqual(errors,[]);await p.close();console.log('PASS continuous scene coverage, stable footer, no button flash, sheet entrance, interruption cleanup',engine.name(),reduced?'reduced':'normal');
 }await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
