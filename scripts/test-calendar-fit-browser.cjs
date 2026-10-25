'use strict';
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();
 for(const [width,height]of [[320,568],[390,844],[412,915]]){
 const page=await browser.newPage({viewport:{width,height},timezoneId:'Asia/Seoul'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date('2026-10-25T12:00:00+09:00'));
 await page.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme','test');localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}));});
 await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await page.goto(process.env.TEST_URL||'http://localhost:8768/');
 const theme=t=>page.evaluate(t=>{const e=document.getElementById('pref-theme');e.value=t;e.dispatchEvent(new Event('change'));},t);
 const grid=page.locator('#calendar-grid');
 for(const month of [9,4,1]){
  await page.evaluate(m=>{currentCalDate=new Date(2026,m,1);renderCalendar()},month);
  await theme('current');const baseline=await grid.boundingBox();await theme('test');const actual=await grid.boundingBox();
  assert(Math.abs(actual.width-baseline.width)<=3,JSON.stringify({baseline,actual}));assert(Math.abs(actual.height-baseline.height)<=3,JSON.stringify({baseline,actual}));
  assert.equal(await page.locator('.routine-calendar-toolbar').isVisible(),false);
  assert.equal(await page.locator('.calendar-test-summary').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('.cal-day:not(.other-month)').first().evaluate(e=>getComputedStyle(e).borderRightWidth),'1px');
 }
 await page.evaluate(()=>{currentCalDate=new Date(2026,9,1);overrides['2026-10-03']='LEAVE';dayMemos['2026-10-03']='공휴일 메모 확인';renderCalendar()});
 const cell=page.locator('.cal-day[data-date="2026-10-03"]');const date=await cell.locator('.day-num').boundingBox(),hol=await cell.locator('.holiday-bar').boundingBox();assert(hol.y>=date.y+date.height-1);
 await cell.locator('.memo-tag').click();assert.equal(await page.locator('#memo-tab').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#modal-memo-input').inputValue(),'공휴일 메모 확인');await page.getByRole('button',{name:'근무 변경 내리기',exact:true}).click();
 if(width===390){await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`/tmp/calendar-shared-form-${engine.name()}.png`,animations:'disabled'});}
 assert.deepEqual(errors,[]);console.log(engine.name(),width,'PASS shared 4/5/6-week dimensions, borders, holiday order, memo, overflow');await page.close();
 }await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
