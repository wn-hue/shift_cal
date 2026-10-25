'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of [webkit,chromium]){const browser=await engine.launch();for(const [width,theme]of [[320,'test'],[390,'current'],[390,'dark']]){
 const page=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'));
 await page.addInitScript(theme=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme',theme);localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}));},theme);
 await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await page.goto(process.env.TEST_URL||'http://localhost:8770/');
 const state=()=>page.evaluate(()=>({date:selectedDateStr,tab:document.getElementById('modal-override').dataset.editorTab,open:document.getElementById('modal-override').classList.contains('active')}));
 async function swipe(selector,dx,dy=0,mode='end'){
  await page.locator(selector).first().evaluate((el,{dx,dy,mode})=>{
   const fire=(type,x,y,n=1)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:Array.from({length:n},()=>({clientX:x,clientY:y}))},changedTouches:{value:[{clientX:x,clientY:y}]}});el.dispatchEvent(e)};
   fire('touchstart',80,300,mode==='pinch'?2:1);fire('touchmove',80+dx,300+dy,mode==='pinch'?2:1);fire(mode==='cancel'?'touchcancel':'touchend',80+dx,300+dy);
  },{dx,dy,mode});
  await page.waitForTimeout(510);
 }
 await page.locator('.cal-day[data-date="2026-10-31"]').click();assert.equal(await page.locator('#modal-override [role=tab]').count(),2);assert.equal(await page.locator('#modal-override .override-close').count(),0);
 const box=await page.locator('.override-sheet').boundingBox();
 await page.evaluate(()=>{const d=new Date(2026,9,25);openOverrideModal('2026-10-25',d,getActualShift(d,currentGroup))});await swipe('#editor-swipe-space',90);assert.deepEqual(await state(),{date:'2026-10-26',tab:'work',open:true});await swipe('#editor-swipe-space',-90);assert.equal((await state()).date,'2026-10-25');await page.evaluate(()=>{const d=new Date(2026,9,31);openOverrideModal('2026-10-31',d,getActualShift(d,currentGroup));switchEditorTab('memo')});
 await page.locator('#modal-memo-input').fill('저장 전 메모');await page.locator('#editor-sticker-preview').click();assert.equal(await page.locator('#sticker-dialog').evaluate(e=>e.open),true);
 await page.locator('[data-sticker="beer"]').click();await page.getByRole('button',{name:'완료',exact:true}).click();assert.deepEqual(await state(),{date:'2026-10-31',tab:'memo',open:true});assert.equal(await page.locator('#modal-memo-input').inputValue(),'저장 전 메모');assert.equal(await page.locator('.override-sheet').evaluate(e=>e.getBoundingClientRect().height),box.height);
 page.once('dialog',d=>d.dismiss());await swipe('#editor-swipe-space',90);assert.equal((await state()).date,'2026-10-31');assert.equal(await page.locator('#modal-memo-input').inputValue(),'저장 전 메모');
 await page.locator('#modal-memo-input').fill('');await swipe('#editor-swipe-space',90);assert.deepEqual(await state(),{date:'2026-11-01',tab:'memo',open:true});
 await swipe('#editor-swipe-space',-90);assert.deepEqual(await state(),{date:'2026-10-31',tab:'memo',open:true});await page.locator('#work-tab').click();assert.equal((await state()).tab,'work');
 for(const [selector,dx,dy,mode]of [['.shift-scroll',90,0,'end'],['#editor-swipe-space',0,100,'end'],['#editor-swipe-space',30,0,'end'],['#editor-swipe-space',90,0,'cancel'],['#editor-swipe-space',90,0,'pinch']]){await swipe(selector,dx,dy,mode);assert.deepEqual(await state(),{date:'2026-10-31',tab:'work',open:true});}
 await page.locator('#memo-tab').click();await page.locator('#event-add').click();await page.locator('#event-title').fill('미완성 일정');page.once('dialog',d=>d.dismiss());await swipe('#editor-swipe-space',90);assert.equal((await state()).date,'2026-10-31');assert.equal(await page.locator('#event-title').inputValue(),'미완성 일정');page.once('dialog',d=>d.accept());await page.locator('#event-cancel').click();
 await page.locator('#editor-sticker-preview').click();await page.keyboard.press('Escape');assert.equal(await page.locator('#sticker-dialog').evaluate(e=>e.open),false);assert.equal((await state()).open,true);
 await swipe('#modal-override .override-header',0,30);assert.equal((await state()).open,true);await swipe('#modal-override .override-header',0,120);assert.equal((await state()).open,false);
 await page.locator('.cal-day[data-date="2026-10-31"]').click();await page.locator('#editor-dismiss').click();assert.equal((await state()).open,false);
 await page.evaluate(()=>{currentCalDate=new Date(2026,11,1);renderCalendar();const d=new Date(2026,11,31);openOverrideModal('2026-12-31',d,getActualShift(d,currentGroup));switchEditorTab('memo')});await swipe('#editor-swipe-space',90);assert.equal((await state()).date,'2027-01-01');
 await page.setViewportSize({width,height:360});await page.locator('#editor-sticker-preview').click();await page.locator('[data-sticker="jjamppong"]').scrollIntoViewIfNeeded();const r=await page.locator('[data-sticker="jjamppong"]').boundingBox();assert(r.y>=0&&r.y+r.height<=360);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(width===390&&theme==='current'){await page.setViewportSize({width,height:844});await page.waitForTimeout(100);await page.locator('#sticker-dialog').evaluate(e=>e.scrollTop=0);await page.screenshot({path:`/tmp/day-sticker-popup-${engine.name()}.png`});await page.getByRole('button',{name:'스티커 닫기'}).click();await page.screenshot({path:`/tmp/day-editor-handle-${engine.name()}.png`});}
 assert.deepEqual(errors,[]);console.log(engine.name(),width,theme,'PASS popup isolation, two tabs, right/left day transitions, draft protection, gesture exclusions, dismiss handle, year rollover and short screen');await page.close();
 }await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
