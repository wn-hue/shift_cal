'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of[webkit,chromium]){const b=await engine.launch();for(const width of(process.env.DETAIL_QUICK?[390]:[320,390,768])){
 const p=await b.newPage({viewport:{width,height:844},timezoneId:'Asia/Seoul',reducedMotion:'reduce'}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.clock.setFixedTime(new Date('2026-10-28T12:00:00+09:00'));
 await p.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master','{"hireDate":"2015-06-16","baseHourly":10320,"ordinaryHourly":11000}')});
 await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(process.env.TEST_URL||'http://127.0.0.1:8771/');
 for(const theme of['test1','test3','test4']){
  await p.evaluate(t=>{const e=document.getElementById('pref-theme');e.value=t;e.dispatchEvent(new Event('change'));currentCalDate=new Date(2026,8,1);overrides['2026-09-01']='SPECIAL_DAY';renderCalendar()},theme);
  for(const [lang,month]of[['ko','9월'],['en','September'],['zh','九月'],['ja','9月']]){await p.evaluate(l=>AppI18n.setLanguage(l),lang);assert.equal(await p.locator('.theme-month').textContent(),month);const special=p.locator('.cal-grid .shift-badge.special').first();if(await special.count()){const label=await special.textContent();assert(label.length<=2);if(lang==='en')assert.match(await special.getAttribute('title'),/OT/);}assert(await p.locator('#header-calendar-actions button').evaluateAll(els=>els.every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44})));}
  await p.evaluate(()=>{AppI18n.setLanguage('ko');currentCalDate=new Date(2026,9,1);renderCalendar()});
  // A safe-area inset changes the available calendar space, rather than pushing the last row behind the navigation.
  await p.addStyleTag({content:'body{padding-top:59px!important}.bottom-nav{padding-bottom:44px!important}'});
  await p.evaluate(()=>window.dispatchEvent(new Event('resize')));await p.waitForTimeout(100);
  const fit=await p.evaluate(()=>{const h=document.querySelector('.reference-header').getBoundingClientRect(),g=document.getElementById('calendar-grid').getBoundingClientRect(),n=document.querySelector('.bottom-nav').getBoundingClientRect();return{top:h.top,bottom:g.bottom,nav:n.top}});assert(fit.top>=75&&fit.bottom<fit.nav,JSON.stringify({theme,width,fit}));
  // A six-week month with work, overtime, a sticker and a note must keep every item visible in its date.
  await p.evaluate(()=>{currentCalDate=new Date(2026,4,1);overrides['2026-05-01']='SPECIAL_DAY_NO_OT';dayMemos['2026-05-01']='가족과 저녁 약속';localStorage.setItem('shift_day_stickers',JSON.stringify({'2026-05-01':'beer'}));renderCalendar()});
  const cell=p.locator('.cal-day[data-date="2026-05-01"]');
  const bounds=await cell.evaluate(e=>{const box=e.getBoundingClientRect(),children=[...e.children].filter(x=>getComputedStyle(x).display!=='none').map(x=>({kind:x.className,r:x.getBoundingClientRect()}));return{bottom:box.bottom,children:children.map(x=>({kind:x.kind,top:x.r.top,bottom:x.r.bottom,left:x.r.left,right:x.r.right})),left:box.left,right:box.right}});
  let previous=-Infinity;for(const c of bounds.children){assert(c.top>=previous-.5&&c.bottom<=bounds.bottom+1&&c.left>=bounds.left-1&&c.right<=bounds.right+1,JSON.stringify({theme,width,bounds}));previous=c.bottom;}
  await cell.locator('.memo-tag').click();assert.equal(await p.locator('#memo-tab').getAttribute('aria-selected'),'true');assert.equal(await p.locator('#modal-memo-input').inputValue(),'가족과 저녁 약속');await p.getByRole('button',{name:'근무 변경 내리기',exact:true}).click();
  await p.locator('.cal-day:not(.other-month)').last().scrollIntoViewIfNeeded();await p.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  assert(await p.locator('.cal-day:not(.other-month)').last().evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('.bottom-nav').getBoundingClientRect().top));
  // Off-day text remains readable without relying on a colored fill.
  const contrast=await p.locator('.shift-badge.off').first().evaluate(e=>{const color=getComputedStyle(e).color,bg=getComputedStyle(document.querySelector('.calendar-card')).backgroundColor;const lum=c=>{const v=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return v[0]*.2126+v[1]*.7152+v[2]*.0722};const [a,b]=[lum(color),lum(bg)].sort((a,b)=>a-b);return(b+.05)/(a+.05)});assert(contrast>=4.5,{theme,contrast});
  await p.evaluate(()=>{document.querySelectorAll('style').forEach(s=>{if(s.textContent.startsWith('body{padding-top:59px'))s.remove()});window.scrollTo(0,0)});
 }
 assert.deepEqual(errors,[]);console.log(engine.name(),width,'PASS localized month hierarchy, 44px tools, safe-area fit, six-week dense cells, memo action, scroll clearance and off-day contrast');await p.close();
 }await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
