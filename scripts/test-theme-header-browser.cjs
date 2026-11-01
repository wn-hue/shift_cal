'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of[webkit,chromium]){const browser=await engine.launch();for(const width of(process.env.HEADER_QUICK?[390]:[320,390,412])){
 const p=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-10-28T12:00:00+09:00'));
 await p.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master','{"hireDate":"2015-06-16","baseHourly":10320,"ordinaryHourly":11000}')});
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(process.env.TEST_URL||'http://127.0.0.1:8771/');await p.evaluate(()=>document.fonts.ready);
 for(const theme of['test','test1','test3','test4']){
  await p.evaluate(t=>{const e=document.getElementById('pref-theme');e.value=t;e.dispatchEvent(new Event('change'));currentCalDate=new Date(2026,8,1);renderCalendar();document.getElementById('weather-icon').textContent='☀️';document.getElementById('weather-temperature').textContent='-12°';document.getElementById('weather-alert').hidden=false;document.getElementById('weather-alert').textContent='Wind advisory'},theme);
  for(const language of['ko','en','zh','ja']){
   await p.evaluate(l=>AppI18n.setLanguage(l),language);await p.locator('#cal-month-title-btn').focus();
   await p.waitForFunction(()=>Math.abs(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--theme-header-height'))-document.querySelector('.reference-header').getBoundingClientRect().height)<1.1);
   const geometry=await p.evaluate(()=>{const h=document.querySelector('.reference-header').getBoundingClientRect(),t=document.getElementById('cal-month-title-btn').getBoundingClientRect(),a=document.getElementById('header-calendar-actions').getBoundingClientRect(),g=document.getElementById('calendar-grid').getBoundingClientRect(),n=document.querySelector('.bottom-nav').getBoundingClientRect();const range=document.createRange();range.selectNodeContents(document.getElementById('cal-month-title-text'));const text=range.getBoundingClientRect();return{overlap:t.right>a.left&&t.left<a.right&&t.bottom>a.top&&t.top<a.bottom,focusFits:t.left-4>=h.left-1&&t.right+4<=h.right+1&&t.top-4>=h.top-1&&t.bottom+4<=h.bottom+1,textFits:text.left>=t.left-1&&text.right<=t.right+1&&text.top>=t.top-1&&text.bottom<=t.bottom+1,gridClear:g.bottom<n.top,topGap:h.top-parseFloat(getComputedStyle(document.body).paddingTop),overflow:document.documentElement.scrollWidth>innerWidth}});
   assert(geometry.topGap>=16,JSON.stringify({theme,geometry}));assert.equal(geometry.overlap,false,JSON.stringify({theme,language,geometry}));assert(geometry.focusFits&&geometry.textFits&&geometry.gridClear&&!geometry.overflow,JSON.stringify({theme,language,geometry}));
  }
  await p.evaluate(()=>{currentCalDate=new Date(2026,9,1);renderCalendar()});
  const today=await p.locator('.cal-day[aria-current=date]').evaluate(e=>{const s=getComputedStyle(e,'::after');return{radius:getComputedStyle(e).borderRadius,content:s.content,width:s.borderTopWidth,color:s.borderTopColor,inset:s.top,pointer:s.pointerEvents}});
  assert.equal(today.radius,'14px');assert.equal(today.content,'""');assert(parseFloat(today.width)>=1);assert.notEqual(today.color,'rgba(0, 0, 0, 0)');assert.equal(today.inset,'1px');assert.equal(today.pointer,'none');
  await p.locator('#cal-month-title-btn').click();assert.equal(await p.locator('#modal-year-month-picker').evaluate(e=>e.classList.contains('active')),true);
  await p.locator('#modal-year-month-picker .sheet-dismiss-handle').click();await p.waitForFunction(()=>!document.getElementById('modal-year-month-picker').classList.contains('active'));
  if(width===390)await p.screenshot({path:`/tmp/header-fixed-${theme}-${engine.name()}.png`,animations:'disabled'});
 }
 assert.deepEqual(errors,[]);console.log(engine.name(),width,'PASS four headers, safe top gap, rounded today outline, 4 languages, long weather text, focus outline, no overlap/clipping, responsive height and month picker');await p.close();
 }await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
