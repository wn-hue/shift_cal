'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require('playwright');
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();
 for(const width of [320,393,430]){
  const page=await browser.newPage({viewport:{width,height:852},timezoneId:'Asia/Seoul'});page.setDefaultTimeout(10000);
  await page.clock.setFixedTime(new Date('2026-10-27T12:00:00+09:00'));
  await page.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme','test4');localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}));});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));page.on('dialog',d=>d.accept());
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:8771/');await page.locator('.cal-day[data-date="2026-10-27"] .day-num').click();
  assert(await page.locator('.design-week').isHidden());assert(await page.locator('.kakao-date-nav').isVisible());assert.equal(await page.locator('.design-tabs').innerText(),'근무\n메모\n급여');
  await page.locator('.attendance-choices').scrollIntoViewIfNeeded();
  const layout=await page.locator('.attendance-choices').evaluate(e=>{const rect=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};return [...e.querySelectorAll('button')].filter(b=>!b.hidden).map(b=>({button:rect(b),icon:rect(b.querySelector('.design-choice-icon')),label:rect(b.querySelector('.design-choice-label')),path:b.querySelector('.design-choice-icon').innerHTML}));});
  assert.equal(layout.length,6);
  for(let i=0;i<layout.length;i++){const {button,icon,label}=layout[i];assert(icon.right<=label.x-4,JSON.stringify(layout[i]));assert(Math.abs(icon.y+icon.height/2-(label.y+label.height/2))<2,JSON.stringify(layout[i]));assert(label.right<=button.right&&label.bottom<=button.bottom);assert(button.x>=0&&button.right<=width);if(i%2===1){assert(Math.abs(button.y-layout[i-1].button.y)<1);assert(Math.abs(button.height-layout[i-1].button.height)<1);}if(i>=2)assert(button.y>layout[i-2].button.y);}
  assert.equal(new Set(layout.map(x=>x.path)).size,6,'Attendance types must have meaningful distinct icons, not the day sun fallback');
  if(width===393)await page.screenshot({path:'/tmp/kakao-attendance-'+engine.name()+'.png',animations:'disabled'});
  await page.locator('[data-override="HALF_POST"]').click();assert.equal(await page.locator('[data-override="HALF_POST"]').getAttribute('aria-pressed'),'true');assert.match(await page.locator('#kakao-selection-label').textContent(),/반차/);
  await page.locator('[data-pane="pay"]').click();assert(await page.locator('#change-preview-title').isVisible());assert(await page.locator('.attendance-choices').isHidden());assert.match(await page.locator('#change-preview-title').textContent(),/예상 급여 변화/);
  await page.locator('[data-pane="work"]').click();await page.locator('#apply-preview').click();await page.waitForFunction(()=>!document.getElementById('modal-override').classList.contains('active'));assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-27']),'HALF_POST');
  await page.locator('.cal-day[data-date="2026-10-27"] .day-num').click();await page.locator('#kakao-next-day').click();assert.equal(await page.evaluate(()=>selectedDateStr),'2026-10-28');assert(await page.locator('.design-attendance').isHidden());await page.locator('[data-pane="pay"]').click();assert(await page.locator('.kakao-pay-empty').isVisible());
  const footer=await page.locator('#apply-preview').boundingBox();assert(footer.y>=0&&footer.y+footer.height<=853);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);console.log(engine.name(),width,'PASS 2-column attendance, horizontal icon/text alignment, all six icons, bubbles, date navigation, pay tab, save and footer');await page.close();
 }
 await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
