'use strict';
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 for(const engine of [webkit,chromium]){
  const browser=await engine.launch();
  for(const [width,height] of [[320,568],[390,844],[412,780]]){
   const page=await browser.newPage({viewport:{width,height}});
   await page.addInitScript(()=>{
    if(localStorage.getItem('shift_active_group'))return;
    localStorage.setItem('shift_active_group','C');
    localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}));
    localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));
   });
   await page.route('**/api/**',route=>route.fulfill({json:{configured:false}}));
   await page.goto(process.env.TEST_URL||'http://localhost:8768/');
   assert.equal(await page.locator('#pref-theme option[value=routine]').textContent(),'5. A타입');
   assert.equal(await page.locator('#pref-theme option[value=google]').textContent(),'6. G타입');
   for(const month of [9,4]){
    await page.evaluate(m=>{currentCalDate=new Date(2026,m,1);renderCalendar()},month);
    const sizes={};
    for(const theme of ['current','routine','google']){
     await page.evaluate(t=>{const input=document.getElementById('pref-theme');input.value=t;input.dispatchEvent(new Event('change'))},theme);
     sizes[theme]=await page.locator('#calendar-grid').evaluate(el=>({height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,min:getComputedStyle(el).minHeight,rows:getComputedStyle(el).gridTemplateRows}));
     assert.equal(await page.locator('#calendar-grid').evaluate(el=>el.style.getPropertyValue('--calendar-row-height')),'');
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
     if(theme!=='current'){
      assert(Math.abs(sizes[theme].height-sizes.current.height)<1,JSON.stringify({width,height,month,sizes}));
      assert(Math.abs(sizes[theme].width-sizes.current.width)<3,JSON.stringify({width,height,month,sizes}));
      assert.equal(sizes[theme].min,sizes.current.min);
      assert.equal(await page.locator('.routine-calendar-guide').isVisible(),false);
      if(width===390&&month===9)await page.screenshot({animations:'disabled',path:`/tmp/calendar-${theme}-standard-size-${engine.name()}.png`});
     }
    }
   }
   await page.reload();assert.equal(await page.locator('body').getAttribute('data-pref-theme'),'google');
   await page.locator('.cal-day:not(.other-month)').first().click();assert(await page.locator('#modal-override').evaluate(el=>el.classList.contains('active')));
   await page.close();console.log(engine.name(),width,height,'PASS A/G names, standard calendar dimensions, settings retained and date editing');
  }
  await browser.close();
 }
})().catch(error=>{console.error(error);process.exit(1)});
