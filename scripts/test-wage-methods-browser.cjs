'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of[webkit,chromium]){const browser=await engine.launch();for(const width of(process.env.WAGE_QUICK?[390]:[320,390,412])){
 const page=await browser.newPage({viewport:{width,height:844},isMobile:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await page.goto(process.env.TEST_URL||'http://127.0.0.1:8772/');
 await page.locator('#onboarding-date').fill('2025-01-01');await page.locator('#onboarding-next').click();await page.getByRole('button',{name:'B조',exact:true}).click();await page.locator('#onboarding-next').click();await page.locator('#onboarding-next').click();
 assert.equal(await page.locator('#wage-bonus-input').isVisible(),false);assert.equal(await page.locator('#wage-manual-base').isVisible(),true);
 await page.locator('#payroll-sms-apply').click();assert.match(await page.locator('#wage-manual-status').textContent(),/기본시급/);
 await page.locator('#wage-manual-base').fill('11,050');await page.locator('#wage-manual-ordinary').fill('14482');
 if(width===390)await page.screenshot({path:'/tmp/wage-unified-onboarding-'+engine.name()+'.png'});
 await page.locator('#payroll-sms-apply').click();await page.waitForFunction(()=>!document.getElementById('onboarding-dialog').open);
 await page.reload();assert.equal(await page.evaluate(()=>config.baseHourly),11050);assert.equal(await page.evaluate(()=>config.ordinaryHourly),14482);
 await page.evaluate(()=>{localStorage.setItem('shift_payroll_sms_reference_v1',JSON.stringify({rate:.15}));applyPayrollStatement({dutyPay:70000});PayrollEstimate.reloadReference();PayrollEstimate.open()});
 assert.equal(await page.locator('#wage-legacy').inputValue(),'70,000');await page.locator('#wage-manual-base').fill('22000');await page.locator('#payroll-sms-dialog .sheet-dismiss-handle').click();await page.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);assert.equal(await page.evaluate(()=>config.baseHourly),11050);
 await page.evaluate(()=>PayrollEstimate.open());await page.locator('#wage-manual-base').fill('12000');await page.locator('#payroll-sms-apply').click();assert.equal(await page.evaluate(()=>config.dutyPay),70000);assert.equal(await page.evaluate(()=>config.fixedAllowances.legacy),70000);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_payroll_sms_reference_v1')).rate),.15);assert.deepEqual(errors,[]);
 await page.close();console.log('PASS unified manual onboarding, validation, persistence, cancel and legacy allowances',engine.name(),width);
}await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
