'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const address=process.env.TEST_URL||'http://127.0.0.1:8774/';
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
const settled=p=>p.waitForFunction(()=>!document.querySelector('[data-wage-moving=true],[data-sheet-resizing=true],.onboarding-scene-copy'));
const next=async p=>{await p.locator('#payroll-sms-apply').click();await settled(p);};
const current=p=>p.locator('#guided-allowance-entry').getAttribute('data-allowance');
const back=async p=>{await p.locator('#guided-wage-back').click();await settled(p);};
const open=async p=>{await p.locator('#onboarding-next').click();await p.waitForTimeout(400);};
async function toChoice(p){await open(p);await p.locator('#wage-manual-base').fill('11050');await next(p);await p.locator('#wage-manual-ordinary').fill('14482');await next(p);}
async function custom(p,key,value){
 if(['seniority','duty'].includes(key))await p.locator('[data-allowance-option=custom]').click();
 await p.locator('#guided-allowance-amount-'+key).fill(value);
}
async function done(p){await p.waitForFunction(()=>!document.getElementById('onboarding-dialog').open);assert.deepEqual(p.errors,[]);}
async function checkKeyboard(p,id,width){
 await p.locator(id).focus();await p.setViewportSize({width,height:400});await p.waitForTimeout(120);
 const geometry=await p.evaluate(id=>{const field=document.querySelector(id).getBoundingClientRect(),frame=document.querySelector('.guided-wage-content').getBoundingClientRect(),button=document.getElementById('payroll-sms-apply').getBoundingClientRect();return{field,frame,button,overflow:document.getElementById('payroll-sms-dialog').scrollWidth>innerWidth}},id);
 assert(geometry.button.bottom<=401&&geometry.button.top>=0,JSON.stringify(geometry));assert(geometry.field.top>=geometry.frame.top-1&&geometry.field.bottom<=geometry.frame.bottom+1,JSON.stringify(geometry));assert(!geometry.overflow);
 await p.setViewportSize({width,height:844});await p.waitForTimeout(120);
}
async function swipe(p,selector,dy=120){await p.locator(selector).evaluate((el,dy)=>{const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+10;for(const [type,offset]of [['touchstart',0],['touchmove',dy/2],['touchmove',dy],['touchend',dy]]){const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[{clientX:x,clientY:y+offset}]},changedTouches:{value:[{clientX:x,clientY:y+offset}]}});el.dispatchEvent(e)}},dy);}
(async()=>{for(const engine of[webkit,chromium]){const browser=await engine.launch();
 for(const motion of['reduce','no-preference'])for(const width of[320,390]){
  const p=await setup(browser,motion,width);await open(p);assert.equal(await stage(p),'base');assert.equal(await p.locator('#wage-manual-ordinary').isVisible(),false);assert.equal(await p.evaluate(()=>clipReads),0);
  await next(p);assert.match(await p.locator('#wage-manual-status').textContent(),/기본시급/);
  await p.locator('#wage-manual-base').fill('11050');await checkKeyboard(p,'#wage-manual-base',width);await next(p);assert.equal(await stage(p),'ordinary');
  await p.locator('#wage-manual-ordinary').fill('14482');await checkKeyboard(p,'#wage-manual-ordinary',width);await back(p);assert.equal(await p.locator('#wage-manual-base').inputValue(),'11050');await next(p);assert.equal(await p.locator('#wage-manual-ordinary').inputValue(),'14482');await next(p);
  assert.equal(await p.locator('[data-guided-allowance]').count(),7);await p.locator('[data-guided-allowance=duty]').click();assert.equal(await stage(p),'choice');await next(p);
  assert.equal(await current(p),'seniority');assert.match(await p.locator('#guided-wage-progress').textContent(),/1 \/ 2/);assert.match(await p.locator('[data-allowance-option=preset]').textContent(),/근속수당 7만원/);assert.equal(await p.locator('#guided-allowance-amount-duty').count(),0);
  await p.locator('[data-allowance-option=custom]').click();const amount=p.locator('#guided-allowance-amount-seniority');assert.equal(await amount.inputValue(),'');await amount.pressSequentially('070000');assert.equal(await amount.inputValue(),'70000','initial zero never prefixes the amount');await amount.fill('90000');await checkKeyboard(p,'#guided-allowance-amount-seniority',width);
  if(width===390&&motion==='reduce'){await p.locator('.guided-wage-content').evaluate(e=>e.scrollTop=0);await p.screenshot({path:'/tmp/allowance-custom-'+engine.name()+'.png'});}
  await next(p);assert.equal(await current(p),'duty');assert.match(await p.locator('#guided-wage-progress').textContent(),/2 \/ 2/);assert.equal(await p.locator('#guided-allowance-amount-seniority').count(),0);assert.equal(await p.locator('#payroll-sms-apply').isDisabled(),true);assert.equal(await p.evaluate(()=>savedCount),0);
  await back(p);assert.equal(await current(p),'seniority');assert.equal(await amount.inputValue(),'90000');await next(p);await p.locator('[data-allowance-option=preset]').click();assert.match(await p.locator('[data-allowance-option=preset]').textContent(),/직책수당 7만원/);assert.equal(await p.locator('#guided-allowance-list input').count(),0);
  if(width===390&&motion==='reduce')await p.screenshot({path:'/tmp/allowance-preset-'+engine.name()+'.png'});
  await p.locator('#payroll-sms-apply').click();if(motion==='no-preference'){assert(await p.locator('#payroll-sms-dialog').evaluate(e=>e.open));assert(await p.locator('#onboarding-dialog').evaluate(e=>e.open),'parent remains until exit completes');}
  await done(p);assert.deepEqual(await p.evaluate(()=>[config.baseHourly,config.ordinaryHourly,config.dutyPay,config.seniorityPayOverride,config.fixedAllowances.duty,savedCount,completionCount,clipReads]),[11050,14482,70000,90000,70000,1,1,0]);await p.close();
  console.log('PASS sequential allowances, presets, zero-free typing, back, keyboard and one final save',engine.name(),motion,width);
 }
 // All six categories keep their own amounts and retain them through back/selection/tax navigation.
 const all=await setup(browser);await toChoice(all);for(const key of['duty','qualification','family','job','legacy'])await all.locator('[data-guided-allowance='+key+']').click();await next(all);
 for(const [i,key]of['seniority','duty','qualification','family','job','legacy'].entries()){
  assert.equal(await current(all),key);assert.match(await all.locator('#guided-wage-progress').textContent(),new RegExp((i+1)+' / 6'));
  if(i<2)await all.locator('[data-allowance-option=preset]').click();else await custom(all,key,String(i*10000));
  if(key==='legacy')break;await next(all);assert.equal(await all.evaluate(()=>savedCount),0);
 }
 await all.locator('#guided-wage-import').click();await settled(all);await all.evaluate(()=>PayrollEstimate.importText('salary','성명 PRIVATE_ALLOWANCE\n근속 999999\n지급 합계 1000000\n공제 합계 100000'));await next(all);assert.equal(await current(all),'legacy');assert.equal(await all.locator('#guided-allowance-amount-legacy').inputValue(),'50000');
 await all.locator('#guided-allowance-change').click();await settled(all);await all.locator('[data-guided-allowance=family]').click();await next(all);assert.match(await all.locator('#guided-wage-progress').textContent(),/1 \/ 5/);
 for(const key of['seniority','duty','qualification','job','legacy']){assert.equal(await current(all),key);if(key==='qualification')assert.equal(await all.locator('#guided-allowance-amount-qualification').inputValue(),'20000');await next(all);}
 await done(all);assert.deepEqual(await all.evaluate(()=>[config.seniorityPayOverride,config.dutyPay,config.fixedAllowances,JSON.parse(localStorage.getItem('shift_payroll_sms_reference_v1')).rate,savedCount]),[70000,180000,{qualification:20000,job:40000,family:0,duty:70000,legacy:50000},.1,1]);assert.equal(await all.evaluate(()=>JSON.stringify(localStorage).includes('PRIVATE_ALLOWANCE')),false);await all.close();
 const none=await setup(browser);await toChoice(none);await none.locator('[data-guided-allowance=none]').click();await next(none);await done(none);assert.deepEqual(await none.evaluate(()=>[config.dutyPay,config.seniorityPayOverride,savedCount]),[0,0,1]);await none.close();
 // Empty/custom zero is valid; invalid values and an over-limit combined amount never save.
 const v=await setup(browser);await toChoice(v);await v.locator('[data-guided-allowance=none]').click();for(const key of['duty','job'])await v.locator('[data-guided-allowance='+key+']').click();await next(v);await custom(v,'duty','-1');await next(v);assert.match(await v.locator('#wage-manual-status').textContent(),/소수점 없이/);await custom(v,'duty','1000000000');await next(v);await custom(v,'job','1');await next(v);assert.match(await v.locator('#wage-manual-status').textContent(),/합계/);assert.equal(await v.evaluate(()=>savedCount),0);await back(v);await custom(v,'duty','');await next(v);await custom(v,'job','');await next(v);await done(v);assert.deepEqual(await v.evaluate(()=>[config.dutyPay,config.seniorityPayOverride,savedCount]),[0,0,1]);
 await v.evaluate(()=>PayrollEstimate.open());await v.locator('#wage-duty').focus();assert.equal(await v.locator('#wage-duty').inputValue(),'');await v.locator('#wage-duty').pressSequentially('070000');assert.equal(await v.locator('#wage-duty').inputValue(),'70000');await v.close();
 // A single selected allowance ends in one save; optional tax import does not replace manual amounts.
 const one=await setup(browser);await toChoice(one);await one.locator('[data-guided-allowance=none]').click();await one.locator('[data-guided-allowance=seniority]').click();await next(one);assert.match(await one.locator('#guided-wage-progress').textContent(),/1 \/ 1/);await one.locator('[data-allowance-option=preset]').click();await next(one);await done(one);assert.deepEqual(await one.evaluate(()=>[config.seniorityPayOverride,config.dutyPay,savedCount]),[70000,0,1]);await one.close();
 const p=await setup(browser);await open(p);await p.locator('#wage-manual-base').fill('11050');await p.locator('#guided-wage-import').click();await settled(p);await p.locator('#wage-paste-fallback>summary').click();await p.locator('#payroll-sms-text').fill('기본시급 99999\n통상시급 99999\n지급 합계 1000000\n공제 합계 100000');assert.equal(await p.locator('#wage-manual-base').inputValue(),'11050');await next(p);await next(p);await p.locator('#wage-manual-ordinary').fill('14482');await next(p);await p.locator('[data-guided-allowance=none]').click();await next(p);await done(p);assert.deepEqual(await p.evaluate(()=>[config.baseHourly,config.ordinaryHourly,JSON.parse(localStorage.getItem('shift_payroll_sms_reference_v1')).rate,savedCount]),[11050,14482,.1,1]);await p.close();
 console.log('PASS all categories, deselection, tax-only imports, empty zero, single allowance and combined validation',engine.name());
 // Both motion preferences dismiss once by swipe, without a small intermediate popup or draft save.
 for(const motion of['reduce','no-preference']){
  const p=await setup(browser,motion);await toChoice(p);await p.locator('[data-guided-allowance=duty]').click();await next(p);await p.locator('[data-allowance-option=preset]').click();await next(p);await p.locator('[data-allowance-option=custom]').click();await p.locator('#guided-allowance-amount-duty').fill('80000');await p.locator('.guided-wage-content').evaluate(e=>e.scrollTop=0);await swipe(p,'#payroll-sms-dialog .sheet-dismiss-handle');
  if(motion==='no-preference')assert.equal(await p.locator('#payroll-sms-dialog').getAttribute('data-sheet-closing'),'true');await p.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);assert(await p.locator('#onboarding-dialog').evaluate(d=>d.open));assert.equal(await p.evaluate(()=>savedCount),0);assert.equal(await p.locator('.sheet-closing,.onboarding-scene-copy').count(),0);
  await p.waitForTimeout(750);await open(p);assert.equal(await stage(p),'base');await p.locator('#guided-wage-import').click();await settled(p);await p.locator('#wage-fill').click();await back(p);await p.evaluate(()=>resolveClip('지급 합계 1000000\n공제 합계 100000'));assert.equal(await p.locator('#payroll-sms-recognized').isVisible(),false);assert.deepEqual(p.errors,[]);await p.close();
 }
 console.log('PASS smooth entry/exit, swipe dismissal, no partial save, clean reopen and stale clipboard',engine.name());await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
