'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE);
(async()=>{
 for(const engine of [webkit,chromium]){
  const browser=await engine.launch();
  for(const width of [320,390,412]){
   const page=await browser.newPage({viewport:{width,height:844},isMobile:true,reducedMotion:'reduce'});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
   await page.goto(process.env.CHECK_URL||'http://127.0.0.1:8769/');
   for(const theme of ['current','toss','gpt','dark']){
    await page.evaluate(t=>{document.getElementById('pref-theme').value=t;document.getElementById('pref-theme').dispatchEvent(new Event('change'));setGroup('C');config.baseHourly=11050;config.ordinaryHourly=14482;config.hireDate='2015-06-16';currentPayDate=new Date(2026,9,1);saveConfig();loadConfig();syncFromCalendar();switchView('payroll');},theme);
    const card=page.locator('.payroll-input-card'),extra=page.locator('#workday-adjustments');
    assert.equal(await extra.evaluate(e=>e.open),false);
    assert((await card.boundingBox()).height<570,'Default card must fit comfortably on a phone');
    assert.equal(await page.locator('#inp-holiday-bonus').isVisible(),false);
    await extra.locator('summary').click();
    await page.locator('#inp-no-ot-days').fill('1.5');
    const days=await page.evaluate(()=>Number(document.getElementById('inp-day-days').value)+Number(document.getElementById('inp-night-days').value));
    assert.match(await page.locator('#disp-ot-hours').inputValue(),new RegExp('^'+((days-1.5)*2.5).toFixed(1).replace('.','\\.')));
    await page.locator('#inp-holiday-bonus').fill('0');
    const gross=await page.locator('#hero-gross-pay').textContent();
    await page.locator('#inp-holiday-bonus').fill('150000');
    const amount=x=>Number(x.replace(/[^0-9]/g,''));
    assert.equal(amount(await page.locator('#hero-gross-pay').textContent())-amount(gross),150000);
    await extra.locator('summary').click();
    assert.match(await extra.locator('summary').textContent(),/1.5일.*150,000원/);
    await page.getByRole('button',{name:'입력값 저장',exact:true}).click();
    assert.equal(await page.evaluate(()=>config.holidayBonus),150000);
    await page.evaluate(()=>{switchView('calendar');scrollTo(0,0)});
    for(const inset of [0,47]){
     await page.evaluate(n=>{document.body.style.paddingTop=n+'px';scrollTo(0,0)},inset);
     const header=await page.locator('.reference-header').boundingBox();
     for(const selector of ['#cal-month-title-btn','#weather-open','[aria-label="근무표 공유"]','[aria-label="월 근무 통계"]']){
      const box=await page.locator(selector).boundingBox();
      assert(box.y>=inset+10&&box.y+box.height<=header.y+header.height,'Header control must fit below safe area: '+selector);
      assert(box.x>=0&&box.x+box.width<=width,'Header must fit phone width');
     }
    }
    await page.evaluate(()=>document.body.style.removeProperty('padding-top'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(width===390&&theme==='current'){
     await page.screenshot({path:'/tmp/calendar-header-'+engine.name()+'.png'});
     await page.evaluate(()=>{switchView('payroll');document.querySelector('.payroll-input-card').scrollIntoView({block:'start'})});
     await page.screenshot({path:'/tmp/compact-workdays-'+engine.name()+'.png'});
    }
   }
   assert.deepEqual(errors,[]);await page.close();
   console.log('PASS compact workdays / advanced calculation / saved allowance / safe header',engine.name(),width,'4 themes');
  }
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exit(1)});
