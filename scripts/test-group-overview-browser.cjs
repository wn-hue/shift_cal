'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of[webkit,chromium]){const b=await engine.launch();for(const width of(process.env.GROUP_QUICK?[390]:[320,390,412])){
 const p=await b.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-11-01T12:00:00+09:00'));
 await p.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');});await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(process.env.TEST_URL||'http://127.0.0.1:8772/');await p.locator('#bnav-groups').tap();await p.waitForTimeout(80);
 assert.equal(await p.locator('#group-overview,#group-overview-title,#group-today,#header-group-actions').count(),0);assert.equal(await p.evaluate(()=>scrollY),0);

 for(const theme of['current','test','toss','gpt','dark','test1','test3','test4']){
  await p.evaluate(t=>{const s=document.getElementById('pref-theme');s.value=t;s.dispatchEvent(new Event('change'));scrollTo(0,0)},theme);
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const title=await p.locator('#group-month-title').boundingBox();assert(title.x>=0&&title.x+title.width<=width);
  assert.equal(await p.locator('#header-view-title').isVisible(),false);
  const titleMetrics=async id=>p.locator(id).evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);const r=range.getBoundingClientRect(),s=getComputedStyle(e);return{x:r.x,y:r.y,width:r.width,height:r.height,font:s.fontSize,weight:s.fontWeight,text:e.textContent}});
  const groupTitle=await titleMetrics('#group-month-title-text');
  await p.locator('#bnav-cal').tap();await p.evaluate(()=>scrollTo(0,0));
  const calendarTitle=await titleMetrics('#cal-month-title-text');
  assert.deepEqual(groupTitle,calendarTitle,JSON.stringify({theme,width,groupTitle,calendarTitle}));
  if(theme==='test'&&width===390&&engine.name()==='webkit')await p.screenshot({path:'/tmp/warmth-calendar-updated.png'});
  await p.locator('#bnav-groups').tap();await p.waitForTimeout(80);
  const card=await p.locator('.group-week-card').first().boundingBox(),nav=await p.locator('.bottom-nav').boundingBox();assert(card.y+card.height<nav.y);
  assert.equal(await p.locator('.group-week-heading h2').first().textContent(),'1주차');assert.equal(await p.locator('.group-week-range').first().textContent(),'11.1 – 11.7');assert.equal(await p.locator('.my-group .group-mine-label').count(),5);
  if(width===390&&engine.name()==='webkit')await p.screenshot({path:'/tmp/groups-final-'+theme+'.png'});
 }
 for(const lang of['en','zh','ja']){await p.evaluate(l=>AppI18n.setLanguage(l),lang);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.doesNotMatch(await p.locator('.group-week-heading h2').first().textContent(),/주차/);}await p.evaluate(()=>AppI18n.setLanguage('ko'));
 // Overrides use the same calculation as the table; a day with leave or no overtime is not summarized as a regular shift.
 await p.evaluate(()=>{localStorage.setItem('shift_overrides_C',JSON.stringify({'2026-11-01':'LEAVE'}));localStorage.setItem('shift_overrides_B',JSON.stringify({'2026-11-01':'NO_OT'}));window.dispatchEvent(new StorageEvent('storage',{key:'shift_overrides_C'}));});
 assert.equal(await p.locator('tr[data-group=C] td[data-date="2026-11-01"]').getAttribute('data-shift'),'LEAVE');assert.equal(await p.locator('tr[data-group=B] td[data-date="2026-11-01"]').getAttribute('data-shift'),'NO_OT');
 const before=await p.evaluate(()=>['A','B','C'].map(g=>localStorage.getItem('shift_overrides_'+g)));
 await p.clock.setFixedTime(new Date('2026-11-30T12:00:00+09:00'));
 for(const height of[844,640]){await p.setViewportSize({width,height});await p.locator('#bnav-cal').tap();await p.locator('#bnav-groups').tap();await p.waitForTimeout(80);
  const box=await p.locator('thead th.today').evaluate(e=>e.closest('.group-week-card').getBoundingClientRect().toJSON()),header=await p.locator('.reference-header').boundingBox(),nav=await p.locator('.bottom-nav').boundingBox();assert(box.y>=header.y+header.height-1,JSON.stringify({box,header}));assert(box.bottom<=nav.y+1,JSON.stringify({box,nav}));
 }
 // Account for the status-bar and home-indicator insets used by standalone iPhone views.
 await p.setViewportSize({width,height:520});await p.evaluate(()=>{document.querySelector('.reference-header').style.top='47px';document.querySelector('.bottom-nav').style.bottom='34px';document.body.style.paddingBottom='160px';GroupSchedule.focusToday()});await p.waitForTimeout(80);
 const safe=await p.evaluate(()=>{const r=document.querySelector('thead th.today').closest('.group-week-card').getBoundingClientRect(),h=document.querySelector('.reference-header').getBoundingClientRect(),n=document.querySelector('.bottom-nav').getBoundingClientRect();return {top:r.top,bottom:r.bottom,header:h.bottom,nav:n.top}});assert(safe.top>=safe.header&&safe.bottom<=safe.nav,JSON.stringify(safe));
 await p.evaluate(()=>{document.querySelector('.reference-header').style.removeProperty('top');document.querySelector('.bottom-nav').style.removeProperty('bottom');document.body.style.removeProperty('padding-bottom')});
 await p.setViewportSize({width,height:844});await p.evaluate(()=>{currentCalDate=new Date(2027,0,1);renderCalendar();scrollTo(0,0)});await p.locator('#group-month-title').tap();await p.getByRole('button',{name:'이번 달로 이동',exact:true}).tap();await p.waitForTimeout(80);assert.match(await p.locator('#group-month-title').getAttribute('aria-label'),/2026년 11월/);assert.equal(await p.locator('thead th.today').getAttribute('data-date'),'2026-11-30');
 // Returning after midnight refreshes today's overview without changing a browsed month.
 await p.clock.setFixedTime(new Date('2026-12-01T00:01:00+09:00'));await p.evaluate(()=>window.dispatchEvent(new Event('focus')));await p.locator('#group-month-title').tap();await p.getByRole('button',{name:'이번 달로 이동',exact:true}).tap();await p.waitForTimeout(80);assert.match(await p.locator('#group-month-title').getAttribute('aria-label'),/2026년 12월/);assert.equal(await p.evaluate(()=>scrollY),0);
 assert.deepEqual(await p.evaluate(()=>['A','B','C'].map(g=>localStorage.getItem('shift_overrides_'+g))),before);assert.deepEqual(errors,[]);await p.close();console.log('PASS aligned month header, no duplicate today controls, weekly cards, month-end focus, sticky controls, overrides, languages and date rollover',engine.name(),width);
 }await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
