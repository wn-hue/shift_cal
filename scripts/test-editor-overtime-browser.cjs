'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of[webkit,chromium]){const browser=await engine.launch();for(const width of(process.env.OT_QUICK?[390]:[320,390])){
 const p=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.clock.setFixedTime(new Date('2026-10-20T12:00:00+09:00'));
 await p.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master','{"hireDate":"2015-06-16","baseHourly":10320,"ordinaryHourly":11000}');});
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(process.env.TEST_URL||'http://127.0.0.1:8772/');
 const open=async key=>{await p.evaluate(k=>{const d=new Date(k+'T12:00:00');currentCalDate=new Date(d.getFullYear(),d.getMonth(),1);renderCalendar();openOverrideModal(k,d,getActualShift(d,currentGroup));},key);await p.waitForTimeout(80)};
 const closed=async()=>{await p.waitForFunction(()=>!document.getElementById('modal-override').classList.contains('active'));};
 const close=async()=>{await p.evaluate(()=>closeModalDirect());await closed()};
 const save=async()=>{await p.locator(await p.locator('#modal-override').getAttribute('data-editor-design')==='apple'?'#design-done':'#apply-preview').click();await closed()};
 const read=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('shift_overrides_C')||'{}'));
 const toggle=p.locator('#design-ot-toggle');
 const extra=async()=>{if(!await p.locator('.design-extra').evaluate(e=>e.open))await p.locator('.design-extra>summary').click()};
 for(const theme of['current','test','toss','gpt','dark','test1','test3','test4']){
  await p.evaluate(t=>{const e=document.getElementById('pref-theme');e.value=t;e.dispatchEvent(new Event('change'));},theme);
  for(const[date,base]of[['2026-10-20','DAY'],['2026-10-27','NIGHT'],['2026-10-22','OFF']]){
   await open(date);assert.deepEqual(await p.locator('.design-main-choices .opt-btn:visible').evaluateAll(es=>es.map(e=>e.dataset.override)),[base]);
   assert.equal(await p.locator('.design-change').count(),0);assert.equal(await p.locator('[data-override="NO_OT"],[data-override$="_NO_OT"]').evaluateAll(es=>es.every(e=>e.hidden&&e.disabled)),true);
   assert(await p.locator('.design-extra').evaluate(e=>e.open));
   const header=await p.locator('.design-date-row').boundingBox(),ot=await toggle.boundingBox(),dateBox=await p.locator(theme==='test4'?'#kakao-date': '#design-date').boundingBox();assert(ot.x>=dateBox.x+dateBox.width&&ot.y>=header.y&&ot.y+ot.height<=header.y+header.height+1,JSON.stringify({theme,width,header,ot,dateBox}));
   if(base==='OFF'){assert(await toggle.isDisabled());assert.equal(await toggle.getAttribute('aria-checked'),'false');}else{assert(await toggle.isVisible());assert.equal(await toggle.getAttribute('aria-checked'),'true');}
   assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await close();
  }
  await open('2026-10-20');await toggle.click();assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.equal((await read())['2026-10-20'],undefined,'switch only stages change');
  assert.equal(await p.locator('[data-override="DAY"]').getAttribute('aria-pressed'),'true');await save();assert.deepEqual(await read(),{'2026-10-20':'NO_OT'});
  await open('2026-10-21');assert.equal(await toggle.getAttribute('aria-checked'),'true','next day keeps OT enabled');await close();
  await open('2026-10-20');assert.equal(await toggle.getAttribute('aria-checked'),'false');
  if(width===390&&engine.name()==='webkit'&&['current','test','test3','test4'].includes(theme))await p.screenshot({path:'/tmp/ot-editor-'+theme+'.png'});
  await toggle.click();await save();assert.deepEqual(await read(),{},'ON restores the scheduled shift');
 }
 // Night OT retains the night shift, and cancelling a draft never saves it.
 await open('2026-10-27');await toggle.click();await save();assert.equal(await p.evaluate(()=>getActualShift(new Date(2026,9,27),currentGroup).origType),'NIGHT');
 await open('2026-10-20');await toggle.click();await close();assert.deepEqual(await read(),{'2026-10-27':'NO_OT'});
 // Off-day special work stays available, with one switch for both overtime variants.
 await open('2026-10-22');await extra();await p.locator('[data-override="SPECIAL_DAY"]').click();assert.equal(await toggle.getAttribute('aria-checked'),'true');await toggle.click();
 await p.locator('[data-override="SPECIAL_NIGHT"]').click();assert.equal(await toggle.getAttribute('aria-checked'),'false','same-day OT preference follows special shift selection');await save();assert.equal((await read())['2026-10-22'],'SPECIAL_NIGHT_NO_OT');
 await open('2026-10-22');await extra();assert.equal(await p.locator('[data-override="SPECIAL_NIGHT"]').getAttribute('aria-pressed'),'true');await toggle.click();await save();assert.equal((await read())['2026-10-22'],'SPECIAL_NIGHT');
 await open('2026-10-22');await p.locator('.design-reset').click();assert(await toggle.isVisible());assert(await toggle.isDisabled());await save();assert.equal((await read())['2026-10-22'],undefined);
 // Automatic holiday special work must stay special when overtime is switched off/on.
 await open('2026-10-09');assert.equal(await p.evaluate(()=>getActualShift(new Date(2026,9,9),currentGroup).type),'SPECIAL_DAY');await toggle.click();await save();assert.equal((await read())['2026-10-09'],'SPECIAL_DAY_NO_OT');
 await open('2026-10-09');await toggle.click();await save();assert.equal((await read())['2026-10-09'],undefined);assert.equal(await p.evaluate(()=>getActualShift(new Date(2026,9,9),currentGroup).type),'SPECIAL_DAY');
 // Attendance keeps its existing OT/pay rules, rather than being replaced by an OT toggle.
 await open('2026-10-20');if(!await p.locator('.design-attendance').evaluate(e=>e.open))await p.locator('.design-attendance>summary').click();await p.locator('[data-override="HALF_POST"]').click();assert(await toggle.isVisible());assert(await toggle.isDisabled());assert.equal(await toggle.getAttribute('aria-checked'),'false');await save();assert.equal((await read())['2026-10-20'],'HALF_POST');
 // Existing opposite shifts and other teams remain intact when opening/closing.
 await p.evaluate(()=>{overrides['2026-10-20']='NIGHT';saveOverrides();localStorage.setItem('shift_overrides_A','{"2026-10-20":"LEAVE"}');});
 await open('2026-10-20');assert(await toggle.isVisible());assert(await toggle.isDisabled());await close();assert.equal((await read())['2026-10-20'],'NIGHT');assert.equal(await p.evaluate(()=>localStorage.getItem('shift_overrides_A')),'{"2026-10-20":"LEAVE"}');
 // Completion still fits a short screen; a memo saves the staged shift in the same action.
 await p.evaluate(()=>{delete overrides['2026-10-20'];saveOverrides();});await p.setViewportSize({width,height:540});await open('2026-10-20');await toggle.click();await p.locator('.design-memo-link').click();await p.locator('#memo-compose-input').fill('잔업 없이 퇴근');await p.locator('#memo-compose-save').click();await closed();assert.equal((await read())['2026-10-20'],'NO_OT');assert.equal(await p.evaluate(()=>dayMemos['2026-10-20']),'잔업 없이 퇴근');
 assert.deepEqual(errors,[]);console.log('PASS scheduled-only choices, 8 themes, per-date OT staging/persistence/reset, night/holiday/special/leave rules, legacy preservation and one-save memo',engine.name(),width);await p.close();
 }await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
