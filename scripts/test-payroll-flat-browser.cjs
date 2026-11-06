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
 assert.match(await p.locator('#payroll-bonus-hint').textContent(),/ⓘ.*짝수 달에.*반영/);
 assert.equal(await p.locator('.payroll-bonus-row,#lbl-bonus-check,#payroll-bonus-state,#payroll-bonus-amount').count(),0);assert(!(await p.locator('#inp-bonus-check').isVisible()));assert(await p.locator('#inp-bonus-check').isDisabled());assert(!(await p.locator('#inp-bonus-check').isChecked()));
 const geometry=await p.evaluate(()=>{const ids=['salary-hero-card','payroll-estimate-card'];return {overflow:document.documentElement.scrollWidth>innerWidth,work:document.querySelector('.payroll-input-card').getBoundingClientRect().top,wage:document.querySelector('.wage-settings-card').getBoundingClientRect().top,bonus:document.querySelector('.payroll-bonus').getBoundingClientRect().top,hero:document.getElementById('salary-hero-card').getBoundingClientRect().top,sections:ids.map(id=>getComputedStyle(document.getElementById(id)).borderRadius),cards:['.salary-month-viewport','.payroll-input-card','.wage-settings-card'].map(selector=>{const element=document.querySelector('#view-payroll '+selector),box=element.getBoundingClientRect(),style=getComputedStyle(element);return{left:box.left,right:box.right,radius:parseFloat(style.borderTopLeftRadius),background:style.backgroundColor};})};});
 assert(!geometry.overflow,JSON.stringify(geometry));assert(geometry.hero<geometry.bonus&&geometry.bonus<geometry.work&&geometry.work<geometry.wage);assert.deepEqual(geometry.sections,['0px','0px']);for(const card of geometry.cards){assert(card.radius>=20,'Overview groups use rounded cards');assert(card.left>=12&&card.right<=width-12,'Cards have visible page gutters');assert.equal(card.background,'rgb(255, 255, 255)');}assert(await p.locator('.special-days').evaluate(e=>e.getBoundingClientRect().height<=40),'Special shifts remain one compact horizontal line');
 assert.deepEqual(await p.locator('#wage-allowance-settings .input-group:not([hidden]) label').allTextContents(),['근속수당','직책수당']);
 const columns=await p.evaluate(()=>{const a=document.querySelector('.wage-rates').getBoundingClientRect(),b=document.getElementById('wage-allowance-settings').getBoundingClientRect();return {left:a.right,right:b.left};});assert(columns.left<columns.right,'Wages are left of allowances');
 const metrics=await p.evaluate(()=>{const box=id=>document.getElementById(id).getBoundingClientRect(),a=box('hero-gross-pay'),b=box('payroll-gross-toggle');return {amountRight:a.right,switchLeft:b.left,amountTop:a.top,amountBottom:a.bottom,switchTop:b.top,switchBottom:b.bottom,units:['day','night','daysp','nightsp'].map(key=>{const node=document.getElementById('work-'+key+'-count'),unit=node.querySelector('.work-day-unit').getBoundingClientRect(),n=node.querySelector('strong').getBoundingClientRect();return {right:unit.right,numberBottom:n.bottom,unitBottom:unit.bottom};})};});
 const rowAlignment=await p.locator('.regular-days .input-group').evaluateAll(rows=>rows.map(row=>{const label=row.querySelector('label').getBoundingClientRect(),value=row.querySelector('output').getBoundingClientRect();return {labelRight:label.right,valueLeft:value.left,labelMiddle:(label.top+label.bottom)/2,valueMiddle:(value.top+value.bottom)/2};}));
 for(const row of rowAlignment){assert(row.labelRight<=row.valueLeft+1,'Regular work labels and counts share one row without overlap');assert(Math.abs(row.labelMiddle-row.valueMiddle)<2,'Label and count are vertically centered like special work');}
 assert(metrics.switchLeft>metrics.amountRight,'Estimate switch is beside the amount');assert(metrics.switchBottom>=metrics.amountTop&&metrics.switchTop<=metrics.amountBottom,'Amount and switch share a row');
 assert(Math.abs(metrics.units[0].right-metrics.units[2].right)<1);assert(Math.abs(metrics.units[1].right-metrics.units[3].right)<1,'Ordinary and special shift units share column edges');
 assert(Math.abs((metrics.units[0].numberBottom-metrics.units[0].unitBottom)-(metrics.units[1].numberBottom-metrics.units[1].unitBottom))<1,'Both ordinary counts share the same baseline treatment');
 await p.evaluate(()=>{document.getElementById('inp-day-days').value='0.5';document.getElementById('inp-night-days').value='12.5';document.getElementById('inp-daysp-days').value='2';calculatePayrollFromInputs();});
 assert.equal(await p.locator('#payroll-day-count').textContent(),'0.5');assert.equal(await p.locator('#payroll-night-count').textContent(),'12.5');assert.equal(await p.locator('#payroll-daysp-count').textContent(),'2');await p.evaluate(()=>syncFromCalendar());
 assert.equal(await p.locator('#payroll-gross-toggle').isChecked(),false);assert.equal(await p.locator('#workday-adjustments').count(),1);assert.equal(await p.locator('.payroll-tools>details').count(),1);assert.equal(await p.locator('#inp-holiday-bonus').isVisible(),false);assert.equal(await p.locator('#payroll-estimate-card').evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');
 assert.equal(await p.locator('.special-days label .payroll-shift-icon').count(),2);
 const gross=await number('hero-gross-pay');await p.locator('.estimate-toggle').click();await p.locator('#payroll-estimate-panel').waitFor({state:'visible'});
 assert.equal(await p.locator('#payroll-estimate-disclaimer').isVisible(),false,'Disclaimer stays inside the deduction sheet');
 const layout=()=>p.evaluate(()=>({scroll:scrollY,cards:['.salary-month-viewport','.payroll-input-card','.wage-settings-card'].map(q=>{const r=document.querySelector(q).getBoundingClientRect();return {top:r.top+scrollY,height:r.height};})}));
 const beforeDetails=await layout(),bonus=await p.locator('#payroll-bonus-hint').boundingBox(),entry=await p.locator('#payroll-deductions-open').boundingBox();assert(entry.y>=bonus.y+bonus.height,'Deduction entry follows the bonus policy');
 if(width===390)await p.screenshot({path:'/tmp/work-routine-payroll-net-'+engine.name()+'.png',fullPage:true});
 await p.locator('#payroll-deductions-open').click();await p.locator('#payroll-deductions-dialog').waitFor({state:'visible'});assert.equal(await p.locator('#payroll-estimate-disclaimer').isVisible(),true);assert.deepEqual(await layout(),beforeDetails,'Showing deduction details does not move the payroll cards');
 if(width===390)await p.screenshot({path:'/tmp/work-routine-payroll-deductions-'+engine.name()+'.png'});
 await p.locator('#payroll-deductions-dialog .info-sheet-done').click();await p.locator('#payroll-deductions-dialog').waitFor({state:'hidden'});assert.equal(await p.locator('#payroll-estimate-disclaimer').isVisible(),false);assert.deepEqual(await layout(),beforeDetails,'Closing details keeps the payroll layout and scroll position');
 assert.equal(await number('hero-gross-pay'),gross-Math.trunc(gross*.15+1e-7));assert.equal(await number('row-gross-pay'),await number('hero-gross-pay'));assert.match(await p.locator('#hero-pay-label').textContent(),/예상 실수령액/);assert.match(await p.locator('#hero-pay-basis').textContent(),/추정/);assert.equal(await p.locator('#payroll-gross-toggle').isChecked(),true);assert.equal(await p.locator('#payroll-estimate-action-label').textContent(),'세후');
 await p.locator('.estimate-toggle').click();assert.equal(await number('hero-gross-pay'),gross);assert.equal(await p.locator('#payroll-gross-toggle').isChecked(),false);assert.equal(await p.locator('#payroll-estimate-action-label').textContent(),'세전');
 // Every month and the year boundary retain automatic parity, without manual toggles.
 for(let month=0;month<12;month++){
  await p.evaluate(m=>{currentPayDate=new Date(2026,m,1);syncFromCalendar();},month);
  const on=(month+1)%2===0;assert.equal(await p.locator('#inp-bonus-check').isChecked(),on);assert.equal((await number('row-bonus-pay'))>0,on);
  await p.locator('#payroll-gross-toggle').check();
  await p.locator('#payroll-deductions-open').click();await p.locator('#payroll-deductions-dialog').waitFor({state:'visible'});
  assert.equal(await p.locator('#estimate-regular-row').isVisible(),on);assert.equal(await p.locator('#estimate-bonus-row').isVisible(),on);
  assert.equal(await p.locator('#estimate-total-label').textContent(),on?'전체 예상 공제액':'전체 공제');
  assert.equal(await p.locator('#estimate-total').textContent(),(await p.locator('#row-estimated-deduction').textContent()).replace('−','')+' 원');
  if(!on)assert.doesNotMatch(await p.locator('#payroll-estimate-basis').textContent(),/상여:/);
  await p.locator('#payroll-deductions-dialog .info-sheet-done').click();await p.locator('#payroll-deductions-dialog').waitFor({state:'hidden'});
  await p.locator('#payroll-gross-toggle').uncheck();
  const sum=(await number('hero-regular-pay'))+(await number('hero-bonus-pay'));assert.equal(await number('hero-gross-pay'),sum);
 }
 await p.evaluate(()=>{changePayMonth(1,false);});assert.equal(await p.locator('#pay-month-title').textContent(),'2027년 1월');assert(!(await p.locator('#inp-bonus-check').isChecked()));
 await p.reload();await p.evaluate(()=>switchView('payroll'));assert(!(await p.locator('#inp-bonus-check').isChecked()));assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('shift_payroll_sms_reference_v1')).rate),.15);
 for(let i=0;i<3;i++){
  await p.locator('#workday-adjustments>summary').click();
  assert.equal(await p.locator('#workday-adjustments').evaluate(e=>e.open),true);
  assert.equal(await p.locator('#workday-adjustments>summary>span').first().evaluate(e=>getComputedStyle(e).transform),'none','Disclosure label remains upright');
  assert.notEqual(await p.locator('.workday-chevron').evaluate(e=>getComputedStyle(e).transform),'none','Only the chevron rotates');
  if(i===0&&width===390)await p.screenshot({path:'/tmp/payroll-calculations-upright-'+engine.name()+'.png',fullPage:true});
  await p.locator('#workday-adjustments>summary').click();
 }
 for(const theme of ['current','toss','gpt','dark']){await p.evaluate(t=>{document.body.dataset.prefTheme=t;},theme);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await p.evaluate(()=>{document.body.dataset.prefTheme='current';scrollTo(0,0);});
 if(width===390)await p.screenshot({path:'/tmp/work-routine-payroll-flat-'+engine.name()+'.png',fullPage:true});
 await p.locator('.wage-edit-button').click();await p.locator('#payroll-sms-dialog').waitFor({state:'visible'});
 await p.locator('#wage-manual-base').fill('12000');await p.locator('#wage-duty').click();await p.locator('#wage-amount-dialog').waitFor({state:'visible'});
 const before=await p.locator('#wage-duty').inputValue();await p.locator('#wage-amount-preset').click();assert.equal(await p.locator('#wage-duty').inputValue(),before);assert(await p.locator('#wage-amount-dialog').evaluate(e=>e.open));
 if(width===390)await p.screenshot({path:'/tmp/work-routine-payroll-sheet-'+engine.name()+'.png'});
 await p.locator('#wage-amount-done').click();await p.waitForFunction(()=>!document.getElementById('wage-amount-dialog').open);assert(await p.locator('#payroll-sms-dialog').evaluate(e=>e.open));
 await p.locator('#payroll-sms-apply').click();await p.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);assert.equal(await p.evaluate(()=>config.baseHourly),12000);assert.equal(await p.evaluate(()=>config.fixedAllowances.duty),70000);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('shift_payroll_sms_reference_v1')).rate),.15);
 assert.deepEqual(errors,[]);await p.close();console.log('PASS',engine.name(),width,'rounded cards / stable deduction sheet / named allowances / gross-net reconciliation / all 12 bonus months / year rollover / reload / 4 themes / two-option draft confirmation');
 }}finally{await b.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
