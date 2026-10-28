'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();
 for(const width of [320,390])for(const theme of ['current','toss','gpt','dark','test','test1','test3','test4']){
  if(process.env.WORK_TEST_QUICK&&(width!==390||!(process.env.WORK_TEST_THEMES||'current,test,test1,test3,test4').split(',').includes(theme)))continue;
  const page=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Seoul'});
  await page.clock.setFixedTime(new Date('2026-10-24T12:00:00+09:00'));
  await page.addInitScript(({theme})=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme',theme);localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}))},{theme});
  await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.TEST_URL||'http://localhost:8768/');
  const weekendColors=await page.locator('.cal-weekdays').evaluate(el=>[getComputedStyle(el.firstElementChild).color,getComputedStyle(el.lastElementChild).color]);assert.deepEqual(weekendColors,theme==='dark'?['rgb(255, 139, 152)','rgb(138, 185, 255)']:theme==='test'?['rgb(174, 88, 100)','rgb(82, 123, 153)']:theme==='test1'?['rgb(193, 75, 94)','rgb(66, 118, 173)']:theme==='test3'?['rgb(207, 72, 69)','rgb(78, 116, 150)']:theme==='test4'?['rgb(173, 86, 98)','rgb(75, 114, 145)']:['rgb(229, 72, 77)','rgb(49, 130, 246)']);
  const open=async day=>{await page.locator(`.cal-day[data-date="2026-10-${day}"] .day-num`).click();await page.waitForFunction(()=>{const r=document.querySelector('.override-sheet').getBoundingClientRect();return document.body.classList.contains('work-editor-open')&&r.y>=0&&r.bottom<=innerHeight+1})};
  await open('01');assert.equal(await page.locator('#work-panel .shift-scroll .opt-btn').count(),14);
  await page.waitForTimeout(280);const sheet=await page.locator('.override-sheet').boundingBox();assert(sheet.height>=500&&sheet.height<=780&&sheet.y>=60&&sheet.y+sheet.height<=845,JSON.stringify(sheet));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const emptySpace=await page.locator('#editor-swipe-space').evaluate(e=>e.getBoundingClientRect().height);assert(emptySpace>=44&&emptySpace<=46);

  const sticker=await page.locator('#editor-sticker-preview').boundingBox(),reset=await page.locator('.override-header .override-reset').boundingBox();assert(reset.y>=sticker.y+sticker.height&&reset.x+reset.width<=width,JSON.stringify({sticker,reset}));
  const rails=page.locator('#work-panel .shift-scroll');assert.equal(await rails.count(),2);
  assert(await page.locator('#work-panel .work-section-heading').isVisible());
  assert.equal(await page.locator('.override-sheet>.editor-tabs').evaluate(e=>getComputedStyle(e,'::before').display),'none');
  const attendance=await page.locator('.attendance-choices button:visible').first().evaluate(e=>{const r=e.getBoundingClientRect();return{width:r.width,height:r.height,radius:getComputedStyle(e).borderRadius}});assert(attendance.width>=76&&attendance.height===46&&attendance.radius==='14px',JSON.stringify(attendance));
  const columns=await rails.evaluateAll(rows=>rows.map(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length));assert.deepEqual(columns,[3,2]);
  for(const rail of await rails.all()){
   assert(await rail.evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   for(const card of await rail.locator('button:visible').all()){
    await card.scrollIntoViewIfNeeded();assert(await card.evaluate(e=>{const r=e.getBoundingClientRect(),p=document.querySelector('.editor-content').getBoundingClientRect();return r.top>=p.top-1&&r.bottom<=p.bottom+1}));
   }
  }
  assert.equal(await page.getByRole('button',{name:'기본 근무로 복구',exact:true}).evaluate(e=>getComputedStyle(e).color),theme==='test'?'rgb(137, 107, 69)':theme==='test1'?'rgb(34, 113, 233)':theme==='test3'?'rgb(217, 54, 50)':theme==='test4'?'rgb(89, 69, 56)':'rgb(27, 100, 218)');
  const palette=await page.evaluate(()=>{const row=document.querySelector('#work-panel .shift-scroll'),classes=['day','night','off','special special-day','special special-night'];const grid=document.getElementById('calendar-grid'),cell=document.createElement('div');cell.className='cal-day';const badge=document.createElement('div');cell.append(badge);grid.append(cell);try{return classes.map((c,i)=>{badge.className='shift-badge '+c;const a=getComputedStyle(badge),b=getComputedStyle(row.children[i]);return row.children[i].hidden?null:[a.backgroundColor,a.color,b.backgroundColor,b.color]})}finally{cell.remove()}});assert(palette.filter(Boolean).every(([a,b,c,d])=>a===c&&b===d),JSON.stringify(palette));
  if(width===390&&['current','dark','test'].includes(theme))await page.screenshot({animations:'disabled',path:`/tmp/compact-work-${theme}-${engine.name()}.png`});
  await page.locator('#work-panel .opt-btn.no-ot').click();assert.equal(await page.evaluate(()=>localStorage.getItem('shift_overrides_C')),null);await page.locator('#apply-preview').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-01']),'NO_OT');
  await open('01');await page.getByRole('button',{name:'기본 근무로 복구',exact:true}).click();await page.locator('#apply-preview').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-01']),undefined);
  await open('01');await page.locator('#work-panel .opt-btn.leave').click();await page.locator('#apply-preview').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-01']),'LEAVE');
  await open('01');await page.getByRole('tab',{name:'메모',exact:true}).click();assert(await page.locator('#day-note').evaluate(e=>!!(e.compareDocumentPosition(document.querySelector('.day-agenda'))&Node.DOCUMENT_POSITION_FOLLOWING)));await page.locator('#modal-memo-input').fill('근무 변경 창에서도 메모 유지');await page.getByRole('button',{name:'메모 저장',exact:true}).click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_day_memos'))['2026-10-01']),'근무 변경 창에서도 메모 유지');
  await open('01');await page.locator('#work-panel .opt-btn.off').click();await page.locator('#apply-preview').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-01']),'OFF');
  await open('04');await page.locator('.override-sheet').evaluate(async e=>Promise.all(e.getAnimations().map(a=>a.finished.catch(()=>{}))));const shortSheet=await page.locator('.override-sheet').boundingBox();assert(shortSheet.height<sheet.height-50&&shortSheet.height<=560,JSON.stringify({sheet,shortSheet}));assert.equal(await page.locator('#work-panel .opt-btn.leave').isDisabled(),true);await page.getByRole('button',{name:'근무 변경 내리기',exact:true}).click();
  await page.setViewportSize({width,height:360});await open('01');await page.locator('#work-panel .opt-btn.unpaid-half').last().scrollIntoViewIfNeeded();const last=await page.locator('#work-panel .opt-btn.unpaid-half').last().boundingBox();assert(last.y>=0&&last.y+last.height<=361);await page.getByRole('button',{name:'근무 변경 내리기',exact:true}).click();await page.waitForFunction(()=>!document.body.classList.contains('work-editor-open'));
  console.log(engine.name(),width,theme,'PASS partial-height card, card grids, matching colors, all choices, shift/leave save, restore, off-day restriction, memo and short screen');await page.close();
 }
 await browser.close();
}})().catch(error=>{console.error(error);process.exit(1)});
