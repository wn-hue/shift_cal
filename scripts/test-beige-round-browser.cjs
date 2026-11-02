'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of [webkit,chromium]){const browser=await engine.launch();for(const width of [320,390,430]){
 const p=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-11-02T12:00:00+09:00'));
 await p.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master','{"hireDate":"2015-06-16","baseHourly":11050,"ordinaryHourly":14482}');});
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
 await p.goto(process.env.TEST_URL||'http://127.0.0.1:8773/');await p.evaluate(()=>document.fonts.ready);
 assert.equal(await p.locator('#pref-theme').inputValue(),'current');
 // Explicitly re-enable an archived option only inside this preview regression fixture.
 async function choose(theme){await p.locator('#pref-theme option[value="'+theme+'"]').evaluate(o=>{o.hidden=false;o.disabled=false});await p.evaluate(()=>openAppPreferences());await p.locator('#choose-theme').click();await p.locator('#settings-options input[value="'+theme+'"]').check();await p.locator('#settings-back').click();await p.waitForFunction(()=>document.getElementById('app-preferences-dialog').hidden);await p.waitForTimeout(80);}
 const snapshot=()=>p.evaluate(()=>{const cell=document.querySelector('.cal-day.today'),header=document.querySelector('.reference-header');return{radius:getComputedStyle(cell).borderRadius,outline:getComputedStyle(cell,'::after').borderTopColor,header:getComputedStyle(header).borderRadius,page:getComputedStyle(document.body).backgroundColor}});
 await p.evaluate(()=>openAppPreferences());await p.locator('#choose-theme').click();
 assert.equal(await p.locator('#settings-options input[value=test],#settings-options input[value=beige-round]').count(),0,'archived themes are absent from the real picker');
 await p.locator('#settings-options .sheet-dismiss-handle').click();await p.waitForFunction(()=>!document.getElementById('settings-options').open);await p.locator('#settings-back').click();await p.waitForFunction(()=>document.getElementById('app-preferences-dialog').hidden);
 await choose('test');const original=await snapshot();await choose('beige-round');
 assert.equal(await p.evaluate(()=>localStorage.getItem('shift_display_theme')),'beige-round');
 await p.reload();assert.equal(await p.locator('#pref-theme').inputValue(),'current');
 assert.equal(await p.evaluate(()=>localStorage.getItem('shift_display_theme')),'current','saved archived theme falls back to Day & night');
 assert.equal(await p.evaluate(()=>document.body.hasAttribute('data-beige-round')),false);
 await choose('beige-round');
 assert.equal(await p.locator('.cal-day.today .day-num').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(49, 130, 246)');
 for(const view of ['calendar','groups','payroll','all']){
  await p.evaluate(v=>switchView(v),view);await p.waitForTimeout(100);
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,engine.name()+width+view);
  if(view==='calendar'){
   const fits=await p.evaluate(()=>{const h=document.querySelector('.reference-header').getBoundingClientRect(),g=document.querySelector('#calendar-grid').getBoundingClientRect(),n=document.querySelector('.bottom-nav').getBoundingClientRect(),t=document.querySelector('#cal-month-title-btn').getBoundingClientRect(),a=document.querySelector('#header-calendar-actions').getBoundingClientRect();return{top:h.top,bottom:g.bottom,nav:n.top,overlap:t.right>a.left&&t.left<a.right&&t.bottom>a.top&&t.top<a.bottom}});
   assert(fits.top>=16&&fits.bottom<fits.nav&&!fits.overlap,JSON.stringify({width,fits}));
  }
  if(width===390&&engine===webkit)await p.screenshot({path:`/tmp/beige-round-${view}.png`});
 }
 await p.evaluate(()=>{switchView('calendar');currentCalDate=new Date(2026,4,1);overrides['2026-05-01']='SPECIAL_DAY_NO_OT';dayMemos['2026-05-01']='가족과 저녁 약속';renderCalendar()});
 await p.addStyleTag({content:'body{padding-top:59px!important}.bottom-nav{padding-bottom:34px!important}'});await p.waitForTimeout(100);
 const bounds=await p.locator('.cal-day[data-date="2026-05-01"]').evaluate(e=>{const r=e.getBoundingClientRect();return[...e.children].filter(c=>getComputedStyle(c).display!=='none').map(c=>{const b=c.getBoundingClientRect();return{kind:c.className,fits:b.bottom<=r.bottom+1&&b.left>=r.left-1&&b.right<=r.right+1}})});assert(bounds.every(x=>x.fits),JSON.stringify({width,bounds}));
 await p.evaluate(()=>{document.querySelectorAll('style').forEach(s=>{if(s.textContent.startsWith('body{padding-top:59px'))s.remove()});currentCalDate=new Date(2026,10,1);renderCalendar();window.scrollTo(0,0)});
 await choose('test');assert.equal(await p.evaluate(()=>document.body.hasAttribute('data-beige-round')),false);assert.deepEqual(await snapshot(),original);
 assert.deepEqual(errors,[]);console.log(engine.name(),width,'PASS: archived themes hidden, saved preview falls back, retained Beige designs work, default unchanged, 4 screens, today marker and six-week safe-area layout');await p.close();
 }await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
