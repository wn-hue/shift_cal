'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();
 for(const width of [320,390])for(const theme of ['current','toss','gpt','dark','test']){
  if(process.env.WORK_TEST_QUICK&&(width!==390||!['current','test'].includes(theme)))continue;
  const page=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Seoul'});
  await page.clock.setFixedTime(new Date('2026-10-24T12:00:00+09:00'));
  await page.addInitScript(({theme})=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme',theme);localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}))},{theme});
  await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.TEST_URL||'http://localhost:8768/');
  const weekendColors=await page.locator('.cal-weekdays').evaluate(el=>[getComputedStyle(el.firstElementChild).color,getComputedStyle(el.lastElementChild).color]);assert.deepEqual(weekendColors,theme==='dark'?['rgb(255, 139, 152)','rgb(138, 185, 255)']:theme==='test'?['rgb(166, 77, 90)','rgb(78, 111, 147)']:['rgb(229, 72, 77)','rgb(49, 130, 246)']);
  const open=async day=>{await page.locator(`.cal-day[data-date="2026-10-${day}"] .day-num`).click();await page.waitForFunction(()=>{const r=document.querySelector('.override-sheet').getBoundingClientRect();return document.body.classList.contains('work-editor-open')&&r.y>=0&&r.bottom<=innerHeight+1})};
  await open('01');assert.equal(await page.locator('#work-panel .shift-scroll .opt-btn').count(),14);
  const sheet=await page.locator('.override-sheet').boundingBox();assert(sheet.height>=600&&sheet.height<=640&&sheet.y>=200&&sheet.y+sheet.height<=845,JSON.stringify(sheet));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const sticker=await page.locator('#editor-sticker-preview').boundingBox(),reset=await page.locator('.override-header .override-reset').boundingBox();assert(reset.y>=sticker.y+sticker.height&&reset.x+reset.width<=width,JSON.stringify({sticker,reset}));
  const rails=page.locator('#work-panel .shift-scroll');assert.equal(await rails.count(),2);
  for(const rail of await rails.all()){
   const info=await rail.evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth,ys:[...el.children].filter(e=>!e.hidden).map(e=>Math.round(e.getBoundingClientRect().y))}));assert(info.scroll>info.width,JSON.stringify(info));assert.equal(new Set(info.ys).size,1);
   await rail.locator('button').last().scrollIntoViewIfNeeded();assert(await rail.evaluate(e=>e.scrollLeft>0));
   await rail.evaluate(e=>e.scrollLeft=0);
  }
  assert.equal(await page.getByRole('button',{name:'기본 근무로 복구',exact:true}).evaluate(e=>getComputedStyle(e).color),theme==='test'?'rgb(78, 111, 147)':'rgb(27, 100, 218)');
  const palette=await page.evaluate(()=>{const row=document.querySelector('#work-panel .shift-scroll'),classes=['day','night','off','special special-day','special special-night'];const grid=document.getElementById('calendar-grid'),cell=document.createElement('div');cell.className='cal-day';const badge=document.createElement('div');cell.append(badge);grid.append(cell);try{return classes.map((c,i)=>{badge.className='shift-badge '+c;const a=getComputedStyle(badge),b=getComputedStyle(row.children[i]);return row.children[i].hidden?null:[a.backgroundColor,a.color,b.backgroundColor,b.color]})}finally{cell.remove()}});assert(palette.filter(Boolean).every(([a,b,c,d])=>a===c&&b===d),JSON.stringify(palette));
  if(width===390&&['current','dark','test'].includes(theme))await page.screenshot({animations:'disabled',path:`/tmp/compact-work-${theme}-${engine.name()}.png`});
  await page.locator('#work-panel .opt-btn.no-ot').click();assert.equal(await page.evaluate(()=>localStorage.getItem('shift_overrides_C')),null);await page.locator('#apply-preview').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-01']),'NO_OT');
  await open('01');await page.getByRole('button',{name:'기본 근무로 복구',exact:true}).click();await page.locator('#apply-preview').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-01']),undefined);
  await open('01');await page.locator('#work-panel .opt-btn.leave').click();await page.locator('#apply-preview').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-01']),'LEAVE');
  await open('01');await page.getByRole('tab',{name:'메모',exact:true}).click();await page.locator('#modal-memo-input').fill('근무 변경 창에서도 메모 유지');await page.getByRole('button',{name:'메모 저장',exact:true}).click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_day_memos'))['2026-10-01']),'근무 변경 창에서도 메모 유지');
  await open('01');await page.locator('#work-panel .opt-btn.off').click();await page.locator('#apply-preview').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-01']),'OFF');
  await open('04');assert.equal(await page.locator('#work-panel .opt-btn.leave').isDisabled(),true);await page.getByRole('button',{name:'근무 변경 내리기',exact:true}).click();
  await page.setViewportSize({width,height:360});await open('01');await page.locator('#work-panel .opt-btn.unpaid-half').last().scrollIntoViewIfNeeded();const last=await page.locator('#work-panel .opt-btn.unpaid-half').last().boundingBox();assert(last.y>=0&&last.y+last.height<=361);await page.getByRole('button',{name:'근무 변경 내리기',exact:true}).click();await page.waitForFunction(()=>!document.body.classList.contains('work-editor-open'));
  console.log(engine.name(),width,theme,'PASS partial-height card, horizontal rails, matching colors, all choices, shift/leave save, restore, off-day restriction, memo and short screen');await page.close();
 }
 await browser.close();
}})().catch(error=>{console.error(error);process.exit(1)});
