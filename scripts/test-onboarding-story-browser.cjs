'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const address=process.env.TEST_URL||'http://127.0.0.1:8772/';
const original='.onboarding-main:not(.onboarding-scene-copy)';
const scene=type=>`${original} [data-story=${type}]`;
const settled=p=>p.waitForFunction(()=>!document.querySelector('.onboarding-scene-copy'));
async function checkAnotherLoop(scene){
 await scene.evaluate(e=>e.getAnimations({subtree:true}).forEach(a=>a.currentTime=6375));
 await scene.page().waitForTimeout(100);
 assert(await scene.evaluate(e=>e.getAnimations({subtree:true}).some(a=>a.animationName==='story-loop'&&a.effect.getComputedTiming().currentIteration>=1&&a.playState==='running')),'each visible page repeats after its first pass');
}
async function geometry(p){return p.evaluate(()=>['#onboarding-title','#onboarding-date-open','#onboarding-next'].map(s=>{const b=document.querySelector(s).getBoundingClientRect();return[b.x,b.y,b.width,b.height]}));}
(async()=>{for(const engine of[webkit,chromium]){
 const browser=await engine.launch();
 for(const reducedMotion of['no-preference','reduce']){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await page.goto(address);
  await page.waitForFunction(()=>document.getElementById('onboarding-dialog').open);
  const hire=page.locator(scene('hire'));
  const saved=await page.evaluate(()=>[config.hireDate,config.baseHourly,config.ordinaryHourly,localStorage.getItem('shift_active_group')]);
  await page.waitForTimeout(350);const before=await geometry(page);
  if(reducedMotion==='no-preference'){
   await page.waitForFunction(s=>document.querySelector(s).getAnimations({subtree:true}).some(a=>a.playState==='running'),scene('hire'));
   const frames=await hire.evaluate(e=>e.getAnimations({subtree:true}).map(a=>({duration:a.effect.getTiming().duration,iterations:a.effect.getTiming().iterations})));
   assert(frames.every(a=>a.duration===6400&&a.iterations===Infinity),'all scene parts share the repeating timeline');
   await page.locator('#onboarding-date-open').click();
   await page.waitForFunction(s=>document.querySelector(s).getAnimations({subtree:true}).every(a=>a.playState==='paused'),scene('hire'));
   const paused=await hire.evaluate(e=>e.getAnimations({subtree:true}).map(a=>a.currentTime));
   await page.waitForTimeout(220);
   const held=await hire.evaluate(e=>e.getAnimations({subtree:true}).map(a=>a.currentTime));
   assert(held.every((time,i)=>Math.abs(time-paused[i])<2),'illustration pauses under the date picker');
   await page.locator('#onboarding-date-picker .sheet-dismiss-handle').click();
   await page.waitForFunction(()=>!document.getElementById('onboarding-date-picker').open);
   await page.waitForFunction(s=>document.querySelector(s).getAnimations({subtree:true}).some(a=>a.animationName==='story-loop'&&a.effect.getComputedTiming().currentIteration>=1&&a.playState==='running'),scene('hire'),{timeout:10000});
   const seam=await hire.evaluate(e=>{const animations=e.getAnimations({subtree:true}),opacities=[6399,6401].map(time=>{animations.forEach(a=>{a.pause();a.currentTime=time;});return Number(getComputedStyle(e.querySelector('.story-scene')).opacity);});animations.forEach(a=>a.play());return opacities;});
   assert(seam.every(opacity=>opacity<.01),'both sides of the loop boundary are hidden before parts reset');
  }else assert.equal(await hire.evaluate(e=>e.getAnimations({subtree:true}).length),0);
  assert.deepEqual(await geometry(page),before,'motion must not move the heading, field or action');
  assert.deepEqual(await page.evaluate(()=>[config.hireDate,config.baseHourly,config.ordinaryHourly,localStorage.getItem('shift_active_group')]),saved,'illustration must not write settings');
  await page.locator('#onboarding-date-open').click();await page.locator('#onboarding-date-confirm').click();
  assert.equal(await hire.locator('.story-date-number').textContent(),String(Number((await page.locator('#onboarding-date').inputValue()).slice(-2))));
  await page.locator('#onboarding-next').click();
  if(reducedMotion==='no-preference'){
   const clone=page.locator('.onboarding-scene-copy');
   assert.equal(await clone.count(),1);assert.equal(await clone.getAttribute('aria-hidden'),'true');
   assert.equal(await clone.locator('.story-motion').evaluateAll(es=>es.flatMap(e=>e.getAnimations()).length),0,'outgoing illustration keeps its frame');
  }
  await settled(page);
  const team=page.locator(scene('team'));
  assert.equal(await team.locator('.is-selected').count(),0,'no group is falsely preselected');
  if(reducedMotion==='no-preference')await checkAnotherLoop(team);
  await page.locator('[data-onboarding-group=C]').click();assert.equal(await team.locator('.is-selected').getAttribute('data-story-group'),'C');
  await page.locator('#onboarding-next').click();await settled(page);
  const wage=page.locator(scene('wage'));
  await page.locator('#onboarding-next').click();
  await page.waitForFunction(s=>document.querySelector(s).getAnimations({subtree:true}).every(a=>a.playState==='paused'),scene('wage'));
  await page.locator('#payroll-sms-dialog .sheet-dismiss-handle').click();await page.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);
  if(reducedMotion==='no-preference'){
   await page.waitForFunction(s=>document.querySelector(s).getAnimations({subtree:true}).some(a=>a.playState==='running'),scene('wage'));
   await checkAnotherLoop(wage);
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await wage.evaluate(e=>e.getAnimations({subtree:true}).length),0,'live reduced-motion setting takes effect');
  }
  await page.setViewportSize({width:320,height:500});await page.waitForTimeout(80);
  assert(await page.locator('#onboarding-next').evaluate(e=>{const b=e.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight+1}));
  assert(await page.locator('#onboarding-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth));
  assert.deepEqual(errors,[]);await page.close();console.log('PASS explanatory scenes, continuous loops, stable layout, pause/resume, selection, transitions and reduced motion',engine.name(),reducedMotion);
 }
 await browser.close();
}})().catch(error=>{console.error(error);process.exit(1)});
