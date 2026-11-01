'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 for(const engine of [webkit,chromium]){
  const browser=await engine.launch();
  for(const width of (process.env.DESIGN_TEST_QUICK?[390]:[320,390]))for(const theme of ['current','test3','test4']){
   const page=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Seoul'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+09:00'));
   await page.addInitScript(theme=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme',theme);localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}));},theme);
   await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
   let accept=true;page.on('dialog',d=>accept?d.accept():d.dismiss());
   await page.goto(process.env.TEST_URL||'http://127.0.0.1:8771/');
   const open=async(day='20')=>{await page.locator(`.cal-day[data-date="2026-10-${day}"] .day-num`).click();await page.waitForFunction(()=>document.body.classList.contains('work-editor-open'));await page.waitForTimeout(250)};
   const save=()=>page.locator(theme==='test3'?'#design-done':'#apply-preview').click();
   const closed=()=>page.waitForFunction(()=>!document.getElementById('modal-override').classList.contains('active'));
   const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C')||'{}'));
   await open();assert.equal(await page.locator('#modal-override').getAttribute('data-editor-design'),theme==='test3'?'apple':theme==='test4'?'kakao':'toss');
   const chosenType=theme==='current'?'OFF':'NIGHT';const choice=page.locator('#work-panel [data-override="'+chosenType+'"]');await choice.click();assert.equal((await read())['2026-10-20'],undefined);
   assert.equal(await choice.getAttribute('aria-pressed'),'true');
   const target=theme==='test3'?'#design-done':'#apply-preview';const bounds=await page.locator(target).boundingBox();assert(bounds.y>=0&&bounds.y+bounds.height<=844);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   // Memo completion commits the pending work and note in one action.
   await page.locator('.design-memo-link').click();await page.locator('#memo-compose-open').click();await page.locator('#memo-compose-input').fill('새 디자인 메모');await page.locator('#memo-compose-save').click();await closed();assert.equal((await read())['2026-10-20'],chosenType);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_day_memos'))['2026-10-20']),'새 디자인 메모');
   await open();await page.locator('.design-reset').click();await save();await closed();assert.equal((await read())['2026-10-20'],undefined);
   // Cancelling a dismissal preserves drafts; accepting discards them without saving.
   await open();await page.locator('#work-panel [data-override="OFF"]').click();accept=false;await page.locator('#design-back').click();assert(await page.locator('#modal-override').evaluate(e=>e.classList.contains('active')));assert.equal((await read())['2026-10-20'],undefined);accept=true;await page.locator('#design-back').click();await closed();
   await open();if(!await page.locator('.design-attendance').evaluate(e=>e.open))await page.locator('.design-attendance>summary').click();await page.locator('[data-override="LEAVE"]').click();await save();await closed();assert.equal((await read())['2026-10-20'],'LEAVE');
   // Off days retain the original attendance/OT restrictions.
   await open('22');assert(await page.locator('[data-override="LEAVE"]').isDisabled());assert(await page.locator('[data-override="NO_OT"]').isHidden());await page.locator('#design-back').click();await closed();
   if(theme!=='current'){await open();if(theme==='test4')await page.locator('#kakao-next-day').click();else await page.locator('.design-week-day[data-date="2026-10-21"]').click();assert.equal(await page.evaluate(()=>selectedDateStr),'2026-10-21');await page.locator('#design-back').click();await closed();}
   // Extras stay reachable and commit via the existing validator.
   await open();if(theme==='current')await page.locator('.design-extra>summary').click();await page.locator('[data-override="NO_OT"]').click();await save();await closed();assert.equal((await read())['2026-10-20'],'NO_OT');
   // Sticker picker and event editor remain available.
   await open();await page.locator('#editor-sticker-preview').click();assert(await page.locator('#sticker-dialog').isVisible());await page.evaluate(()=>CalendarStickers.close());await page.locator('.design-memo-link').click();await page.locator('#event-add').click();await page.locator('#event-title').fill('새 화면 일정');await page.locator('#event-save').click();assert(await page.locator('#event-list').getByText('새 화면 일정',{exact:true}).isVisible());await page.locator('#design-back').click();await page.locator('#design-back').click();await closed();
   // A short viewport must scroll its content while keeping completion reachable.
   await page.setViewportSize({width,height:360});await open();await page.locator('.design-memo-link').click();await page.locator('#memo-compose-open').click();await page.locator('#memo-compose-input').fill('작은 화면에서도 저장');const small=await page.locator('#memo-compose-save').boundingBox();assert(small.y>=0&&small.y+small.height<=360);await page.locator('#memo-compose-save').click();await closed();
   assert.deepEqual(errors,[]);console.log(engine.name(),width,theme,'PASS layout, staged work+memo save, reset, discard, leave, restrictions, date navigation, OT, sticker, events, short screen');await page.close();
  }
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});
