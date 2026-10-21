const assert = require('node:assert/strict');
const {webkit, chromium} = require(process.env.PLAYWRIGHT_MODULE);
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-3*3600000));
const day = n => new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
(async()=>{
 for(const engine of [webkit,chromium]) {
  const browser=await engine.launch();
  for(const width of [320,390,412]) {
   const p=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});
   const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/api/**',async r=>{
    const url=new URL(r.request().url());
    if(url.pathname==='/api/today-menu') {
     const date=url.searchParams.get('date')||today;
     if(date===day(2))return r.fulfill({json:{status:'not_published',date,meals:[],message:'이 날짜의 식단이 아직 등록되지 않았어요.'}});
     if(date===day(1))await new Promise(resolve=>setTimeout(resolve,200));
     return r.fulfill({json:{status:'ok',date,checkedAt:new Date().toISOString(),meals:['조식','중식','석식','야식'].map(name=>({name,groups:[{title:'일반식',items:[date+' 밥','국','반찬']}]}))}}).catch(()=>{});
    }
    if(url.pathname==='/api/meal-votes')return r.fulfill({json:{date:today,mine:{},totals:Object.fromEntries(['조식','중식','석식','야식'].map(m=>[m,{up:3,down:1}]))}});
    return r.fulfill({json:{configured:false}});
   });
   await p.addInitScript(()=>localStorage.setItem('shift_active_group','C'));
   await p.goto(process.env.CHECK_URL||'http://127.0.0.1:8768');await p.evaluate(()=>switchView('menu'));
   await p.waitForFunction(()=>document.querySelectorAll('.meal-rating').length===4);
   await p.getByRole('button',{name:'다음 날 식단',exact:true}).click();
   await p.waitForFunction(date=>document.querySelector('.meal-items')?.textContent.includes(date),day(1));
   assert.equal(await p.locator('#today-menu-relative').textContent(),'내일 식단');
   assert.equal(await p.locator('.meal-rating').count(),0,'Tomorrow never displays today’s vote controls');
   await p.getByRole('button',{name:'다음 날 식단',exact:true}).click();
   await p.locator('#today-menu-empty').waitFor({state:'visible'});
   await p.getByRole('button',{name:'오늘',exact:true}).click();
   await p.waitForFunction(()=>document.querySelectorAll('.meal-rating').length===4);
   // Swipe on the meal surface; vertical drag leaves the date alone.
   async function drag(dx,dy) {await p.locator('#today-menu-panel').dispatchEvent('touchstart',{touches:[{identifier:1,clientX:180,clientY:300}]});await p.locator('#today-menu-panel').dispatchEvent('touchmove',{touches:[{identifier:1,clientX:180+dx,clientY:300+dy}]});await p.locator('#today-menu-panel').dispatchEvent('touchend',{touches:[],changedTouches:[{identifier:1,clientX:180+dx,clientY:300+dy}]});}
   await drag(2,100);assert.equal(await p.locator('#today-menu-relative').textContent(),'오늘 식단');
   await drag(-100,2);await p.waitForFunction(date=>document.querySelector('.meal-items')?.textContent.includes(date),day(1));
   await p.waitForFunction(()=>!document.querySelector('.month-swipe-track'));
   await drag(100,2);await p.waitForFunction(()=>document.querySelector('#today-menu-relative').textContent==='오늘 식단');
   await p.waitForFunction(()=>!document.querySelector('.month-swipe-track'));
   // A delayed tomorrow response cannot overwrite a rapid return to today.
   await p.evaluate(()=>{TodayMenu.changeDate(1);TodayMenu.changeDate(-1);});
   await p.waitForFunction(date=>document.querySelector('.meal-items')?.textContent.includes(date),today);
   await p.waitForTimeout(300);assert.equal(await p.locator('#today-menu-relative').textContent(),'오늘 식단');
   assert.equal(await p.locator('.meal-rating').count(),4);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
   assert.deepEqual(errors,[]);
   if(width===390)await p.screenshot({path:'/tmp/natbam-meal-nav-'+engine.name()+'.png',fullPage:true});
   console.log('PASS',engine.name(),width,'date arrows / today / unpublished / swipe / vertical scroll / races / vote isolation');
   await p.close();
  }
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
