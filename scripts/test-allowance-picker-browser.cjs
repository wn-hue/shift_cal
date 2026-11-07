'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of [webkit,chromium].filter(e=>!process.env.BROWSER_ENGINE||e.name()===process.env.BROWSER_ENGINE)){
 const browser=await engine.launch();try{for(const motion of ['reduce','no-preference']){
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:motion});
 const errors=[];p.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
 await p.context().addCookies([{name:'__Host-work-routine-ready',value:'1',url:'https://20261104.xyz',secure:true,sameSite:'Lax'}]);
 await p.addInitScript(()=>{if(localStorage.getItem('shift_salary_config_master'))return;localStorage.setItem('shift_origin_ready_v1','1');localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:11050,ordinaryHourly:14482,dutyPay:5000,fixedAllowances:{qualification:0,job:0,family:0,duty:0,legacy:5000}}));});
 await p.goto(process.env.TEST_URL||'http://127.0.0.1:8768');
 await p.evaluate(()=>{switchView('payroll');window.savedCount=0;const save=applyPayrollStatement;window.applyPayrollStatement=(...args)=>{savedCount++;return save(...args);};PayrollEstimate.open();});
 const before=await p.evaluate(()=>localStorage.getItem('shift_salary_config_master'));
 const picker=p.locator('#wage-amount-dialog');
 const closed=()=>p.waitForFunction(()=>!document.getElementById('wage-amount-dialog').open);
 const open=async key=>{await p.locator('#wage-'+key).click();await picker.waitFor({state:'visible'});assert.equal(await picker.locator('.wage-amount-options button').count(),2);};
 assert.equal(await p.locator('#payroll-sms-dialog input[role=switch]').count(),6);
 assert.deepEqual(await p.locator('.wage-allowance-toggle-row').evaluateAll(rows=>rows.map(row=>(row.firstChild.nodeType===3?row.firstChild:row.firstElementChild.firstChild).textContent.trim())),['근속수당','직책수당','자격수당','가족수당','직무수당','기타수당']);
 if(engine.name()==='webkit'&&motion==='reduce')await p.screenshot({path:'/tmp/work-routine-allowance-switches-20261106.png'});
 assert.equal(await p.locator('#wage-toggle-seniority').isChecked(),true);
 await p.locator('#wage-toggle-seniority').uncheck();assert.equal(await p.locator('#wage-seniority').inputValue(),'0');
 await p.locator('#wage-toggle-seniority').check();await picker.waitFor({state:'visible'});assert.match(await p.locator('#wage-amount-preset-label').textContent(),/7만원/);
 await p.locator('#wage-amount-preset').click();assert.equal(await picker.evaluate(e=>e.open),true);await p.locator('#wage-amount-done').click();await closed();assert.equal(await p.locator('#wage-seniority').inputValue(),'70,000');await p.locator('#wage-toggle-seniority').uncheck();assert.equal(await picker.isVisible(),false);
 await p.locator('#wage-toggle-duty').check();await picker.waitFor({state:'visible'});await p.locator('#wage-amount-custom').click();assert.equal(await p.locator('#wage-amount-input').inputValue(),'');
 await p.locator('#wage-amount-input').pressSequentially('070000');assert.equal(await p.locator('#wage-amount-input').inputValue(),'70000');
 await p.locator('#wage-amount-input').fill('-1');await p.locator('#wage-amount-done').click();assert.match(await p.locator('#wage-amount-status').textContent(),/소수점 없이/);assert.equal(await picker.evaluate(e=>e.open),true);
 await p.locator('#wage-amount-input').fill('80000');await p.setViewportSize({width:390,height:400});await p.waitForTimeout(150);
 const geo=await p.evaluate(()=>{const field=document.getElementById('wage-amount-input').getBoundingClientRect(),frame=document.querySelector('.wage-amount-content').getBoundingClientRect(),button=document.getElementById('wage-amount-done').getBoundingClientRect();return {fieldBottom:field.bottom,frameBottom:frame.bottom,buttonBottom:button.bottom,overflow:document.getElementById('wage-amount-dialog').scrollWidth>innerWidth};});
 assert(geo.buttonBottom<=401&&!geo.overflow&&geo.fieldBottom<=geo.frameBottom+1,JSON.stringify(geo));
 await p.locator('#wage-amount-done').click();await closed();await p.setViewportSize({width:390,height:844});assert.equal(await p.locator('#wage-duty').inputValue(),'80,000');
 await p.locator('#wage-toggle-qualification').check();await picker.waitFor({state:'visible'});assert.equal(await p.locator('#wage-amount-preset-hint').textContent(),'매월 70,000원');await p.locator('#wage-amount-preset').click();assert.equal(await picker.evaluate(e=>e.open),true);await p.locator('#wage-amount-done').click();await closed();assert.equal(await p.locator('#wage-qualification').inputValue(),'70,000');await p.locator('#wage-toggle-qualification').uncheck();assert.equal(await p.locator('#wage-qualification').inputValue(),'0');
 await p.locator('#wage-toggle-job').check();await picker.waitFor({state:'visible'});await p.locator('#wage-amount-preset').click();assert.equal(await picker.evaluate(e=>e.open),true);await p.locator('#wage-amount-done').click();await closed();assert.equal(await p.locator('#wage-job').inputValue(),'70,000');await p.locator('#wage-toggle-job').uncheck();
 await open('legacy');await p.locator('#wage-amount-custom').click();await p.locator('#wage-amount-input').fill('');await p.locator('#wage-amount-done').click();await closed();assert.equal(await p.locator('#wage-legacy').inputValue(),'0');
 // Dragging a child sheet closes it once, keeping the wage draft and parent open.
 await p.locator('#wage-toggle-family').check();await picker.waitFor({state:'visible'});await p.locator('#wage-amount-custom').click();await p.locator('#wage-amount-input').fill('90000');
 const handle=picker.locator('.sheet-dismiss-handle');const box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
 await handle.dispatchEvent('touchstart',{touches:[{identifier:1,clientX:x,clientY:y}]});await handle.dispatchEvent('touchmove',{touches:[{identifier:1,clientX:x,clientY:y+100}]});await handle.dispatchEvent('touchend',{touches:[],changedTouches:[{identifier:1,clientX:x,clientY:y+100}]});await closed();
 assert.equal(await p.locator('#payroll-sms-dialog').evaluate(e=>e.open),true);assert.equal(await p.locator('#wage-family').inputValue(),'0');assert.equal(await p.locator('#wage-toggle-family').isChecked(),false);assert.equal(await p.evaluate(()=>savedCount),0);assert.equal(await p.evaluate(()=>localStorage.getItem('shift_salary_config_master')),before);
 await p.locator('#payroll-sms-apply').click();await p.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);
 assert.deepEqual(await p.evaluate(()=>[config.seniorityPayOverride,config.fixedAllowances.duty,config.fixedAllowances.legacy,savedCount]),[0,80000,0,1]);
 await p.evaluate(()=>PayrollEstimate.open());assert.equal(await p.locator('#wage-duty').inputValue(),'80,000');
 assert.equal(await p.locator('#wage-legacy-row').isVisible(),true,'Other allowances remain available when the amount is zero');
 assert.equal(await p.locator('#wage-toggle-seniority').isChecked(),false);
 await p.locator('#wage-seniority-reset').click();assert.equal(await p.locator('#wage-toggle-seniority').isChecked(),true);assert.equal(await p.locator('#wage-seniority').inputValue(),'70,000');assert.equal(await p.evaluate(()=>config.seniorityPayOverride),0);
 await p.locator('#wage-toggle-legacy').check();await picker.waitFor({state:'visible'});assert.equal(await p.locator('#wage-amount-preset-hint').textContent(),'매월 70,000원');await picker.locator('.sheet-dismiss-handle').click();await closed();
 for(const theme of ['current','toss','gpt','dark']){await p.evaluate(t=>{document.body.dataset.prefTheme=t;},theme);await open('duty');assert.equal(await p.locator('#wage-amount-input').inputValue(),'80,000');assert.equal(await p.locator('#wage-amount-custom').getAttribute('aria-pressed'),'true');assert.equal(await picker.evaluate(e=>e.scrollWidth<=e.clientWidth),true);if(engine.name()==='webkit'&&motion==='no-preference'&&theme==='current'){await p.waitForTimeout(400);await p.screenshot({path:'/tmp/work-routine-allowance-options-20261106.png'});}await picker.locator('.sheet-dismiss-handle').click();await closed();}
 await p.locator('#payroll-sms-dialog .sheet-dismiss-handle').click();await p.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);
 assert.deepEqual(errors,[]);await p.close();console.log('PASS',engine.name(),motion,'six switches / all 70000 presets / off zero / cancel restores off / custom / keyboard resize / swipe / one save / persistence / themes');
 }}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
