'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
async function swipe(p,selector,dy=110){await p.locator(selector).first().evaluate((el,dy)=>{const r=el.getBoundingClientRect(),x=r.left+Math.min(r.width/2,80),y=r.top+Math.min(r.height/2,20);for(const [type,offset]of [['touchstart',0],['touchmove',dy/2],['touchmove',dy],['touchend',dy]]){const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[{clientX:x,clientY:y+offset}]},changedTouches:{value:[{clientX:x,clientY:y+offset}]}});el.dispatchEvent(e)}},dy);}
(async()=>{for(const engine of [webkit,chromium]){const b=await engine.launch();for(const theme of ['current','dark']){
 const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul',reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'));
 await p.addInitScript(theme=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme',theme);localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master','{"hireDate":"2015-06-16","baseHourly":10320,"ordinaryHourly":11000}');},theme);
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(process.env.TEST_URL||'http://127.0.0.1:8770');
 const closed=id=>p.locator('#'+id).evaluate(d=>d.tagName==='DIALOG'?!d.open:!d.classList.contains('active'));
 const open=id=>p.locator('#'+id).evaluate(d=>{d.tagName==='DIALOG'?d.showModal():d.classList.add('active');d.scrollTop=0;});
 const ids=await p.locator('dialog.app-bottom-sheet,.modal-overlay:not(#modal-override)').evaluateAll(ds=>ds.map(d=>d.id));
 for(const id of ids){await open(id);await p.waitForTimeout(40);assert.equal(await p.locator('#'+id+' .sheet-dismiss-handle:visible').count(),1,id);await p.locator('#'+id+' .sheet-dismiss-handle').focus();assert.equal(await p.locator('#'+id+' .sheet-dismiss-handle').evaluate(e=>getComputedStyle(e).outlineStyle),'none',id);
  await p.touchscreen.tap(195,24);assert(await closed(id),id+' touch backdrop');
  await p.waitForTimeout(750);await open(id);const sheet=p.locator('#'+id);await sheet.evaluate(d=>{const r=d.getBoundingClientRect();d.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:195,clientY:5}));});assert(await closed(id),id+' click fallback');
  await open(id);await sheet.evaluate(d=>{const body=d.tagName==='DIALOG'?d:d.querySelector('.modal-sheet');const surface=document.createElement('div');surface.className='gesture-test-content';surface.style.cssText='height:120px;flex:none';body.querySelector('.sheet-dismiss-handle').after(surface);body.scrollTop=0;});await swipe(p,'#'+id+' .gesture-test-content');assert(await closed(id),id+' content swipe');await sheet.locator('.gesture-test-content').evaluate(e=>e.remove());
 }
 // Use real feature entry points for focus restoration and the date heading.
 await p.locator('#account-menu-button').tap();await p.locator('#commute-open').tap();await p.locator('#commute-back').tap();await p.waitForFunction(()=>document.getElementById('commute-dialog').hidden);assert.equal(await p.locator('#commute-open').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 await p.locator('#bnav-groups').tap();await p.locator('.group-date').first().tap();assert.equal(await p.locator('#group-day-title').evaluate(e=>getComputedStyle(e).outlineStyle),'none');assert.equal(await p.locator('#group-day-dialog .group-dialog-handle:visible').count(),0);await swipe(p,'#group-day-rows');assert(await closed('group-day-dialog'));
 await p.locator('#bnav-cal').tap();await p.locator('.cal-day[data-date="2026-10-26"]').tap();await swipe(p,'#editor-swipe-space');assert(await closed('modal-override'),'editor content downward swipe');
 await p.locator('.cal-day[data-date="2026-10-26"]').tap();await p.locator('#editor-sticker-preview').tap();await p.touchscreen.tap(195,24);assert(await closed('sticker-dialog'));assert(!(await closed('modal-override')));await p.touchscreen.tap(195,24);assert(await closed('modal-override'));
 // A scrolled content pane scrolls back up, without dismissing midway.
 await open('lost-found-dialog');await p.locator('#lost-found-dialog').evaluate(d=>{const e=document.createElement('div');e.id='scroll-fixture';e.style.cssText='height:100px;overflow:auto';e.innerHTML='<div style="height:800px">scroll content</div>';d.prepend(e);e.scrollTop=70;});await swipe(p,'#scroll-fixture');assert(!(await closed('lost-found-dialog')));await p.locator('#scroll-fixture').evaluate(e=>e.remove());await p.touchscreen.tap(195,24);
 // Real Chromium touch input, not only dispatched DOM events.
 if(engine===chromium&&theme==='current'){
  await p.locator('#bnav-cal').tap();await p.locator('.cal-day[data-date="2026-10-26"]').tap();const cdp=await p.context().newCDPSession(p),r=await p.locator('#editor-swipe-space').boundingBox(),x=195,y=Math.min(r.y+12,690);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let offset=20;offset<=100;offset+=20){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+offset}]});await p.waitForTimeout(25);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert(await closed('modal-override'),'native touch drag');await cdp.detach();
 }
 if(theme==='current'){await p.locator('#bnav-groups').tap();await p.locator('.group-date').first().tap();await p.screenshot({path:'/tmp/sheet-group-'+engine.name()+'.png'});await p.touchscreen.tap(195,24);}
 // Keyboard navigation still has a visible focus indicator on ordinary controls.
 await p.locator('#account-menu-button').tap();await p.keyboard.press('Tab');await p.locator('#commute-open').focus();assert.notEqual(await p.locator('#commute-open').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 assert.deepEqual(errors,[]);console.log(engine.name(),theme,'PASS all sheets: touch backdrop, click fallback, body swipe, one unboxed handle, touch focus restoration, nested picker and scroll protection');await p.close();
 }await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
