'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const url=process.env.TEST_URL||'http://127.0.0.1:8768/';
const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function geometry(p){return p.evaluate(()=>{const card=document.querySelector('.calendar-card').getBoundingClientRect(),nav=document.querySelector('.bottom-nav').getBoundingClientRect();return{gap:nav.top-card.bottom,top:card.top,bottom:card.bottom,nav:nav.top,grid:document.getElementById('calendar-grid').getBoundingClientRect().height,room:nav.top-(document.getElementById('calendar-grid').getBoundingClientRect().top+scrollY)-20,overflow:document.documentElement.scrollWidth>innerWidth};});}
async function filled(p,label){
 await p.waitForFunction(()=>{const card=document.querySelector('.calendar-card').getBoundingClientRect(),nav=document.querySelector('.bottom-nav').getBoundingClientRect();return nav.top-card.bottom>=6&&nav.top-card.bottom<=10;},null,{timeout:3000}).catch(async()=>{assert.fail(label+': '+JSON.stringify(await geometry(p)));});
 assert.equal((await geometry(p)).overflow,false,label+' has no horizontal overflow');
}
(async()=>{for(const engine of(process.env.HEIGHT_QUICK?[webkit]:[webkit,chromium])){
 const browser=await engine.launch();try{for(const [width,height] of(process.env.HEIGHT_QUICK?[[393,852]]:[[393,852],[430,932],[440,956],[390,1200]])){
  const p=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true,reducedMotion:'reduce',timezoneId:'Asia/Seoul'}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-11-07T12:00:00+09:00'));
  await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
  await p.context().addCookies([{name:'__Host-work-routine-ready',value:'1',url:'https://20261104.xyz',secure:true,sameSite:'Lax'}]);
  await p.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{value:true});localStorage.setItem('shift_origin_ready_v1','1');localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_salary_config_master','{"hireDate":"2015-01-01","baseHourly":11050,"ordinaryHourly":14482}');});
  await p.goto(url);await p.evaluate(()=>document.fonts.ready);await filled(p,'Initial calendar fills the available height');
  await p.evaluate(()=>document.documentElement.style.setProperty('--theme-calendar-room','352px'));await filled(p,'Legacy grid minimum cannot shorten the viewport card');
  // Saved setup can hide a preceding guide after the first height measurement.
  await p.evaluate(()=>{const guide=document.getElementById('first-use-guide');guide.style.cssText='height:96px;min-height:96px;max-height:96px;margin:0;padding:0;overflow:hidden';guide.hidden=false;dispatchEvent(new Event('resize'));});await settle(p);await settle(p);
  await p.evaluate(()=>{document.getElementById('first-use-guide').hidden=true;});await filled(p,'Hiding the setup guide must expand the calendar again');
  // A restored standalone viewport can move fixed navigation without resizing its box.
  await p.evaluate(()=>{document.querySelector('.bottom-nav').style.bottom='80px';dispatchEvent(new Event('pageshow'));});await filled(p,'Restored viewport moves the calendar edge with navigation');
  await p.evaluate(()=>{document.querySelector('.bottom-nav').style.bottom='';dispatchEvent(new Event('pageshow'));});await filled(p,'Full viewport restores the longer calendar');
  // Match an iPhone PWA's status bar and home-indicator insets.
  await p.evaluate(()=>{document.body.style.paddingTop='59px';document.body.style.paddingBottom='134px';document.querySelector('.bottom-nav').style.paddingBottom='42px';document.documentElement.style.setProperty('--visible-height',innerHeight+'px');});await filled(p,'Standalone safe areas leave only the intended card gap');
  for(const theme of ['current','toss','gpt','dark','test1','test3','test4']){
   await p.evaluate(t=>{const e=document.getElementById('pref-theme');e.value=t;e.dispatchEvent(new Event('change'));currentCalDate=new Date(2026,10,1);renderCalendar();scrollTo(0,0);},theme);await filled(p,theme+' fills the standalone viewport');
   for(const [month,rows] of [[1,4],[10,5],[4,6]]){
    await p.evaluate(m=>{currentCalDate=new Date(2026,m,1);renderCalendar();scrollTo(0,0);},month);await settle(p);
    assert.equal(await p.locator('#calendar-grid>.cal-day').count(),rows*7);
    const tracks=await p.locator('#calendar-grid').evaluate(e=>({height:e.getBoundingClientRect().height,rows:getComputedStyle(e).gridTemplateRows.split(' ').map(parseFloat)}));assert(Math.abs(tracks.rows.reduce((a,b)=>a+b,0)-tracks.height)<2,'All date rows fill the entire calendar height');assert(Math.max(...tracks.rows)-Math.min(...tracks.rows)<1,'Date rows share the same height');
    const g=await geometry(p);if(g.room>=rows*88)await filled(p,theme+' '+rows+' weeks');
    else{await p.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));const end=await p.locator('#calendar-grid>.cal-day').last().boundingBox(),nav=await p.locator('.bottom-nav').boundingBox();assert(end.y+end.height<=nav.y+1,'Dense months keep the last row accessible: '+JSON.stringify({theme,rows,end,nav}));}
   }
  }
  await p.evaluate(()=>{const e=document.getElementById('pref-theme');e.value='current';e.dispatchEvent(new Event('change'));currentCalDate=new Date(2026,10,1);renderCalendar();scrollTo(0,0);});await filled(p,'Final calendar');
  if(height>1100)assert((await geometry(p)).grid>740,'Tall web apps are not limited to a 740px calendar');
  if(width===393)await p.screenshot({path:'/tmp/calendar-height-pwa-'+engine.name()+'.png'});
  await p.locator('#bnav-pay').click();await p.locator('#bnav-cal').click();await filled(p,'Returning to the calendar recalculates its height');
  assert.deepEqual(errors,[]);await p.close();console.log('PASS',engine.name(),width,height,'PWA full height, late setup removal, restored viewport, safe areas, 7 themes, 4/5/6 weeks and tab return');
 }}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1;});
