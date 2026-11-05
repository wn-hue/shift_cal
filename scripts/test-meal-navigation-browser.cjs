const assert = require('node:assert/strict');
const {webkit, chromium} = require(process.env.PLAYWRIGHT_MODULE);
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-3*3600000));
const day = n => new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
(async()=>{
 for(const engine of [webkit,chromium]) {
  const browser=await engine.launch();
  for(const width of [320,390,412]) {
   const p=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});
   let requests=0;
   const errors=[];p.on('pageerror',e=>errors.push(e.message));
   await p.route('**/api/**',async r=>{
    const url=new URL(r.request().url());
    if(url.pathname==='/api/today-menu') {
     requests++;
     const date=url.searchParams.get('date')||today;
     if(date===day(2))return r.fulfill({json:{status:'not_published',date,meals:[],message:'이 날짜의 식단이 아직 등록되지 않았어요.'}});
     if(date===day(3))await new Promise(resolve=>setTimeout(resolve,200));
     const menu=menuDate=> ({status:'ok',date:menuDate,checkedAt:new Date().toISOString(),meals:['조식','중식','석식','야식'].map(name=>({name,groups:[{title:'한식 · 사계',items:[menuDate+' 콩나물매콤돼지불고기','미역국','알감자버터구이','치커리생채','포기김치','쌀밥']},{title:'Plus',items:['누룽지죽']},{title:'간편식',items:['빵 SET','반숙란 SET','샌드위치 SET','마이보글','컵라면/단무지/맛김치/쌀밥']},{title:'별미 · 공방',items:['돈가스카레라이스','샐러드']}]}))});
     return r.fulfill({json:{...menu(date),menus:[menu(today),menu(day(1))]}}).catch(()=>{});
    }
    if(url.pathname==='/api/meal-votes')return r.fulfill({json:{date:today,mine:{},totals:Object.fromEntries(['조식','중식','석식','야식'].map(m=>[m,{up:3,down:1}]))}});
    return r.fulfill({json:{configured:false}});
   });
   await p.addInitScript(()=>localStorage.setItem('shift_active_group','C'));
   await p.goto(process.env.CHECK_URL||'http://127.0.0.1:8768');await p.evaluate(()=>switchView('menu'));
   await p.waitForFunction(()=>document.querySelectorAll('.meal-rating').length===4);
   assert.equal(await p.locator('#header-view-title').textContent(),new Intl.DateTimeFormat('ko-KR',{weekday:'long',timeZone:'Asia/Seoul'}).format(new Date(today+'T12:00:00+09:00'))+' 메뉴');
   assert.equal(await p.locator('#bnav-menu').getAttribute('aria-label'),'오늘 메뉴');
   assert.equal(await p.locator('.meal-eyebrow').count(),0);
   assert.equal(await p.locator('#today-menu-today,#today-menu-refresh,#today-menu-date').count(),0);
   const nav=await p.locator('.meal-navigation').boundingBox();
   const relative=await p.locator('#today-menu-relative').boundingBox();
   assert(Math.abs(relative.x+relative.width/2-nav.x-nav.width/2)<1,'Date navigation is centered');
   assert.equal(await p.locator('.meal-sides .meal-side-group').count(),8);
   assert.equal(await p.locator('.meal-extras').count(),0);
   assert.equal(await p.locator('.meal-main .meal-addon').count(),4);
   assert.match(await p.locator('.meal-main .meal-addon').first().textContent(),/Plus · 추가 제공/);
   assert.equal(await p.locator('.meal-sides .meal-choice-label').count(),4);
   assert.equal(await p.locator('.meal-sides .meal-choice-badge').count(),0);
   assert.match(await p.locator('.meal-sides .meal-side-group').nth(1).textContent(),/별미공방/);
   assert.equal(await p.locator('.meal-main .meal-addon').filter({hasText:'별미'}).count(),0);
   assert.equal(await p.locator('.meal-sides').first().getAttribute('aria-label'),'조식 선택 메뉴');
   assert.equal(await p.locator('.meal-sides .meal-addon').count(),0);
   assert.equal(await p.locator('.all-page a[href="/origin-transfer.html"]').count(),0);
   const [main,side]=await p.evaluate(()=>['.meal-main','.meal-sides'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width};}));
   assert(side.x>=main.x+main.width&&Math.abs(main.y-side.y)<2,'Extra menus sit beside the main menu');
   for(const theme of ['current','toss','gpt','dark','test']){
    await p.evaluate(t=>{const pref=document.getElementById('pref-theme');pref.value=t;pref.dispatchEvent(new Event('change'));},theme);
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.equal(await p.locator('.meal-card').first().evaluate(e=>e.scrollWidth<=e.clientWidth),true);
   }
   await p.evaluate(()=>{const pref=document.getElementById('pref-theme');pref.value='current';pref.dispatchEvent(new Event('change'));});
   assert.equal(requests,1);
   await p.evaluate(()=>switchView('calendar'));await p.evaluate(()=>switchView('menu'));
   assert.equal(requests,1,'Re-entering uses saved data');
   if(width===390)await p.screenshot({path:'/tmp/menu-columns-'+engine.name()+'.png',fullPage:true});
   await p.getByRole('button',{name:'다음 날 식단',exact:true}).click();
   await p.waitForFunction(date=>document.querySelector('.meal-items')?.textContent.includes(date),day(1));
   assert.equal(requests,1,'The next day is already in the saved PDF schedule');
   assert.equal(await p.locator('#today-menu-relative').textContent(),'내일');
   assert.equal(await p.locator('.meal-rating').count(),0,'Tomorrow never displays today’s vote controls');
   await p.getByRole('button',{name:'다음 날 식단',exact:true}).click();
   await p.locator('#today-menu-empty').waitFor({state:'visible'});
   await p.getByRole('button',{name:'이전 날 식단',exact:true}).click();
   await p.getByRole('button',{name:'이전 날 식단',exact:true}).click();
   await p.waitForFunction(()=>document.querySelectorAll('.meal-rating').length===4);
   // Swipe on the meal surface; vertical drag leaves the date alone.
   async function drag(dx,dy) {await p.locator('#today-menu-panel').dispatchEvent('touchstart',{touches:[{identifier:1,clientX:180,clientY:300}]});await p.locator('#today-menu-panel').dispatchEvent('touchmove',{touches:[{identifier:1,clientX:180+dx,clientY:300+dy}]});await p.locator('#today-menu-panel').dispatchEvent('touchend',{touches:[],changedTouches:[{identifier:1,clientX:180+dx,clientY:300+dy}]});}
   await drag(2,100);assert.equal(await p.locator('#today-menu-relative').textContent(),'오늘');
   await drag(-100,2);await p.waitForFunction(date=>document.querySelector('.meal-items')?.textContent.includes(date),day(1));
   await p.waitForFunction(()=>!document.querySelector('.month-swipe-track'));
   await drag(100,2);await p.waitForFunction(()=>document.querySelector('#today-menu-relative').textContent==='오늘');
   await p.waitForFunction(()=>!document.querySelector('.month-swipe-track'));
   // A delayed tomorrow response cannot overwrite a rapid return to today.
   await p.evaluate(()=>{TodayMenu.changeDate(3);TodayMenu.changeDate(-3);});
   await p.waitForFunction(date=>document.querySelector('.meal-items')?.textContent.includes(date),today);
   await p.waitForTimeout(300);assert.equal(await p.locator('#today-menu-relative').textContent(),'오늘');
   assert.equal(await p.locator('.meal-rating').count(),4);
   assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
   const beforeReload=requests;
   await p.reload();await p.evaluate(()=>switchView('menu'));
   await p.waitForFunction(()=>document.querySelectorAll('.meal-card').length===4);
   assert.equal(requests,beforeReload,'A page reload restores the saved schedule without downloading it');
   assert.deepEqual(errors,[]);
   if(width===390)await p.screenshot({path:'/tmp/natbam-meal-nav-'+engine.name()+'.png',fullPage:true});
   console.log('PASS',engine.name(),width,'date arrows / today / unpublished / swipe / vertical scroll / races / vote isolation');
   await p.close();
  }
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
