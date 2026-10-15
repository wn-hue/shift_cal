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
    for(const id of ['inp-day-days','inp-night-days','inp-daysp-days','inp-nightsp-days','inp-no-ot-days']){
     const field=page.locator('#'+id);assert.equal(await field.isEditable(),false);
     const original=await field.inputValue();await field.focus();await page.keyboard.press('ArrowUp');await page.keyboard.type('9');assert.equal(await field.inputValue(),original);
    }
    const beforeHours=parseFloat(await page.locator('#disp-ot-hours').inputValue());
    const key=await page.evaluate(()=>{
     const d=new Date(currentPayDate.getFullYear(),currentPayDate.getMonth()-1,16),end=new Date(currentPayDate.getFullYear(),currentPayDate.getMonth(),15);
     while(d<=end){if(getActualShift(d,currentGroup).type==='DAY'){const key=toDateKey(d.getFullYear(),d.getMonth(),d.getDate());selectedDateStr=key;setDayOverride('NO_OT');document.getElementById('apply-preview').click();return key;}d.setDate(d.getDate()+1);}
    });
    assert(key);assert.equal(parseFloat(await page.locator('#disp-ot-hours').inputValue()),beforeHours-2.5);
    assert.equal(await page.locator('#inp-no-ot-days').inputValue(),'1');
    const {left,right}=await page.evaluate(()=>({left:document.getElementById('inp-no-ot-days').getBoundingClientRect().toJSON(),right:document.getElementById('inp-holiday-bonus').getBoundingClientRect().toJSON()}));
    assert(Math.abs(left.y-right.y)<2&&left.x+left.width<=right.x&&Math.abs(left.width-right.width)<2,'Additional fields must share one row equally '+JSON.stringify({left,right,width,theme,engine:engine.name()}));
    await page.locator('#inp-holiday-bonus').fill('0');
    const gross=await page.locator('#hero-gross-pay').textContent();
    await page.locator('#inp-holiday-bonus').fill('150000');
    const amount=x=>Number(x.replace(/[^0-9]/g,''));
    assert.equal(amount(await page.locator('#hero-gross-pay').textContent())-amount(gross),150000);
    if(width===390&&theme==='current')await extra.screenshot({path:'/tmp/half-width-adjustments-'+engine.name()+'.png'});
    await extra.locator('summary').click();
    assert.match(await extra.locator('summary').textContent(),/1일.*150,000원/);
    await page.getByRole('button',{name:'입력값 저장',exact:true}).click();
    assert.equal(await page.evaluate(()=>config.holidayBonus),150000);
    await page.evaluate(k=>{selectedDateStr=k;setDayOverride(null);document.getElementById('apply-preview').click();switchView('calendar');scrollTo(0,0)},key);
    await page.getByRole('button',{name:'월 근무 통계',exact:true}).click();
    assert.equal(await page.locator('#modal-month-stats .stats-section').count(),2);
    assert.equal(await page.locator('#stat-total,#stat-remaining').count(),0);
    assert.match(await page.locator('#modal-month-stats').textContent(),/연차 사용/);
    await page.getByRole('button',{name:'근무 통계 닫기',exact:true}).click();
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
