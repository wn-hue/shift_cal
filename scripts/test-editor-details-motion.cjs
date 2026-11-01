'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of[webkit,chromium]){const b=await engine.launch();for(const reduced of[false,true]){
 const p=await b.newPage({viewport:{width:390,height:844},reducedMotion:reduced?'reduce':'no-preference',timezoneId:'Asia/Seoul'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');});await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(process.env.TEST_URL||'http://127.0.0.1:8772/');
 for(const theme of['current','test3','test4']){
  await p.evaluate(t=>{const e=document.getElementById('pref-theme');e.value=t;e.dispatchEvent(new Event('change'));const d=new Date('2026-10-20T12:00');openOverrideModal('2026-10-20',d,getActualShift(d,currentGroup));},theme);await p.waitForTimeout(250);
  const details=p.locator('.design-attendance');await details.evaluate(e=>{e.open=false});await details.locator('summary').dispatchEvent('pointerdown',{pointerType:'mouse'});
  // Native summary clicks remain keyboard-accessible; interrupted motion reverses from its current height.
  const result=await details.evaluate((e,reduced)=>{const summary=e.querySelector('summary'),before=e.getBoundingClientRect().height;summary.click();const animations=e.getAnimations();if(reduced)return{before,after:e.getBoundingClientRect().height,animated:animations.length,open:e.open};const a=animations[0];a.pause();a.currentTime=90;const middle=e.getBoundingClientRect().height;summary.click();const reversed=e.getBoundingClientRect().height;return{before,middle,reversed,animated:animations.length};},reduced);
  if(reduced){assert.equal(result.animated,0);assert(result.open&&result.after>result.before);}else{assert.equal(result.animated,1);assert(result.middle>result.before);assert(Math.abs(result.middle-result.reversed)<1,JSON.stringify(result));await p.waitForTimeout(280);assert.equal(await details.evaluate(e=>e.open),false);}
  assert.equal(await details.evaluate(e=>e.getAnimations().length),0);assert.equal(await details.evaluate(e=>e.style.overflow),'');
  // Reopening the editor cancels unfinished details motion and restores the expanded special choices.
  await details.evaluate(e=>e.querySelector('summary').click());await p.evaluate(()=>{const d=new Date('2026-10-21T12:00');openOverrideModal('2026-10-21',d,getActualShift(d,currentGroup));});await p.waitForTimeout(280);assert.equal(await details.evaluate(e=>e.getAnimations().length),0);assert.equal(await p.locator('.design-extra').evaluate(e=>e.open),true);
  await p.evaluate(()=>closeModalDirect());await p.waitForFunction(()=>!document.getElementById('modal-override').classList.contains('active'));
 }
 assert.deepEqual(errors,[]);console.log('PASS smooth/reversible details, reduced motion, reopen cleanup and consistent expanded extras',engine.name(),reduced?'reduced':'normal');await p.close();
 }await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
