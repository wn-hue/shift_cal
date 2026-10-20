'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE);
const url=process.env.CHECK_URL||'http://127.0.0.1:8769/';
(async()=>{for(const engine of[chromium,webkit]){const browser=await engine.launch();
 for(const [width,height] of[[320,568],[360,640],[384,640],[390,664],[390,852],[412,700],[430,932],[768,1024],[915,412]]){
  for(const incomplete of[false,true]){
   const page=await browser.newPage({viewport:{width,height},isMobile:true,deviceScaleFactor:2}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
   await page.addInitScript(incomplete=>{localStorage.setItem('shift_active_group','C');if(!incomplete)localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:11050,ordinaryHourly:14482}));},incomplete);
   await page.goto(url);await page.evaluate(()=>{currentCalDate=new Date(2026,9,1);renderCalendar();document.getElementById('weather-icon').textContent='☀️';document.getElementById('weather-temperature').textContent='19°';const alert=document.getElementById('weather-alert');alert.hidden=false;alert.textContent='비 예보';});
   for(const theme of['current','toss','gpt','dark']){
    await page.evaluate(t=>document.body.dataset.prefTheme=t,theme);
    for(const month of[9,4]){
     await page.evaluate(m=>{currentCalDate=new Date(2026,m,1);renderCalendar()},month);
     await page.waitForTimeout(80);
     const result=await page.evaluate(()=>{const grid=document.getElementById('calendar-grid'),nav=document.querySelector('.bottom-nav'),header=document.querySelector('.reference-header'),rect=grid.getBoundingClientRect(),nr=nav.getBoundingClientRect();return {overflow:document.documentElement.scrollWidth-innerWidth,gridWidth:rect.width,navTop:nr.top,navBottom:nr.bottom,bottom:rect.bottom,top:rect.top,height:rect.height,rows:grid.children.length/7,preferred:parseFloat(getComputedStyle(grid).getPropertyValue('--calendar-row-preferred')),min:parseFloat(getComputedStyle(grid).getPropertyValue('--calendar-cell-min')),header:header.getBoundingClientRect().bottom,day:Math.min(...[...grid.children].map(e=>e.getBoundingClientRect().height)),reserve:parseFloat(getComputedStyle(document.body).paddingBottom),navHeight:nr.height,desired:innerHeight-nr.height-(rect.top+scrollY)-16};});
     assert(result.overflow<=1,JSON.stringify({width,height,incomplete,theme,result}));assert(result.day>=result.min-1);assert(result.navBottom<=height+1);assert(result.top>=result.header);assert(result.reserve>=result.navHeight);
     assert(result.height<=result.rows*result.preferred+1,'Date rows must not stretch: '+JSON.stringify(result));
     if(result.desired>=result.rows*result.min)assert(result.bottom<=result.navTop-8,JSON.stringify(result));
    }
   }
   // iOS standalone: safe areas plus a visual viewport shorter than the fixed layout.
   if(width===390&&!incomplete){
    await page.addStyleTag({content:'body{padding-top:59px!important}body[data-pref-theme] .bottom-nav{padding-bottom:42px!important}'});
    await page.evaluate(()=>{currentCalDate=new Date(2026,9,1);renderCalendar();Object.defineProperty(visualViewport,'height',{configurable:true,get:()=>innerHeight-80});window.dispatchEvent(new Event('resize'));});
    await page.waitForTimeout(100);
    const gap=await page.evaluate(()=>document.querySelector('.bottom-nav').getBoundingClientRect().top-document.getElementById('calendar-grid').getBoundingClientRect().bottom);
    assert(gap>=12,'Standalone month must fit above navigation: '+gap);
    assert(await page.locator('#calendar-grid').evaluate(e=>e.getBoundingClientRect().height<=e.children.length/7*92+1),'iPhone date rows remain compact');
    // Simulate stale fixed-position coordinates during an installed-app resize.
    await page.evaluate(()=>{const nav=document.querySelector('.bottom-nav'),measure=nav.getBoundingClientRect.bind(nav);nav.getBoundingClientRect=()=>{const rect=measure();return {height:rect.height,top:rect.top+180};};dispatchEvent(new Event('resize'));});
    await page.waitForTimeout(100);
    assert(await page.locator('#calendar-grid').evaluate(e=>{const rect=e.getBoundingClientRect(),nav=document.querySelector('.bottom-nav'),bottom=innerHeight-nav.offsetHeight;return rect.bottom<=bottom-12;}),'Stale nav coordinates must not grow the calendar beneath the menu');
    await page.screenshot({path:'/tmp/calendar-iphone-safe-'+engine.name()+'.png'});
    await page.evaluate(()=>{delete visualViewport.height;});
   }
   // Shrinking browser chrome space recomputes the grid; returning to calendar after another tab does too.
   if(width===412&&!incomplete){await page.setViewportSize({width,height:580});await page.waitForTimeout(100);await page.evaluate(()=>switchView('payroll'));await page.evaluate(()=>switchView('calendar'));await page.waitForTimeout(100);assert(await page.locator('#calendar-grid').evaluate(e=>e.scrollWidth<=e.clientWidth));await page.setViewportSize({width,height});}
   if(width===384&&incomplete)await page.screenshot({path:'/tmp/adaptive-calendar-'+engine.name()+'.png'});
   if(!incomplete&&width===390){await page.evaluate(()=>PayrollEstimate.open());assert.equal(await page.locator('#wage-manual-base').getAttribute('placeholder'),'10,320');assert.equal(await page.locator('#wage-manual-ordinary').getAttribute('placeholder'),'11,000');assert.match(await page.locator('#payroll-sms-text').getAttribute('placeholder'),/10,320원\n통상시급: 11,000원/);await page.locator('#wage-manual-tab').click();assert.equal(await page.locator('#wage-manual-base').inputValue(),'11,050');await page.locator('#payroll-sms-close').click();}
   // Every date remains reachable above the fixed navigation when vertical scrolling is necessary.
   await page.locator('#calendar-grid .cal-day').last().scrollIntoViewIfNeeded();const bottom=await page.locator('#calendar-grid .cal-day').last().boundingBox(),nav=await page.locator('.bottom-nav').boundingBox();
   if(bottom.y+bottom.height>nav.y){await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(50);const last=await page.locator('#calendar-grid .cal-day').last().boundingBox();assert(last.y+last.height<=nav.y+1);}
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS adaptive calendar, setup guide, 5/6 weeks, 4 themes, navigation and preserved wages',engine.name(),width,height);
 }
 await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
