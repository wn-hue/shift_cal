'use strict';
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 for(const engine of [webkit,chromium]){
  const browser=await engine.launch();
  for(const [width,height,oldTheme] of [[320,568,'routine'],[390,844,'google'],[412,915,'test']]){
   const page=await browser.newPage({viewport:{width,height},timezoneId:'Asia/Seoul'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.clock.setFixedTime(new Date('2026-10-25T12:00:00+09:00'));
   await page.addInitScript(oldTheme=>{
    if(localStorage.getItem('shift_active_group'))return;
    localStorage.setItem('shift_active_group','C');
    localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}));
    localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));
    localStorage.setItem('shift_display_theme',oldTheme);
   },oldTheme);
   await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
   await page.goto(process.env.TEST_URL||'http://localhost:8768/');
   assert.deepEqual(await page.locator('#pref-theme option').evaluateAll(els=>els.map(e=>e.value)),['current','toss','gpt','dark','test']);
   assert.equal(await page.locator('#pref-theme option[value=test]').textContent(),'5. 테스트');
   assert.equal(await page.locator('body').getAttribute('data-pref-theme'),'test');
   assert.equal(await page.evaluate(()=>localStorage.getItem('shift_display_theme')),'test');
   const setTheme=theme=>page.evaluate(t=>{const el=document.getElementById('pref-theme');el.value=t;el.dispatchEvent(new Event('change'));},theme);
   assert.equal(await page.locator('.calendar-test-summary').count(),0,'No redundant statistics on the calendar');
   const grid=page.locator('#calendar-grid');
   for(const month of [9,4]){
    await page.evaluate(m=>{currentCalDate=new Date(2026,m,1);renderCalendar()},month);
    await setTheme('current');
    const baseline=await grid.boundingBox();
    assert.equal(await page.locator('.routine-calendar-toolbar').isVisible(),false);
    assert.equal(await page.locator('.shift-badge.day').first().textContent(),'주');
    await setTheme('test');
    const size=await grid.boundingBox();
    assert(Math.abs(size.width-baseline.width)<3);
    assert(size.height>=440&&size.height<=baseline.height+1,JSON.stringify({width,height,month,size,baseline}));
    assert.equal(await page.locator('.cal-day').count(),month===9?35:42);
    assert.equal(await page.locator('.shift-badge.day').first().textContent(),'주간');
    for(const shape of ['square','circle']){
     await page.evaluate(shape=>{const el=document.getElementById('pref-shape');el.value=shape;el.dispatchEvent(new Event('change'));},shape);
     assert.equal(await grid.locator('.shift-badge.day').first().evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    await page.evaluate(()=>document.fonts.ready);
    if(width===390)await page.screenshot({animations:'disabled',path:`/tmp/test-calendar-${engine.name()}-${month===9?'five':'six'}.png`});
   }
   await page.locator('.routine-today').click();
   const initialHeight=(await grid.boundingBox()).height;
   assert.equal(await page.locator('#cal-month-title-text').textContent(),'2026. 10');
   await page.getByRole('button',{name:'다음 달',exact:true}).click();
   assert.equal(await page.locator('#cal-month-title-text').textContent(),'2026. 11');
   await page.locator('.routine-today').click();
   await page.locator('.cal-day[data-date="2026-10-01"]').click();
   await page.locator('#work-panel .opt-btn.leave').click();await page.locator('#apply-preview').click();
   assert.equal(await page.locator('.cal-day[data-date="2026-10-01"] .attendance-pill').textContent(),'연차 1');
   await page.evaluate(()=>{overrides['2026-10-02']='HALF_PRE';localStorage.setItem('shift_overrides_C',JSON.stringify(overrides));dayMemos['2026-10-02']='메모 내용이 길어도 날짜와 근무를 읽을 수 있어요';localStorage.setItem('shift_day_memos',JSON.stringify(dayMemos));renderCalendar();});
   assert.equal(await page.locator('.cal-day[data-date="2026-10-02"] .attendance-pill').textContent(),'반차 전');
   await page.evaluate(()=>{overrides['2026-10-03']='LEAVE';dayMemos['2026-10-03']='공휴일에도 연차와 메모를 함께 표시';renderCalendar();});
   const crowded=page.locator('.cal-day[data-date="2026-10-03"]');
   const crowdedBox=await crowded.boundingBox(),holidayBox=await crowded.locator('.holiday-bar').boundingBox();
   assert(holidayBox.y+holidayBox.height<=crowdedBox.y+crowdedBox.height,'Holiday + attendance + note fit inside the day');
   assert((await grid.boundingBox()).height<=initialHeight+1,'Attendance and memo must not stretch month rows');
   assert.equal(await page.locator('.cal-day[data-date="2026-10-02"] .attendance-pill').textContent(),'반차 전');
   await page.locator('.cal-day[data-date="2026-10-02"]').click();await page.getByRole('tab',{name:'메모',exact:true}).click();
   assert.match(await page.locator('#modal-memo-input').inputValue(),/메모 내용/);await page.getByRole('button',{name:'근무 변경 닫기',exact:true}).click();
   await page.reload();assert.equal(await page.locator('body').getAttribute('data-pref-theme'),'test');
   assert.equal(await page.locator('.cal-day[data-date="2026-10-02"] .attendance-pill').textContent(),'반차 전');
   if(width===390)await page.screenshot({animations:'disabled',path:`/tmp/test-calendar-${engine.name()}-edited.png`});
   // The shared month picker must still work for calendar AND payroll.
   await page.locator('#cal-month-title-btn').click();
   assert.equal(await page.locator('#picker-title-text').textContent(),'월 선택');
   assert.equal(await page.locator('.picker-month-btn[aria-pressed=true]').getAttribute('aria-label'),'2026년 10월');
   await page.getByRole('button',{name:'다음 연도',exact:true}).click();
   await page.getByRole('button',{name:'2027년 2월',exact:true}).click();
   assert.equal(await page.locator('#cal-month-title-text').textContent(),'2027. 02');
   await page.locator('.routine-today').click();
   await page.evaluate(()=>switchView('payroll'));
   await page.locator('#pay-month-title-btn').click();
   assert.equal(await page.locator('#picker-title-text').textContent(),'급여 월 선택');
   await page.locator('#modal-year-month-picker .modal-sheet').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
   const picker=await page.locator('#modal-year-month-picker .modal-sheet').boundingBox();
   assert(picker.x>=0&&picker.y>=0&&picker.x+picker.width<=width+1&&picker.y+picker.height<=height+1,JSON.stringify({picker,width,height}));
   await page.getByRole('button',{name:'2026년 11월',exact:true}).click();
   assert.match(await page.locator('#pay-month-title').textContent(),/2026년 11월/);
   await page.evaluate(()=>switchView('calendar'));
   await page.locator('.routine-today').click();
   await page.getByRole('button',{name:'월 근무 통계',exact:true}).click();
   assert.equal(await page.locator('#modal-month-stats').evaluate(e=>e.classList.contains('active')),true);
   assert.notEqual(await page.locator('#modal-pill-day').textContent(),'');
   await page.getByRole('button',{name:'근무 통계 닫기',exact:true}).click();
   assert.deepEqual(errors,[]);await page.close();
   console.log(engine.name(),width,height,'PASS removed themes / migration / 5-6 rows / no summary / half-day edits / calendar + payroll picker / statistics / memo / persistence');
  }
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exit(1)});
