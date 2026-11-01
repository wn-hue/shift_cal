'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require('playwright');
(async()=>{for(const engine of[webkit,chromium]){const browser=await engine.launch();for(const width of[320,390]){
 const p=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-02T12:00:00+09:00'));
 await p.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master','{"hireDate":"2015-06-16","baseHourly":11050,"ordinaryHourly":14482,"dutyPay":70000}');});
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(process.env.TEST_URL||'http://127.0.0.1:8772/');
 assert.equal(await p.locator('body').getAttribute('data-pref-shape'),'circle');
 assert.equal(await p.evaluate(()=>getComputedStyle(document.querySelector('.cal-grid .shift-badge.day,.cal-grid .shift-badge.night')).borderRadius),'50%');
 await p.evaluate(()=>switchView('payroll'));await p.locator('.wage-edit-button').tap();
 assert.equal(await p.locator('#wage-seniority').textContent(),'70,000');
 assert.deepEqual(await p.locator('.wage-mini-cards>.wage-mini-card>span:first-child').evaluateAll(es=>es.map(e=>e.firstChild.textContent)),['근속수당','직책수당','자격수당','가족수당','직무수당']);
 assert(await p.locator('#wage-paste-guide').isVisible());
 const sheet=p.locator('#payroll-sms-dialog');
 for(const theme of['current','toss','gpt','dark','test']){
  await p.evaluate(t=>{const s=document.getElementById('pref-theme');s.value=t;s.dispatchEvent(new Event('change'));},theme);
  for(const id of['wage-manual-base','wage-manual-ordinary']){
   await p.locator('#'+id).tap();await p.setViewportSize({width,height:400});await p.waitForTimeout(160);
   const g=await p.evaluate(id=>{const input=document.getElementById(id),r=input.getBoundingClientRect(),footer=document.querySelector('#payroll-sms-dialog .sms-actions').getBoundingClientRect(),frame=document.querySelector('.guided-wage-content').getBoundingClientRect(),dialog=document.getElementById('payroll-sms-dialog');return{visible:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===input,top:r.top,bottom:r.bottom,frameTop:frame.top,frameBottom:frame.bottom,footerTop:footer.top,footerBottom:footer.bottom,overflow:dialog.scrollWidth>dialog.clientWidth}},id);
   assert(g.visible&&g.top>=g.frameTop-1&&g.bottom<=g.frameBottom+1&&g.bottom<g.footerTop&&g.footerBottom<=401&&!g.overflow,JSON.stringify({engine:engine.name(),width,theme,id,g}));
   await p.locator('#'+id).fill(id.endsWith('base')?'11500':'14500');
   if(width===390&&theme==='current'&&id.endsWith('ordinary'))await p.screenshot({path:'/tmp/wage-keyboard-'+engine.name()+'.png'});
   await p.setViewportSize({width,height:844});await p.waitForTimeout(100);
  }
 }
 await p.evaluate(()=>{const s=document.getElementById('pref-theme');s.value='current';s.dispatchEvent(new Event('change'));document.querySelector('.guided-wage-content').scrollTop=0;});
 if(width===390)await p.screenshot({path:'/tmp/wage-layout-'+engine.name()+'.png'});
 await p.locator('#payroll-sms-apply').tap();await p.waitForFunction(()=>!document.getElementById('payroll-sms-dialog').open);
 assert.deepEqual(await p.evaluate(()=>[config.baseHourly,config.ordinaryHourly,config.dutyPay]),[11500,14500,70000],'Seniority stays separate from fixed allowances');
 await p.evaluate(()=>{const shape=document.getElementById('pref-shape');shape.value='square';shape.dispatchEvent(new Event('change'));});await p.reload();assert.equal(await p.locator('body').getAttribute('data-pref-shape'),'square','Keep an explicitly selected shape');
 assert.deepEqual(errors,[]);await p.close();console.log('PASS default circle, saved shape, ordered seniority, visible keyboard inputs/footer, five themes and saved wages',engine.name(),width);
 }await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
