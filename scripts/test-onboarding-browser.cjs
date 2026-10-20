'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE);
const address=process.env.CHECK_URL||'http://127.0.0.1:8769/';
(async()=>{for(const engine of[webkit,chromium]){const browser=await engine.launch();
 for(const width of[320,390,412]){
  const page=await browser.newPage({viewport:{width,height:844},isMobile:true,timezoneId:'Asia/Seoul',reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.clock.setFixedTime(new Date('2026-10-20T03:00:00Z'));
  await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await page.goto(address);
  const wizard=page.locator('#onboarding-dialog'),next=page.locator('#onboarding-next');
  assert.equal(await wizard.evaluate(e=>e.open),true);assert.equal(await page.locator('#onboarding-step-label').textContent(),'1 / 3');
  await next.click();assert.match(await page.locator('#onboarding-error').textContent(),/올바른/);
  await page.locator('#onboarding-date').fill('2027-01-01');await next.click();assert.match(await page.locator('#onboarding-error').textContent(),/올바른/);
  await page.locator('#onboarding-date').fill('2026-09-16');if(width===390)await page.screenshot({path:'/tmp/onboarding-date-'+engine.name()+'.png'});await next.click();
  assert.equal(await page.locator('#onboarding-step-label').textContent(),'2 / 3');assert.equal(await next.isDisabled(),true);
  assert.equal(await page.evaluate(()=>config.hireDate),'2026-09-16');await page.reload();assert.equal(await page.locator('#onboarding-step-label').textContent(),'2 / 3');
  await page.locator('#onboarding-back').click();assert.equal(await page.locator('#onboarding-date').inputValue(),'2026-09-16');await next.click();
  await page.getByRole('button',{name:'B조',exact:true}).click();assert.equal(await page.locator('[data-onboarding-group=B]').getAttribute('aria-pressed'),'true');if(width===390)await page.screenshot({path:'/tmp/onboarding-group-'+engine.name()+'.png'});await next.click();
  assert.equal(await page.locator('#onboarding-step-label').textContent(),'3 / 3');await page.reload();assert.equal(await page.locator('#onboarding-step-label').textContent(),'3 / 3');
  assert.equal(await page.evaluate(()=>localStorage.getItem('shift_active_group')),'B');
  for(const theme of['current','toss','gpt','dark']){await page.evaluate(t=>document.body.dataset.prefTheme=t,theme);assert.equal(await wizard.evaluate(e=>e.scrollWidth<=e.clientWidth),true);assert.equal(await wizard.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');}
  await page.setViewportSize({width,height:500});const footer=await next.boundingBox();assert(footer.y>=0&&footer.y+footer.height<=501);await page.setViewportSize({width,height:844});
  if(width===390)await page.screenshot({path:'/tmp/onboarding-wage-'+engine.name()+'.png'});
  await next.click();assert.equal(await page.locator('#payroll-sms-dialog').evaluate(e=>e.open),true);
  await page.locator('#payroll-sms-text').fill('기본시급: 11,050원');await page.locator('#payroll-sms-apply').click();
  assert.equal(await wizard.evaluate(e=>e.open),true);await page.waitForFunction(()=>document.getElementById('onboarding-error').textContent.includes('통상시급'));
  await next.click();await page.locator('#payroll-sms-text').fill('성명 PRIVATE_ONBOARDING_TEST\n기본시급: 11,050원\n통상시급: 14,482원');await page.locator('#payroll-sms-apply').click();
  assert.equal(await wizard.evaluate(e=>e.open),false);assert.equal(await page.locator('body').getAttribute('data-view'),'calendar');assert.equal(await page.locator('#payroll-sms-text').inputValue(),'');
  assert.equal(await page.evaluate(()=>config.baseHourly),11050);assert.equal(await page.evaluate(()=>config.ordinaryHourly),14482);
  assert.equal(await page.evaluate(()=>JSON.stringify(localStorage).includes('PRIVATE_ONBOARDING_TEST')),false);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_onboarding_v1')).status),'complete');
  await page.reload();assert.equal(await wizard.evaluate(e=>e.open),false);assert.equal(await page.evaluate(()=>config.hireDate),'2026-09-16');
  assert.deepEqual(errors,[]);await page.close();console.log('PASS new-user date/group/SMS, invalid date, resume, partial wage, privacy, finish, 4 themes and short viewport',engine.name(),width);
 }
 // Existing users, including incomplete settings, must keep their current behavior and data.
 for(const seed of[{shift_active_group:'A'},{shift_bus_favorites_v1:'[]'},{shift_salary_config_master:JSON.stringify({hireDate:'2015-06-16',baseHourly:11050,ordinaryHourly:14482,leaveByYear:{2026:19},holidayBonus:150000}),shift_active_group:'C',shift_overrides_C:JSON.stringify({'2026-10-20':'LEAVE'}),shift_day_memos:JSON.stringify({'2026-10-20':'keep my memo'})}]){
  const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true});await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.addInitScript(data=>{if(!localStorage.getItem('shift_onboarding_v1'))for(const[k,v]of Object.entries(data))localStorage.setItem(k,v)},seed);await p.goto(address);
  assert.equal(await p.locator('#onboarding-dialog').evaluate(e=>e.open),false);for(const[k,v]of Object.entries(seed))assert.equal(await p.evaluate(k=>localStorage.getItem(k),k),v);
  await p.evaluate(()=>switchView('all'));await p.locator('#onboarding-reopen').click();assert.equal(await p.locator('#onboarding-dialog').evaluate(e=>e.open),true);await p.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await p.locator('#onboarding-dialog').evaluate(e=>e.open),false);await p.reload();assert.equal(await p.locator('#onboarding-dialog').evaluate(e=>e.open),false);await p.close();
 }
 // Account restore on a new device completes setup without overwriting restored settings.
 const p=await browser.newPage();await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(address);await p.evaluate(()=>{config.hireDate='2015-06-16';config.baseHourly=11050;config.ordinaryHourly=14482;setGroup('A');updateLeaveStats()});assert.equal(await p.locator('#onboarding-dialog').evaluate(e=>e.open),false);await p.close();console.log('PASS existing users preserved, optional guide and account restore',engine.name());await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
