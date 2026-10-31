'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require('playwright');
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();
 for(const theme of ['current','test3','test4']){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul',reducedMotion:'reduce'});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let accept=true;page.on('dialog',d=>accept?d.accept():d.dismiss());
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+09:00'));
  await page.addInitScript(theme=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme',theme);localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');if(!localStorage.getItem('memoTestInitialized')){localStorage.setItem('shift_day_memos',JSON.stringify({'2026-10-20':'기존 메모\n\n문단 유지'}));localStorage.setItem('memoTestInitialized','true');}},theme);
  await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:8772/');
  const parent=page.locator('#modal-override'),input=page.locator('#memo-compose-input');
  const open=async()=>{await page.locator('.cal-day[data-date="2026-10-20"] .day-num').tap();await page.evaluate(()=>DayEditorDesigns.showPane('memo'));};
  const save=async value=>{await input.fill(value);await page.locator('#memo-compose-save').tap();await page.waitForFunction(()=>!document.querySelector('#memo-compose-dialog').open);assert(!await parent.evaluate(e=>e.classList.contains('active')));await page.evaluate(()=>{const d=new Date(selectedDateStr+'T12:00');openOverrideModal(selectedDateStr,d,getActualShift(d,currentGroup));DayEditorDesigns.showPane('memo')});};
  await open();assert.equal(await page.locator('.memo-entry-row').count(),1);
  await page.locator('#memo-compose-open').tap();assert.equal(await input.inputValue(),'기존 메모');assert.equal(await page.locator('#memo-compose-details').inputValue(),'문단 유지');await page.locator('#memo-compose-list').tap();
  await page.evaluate(()=>setDayOverride('OFF'));
  await page.locator('#memo-compose-add').tap();assert.equal(await input.inputValue(),'');await save('두 번째 메모');
  assert.equal(await page.evaluate(()=>ShiftTools.pending()),undefined);assert.equal(await page.evaluate(()=>overrides['2026-10-20']),'OFF');
  assert.equal(await page.locator('.memo-entry-row').count(),2);assert.equal(await page.evaluate(()=>dayMemos['2026-10-20']),'기존 메모\n\n문단 유지\n\n두 번째 메모');
  await page.locator('.memo-entry-open').nth(1).tap();await save('수정한 두 번째');
  await page.locator('#memo-compose-add').tap();await input.fill('버릴 초안');await page.locator('#memo-compose-list').tap();assert.equal(await page.locator('.memo-entry-row').count(),2);
  accept=false;await page.locator('.memo-entry-delete').first().tap();assert.equal(await page.locator('.memo-entry-row').count(),2);accept=true;
  // Closing a saved day must not write or sync a second time.
  await page.evaluate(()=>{window.memoWrites=0;const old=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='shift_day_memos')window.memoWrites++;return old.call(this,k,v)};});
  if(engine===webkit)await page.screenshot({path:'/tmp/memo-list-'+theme+'.png'});
  await page.evaluate(()=>closeModalDirect());await page.waitForFunction(()=>!document.querySelector('#modal-override').classList.contains('active'));
  assert.equal(await page.evaluate(()=>memoWrites),0);assert.match(await page.locator('.cal-day[data-date="2026-10-20"]').textContent(),/수정한 두 번째/);
  await page.reload();await open();assert.equal(await page.locator('.memo-entry-row').count(),2);
  // Restoring an account snapshot preserves separate entries.
  await page.evaluate(()=>{const snapshot=AccountDataCore.normalize({shift_day_memos:dayMemos,shift_day_memo_items_v1:JSON.parse(localStorage.getItem('shift_day_memo_items_v1'))});localStorage.setItem('shift_day_memo_items_v1',JSON.stringify(snapshot.shift_day_memo_items_v1));MemoComposer.refresh();});
  assert.equal(await page.locator('.memo-entry-row').count(),2);
  await page.locator('.memo-entry-delete').first().tap();assert.equal(await page.evaluate(()=>dayMemos['2026-10-20']),'수정한 두 번째');
  await page.locator('#memo-compose-open').tap();await input.fill('보존할 초안');await page.evaluate(()=>{dayMemos['2026-10-20']='동기화된 메모';});await page.locator('#memo-compose-save').tap();assert.equal(await input.inputValue(),'보존할 초안');assert.equal(await page.evaluate(()=>dayMemos['2026-10-20']),'동기화된 메모');await page.locator('#memo-compose-list').tap();
  await page.locator('.memo-entry-delete').first().tap();assert.equal(await page.evaluate(()=>dayMemos['2026-10-20']),undefined);assert.equal(await page.locator('.memo-entry-delete').count(),0);
  assert.deepEqual(errors,[]);console.log(engine.name(),theme,'PASS legacy, multiple notes, edit/delete/cancel, single save, reload/account restore, remote-change guard');await page.close();
 }await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
