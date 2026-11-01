'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{for(const engine of[webkit,chromium]){const browser=await engine.launch();for(const width of[320,390,412]){
 const page=await browser.newPage({viewport:{width,height:844},isMobile:true,timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.clock.setFixedTime(new Date('2026-10-16T03:00:00Z'));
 await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
 await page.goto(process.env.CHECK_URL||'http://127.0.0.1:8769/');
 for(const theme of['current','toss','gpt','dark']){
  await page.evaluate(t=>{document.getElementById('pref-theme').value=t;document.getElementById('pref-theme').dispatchEvent(new Event('change'));setGroup('C');currentCalDate=new Date(2026,9,1);config.hireDate='2026-06-16';config.leaveByYear={2026:0};config.leaveManualYears={};config.ordinaryHourly=10000;overrides={};saveConfig();loadConfig();switchView('all');SettingsUI.openLeave();},theme);
  assert.equal(await page.locator('#stat-total-leave').textContent(),'4일');
  assert.equal(await page.locator('#stat-remain-leave').textContent(),'4일');
  assert.equal(await page.locator('#val-total-leave-pay').textContent(),'320,000원');
  assert.match(await page.locator('#leave-accrual-basis').textContent(),/2026.10.16.*개근 가정.*4일/);
  const dialog=page.locator('#leave-settings-dialog');assert.equal(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth),true);
  const bounds=await dialog.boundingBox();assert(bounds.y>=0&&bounds.y+bounds.height<=845);
  await page.locator('#input-total-leave').fill('0');await page.locator('#input-total-leave').press('Tab');
  assert.equal(await page.locator('#stat-total-leave').textContent(),'0일');assert.equal(await page.locator('#leave-restore-auto').isVisible(),true);
  await page.getByRole('button',{name:'완료',exact:true}).click();
  await page.reload();await page.evaluate(()=>{switchView('all');SettingsUI.openLeave()});
  assert.equal(await page.locator('#stat-total-leave').textContent(),'0일','Explicit manual zero survives reload');
  await page.locator('#leave-restore-auto').click();assert.equal(await page.locator('#stat-total-leave').textContent(),'4일');
  assert.equal(await page.evaluate(()=>Object.hasOwn(config.leaveByYear,2026)),false);
  await page.locator('#input-hire-date').fill('2026-09-16');await page.locator('#input-hire-date').press('Tab');
  assert.equal(await page.locator('#stat-total-leave').textContent(),'1일');
  await page.evaluate(()=>{overrides={'2026-10-16':'HALF_POST'};updateLeaveStats()});
  assert.equal(await page.locator('#stat-used-leave').textContent(),'0.5일');assert.equal(await page.locator('#stat-remain-leave').textContent(),'0.5일');
  if(width===390&&theme==='current')await page.screenshot({path:'/tmp/monthly-leave-'+engine.name()+'.png'});
  await page.getByRole('button',{name:'완료',exact:true}).click();
 }
 assert.deepEqual(errors,[]);await page.close();console.log('PASS monthly leave screen / legacy zero / manual restore+reload / hire change / half-day use / 4 themes',engine.name(),width);
}await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
