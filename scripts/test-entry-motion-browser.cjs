'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require('playwright');
(async()=>{for(const engine of [webkit,chromium]){const browser=await engine.launch();for(const reduced of [false,true]){
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');});await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await page.goto(process.env.TEST_URL||'http://127.0.0.1:8772/');
 await page.evaluate(()=>{const d=new Date('2026-10-20T12:00');openOverrideModal('2026-10-20',d,getActualShift(d,currentGroup));});
 const geometry=await page.locator('.override-sheet').evaluate(el=>{
  const a=el.getAnimations()[0];if(a){a.pause();a.currentTime=60;}
  const before=el.getBoundingClientRect().top,r=el.getBoundingClientRect(),x=r.x+50,y=r.y+8;
  const e=new Event('touchstart',{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:[{clientX:x,clientY:y}]}});el.querySelector('#editor-dismiss').dispatchEvent(e);
  const after=el.getBoundingClientRect().top;const cancel=new Event('touchcancel',{bubbles:true});el.dispatchEvent(cancel);return {before,after};
 });assert(Math.abs(geometry.before-geometry.after)<1,JSON.stringify(geometry));await page.waitForTimeout(250);assert.equal(await page.locator('.sheet-returning').count(),0);
 await page.locator('.design-memo-link').tap();await page.locator('#memo-compose-open').tap();
 if(!reduced){
  const sample=await page.locator('#memo-compose-dialog').evaluate(el=>{const a=el.getAnimations()[0];if(a){a.pause();a.currentTime=60;}const before=el.getBoundingClientRect().top,r=el.getBoundingClientRect(),target=el.querySelector('#memo-compose-dismiss');const props={bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:r.x+50,clientY:r.y+10};target.dispatchEvent(new PointerEvent('pointerdown',props));const after=el.getBoundingClientRect().top;target.dispatchEvent(new PointerEvent('pointercancel',props));return {before,after};});assert(Math.abs(sample.before-sample.after)<1,JSON.stringify(sample));
 }
 await page.waitForTimeout(250);await page.locator('#memo-compose-input').fill('한 번 저장');await page.locator('#memo-compose-save').tap();await page.waitForFunction(()=>!document.getElementById('memo-compose-dialog').open);
 // A new touch immediately after the close animation must be accepted, with no 400ms dead period.
 await page.locator('#memo-compose-add').tap();assert.equal(await page.locator('#memo-compose-input').inputValue(),'');await page.locator('#memo-compose-back').tap();await page.waitForFunction(()=>!document.getElementById('memo-compose-dialog').open);
 const sameNode=await page.evaluate(()=>{const old=document.getElementById('memo-compose-open');MemoComposer.refresh();return document.getElementById('memo-compose-open')===old&&old.isConnected;});assert(sameNode);
 await page.locator('#apply-preview').tap();await page.waitForFunction(()=>!document.getElementById('modal-override').classList.contains('active'));assert.equal(await page.evaluate(()=>document.body.style.position),'');assert.deepEqual(errors,[]);console.log(engine.name(),reduced?'reduced':'normal','PASS interrupted sheet/composer entry continuity, cancel settling, immediate next touch and cleanup');await page.close();
 }await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
