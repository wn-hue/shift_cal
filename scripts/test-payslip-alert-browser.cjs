'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.TEST_URL||'http://localhost:8768/';
const ack='shift_payslip_ack_v2_2026-10-22';
async function setup(browser,date,{legacy=false,dismissed=false}={}){
 const page=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul'});
 await page.clock.setFixedTime(new Date(date));
 await page.addInitScript(({legacy,dismissed,ack})=>{
  if(localStorage.getItem('test_seeded'))return;
  localStorage.setItem('test_seeded','1');
  localStorage.setItem('shift_active_group','C');
  localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));
  localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}));
  if(legacy)localStorage.setItem('shift_payslip_alert_shown_2026-10-22','true');
  if(dismissed)localStorage.setItem(ack,'true');
 },{legacy,dismissed,ack});
 await page.route('**/api/**',route=>route.fulfill({json:{configured:false}}));
 await page.goto(url);return page;
}
const active=page=>page.locator('#modal-payslip-alert').evaluate(el=>el.classList.contains('active'));
const waitOpen=page=>page.waitForFunction(()=>document.getElementById('modal-payslip-alert').classList.contains('active'));
(async()=>{
 for(const engine of [webkit,chromium]){
  const browser=await engine.launch();
  // Holiday/weekend adjustment: Sunday 25 -> Friday 23, statement Thursday 22.
  const page=await setup(browser,'2026-10-22T00:00:00+09:00',{legacy:true});
  await waitOpen(page);
  assert.match(await page.locator('#payslip-modal-payday').innerText(),/2026년 10월 23일/);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),ack),null,'Opening is not acknowledgement');
  await page.reload();await waitOpen(page);
  await page.screenshot({animations:'disabled',path:`/tmp/payslip-alert-${engine.name()}.png`});
  await page.getByRole('button',{name:'명세서 닫기',exact:true}).click();
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),ack),'true');
  await page.reload();assert.equal(await active(page),false);
  await page.evaluate(()=>triggerPayslipPopupManual());assert.equal(await active(page),true);
  await page.close();
  // An app resumed after midnight must recheck without a reload, and wait for other dialogs.
  const resumed=await setup(browser,'2026-10-21T23:59:00+09:00');assert.equal(await active(resumed),false);
  await resumed.evaluate(()=>openAppPreferences());
  await resumed.clock.setFixedTime(new Date('2026-10-22T00:01:00+09:00'));
  await resumed.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  assert.equal(await active(resumed),false);
  await resumed.locator('#settings-back').click();
  await resumed.waitForFunction(()=>document.getElementById('app-preferences-dialog').hidden);
  await waitOpen(resumed);
  await resumed.close();
  // When the user is browsing a different payroll month, show today's correct period and restore their view.
  const future=await setup(browser,'2026-10-21T21:00:00+09:00');
  await future.evaluate(()=>{currentCalDate=new Date(2026,10,1);currentPayDate=new Date(2026,10,1);renderCalendar();syncFromCalendar()});
  const before=await future.locator('#hero-gross-pay').innerText();
  await future.clock.setFixedTime(new Date('2026-10-22T09:00:00+09:00'));
  await future.evaluate(()=>window.dispatchEvent(new Event('focus')));await waitOpen(future);
  assert.match(await future.locator('#payslip-modal-title').innerText(),/10월/);
  assert.equal(await future.locator('#payslip-modal-period').innerText(),'2026-09-16 ~ 2026-10-15');
  assert.equal(await future.locator('#hero-gross-pay').innerText(),before);
  assert.equal(await future.evaluate(()=>currentPayDate.getMonth()),10);
  await future.getByRole('button',{name:'상세 명세 보기',exact:true}).click();
  assert.equal(await future.locator('body').getAttribute('data-view'),'payroll');
  assert.equal(await future.evaluate(()=>currentPayDate.getMonth()),9);
  await future.close();
  // An app left open in the foreground also checks the new day on its minute timer.
  const midnight=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul'});
  await midnight.clock.install({time:new Date('2026-10-21T23:59:30+09:00')});
  await midnight.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}))});
  await midnight.route('**/api/**',route=>route.fulfill({json:{configured:false}}));
  await midnight.goto(url);assert.equal(await active(midnight),false);
  await midnight.clock.fastForward(61000);await waitOpen(midnight);await midnight.close();
  // New users see the statement after setup, not behind the onboarding dialog.
  const setupPage=await browser.newPage({viewport:{width:390,height:844},timezoneId:'Asia/Seoul'});
  await setupPage.clock.setFixedTime(new Date('2026-10-22T09:00:00+09:00'));
  await setupPage.route('**/api/**',route=>route.fulfill({json:{configured:false}}));
  await setupPage.goto(url);assert.equal(await active(setupPage),false);
  await setupPage.evaluate(()=>{config.hireDate='2015-06-16';config.baseHourly=10320;config.ordinaryHourly=11000;setGroup('C');updateLeaveStats()});
  await waitOpen(setupPage);assert.equal(await setupPage.locator('#onboarding-dialog').evaluate(el=>el.open),false);await setupPage.close();
  const offDate=await setup(browser,'2026-10-23T10:00:00+09:00');assert.equal(await active(offDate),false);await offDate.close();
  const acknowledged=await setup(browser,'2026-10-22T10:00:00+09:00',{dismissed:true});assert.equal(await active(acknowledged),false);await acknowledged.close();
  console.log(engine.name(),'PASS adjusted date, legacy marker recovery, acknowledgement, reload, resume, modal deferral and current-month payroll');
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exit(1)});
