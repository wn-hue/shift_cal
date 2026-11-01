'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const address=process.env.TEST_URL||'http://127.0.0.1:8772/';
async function setup(browser,motion='reduce',width=390){
 const p=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul',reducedMotion:motion});p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
 await p.addInitScript(()=>{
  localStorage.setItem('shift_onboarding_v1','{"status":"in_progress","step":2}');localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_salary_config_master','{"hireDate":"2015-06-16","baseHourly":0,"ordinaryHourly":0,"dutyPay":0}');
  window.clipReads=0;Object.defineProperty(navigator,'clipboard',{value:{readText:()=>{clipReads++;return new Promise(resolve=>window.resolveClip=resolve);}}});
 });await p.goto(address);
 await p.evaluate(()=>{window.savedCount=0;window.completionCount=0;const save=window.applyPayrollStatement;window.applyPayrollStatement=(...args)=>{savedCount++;return save(...args)};window.addEventListener('shift-payroll-applied',()=>completionCount++);});return p;
}
const stage=p=>p.locator('#payroll-sms-dialog').getAttribute('data-wage-step');
const next=p=>p.locator('#payroll-sms-apply').click();
const settled=p=>p.waitForFunction(()=>!document.querySelector('.onboarding-scene-copy'));
async function checkKeyboard(p,id,width){
 await p.locator(id).focus();await p.setViewportSize({width,height:400});await p.waitForTimeout(120);
 const geometry=await p.evaluate(id=>{const field=document.querySelector(id).getBoundingClientRect(),frame=document.querySelector('.guided-wage-content').getBoundingClientRect(),button=document.getElementById('payroll-sms-apply').getBoundingClientRect();return{field,frame,button,overflow:document.getElementById('payroll-sms-dialog').scrollWidth>innerWidth}},id);
 assert(geometry.button.bottom<=401&&geometry.button.top>=0,JSON.stringify(geometry));assert(geometry.field.top>=geometry.frame.top-1&&geometry.field.bottom<=geometry.frame.bottom+1,JSON.stringify(geometry));assert(!geometry.overflow);
 await p.setViewportSize({width,height:844});await p.waitForTimeout(100);
}
(async()=>{for(const engine of[webkit,chromium]){const browser=await engine.launch();
 for(const motion of['reduce','no-preference'])for(const width of[320,390]){
  const p=await setup(browser,motion,width);await p.locator('#onboarding-next').click();await p.waitForTimeout(motion==='reduce'?0:360);
  assert.equal(await stage(p),'base');assert.equal(await p.locator('#wage-manual-ordinary').isVisible(),false);assert.equal(await p.evaluate(()=>clipReads),0);
  await next(p);assert.match(await p.locator('#wage-manual-status').textContent(),/기본시급/);
  await p.locator('#wage-manual-base').fill('11050');await checkKeyboard(p,'#wage-manual-base',width);await next(p);assert.equal(await stage(p),'ordinary');await settled(p);
  assert.equal(await p.locator('#wage-manual-base').isVisible(),false);assert.match(await p.locator('#guided-wage-summary').textContent(),/11,050원/);
  await next(p);assert.match(await p.locator('#wage-manual-status').textContent(),/통상시급/);await p.locator('#wage-manual-ordinary').fill('14482');await checkKeyboard(p,'#wage-manual-ordinary',width);
  await p.locator('#guided-wage-back').click();await settled(p);assert.equal(await p.locator('#wage-manual-base').inputValue(),'11050');await next(p);await settled(p);assert.equal(await p.locator('#wage-manual-ordinary').inputValue(),'14482');await next(p);await settled(p);
  assert.equal(await stage(p),'choice');assert(await p.locator('#payroll-sms-apply').isDisabled());await p.locator('[data-guided-allowance=yes]').click();await settled(p);
  assert.equal(await p.locator('.wage-mini-cards').isVisible(),false);assert.equal(await p.locator('#wage-legacy').isVisible(),false);
  assert.equal(await p.locator('#guided-allowance-list input').inputValue(),'');
  assert(await p.locator('#guided-allowance-list option[value=""]').evaluate(option=>option.disabled));
  assert.match(await p.locator('#guided-allowance-seniority').textContent(),/70,000원/);
  await next(p);assert.match(await p.locator('#wage-manual-status').textContent(),/종류/);
  await p.locator('#guided-allowance-list select').selectOption('job');
  await p.locator('#guided-allowance-list input').fill('50000');await p.locator('#guided-allowance-add').click();
  assert(await p.locator('#guided-allowance-list select').nth(1).locator('option[value=job]').evaluate(option=>option.disabled));
  await p.locator('#guided-allowance-list select').nth(1).selectOption('legacy');await p.locator('#guided-allowance-list input').nth(1).fill('20000');
  const amountId=await p.locator('#guided-allowance-list input').nth(1).getAttribute('id');await checkKeyboard(p,'#'+amountId,width);
  if(width===390&&motion==='reduce')await p.screenshot({path:'/tmp/wage-guided-allowances-'+engine.name()+'.png'});
  await next(p);
  if(motion==='no-preference'){assert.equal(await p.locator('#payroll-sms-dialog').evaluate(e=>e.open),true);assert.equal(await p.locator('#onboarding-dialog').evaluate(e=>e.open),true,'parent stays until the sheet exits');}
  await p.waitForFunction(()=>!document.getElementById('onboarding-dialog').open);
  assert.deepEqual(await p.evaluate(()=>[config.baseHourly,config.ordinaryHourly,config.dutyPay,config.fixedAllowances.job,config.fixedAllowances.legacy,savedCount,completionCount,clipReads]),[11050,14482,70000,50000,20000,1,1,0]);assert.deepEqual(p.errors,[]);await p.close();
  console.log('PASS guided manual wages, allowance entry, back, keyboard fit and one save',engine.name(),motion,width);
 }
 const p=await setup(browser);await p.locator('#onboarding-wage-import').click();assert.equal(await stage(p),'import');
 await p.locator('#wage-paste-fallback>summary').click();await p.locator('#payroll-sms-text').fill('성명 PRIVATE_GUIDED\n기본시급 11050\n통상시급 14482\n직무 70000\n지급내역\n소계(ⓐ) 1000000\n공제내역\n소계(ⓑ) 100000');
 assert.equal(await p.locator('#payroll-sms-text').inputValue(),'');assert.equal(await p.evaluate(()=>JSON.stringify(localStorage).includes('PRIVATE_GUIDED')),false);
 await next(p);assert.equal(await stage(p),'base');await next(p);await next(p);assert.equal(await stage(p),'choice');assert.equal(await p.locator('#payroll-sms-apply').textContent(),'다음');
 await p.locator('[data-guided-allowance=no]').click();await next(p);await p.waitForFunction(()=>!document.getElementById('onboarding-dialog').open);
 assert.deepEqual(await p.evaluate(()=>[config.baseHourly,config.ordinaryHourly,config.dutyPay,JSON.parse(localStorage.getItem('shift_payroll_sms_reference_v1')).rate,savedCount]),[11050,14482,0,.1,1]);await p.close();
 const cancelled=await setup(browser);await cancelled.locator('#onboarding-next').click();await cancelled.locator('#wage-manual-base').fill('12345');await cancelled.locator('#guided-wage-import').click();await cancelled.locator('#wage-fill').click();await cancelled.locator('#guided-wage-back').click();await cancelled.evaluate(()=>resolveClip('기본시급 99999'));await cancelled.waitForTimeout(30);assert.equal(await cancelled.locator('#wage-manual-base').inputValue(),'12345');
 await cancelled.locator('#payroll-sms-dialog .sheet-dismiss-handle').click();await cancelled.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);assert.equal(await cancelled.evaluate(()=>config.baseHourly),0);assert.equal(await cancelled.evaluate(()=>savedCount),0);assert.deepEqual(cancelled.errors,[]);await cancelled.close();

 const edits=await setup(browser);await edits.locator('#onboarding-next').click();await edits.locator('#wage-manual-base').fill('11050');await next(edits);await edits.locator('#wage-manual-ordinary').fill('14482');await next(edits);await edits.locator('[data-guided-allowance=yes]').click();
 const kinds=edits.locator('#guided-allowance-list select'),values=edits.locator('#guided-allowance-list input');
 await kinds.nth(0).selectOption('duty');await values.nth(0).fill('70000');await edits.locator('#guided-allowance-add').click();
 await kinds.nth(1).selectOption('qualification');await values.nth(1).fill('10000');await kinds.nth(1).selectOption('job');assert.equal(await values.nth(1).inputValue(),'10000');
 await edits.locator('#guided-allowance-add').click();await kinds.nth(2).selectOption('family');await values.nth(2).fill('30000');await edits.getByRole('button',{name:'가족수당 삭제',exact:true}).click();
 await edits.locator('#guided-wage-back').click();await next(edits);assert.deepEqual(await kinds.evaluateAll(es=>es.map(e=>e.value)),['duty','job']);
 await edits.locator('#guided-wage-import').click();await edits.evaluate(()=>PayrollEstimate.importText('salary','자격 5,000'));await next(edits);
 assert.deepEqual(await kinds.evaluateAll(es=>es.map(e=>e.value)),['duty','qualification','job']);assert.deepEqual(await values.evaluateAll(es=>es.map(e=>e.value.replace(/,/g,''))),['70000','5000','10000']);
 for(const key of['family','legacy']){await edits.locator('#guided-allowance-add').click();await kinds.last().selectOption(key);await values.last().fill('1000');}
 assert(await edits.locator('#guided-allowance-add').isDisabled());await values.last().fill('');await next(edits);assert.match(await edits.locator('#wage-manual-status').textContent(),/기타 고정수당/);assert.equal(await stage(edits),'allowances');
 await values.last().fill('-1');await next(edits);assert.match(await edits.locator('#wage-manual-status').textContent(),/정수/);await values.last().fill('0');
 await next(edits);await edits.waitForFunction(()=>!document.getElementById('onboarding-dialog').open);assert.deepEqual(await edits.evaluate(()=>[config.dutyPay,config.fixedAllowances.duty,config.fixedAllowances.job,config.fixedAllowances.qualification,config.fixedAllowances.family,config.fixedAllowances.legacy,savedCount]),[86000,70000,10000,5000,1000,0,1]);
 await edits.evaluate(()=>PayrollEstimate.open());assert.equal(await edits.locator('#guided-allowance-entry').isVisible(),false);assert.equal(await edits.locator('#wage-duty').inputValue(),'70,000');assert.equal(await edits.locator('#pref-theme option[value=test]').textContent(),'2. 베이지');assert.deepEqual(edits.errors,[]);await edits.close();
 console.log('PASS chosen categories, duplicate prevention, add/remove/reassign, back, partial SMS merge, validation, single save and regular editor',engine.name());
 console.log('PASS optional import, privacy, tax profile, explicit no allowances, stale clipboard and cancel',engine.name());await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
