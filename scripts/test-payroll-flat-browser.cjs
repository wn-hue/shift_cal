'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.TEST_URL||'http://127.0.0.1:8768/';
(async()=>{for(const engine of [webkit,chromium]){
 const b=await engine.launch();try{for(const width of [320,390,412]){
 const p=await b.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-11-06T12:00:00+09:00'));
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
 await p.context().addCookies([{name:'__Host-work-routine-ready',value:'1',url:'https://20261104.xyz',secure:true,sameSite:'Lax'}]);
 await p.addInitScript(()=>{if(localStorage.getItem('shift_salary_config_master'))return;localStorage.setItem('shift_origin_ready_v1','1');localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-01-01',baseHourly:11050,ordinaryHourly:14482,baseHours:209,seniorityPayOverride:70000,dutyPay:70000,fixedAllowances:{duty:70000,qualification:0,family:0,job:0,legacy:0}}));localStorage.setItem('shift_payroll_sms_reference_v1','{"rate":0.15}');});
 await p.goto(url);await p.evaluate(()=>switchView('payroll'));
 const number=async id=>Number((await p.locator('#'+id).textContent()).replace(/[^0-9]/g,''));
 assert.match(await p.locator('#payroll-bonus-hint').textContent(),/짝수 달.*홀수 달/);
 assert(await p.locator('#inp-bonus-check').isDisabled());assert(!(await p.locator('#inp-bonus-check').isChecked()));
 const geometry=await p.evaluate(()=>{const ids=['salary-hero-card','payroll-estimate-card'];return {overflow:document.documentElement.scrollWidth>innerWidth,work:document.querySelector('.payroll-input-card').getBoundingClientRect().top,wage:document.querySelector('.wage-settings-card').getBoundingClientRect().top,bonus:document.querySelector('.payroll-bonus').getBoundingClientRect().top,hero:document.getElementById('salary-hero-card').getBoundingClientRect().top,sections:ids.map(id=>getComputedStyle(document.getElementById(id)).borderRadius)};});
 assert(!geometry.overflow,JSON.stringify(geometry));assert(geometry.hero<geometry.bonus&&geometry.bonus<geometry.work&&geometry.work<geometry.wage);assert.deepEqual(geometry.sections,['0px','0px']);assert(await p.locator('.special-days').evaluate(e=>e.getBoundingClientRect().height<36),'Special shifts remain one compact horizontal line');
 assert.deepEqual(await p.locator('#wage-allowance-settings .input-group:not([hidden]) label').allTextContents(),['근속수당','직책수당']);
 const gross=await number('hero-gross-pay');await p.locator('.estimate-toggle').click();await p.locator('#payroll-estimate-panel').waitFor({state:'visible'});
 assert.equal(await number('hero-gross-pay'),gross-Math.trunc(gross*.15+1e-7));assert.equal(await number('row-gross-pay'),await number('hero-gross-pay'));assert.match(await p.locator('#hero-pay-label').textContent(),/예상 실수령액/);assert.match(await p.locator('#hero-pay-basis').textContent(),/추정/);
 await p.locator('.estimate-toggle').click();assert.equal(await number('hero-gross-pay'),gross);
 // Every month and the year boundary retain automatic parity, without manual toggles.
 for(let month=0;month<12;month++){
  await p.evaluate(m=>{currentPayDate=new Date(2026,m,1);syncFromCalendar();},month);
  const on=(month+1)%2===0;assert.equal(await p.locator('#inp-bonus-check').isChecked(),on);assert.equal(await p.locator('#payroll-bonus-state').textContent(),on?'자동 ON':'자동 OFF');assert.equal((await number('row-bonus-pay'))>0,on);assert.equal((await number('payroll-bonus-amount'))>0,on);
  const sum=(await number('hero-regular-pay'))+(await number('hero-bonus-pay'));assert.equal(await number('hero-gross-pay'),sum);
 }
 await p.evaluate(()=>{changePayMonth(1,false);});assert.equal(await p.locator('#pay-month-title').textContent(),'2027년 1월');assert(!(await p.locator('#inp-bonus-check').isChecked()));
 await p.reload();await p.evaluate(()=>switchView('payroll'));assert(!(await p.locator('#inp-bonus-check').isChecked()));assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('shift_payroll_sms_reference_v1')).rate),.15);
 for(const theme of ['current','toss','gpt','dark']){await p.evaluate(t=>{document.body.dataset.prefTheme=t;},theme);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await p.evaluate(()=>{document.body.dataset.prefTheme='current';scrollTo(0,0);});
 if(width===390)await p.screenshot({path:'/tmp/work-routine-payroll-flat-'+engine.name()+'.png',fullPage:true});
 await p.locator('.wage-edit-button').click();await p.locator('#payroll-sms-dialog').waitFor({state:'visible'});
 await p.locator('#wage-manual-base').fill('12000');await p.locator('#wage-duty').click();await p.locator('#wage-amount-dialog').waitFor({state:'visible'});
 const before=await p.locator('#wage-duty').inputValue();await p.locator('#wage-amount-preset').click();assert.equal(await p.locator('#wage-duty').inputValue(),before);assert(await p.locator('#wage-amount-dialog').evaluate(e=>e.open));
 if(width===390)await p.screenshot({path:'/tmp/work-routine-payroll-sheet-'+engine.name()+'.png'});
 await p.locator('#wage-amount-done').click();await p.waitForFunction(()=>!document.getElementById('wage-amount-dialog').open);assert(await p.locator('#payroll-sms-dialog').evaluate(e=>e.open));
 await p.locator('#payroll-sms-apply').click();await p.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);assert.equal(await p.evaluate(()=>config.baseHourly),12000);assert.equal(await p.evaluate(()=>config.fixedAllowances.duty),70000);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('shift_payroll_sms_reference_v1')).rate),.15);
 assert.deepEqual(errors,[]);await p.close();console.log('PASS',engine.name(),width,'flat order / named allowances / gross-net reconciliation / all 12 bonus months / year rollover / reload / 4 themes / two-option draft confirmation');
 }}finally{await b.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
