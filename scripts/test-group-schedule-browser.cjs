'use strict';
const assert=require('node:assert/strict');const{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of [webkit,chromium]){const browser=await engine.launch();for(const width of [320,390,412]){
 const page=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-26T12:00:00+09:00'));
 await page.addInitScript(()=>{if(localStorage.getItem('shift_active_group'))return;localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}));for(const[g,type]of[['A','OFF'],['B','DAY'],['C','LEAVE']])localStorage.setItem('shift_overrides_'+g,JSON.stringify({'2026-10-18':type}));});
 await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await page.goto(process.env.TEST_URL||'http://localhost:8768/');
 async function swipe(dx,dy=2,cancel=false){
  await page.locator('#group-weeks tbody button').first().evaluate((el,{dx,dy,cancel})=>{
   const fire=(name,x,y)=>{const e=new Event(name,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:name==='touchend'?[]:[{clientX:x,clientY:y}]},changedTouches:{value:[{clientX:x,clientY:y}]}});el.dispatchEvent(e)};
   fire('touchstart',160,200);fire('touchmove',160+dx,200+dy);fire(cancel?'touchcancel':'touchend',160+dx,200+dy);document.querySelector('#group-weeks tbody button').click();
  },{dx,dy,cancel});
  await page.waitForTimeout(450);
  assert.equal(await page.locator('#group-day-dialog').evaluate(e=>e.open),false);
 }
 const saved=await page.evaluate(()=>({group:currentGroup,overrides:JSON.stringify(overrides),storage:['A','B','C'].map(g=>localStorage.getItem('shift_overrides_'+g)),config:localStorage.getItem('shift_salary_config_master')}));
 assert.deepEqual(await page.locator('.nav-capsule>button').evaluateAll(els=>els.map(e=>e.id)),['bnav-cal','bnav-groups','bnav-pay','bnav-menu','account-menu-button']);
 await page.getByRole('button',{name:'조별 근무',exact:true}).click();assert.equal(await page.locator('#bnav-groups').getAttribute('aria-current'),'page');assert.equal(await page.locator('#header-view-title').textContent(),'조별 근무');assert.equal(await page.locator('#group-weeks table').count(),5);
 assert.equal(await page.locator('#group-prev,#group-next,#group-today,#group-mine-label').count(),0);
 assert(!((await page.locator('#view-groups').textContent()).includes('내 조')));
 assert.equal(await page.locator('#group-weeks .selected-date[data-date="2026-10-26"]').count(),4);
 assert.equal(await page.locator('thead [aria-current=date]').count(),1);
 // Drag from a date's button, not only from gaps between dates.
 await swipe(-100);assert.match(await page.locator('#group-month-title').textContent(),/2026\. 11/);
 await swipe(100);assert.match(await page.locator('#group-month-title').textContent(),/2026\. 10/);
 for(const theme of ['current','toss','gpt','dark','test']){
  await page.evaluate(t=>{const s=document.getElementById('pref-theme');s.value=t;s.dispatchEvent(new Event('change'))},theme);
  assert.equal(await page.locator('#group-weeks table').count(),5);
  assert.equal(await page.locator('thead .today .group-today-label').textContent(),'오늘');
  const marker=await page.locator('thead .today strong').evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,radius:getComputedStyle(el).borderRadius}));
  assert.equal(marker.background,theme==='dark'?'rgb(139, 184, 255)':theme==='test'?'rgb(75, 113, 98)':'rgb(49, 130, 246)');assert.equal(marker.radius,'50%');assert.notEqual(marker.color,marker.background);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert(await page.locator('.nav-capsule>button').evaluateAll(els=>els.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&r.right<=innerWidth})));
  for(const[g,type]of[['A','OFF'],['B','DAY'],['C','LEAVE']])assert.equal(await page.locator(`tr[data-group="${g}"] td[data-date="2026-10-18"]`).getAttribute('data-shift'),type);
  assert.equal(await page.locator('tbody tr.my-group').count(),5);
  assert.equal(await page.locator('tbody tr.my-group').first().getAttribute('data-group'),'C');
  if(width===390&&['current','test','dark'].includes(theme)){await page.locator('thead .today').scrollIntoViewIfNeeded();await page.screenshot({path:`/tmp/group-schedule-${theme}-${engine.name()}.png`,animations:'disabled'});}
 }
 for(const[g,type]of[['A','DAY'],['B','OFF'],['C','NIGHT']])assert.equal(await page.locator(`tr[data-group="${g}"] td[data-date="2026-10-01"]`).getAttribute('data-shift'),type);
 for(const[g,type]of[['A','OFF'],['B','SPECIAL_DAY'],['C','SPECIAL_NIGHT']])assert.equal(await page.locator(`tr[data-group="${g}"] td[data-date="2026-10-03"]`).getAttribute('data-shift'),type);
 // Both the date heading and any group cell show the same three-group detail.
 await page.locator('tr[data-group="B"] td[data-date="2026-10-18"] button').click();assert.equal(await page.locator('#group-day-dialog').evaluate(e=>e.open),true);assert.equal(await page.locator('#group-day-rows>.group-detail-row').count(),3);
 assert.match(await page.locator('#group-day-rows>.group-detail-row').first().textContent(),/C조.*연차/);assert.match(await page.locator('#group-day-title').textContent(),/10월 18일 일요일/);
 if(width===390)await page.screenshot({path:`/tmp/group-day-${engine.name()}.png`,animations:'disabled'});
 await page.keyboard.press('Escape');assert.equal(await page.locator('#group-day-dialog').evaluate(e=>e.open),false);
 assert.equal(await page.locator('#group-weeks .today[data-date="2026-10-26"]').count(),4,'today stays emphasized after selecting another date');
 assert.equal(await page.evaluate(()=>document.activeElement.closest('td')?.dataset.date),'2026-10-18');
 await page.locator('thead th[data-date="2026-10-03"] button').click();assert.match(await page.locator('#group-day-caption').textContent(),/개천절/);await page.locator('#group-day-dialog .sheet-dismiss-handle').click();
 // Month picker, 4/5/6 weeks, leap day and year rollover.
 await page.locator('#group-month-title').click();await page.getByRole('button',{name:'2026년 2월',exact:true}).click();assert.equal(await page.locator('#group-weeks table').count(),4);assert.equal(await page.locator('body').getAttribute('data-view'),'groups');
 await page.evaluate(()=>{currentCalDate=new Date(2026,4,1);renderCalendar()});assert.equal(await page.locator('#group-weeks table').count(),6);
 await page.evaluate(()=>{currentCalDate=new Date(2024,1,1);renderCalendar()});assert.equal(await page.locator('thead th[data-date="2024-02-29"]').count(),1);
 await page.evaluate(()=>{currentCalDate=new Date(2026,11,1);renderCalendar()});await swipe(-100);assert.match(await page.locator('#group-month-title').textContent(),/2027\. 01/);await swipe(100);assert.match(await page.locator('#group-month-title').textContent(),/2026\. 12/);
 await page.locator('#group-month-title').click();await page.getByRole('button',{name:'이번 달로 이동',exact:true}).click();assert.equal(await page.locator('body').getAttribute('data-view'),'groups');
 assert.match(await page.locator('#group-month-title').textContent(),/2026\. 10/);assert.equal(await page.locator('thead .today').getAttribute('data-date'),'2026-10-26');
 // Reuse the same pure shift calculation for every displayed date, including holidays and saved changes.
 assert(await page.evaluate(()=>[...document.querySelectorAll('#group-weeks tbody td')].every(td=>{const g=td.parentElement.dataset.group,[y,m,d]=td.dataset.date.split('-').map(Number),changes=JSON.parse(localStorage.getItem('shift_overrides_'+g)||'{}');return td.dataset.shift===getActualShift(new Date(y,m-1,d),g,changes).type})));
 assert.deepEqual(await page.evaluate(()=>({group:currentGroup,overrides:JSON.stringify(overrides),storage:['A','B','C'].map(g=>localStorage.getItem('shift_overrides_'+g)),config:localStorage.getItem('shift_salary_config_master')})),saved);
 // Account restoration updates other groups without leaking the active group's overrides.
 await page.evaluate(()=>{localStorage.setItem('shift_overrides_A',JSON.stringify({'2026-10-18':'NIGHT'}));refreshAccountData()});assert.equal(await page.locator('tr[data-group="A"] td[data-date="2026-10-18"]').getAttribute('data-shift'),'NIGHT');
 await page.evaluate(()=>{localStorage.setItem('shift_overrides_C',JSON.stringify({'2026-10-18':'HALF_PRE'}));window.dispatchEvent(new StorageEvent('storage',{key:'shift_overrides_C'}))});assert.equal(await page.locator('tr[data-group="C"] td[data-date="2026-10-18"]').getAttribute('data-shift'),'HALF_PRE');
 await page.locator('thead th[data-date="2026-10-18"] button').click();await page.locator('#group-open-calendar').click();assert.equal(await page.locator('body').getAttribute('data-view'),'calendar');assert.equal(await page.evaluate(()=>currentGroup),'C');assert.equal(await page.evaluate(()=>getActualShift(new Date(2026,9,18),currentGroup).type),'HALF_PRE');
 await page.locator('#bnav-pay').click();assert.equal(await page.locator('#view-payroll').isVisible(),true);await page.locator('#bnav-menu').click();assert.equal(await page.locator('#view-menu').isVisible(),true);await page.locator('#account-menu-button').click();assert.equal(await page.locator('#view-all').isVisible(),true);
 await page.locator('#bnav-groups').click();await page.setViewportSize({width,height:360});await page.locator('thead th[data-date="2026-10-26"] button').click();await page.locator('#group-open-calendar').scrollIntoViewIfNeeded();const button=await page.locator('#group-open-calendar').boundingBox();assert(button.y>=0&&button.y+button.height<=361);await page.locator('#group-day-dialog .sheet-dismiss-handle').click();
 assert.deepEqual(errors,[]);console.log(engine.name(),width,'PASS 5-theme comparison, group isolation, date detail, month navigation, restore, 5-tab navigation, short screen');await page.close();
 }await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
