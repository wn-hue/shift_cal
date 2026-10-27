'use strict';
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();
 for(const [width,height]of (process.env.THEME_QUICK?[[390,844]]:[[320,568],[390,844],[412,915]])){
 const page=await browser.newPage({viewport:{width,height},timezoneId:'Asia/Seoul',reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date('2026-10-28T12:00:00+09:00'));
 await page.addInitScript(()=>{if(localStorage.getItem('shift_active_group'))return;localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme','test');localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}));});
 await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await page.goto(process.env.TEST_URL||'http://127.0.0.1:8771/');
 // A fresh preference defaults to Day & night, followed by Warmth.
 await page.evaluate(()=>localStorage.removeItem('shift_display_theme'));await page.reload();assert.equal(await page.locator('body').getAttribute('data-pref-theme'),'current');
 // A removed Test 2 preference safely returns to the default; the surviving keys stay stable.
 await page.evaluate(()=>localStorage.setItem('shift_display_theme','test2'));await page.reload();assert.equal(await page.locator('body').getAttribute('data-pref-theme'),'current');assert.equal(await page.locator('#pref-theme option[value=test2]').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('shift_display_theme')),'current');
 // All themes remain discoverable through the actual settings sheet.
 await page.locator('#account-menu-button').click();await page.locator('.menu-preferences').click();
 await page.locator('#choose-theme').click();
 assert.deepEqual(await page.locator('#settings-options .settings-radio-row').evaluateAll(els=>els.map(e=>[e.querySelector('input').value,e.querySelector('span').textContent])),[['test1','테스트1'],['test3','테스트2'],['test4','테스트3'],['current','낮밤'],['test','따뜻함'],['toss','블루컬러'],['gpt','그레이'],['dark','다크모드']]);
 await page.keyboard.press('Escape');
 for(const theme of ['test1','test3','test4','test']){
  await page.locator('#choose-theme').click();await page.locator(`#settings-options input[value=${theme}]`).check();
  assert.equal(await page.locator('body').getAttribute('data-pref-theme'),theme);
 }
 await page.locator('#settings-back').click();await page.locator('#bnav-cal').click();
 await page.evaluate(()=>{const e=document.getElementById('pref-theme');e.value='current';e.dispatchEvent(new Event('change'))});
 const mainCard=await page.locator('.cal-day:not(.other-month)').first().evaluate(e=>({radius:getComputedStyle(e).borderRadius,border:getComputedStyle(e).borderWidth}));assert.equal(mainCard.radius,'0px');assert.equal(await page.locator('#calendar-grid').evaluate(e=>getComputedStyle(e).gap),'normal');
 for(const theme of ['test','test1','test3','test4']){
  await page.evaluate(t=>{const e=document.getElementById('pref-theme');e.value=t;e.dispatchEvent(new Event('change'));},theme);
  await page.reload();assert.equal(await page.locator('body').getAttribute('data-pref-theme'),theme);
  assert(await page.locator('.nav-capsule>button').evaluateAll(els=>els.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.right<=innerWidth})));
  assert.equal(await page.locator('#bnav-pay .nav-visual>svg:visible').count(),1);
  for(const [year,month,rows]of [[2026,9,5],[2026,4,6],[2026,1,4]]){
   await page.evaluate(([y,m])=>{currentCalDate=new Date(y,m,1);renderCalendar()},[year,month]);
   assert.equal(await page.locator('#calendar-grid .cal-day').count(),rows*7);
   if(theme==='test3')assert.equal(await page.locator('#cal-month-title-text').textContent(),`${year}년 ${month+1}월`);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.locator('.reference-month-summary').count(),0);
   const surface=await page.locator('.cal-day:not(.other-month)').first().evaluate(e=>({border:getComputedStyle(e).borderWidth,top:getComputedStyle(e).borderTopWidth,left:getComputedStyle(e).borderLeftWidth,right:getComputedStyle(e).borderRightWidth,bottom:getComputedStyle(e).borderBottomWidth,shadow:getComputedStyle(e).boxShadow}));assert.equal(surface.top,'0px');assert.equal(surface.left,'0px');assert.equal(surface.right,'0px');assert.equal(surface.bottom,['test1','test3'].includes(theme)?'1px':'0px');
   assert.equal(await page.locator('#calendar-grid').evaluate(e=>getComputedStyle(e).gap),theme==='test'?'4px':'0px');
   if(theme==='test3')assert.equal(surface.shadow,'none');
  }
  await page.evaluate(()=>{currentCalDate=new Date(2026,9,1);overrides['2026-10-03']='LEAVE';dayMemos['2026-10-03']='공휴일 메모 확인';renderCalendar()});
  assert.equal(await page.locator('.reference-today-label').count(),0);
  const todayStyle=await page.locator('.cal-day[aria-current=date] .day-num').evaluate(e=>({fill:getComputedStyle(e).backgroundColor,ink:getComputedStyle(e).color}));
  assert.notEqual(todayStyle.fill,'rgba(0, 0, 0, 0)');assert.notEqual(todayStyle.fill,todayStyle.ink);
  const cell=page.locator('.cal-day[data-date="2026-10-03"]');const date=await cell.locator('.day-num').boundingBox(),hol=await cell.locator('.holiday-bar').boundingBox();assert(Math.abs(hol.y-date.y)<4);assert(hol.x>=date.x+date.width-1);
  await cell.locator('.memo-tag').click();assert.equal(await page.locator('#memo-tab').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#modal-memo-input').inputValue(),'공휴일 메모 확인');await page.getByRole('button',{name:'근무 변경 내리기',exact:true}).click();
  await page.evaluate(()=>window.scrollTo(0,0));
  if(width===390){await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`/tmp/reference-${theme}-${engine.name()}.png`,animations:'disabled'});const grid=await page.locator('#calendar-grid').boundingBox(),nav=await page.locator('.bottom-nav').boundingBox();assert(grid.y+grid.height<nav.y,JSON.stringify({grid,nav}));}
 }
 // The Blue theme must show blue after selecting every navigation destination and during the tap animation.
 await page.evaluate(()=>{const e=document.getElementById('pref-theme');e.value='toss';e.dispatchEvent(new Event('change'));window.__navTaps=[];for(const v of document.querySelectorAll('.nav-visual')){const animate=v.animate.bind(v);v.animate=(frames,...args)=>{window.__navTaps.push(frames[0].backgroundColor);return animate(frames,...args)}}});
 await page.emulateMedia({reducedMotion:'no-preference'});
 for(const id of ['bnav-groups','bnav-pay','bnav-menu','account-menu-button','bnav-cal']){
  const target=page.locator('#'+id);await target.scrollIntoViewIfNeeded();const box=await target.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  assert.equal(await page.locator('#'+id+' .nav-visual').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(219, 234, 254)');await page.mouse.up();
  await page.locator('#'+id+' .nav-visual').evaluate(async e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))));
  const selected=await page.locator('#'+id+' .nav-visual').evaluate(e=>({ink:getComputedStyle(e).color,fill:getComputedStyle(e).backgroundColor,icon:getComputedStyle(e.querySelector('svg')).color}));
  assert.equal(selected.ink,'rgb(49, 130, 246)');assert.equal(selected.icon,selected.ink);assert.equal(selected.fill,'rgb(234, 243, 255)');
 }
 assert.deepEqual(await page.evaluate(()=>window.__navTaps),Array(5).fill('#dbeafe'));
 assert.deepEqual(errors,[]);console.log(engine.name(),width,'PASS default/order, 3 design themes, removed theme fallback, 3 sequential tests, blue navigation, persistence, 4/5/6 weeks, removed summary, colored today number, inline holiday, memo and navigation clearance');await page.close();
 }await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
