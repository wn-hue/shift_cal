'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium,devices}=require('playwright');
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();
 for(const theme of ['current','test3','test4']){
 const page=await browser.newPage({...devices['iPhone 13'],timezoneId:'Asia/Seoul'});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+09:00'));
 await page.addInitScript(theme=>{
  localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_display_theme',theme);localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));
  localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}));
  window.nativeTestViewport=window.visualViewport;
  const viewport=Object.assign(new EventTarget(),{width:390,height:844,offsetTop:0,offsetLeft:0,scale:1});
  Object.defineProperty(window,'visualViewport',{get:()=>viewport});window.testViewport=viewport;
 },theme);
 await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));let accept=false;page.on('dialog',d=>accept?d.accept():d.dismiss());
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:8771/');
 await page.evaluate(()=>Object.assign(testViewport,{height:nativeTestViewport.height,width:nativeTestViewport.width}));
 const restingHeight=await page.evaluate(()=>testViewport.height);
 await page.locator('.cal-day[data-date="2026-10-20"] .day-num').tap();await page.waitForTimeout(300);
 const box=s=>page.locator(s).boundingBox();
 const shiftBox=await box('.override-sheet');if(theme==='current')assert(shiftBox.y>=restingHeight*.15,JSON.stringify(shiftBox));
 await page.evaluate(()=>{testViewport.offsetTop=80;testViewport.dispatchEvent(new Event('scroll'));});await page.waitForFunction(()=>document.querySelector('#modal-override').style.getPropertyValue('--memo-viewport-top')==='80px');assert((await box('.design-toolbar')).y>=80);await page.evaluate(()=>{testViewport.offsetTop=0;testViewport.dispatchEvent(new Event('scroll'));});await page.waitForFunction(()=>document.querySelector('#modal-override').style.getPropertyValue('--memo-viewport-top')==='0px');
 if(theme==='current')await page.screenshot({path:'/tmp/work-proportions-fixed.png',animations:'disabled'});
 await page.locator('[data-override="OFF"]').tap();await page.locator('.design-memo-link').tap();
 const compact=async()=>{const card=await box('#memo-panel'),footer=await box('.design-footer');assert(footer.y-card.y-card.height<=20);assert((await box('.override-sheet')).height<550);};
 if(theme==='current')await compact();
 assert(await page.locator('#modal-memo-input').isHidden());await page.locator('#memo-compose-open').tap();
 assert(await page.locator('#memo-compose-dialog').evaluate(e=>e.matches(':modal')));
 assert.equal(await page.evaluate(()=>document.activeElement.id),'memo-compose-input');
 const frozen=await box('.override-sheet');
 await page.locator('#memo-compose-input').fill('Long memo\n'.repeat(250));
 for(const [height,top]of [[425,70],[300,160],[220,200],[restingHeight,0]]){
  await page.evaluate(({height,top})=>{Object.assign(testViewport,{height,offsetTop:top});testViewport.dispatchEvent(new Event('resize'));testViewport.dispatchEvent(new Event('scroll'));},{height,top});
  const g=await box('#memo-compose-dialog'),save=await box('#memo-compose-save');assert(Math.abs(g.y-top)<1&&Math.abs(g.height-height)<1,JSON.stringify(g));assert(save.y>=top&&save.y+save.height<=top+height);assert.deepEqual(await box('.override-sheet'),frozen,'memo keyboard must not resize work sheet');assert((await box('#memo-compose-input')).height>40);
 }
 // Rejecting cancellation keeps the draft, accepting it leaves the saved note untouched.
 await page.locator('#memo-compose-back').tap();assert(await page.locator('#memo-compose-dialog').isVisible());accept=true;await page.locator('#memo-compose-back').tap();assert(await page.locator('#memo-compose-dialog').isHidden());assert.equal(await page.evaluate(()=>dayMemos['2026-10-20']),undefined);
 await page.locator('#memo-compose-open').tap();await page.locator('#memo-compose-input').fill('메모 작성 확인\n두 번째 줄');
 // A failed work validation must leave both the memo draft and pending work intact.
 await page.evaluate(()=>{window.testOriginalValidate=validateDayOverride;validateDayOverride=()=> '검증 실패';});
 await page.locator('#memo-compose-save').tap();assert(await page.locator('#memo-compose-dialog').isVisible());assert.equal(await page.evaluate(()=>dayMemos['2026-10-20']),undefined);assert.equal(await page.evaluate(()=>ShiftTools.pending().type),'OFF');assert.equal(await page.locator('#memo-compose-input').inputValue(),'메모 작성 확인\n두 번째 줄');
 await page.evaluate(()=>{validateDayOverride=testOriginalValidate;});
 if(theme==='current'&&engine===webkit)await page.screenshot({path:'/tmp/memo-composer-fixed.png',animations:'disabled'});
 await page.locator('#memo-compose-save').tap();assert(await page.locator('#memo-compose-dialog').isHidden());
 await page.waitForFunction(()=>!document.querySelector('#modal-override').classList.contains('active'));
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_day_memos'))['2026-10-20']),'메모 작성 확인\n두 번째 줄');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-20']),'OFF');assert.equal(await page.evaluate(()=>!!ShiftTools.pending()),false);
 await page.waitForTimeout(750);await page.locator('.cal-day[data-date="2026-10-20"] .day-num').tap();await page.locator('.design-memo-link').tap();
 if(theme==='current')await compact();
 await page.locator('#memo-compose-open').tap();assert.equal(await page.locator('#memo-compose-input').inputValue(),'메모 작성 확인\n두 번째 줄');await page.locator('#memo-compose-input').fill('');await page.locator('#memo-compose-save').tap();await page.waitForFunction(()=>!document.querySelector('#modal-override').classList.contains('active'));assert.equal(await page.evaluate(()=>dayMemos['2026-10-20']),undefined);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C'))['2026-10-20']),'OFF');assert.deepEqual(errors,[]);
 console.log(engine.name(),theme,'PASS mobile sheet proportion, separate memo, frozen parent, keyboard/pan, cancel/save/delete, staged work');await page.close();
 }await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
