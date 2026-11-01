'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const address=process.env.TEST_URL||'http://127.0.0.1:8772/';
async function swipe(page,selector){await page.locator(selector).evaluate(el=>{
 const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+16;
 for(const[type,dy]of[['touchstart',0],['touchmove',50],['touchmove',100],['touchend',100]]){
  const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[{clientX:x,clientY:y+dy}]},changedTouches:{value:[{clientX:x,clientY:y+dy}]}});el.dispatchEvent(e);
 }
});}
(async()=>{for(const engine of[webkit,chromium]){const browser=await engine.launch();for(const motion of['reduce','no-preference']){
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul',reducedMotion:motion}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-11-01T03:00:00Z'));
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(address);
 const sheet=p.locator('#onboarding-date-picker'),input=p.locator('#onboarding-date'),wheel=part=>p.locator(`[data-date-part=${part}]`);
 const open=async()=>{await p.locator('#onboarding-date-open').click();await p.waitForFunction(()=>document.getElementById('onboarding-date-picker').open);await p.waitForTimeout(250);};
 const closed=()=>p.waitForFunction(()=>!document.getElementById('onboarding-date-picker').open);
 const check=async(part,value)=>{await p.waitForFunction(({part,value})=>document.querySelector(`[data-date-part=${part}]`).getAttribute('aria-valuenow')===String(value),{part,value});};
 await open();assert.equal(await input.inputValue(),'');await check('year',2026);await check('month',11);await check('day',1);
 assert.equal(await wheel('year').getAttribute('aria-valuemax'),'2026');assert.equal(await wheel('month').getAttribute('aria-valuemax'),'11');assert.equal(await wheel('day').getAttribute('aria-valuemax'),'1');
 await wheel('year').press('ArrowUp');await p.keyboard.press('Escape');await closed();assert.equal(await input.inputValue(),'');assert.equal(await p.evaluate(()=>document.activeElement.id),'onboarding-date-open');
 await open();await wheel('year').press('ArrowUp');await wheel('year').press('ArrowUp');await wheel('month').press('Home');await wheel('month').press('ArrowDown');await wheel('day').press('End');await check('day',29);
 await wheel('year').press('ArrowDown');await check('day',28);assert.equal(await wheel('day').getAttribute('aria-valuemax'),'28');
 await wheel('month').press('Home');await wheel('day').press('End');await check('day',31);await wheel('month').evaluate(e=>e.scrollTop=3*48);await check('month',4);await check('day',30);
 await p.locator('#onboarding-date-confirm').click();await closed();assert.equal(await input.inputValue(),'2025-04-30');assert.equal(await p.locator('#onboarding-date-value').textContent(),'2025.04.30');
 await open();await check('year',2025);await check('month',4);await check('day',30);
 // A swipe on a wheel at its first value must scroll that wheel, never dismiss the sheet.
 await wheel('year').press('Home');await swipe(p,'[data-date-part=year]');assert.equal(await sheet.evaluate(e=>e.open),true);assert.equal(await sheet.evaluate(e=>e.style.getPropertyValue('--sheet-drag')),'');
 await wheel('year').press('End');await wheel('month').press('End');await check('day',1);
 if(engine===chromium&&motion==='reduce'){
  const cdp=await p.context().newCDPSession(p),r=await wheel('year').boundingBox(),x=r.x+r.width/2,y=r.y+75;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let dy=20;dy<=100;dy+=20){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy}]});await p.waitForTimeout(35);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(400);
  assert(Number(await wheel('year').getAttribute('aria-valuenow'))<2026,'native touch scroll changes year');assert.equal(await sheet.evaluate(e=>e.open),true);
  await cdp.detach();await wheel('year').press('End');
 }
 // Pending scroll frames cannot save the old day; use the real scroll position at confirmation.
 await wheel('year').press('ArrowUp');await wheel('month').press('Home');
 await p.evaluate(()=>{const day=document.querySelector('[data-date-part=day]');day.scrollTop=14*48;document.getElementById('onboarding-date-confirm').click();});
 await closed();assert.equal(await input.inputValue(),'2025-01-15');
 await open();await wheel('day').locator('[data-value="16"]').click();await check('day',16);
 for(const size of[{width:320,height:568},{width:390,height:500},{width:412,height:844}]){
  await p.setViewportSize(size);await p.waitForTimeout(150);
  const geometry=await sheet.evaluate(el=>{const rect=el.getBoundingClientRect(),button=el.querySelector('#onboarding-date-confirm').getBoundingClientRect();return {top:rect.top,bottom:rect.bottom,buttonBottom:button.bottom,overflow:el.scrollWidth>el.clientWidth,center:[...el.querySelectorAll('.onboarding-date-wheel')].map(w=>{const r=w.getBoundingClientRect(),s=w.querySelector('[data-selected]').getBoundingClientRect();return Math.abs((r.top+r.bottom)/2-(s.top+s.bottom)/2);})};});
  assert(geometry.top>=0&&geometry.bottom<=size.height+1&&geometry.buttonBottom<=size.height,JSON.stringify(geometry));assert(!geometry.overflow);assert(geometry.center.every(delta=>delta<1),JSON.stringify(geometry));
 }
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(150);
 await p.locator('#onboarding-date-picker-title').evaluate(e=>{e.tabIndex=-1;e.focus({preventScroll:true});});
 if(motion==='reduce')await p.screenshot({path:'/tmp/onboarding-wheel-'+engine.name()+'.png'});
 await swipe(p,'#onboarding-date-picker .sheet-dismiss-handle');await closed();assert.equal(await input.inputValue(),'2025-01-15');
 await open();await p.touchscreen.tap(195,40);await closed();assert.equal(await input.inputValue(),'2025-01-15');
 // Step motion is a single compositor transition. Back/next leaves no stale transforms.
 await p.locator('#onboarding-next').click();
 const animations=await p.locator('.onboarding-main').evaluate(e=>e.getAnimations().map(a=>a.effect.getKeyframes()));
 assert.equal(animations.length,motion==='reduce'?0:1);
 if(motion!=='reduce')assert(animations[0].every(frame=>!('height'in frame)&&!('top'in frame)));
 for(let i=0;i<3;i++){await p.locator('#onboarding-back').click();await p.locator('#onboarding-next').click();}
 await p.waitForTimeout(250);assert.equal(await p.locator('.onboarding-main').evaluate(e=>e.getAnimations().length),0);assert.equal(await p.locator('.onboarding-main').evaluate(e=>getComputedStyle(e).transform),'none');
 assert.equal(await p.locator('.sheet-closing,.sheet-returning').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS',engine.name(),motion,'date wheel bounds, leap years, pending scroll, cancellation, swipe separation, responsive fit, step animation cleanup');await p.close();
 }await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
