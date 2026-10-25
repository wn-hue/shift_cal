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
  const open=async day=>{await page.locator(`.cal-day[data-date="2026-10-${day}"]`).click();await page.waitForFunction(()=>document.body.classList.contains('work-editor-open'))};
  await open('01');assert.equal(await page.locator('#work-panel .opt-btn').count(),11);
  const geometry=await page.locator('#modal-override .override-sheet').evaluate(el=>({height:el.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth}));assert(geometry.height<560,JSON.stringify(geometry));assert.equal(geometry.overflow,false);
  const choices=await page.locator('#work-panel .opt-btn').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height,radius:getComputedStyle(e).borderRadius,bottom:r.bottom,left:r.left,right:r.right}}));const sheet=await page.locator('.override-sheet').boundingBox();assert(choices.every(r=>r.height>=44&&(theme==='test'?r.width>=44&&r.radius==='0px':Math.abs(r.width-r.height)<1&&r.radius==='50%')&&r.bottom<=sheet.y+sheet.height&&r.left>=0&&r.right<=width),JSON.stringify(choices));
  if(width===390&&['current','dark'].includes(theme))await page.screenshot({animations:'disabled',path:`/tmp/compact-work-${theme}-${engine.name()}.png`});
  await page.locator('#work-panel .opt-btn.no-ot').click();assert.equal(await page.evaluate(()=>localStorage.getItem('shift_overrides_C')),null);await page.locator('#apply-preview').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-01']),'NO_OT');
  await open('01');await page.getByRole('button',{name:'기본 근무로 복구',exact:true}).click();await page.locator('#apply-preview').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-01']),undefined);
  await open('01');await page.locator('#work-panel .opt-btn.leave').click();await page.locator('#apply-preview').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-01']),'LEAVE');
  await open('01');await page.getByRole('tab',{name:'메모',exact:true}).click();await page.locator('#modal-memo-input').fill('근무 변경 창에서도 메모 유지');await page.getByRole('button',{name:'메모 저장',exact:true}).click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_day_memos'))['2026-10-01']),'근무 변경 창에서도 메모 유지');
  await open('04');assert.equal(await page.locator('#work-panel .opt-btn.leave').isDisabled(),true);await page.getByRole('button',{name:'근무 변경 닫기',exact:true}).click();
  await page.setViewportSize({width,height:360});await open('01');await page.locator('#work-panel .opt-btn.unpaid-half').last().scrollIntoViewIfNeeded();const last=await page.locator('#work-panel .opt-btn.unpaid-half').last().boundingBox();assert(last.y>=0&&last.y+last.height<=361);await page.getByRole('button',{name:'근무 변경 닫기',exact:true}).click();await page.waitForFunction(()=>!document.body.classList.contains('work-editor-open'));
  console.log(engine.name(),width,theme,'PASS compact layout, all choices, shift/leave save, restore, off-day restriction, memo and short screen');await page.close();
 }
 await browser.close();
}})().catch(error=>{console.error(error);process.exit(1)});
