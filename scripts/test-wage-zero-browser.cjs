'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require('playwright');
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();try{
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{if(localStorage.getItem('shift_active_group'))return;localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:11050,ordinaryHourly:14482,dutyPay:70000,fixedAllowances:{qualification:0,job:0,family:0,duty:70000,legacy:0}}));});
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(process.env.TEST_URL||'http://127.0.0.1:8773');
 const open=()=>p.evaluate(()=>PayrollEstimate.open());
 const save=async()=>{await p.locator('#payroll-sms-apply').click();await p.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);};
 await open();await p.locator('#wage-manual-base').fill('');await p.locator('#wage-duty').fill('');await save();
 assert.deepEqual(await p.evaluate(()=>[config.baseHourly,config.ordinaryHourly,config.dutyPay]),[0,14482,0]);
 await open();assert.equal(await p.locator('#wage-manual-base').inputValue(),'0');assert.equal(await p.locator('#wage-duty').inputValue(),'0');
 // Importing a deduction profile must not make explicitly cleared hourly wages survive.
 await p.evaluate(()=>PayrollEstimate.importText('salary','기본시급 11,050\n통상시급 14,482\n지급내역\n소계(ⓐ) 1,000,000\n공제내역\n소계(ⓑ) 100,000'));
 await p.locator('#wage-manual-base').fill('');await p.locator('#wage-manual-ordinary').fill('');
 for(const name of ['qualification','job','family','duty'])await p.locator('#wage-'+name).fill('');
 await save();assert.deepEqual(await p.evaluate(()=>[config.baseHourly,config.ordinaryHourly,config.dutyPay]),[0,0,0]);
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('shift_payroll_sms_reference_v1')).rate),.1);
 await p.reload();await open();assert.equal(await p.locator('#wage-manual-base').inputValue(),'0');assert.equal(await p.locator('#wage-manual-ordinary').inputValue(),'0');
 for(const invalid of ['-1','1.5','1,23','1000000001']){await p.locator('#wage-manual-base').fill(invalid);await p.locator('#payroll-sms-apply').click();assert(await p.locator('#payroll-sms-dialog').isVisible());assert.match(await p.locator('#wage-manual-status').textContent(),/정수/);assert.equal(await p.evaluate(()=>config.baseHourly),0);}
 await p.locator('#wage-manual-base').fill('0');await p.locator('#wage-manual-ordinary').fill('12000');await save();assert.deepEqual(await p.evaluate(()=>[config.baseHourly,config.ordinaryHourly]),[0,12000]);
 assert.deepEqual(errors,[]);console.log('PASS',engine.name(),'cleared amounts become zero / independent fields / imported profile / reload / invalid amounts');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1});
