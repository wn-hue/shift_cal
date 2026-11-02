'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const address=process.env.TEST_URL||'http://127.0.0.1:8774/';
const sample='성명 PRIVATE_MOTION\n기본시급 11050\n통상시급 14482\n지급내역\n근속 70000\n직책 70000\n소계 3000000';
(async()=>{for(const engine of[webkit,chromium]){const b=await engine.launch();for(const reduced of[false,true]){
 const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:reduced?'reduce':'no-preference'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master','{"hireDate":"2015-06-16","baseHourly":11050,"ordinaryHourly":14482,"dutyPay":0}');Object.defineProperty(navigator,'clipboard',{value:{readText:()=>new Promise(resolve=>window.resolveClipboard=resolve)}});});
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(address);
 await p.evaluate(()=>PayrollEstimate.open());await p.waitForTimeout(reduced?30:400);
 const before=await p.locator('#payroll-sms-dialog').boundingBox();await p.locator('#wage-fill').click();assert.equal(await p.locator('#wage-fill').getAttribute('aria-busy'),'true');assert(await p.locator('#wage-fill').isDisabled());assert.equal(await p.locator('.wage-progress-dots i').count(),3);
 await p.evaluate(s=>resolveClipboard(s),sample);await p.waitForFunction(()=>document.getElementById('payroll-sms-dialog').dataset.wageConfirming==='true');
 assert.equal(await p.locator('#wage-fill').getAttribute('aria-busy'),'false');assert.equal(await p.locator('.wage-progress-dots').count(),0);assert.doesNotMatch(await p.locator('#payroll-sms-dialog').textContent(),/PRIVATE_MOTION/);
 assert.equal(await p.evaluate(()=>config.dutyPay),0,'motion never saves the imported draft');
 if(!reduced){
  const frame=await p.evaluate(()=>{const d=document.getElementById('payroll-sms-dialog'),h=document.getElementById('payroll-sms-title');return{box:d.getBoundingClientRect().toJSON(),resizing:d.dataset.sheetResizing,headingAnimations:h.getAnimations().length};});
  assert.equal(frame.resizing,'true');assert(frame.headingAnimations>0);assert.equal(await p.locator('.onboarding-scene-copy').count(),0,'two differently sized forms do not overlap');assert(await p.locator('#wage-confirmation').isVisible());assert(Math.abs(frame.box.y+frame.box.height-(before.y+before.height))<2,'footer remains anchored');
  assert(Math.abs(frame.box.height-before.height)<120,'review height does not snap all at once');
  if(engine.name()==='webkit')await p.screenshot({path:'/tmp/reference-motion-review-mid.png'});
 }
 await p.waitForTimeout(420);const end=await p.locator('#payroll-sms-dialog').boundingBox();assert(end.height<before.height-30);assert.equal(await p.locator('[data-sheet-resizing],.onboarding-scene-copy').count(),0);assert.equal(await p.locator('#payroll-sms-title').evaluate(e=>getComputedStyle(e).maskImage),'none');
 if(engine.name()==='webkit'&&!reduced)await p.screenshot({path:'/tmp/reference-motion-review-end.png'});
 await p.locator('#wage-confirm-edit').click();await p.waitForTimeout(80);await p.setViewportSize({width:390,height:400});await p.locator('#wage-manual-ordinary').focus();await p.waitForTimeout(180);
 assert.equal(await p.locator('[data-sheet-resizing]').count(),0,'keyboard geometry cancels an obsolete height animation');const button=await p.locator('#payroll-sms-apply').boundingBox();assert(button.y>=0&&button.y+button.height<=401);await p.setViewportSize({width:390,height:844});await p.waitForTimeout(200);
 // Dismiss midway through the next size change: one uninterrupted exit, no save.
 await p.evaluate(s=>PayrollEstimate.importText('salary',s),sample);await p.waitForTimeout(80);
 const closing=await p.evaluate(()=>{const d=document.getElementById('payroll-sms-dialog'),before=d.getBoundingClientRect().toJSON();d.close();return{before,after:d.getBoundingClientRect().toJSON()};});
 if(!reduced)assert(Math.abs(closing.before.y-closing.after.y)<2,'closing begins at the displayed position');await p.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);assert.equal(await p.locator('[data-sheet-resizing],.onboarding-scene-copy,.sheet-closing').count(),0);assert.equal(await p.evaluate(()=>config.dutyPay),0);
 // Closing during the slide-in also keeps its painted position.
 await p.evaluate(()=>PayrollEstimate.open());await p.waitForTimeout(60);const interrupted=await p.evaluate(()=>{const d=document.getElementById('payroll-sms-dialog'),a=d.getBoundingClientRect().y;d.close();return{a,b:d.getBoundingClientRect().y};});if(!reduced)assert(Math.abs(interrupted.a-interrupted.b)<2);await p.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);
 assert.deepEqual(errors,[]);console.log('PASS reference motion, real pending state, private review, anchored height, keyboard and interrupted exit',engine.name(),reduced?'reduced':'normal');await p.close();
 }await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
