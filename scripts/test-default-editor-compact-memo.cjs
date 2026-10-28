'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require('playwright');
(async()=>{for(const engine of [webkit,chromium]){const browser=await engine.launch();for(const width of [320,390]){
 const page=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Seoul'});page.setDefaultTimeout(10000);
 await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+09:00'));
 await page.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme','current');localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));});
 await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));page.on('dialog',d=>d.accept());
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:8771/');
 const open=async day=>{await page.locator(`.cal-day[data-date="2026-10-${day}"] .day-num`).click();await page.waitForTimeout(250)};
 const close=async()=>{await page.evaluate(()=>closeModalDirect());await page.waitForFunction(()=>!document.querySelector('#modal-override').classList.contains('active'))};
 await open('20');assert(await page.locator('[data-override="DAY"]').isVisible());assert(await page.locator('[data-override="NIGHT"]').isHidden());await close();
 await open('27');assert(await page.locator('[data-override="NIGHT"]').isVisible());assert(await page.locator('[data-override="DAY"]').isHidden());await close();
 await open('22');assert(await page.locator('[data-override="DAY"]').isVisible());assert(await page.locator('[data-override="NIGHT"]').isVisible());await close();
 await open('20');await page.locator('.design-memo-link').click();
 const geometry=async()=>page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};return {sheet:box('.override-sheet'),input:box('#modal-memo-input'),content:box('.editor-content'),footer:box('.design-footer')};});
 let g=await geometry();assert(g.sheet.height<550&&g.sheet.top>250,JSON.stringify(g));assert.equal(g.input.height,112);assert(Math.abs(g.footer.top-g.content.bottom)<2);assert(g.footer.bottom<=845);
 const memo='긴 메모\n'.repeat(150);await page.locator('#modal-memo-input').fill(memo);g=await geometry();assert.equal(g.input.height,112);assert(g.sheet.height<550);assert(await page.locator('#modal-memo-input').evaluate(e=>e.scrollHeight>e.clientHeight));
 if(width===390)await page.screenshot({path:'/tmp/default-compact-memo-'+engine.name()+'.png',animations:'disabled'});
 await page.locator('#apply-preview').click();await page.waitForFunction(()=>!document.querySelector('#modal-override').classList.contains('active'));assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_day_memos'))['2026-10-20']),memo.trim());assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C')||'{}')['2026-10-20']),undefined);
 // A saved opposite shift is preserved; filtering only simplifies future choices.
 await page.evaluate(()=>{overrides['2026-10-20']='NIGHT';saveOverrides();renderCalendar();});await open('20');await page.locator('.design-memo-link').click();await page.locator('#modal-memo-input').fill('기존 근무 보존');await page.locator('#event-add').click();assert((await geometry()).sheet.height>550);await page.locator('#event-cancel').click();assert((await geometry()).sheet.height<550);await page.locator('#apply-preview').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-20']),'NIGHT');
 console.log(engine.name(),width,'PASS base-aware choices, compact memo, bounded long text, note save, event form, existing override preservation');await page.close();
 }await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
