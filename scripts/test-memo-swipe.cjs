'use strict';
const assert=require('node:assert/strict'),{webkit,chromium,devices}=require('playwright');
(async()=>{for(const engine of [webkit,chromium])for(const reducedMotion of ['no-preference','reduce']){
 const browser=await engine.launch(),page=await browser.newPage({...devices['iPhone 13'],timezoneId:'Asia/Seoul',reducedMotion});page.setDefaultTimeout(10000);
 await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+09:00'));await page.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme','current');localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));});
 await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));let accept=false,dialogs=0;page.on('dialog',d=>{dialogs++;accept?d.accept():d.dismiss()});
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:8771/');await page.locator('.cal-day[data-date="2026-10-20"] .day-num').tap();await page.locator('[data-override="OFF"]').tap();await page.evaluate(()=>DayEditorDesigns.showPane('memo'));
 const open=async()=>{await page.waitForTimeout(650);await page.locator('#memo-compose-open').tap();await page.waitForTimeout(50);};
 const swipe=async(selector,dx,dy,cancel=false)=>{const target=page.locator(selector),b=await target.boundingBox(),x=b.x+b.width/2,y=b.y+Math.min(10,b.height/2);const base={bubbles:true,cancelable:true,pointerId:1,pointerType:'touch',isPrimary:true,button:0};await target.dispatchEvent('pointerdown',{...base,clientX:x,clientY:y});await target.dispatchEvent('pointermove',{...base,clientX:x+dx,clientY:y+dy});const transform=await page.locator('#memo-compose-dialog').evaluate(e=>getComputedStyle(e).transform);await target.dispatchEvent(cancel?'pointercancel':'pointerup',{...base,clientX:x+dx,clientY:y+dy});return transform;};
 const visible=()=>page.locator('#memo-compose-dialog').isVisible();
 await open();await swipe('#memo-compose-dismiss',0,30);await page.waitForTimeout(200);assert(await visible());assert.equal(await page.locator('#memo-compose-dialog').evaluate(e=>getComputedStyle(e).transform),reducedMotion==='reduce'?'none':'matrix(1, 0, 0, 1, 0, 0)');
 await swipe('#memo-compose-title',100,8);assert(await visible());await swipe('#memo-compose-title',0,100,true);assert(await visible());
 // Text editing/selection/scrolling must never trigger dismissal, even with a downward gesture.
 await page.locator('#memo-compose-input').fill('긴 메모\n'.repeat(200));await swipe('#memo-compose-input',0,120);assert(await visible());assert.equal(dialogs,0);
 // A rejected discard snaps back and keeps every character.
 const before=await page.locator('#memo-compose-input').inputValue();const transform=await swipe('#memo-compose-title',0,110);assert.equal(dialogs,1);assert(await visible());assert.equal(await page.locator('#memo-compose-input').inputValue(),before);if(reducedMotion==='no-preference')assert(Number(transform.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,[^,]+,\s*([^)]+)\)/)?.[1])>=109,'drag continues from any in-progress entry position');
 await page.waitForTimeout(650);accept=true;await swipe('#memo-compose-dismiss',0,110);await page.waitForFunction(()=>!document.querySelector('#memo-compose-dialog').open);assert.equal(await page.evaluate(()=>dayMemos['2026-10-20']),undefined);assert.equal(await page.evaluate(()=>ShiftTools.pending().type),'OFF');assert(await page.locator('#modal-override').evaluate(e=>e.classList.contains('active')));
 await open();const count=dialogs;await swipe('#memo-compose-title',0,100);await page.waitForFunction(()=>!document.querySelector('#memo-compose-dialog').open);assert.equal(dialogs,count,'unchanged memo closes without confirmation');
 // The handle remains a keyboard/tap-accessible close control.
 await open();await page.locator('#memo-compose-dismiss').tap();await page.waitForFunction(()=>!document.querySelector('#memo-compose-dialog').open);
 await open();await page.locator('#memo-compose-input').fill('저장된 메모');await page.locator('#memo-compose-save').tap();await page.waitForFunction(()=>!document.querySelector('#memo-compose-dialog').open);assert(await page.locator('#modal-override').evaluate(e=>e.classList.contains('active')));await page.evaluate(()=>closeModalDirect());await page.waitForFunction(()=>!document.querySelector('#modal-override').classList.contains('active'));await page.waitForTimeout(750);await page.locator('.cal-day[data-date="2026-10-20"] .day-num').tap();await page.evaluate(()=>DayEditorDesigns.showPane('memo'));await open();await swipe('#memo-compose-title',0,100);await page.waitForFunction(()=>!document.querySelector('#memo-compose-dialog').open);assert.equal(await page.evaluate(()=>dayMemos['2026-10-20']),'저장된 메모');
 if(engine===chromium){
  await open();const b=await page.locator('#memo-compose-title').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2,cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*22}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>!document.querySelector('#memo-compose-dialog').open);await cdp.detach();
 }
 console.log(engine.name(),reducedMotion,'PASS drag/return, horizontal/cancel, textarea exclusion, discard guard, pending work, handle tap, saved note');await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
