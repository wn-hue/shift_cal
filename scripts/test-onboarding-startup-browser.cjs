'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require('playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:8776';
const url=path=>new URL(path,base).href;
const settled=p=>p.waitForFunction(()=>!document.querySelector('[data-wage-moving=true],[data-sheet-resizing=true],.onboarding-scene-copy'));
(async()=>{for(const engine of[webkit,chromium]){
 const browser=await engine.launch();
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
  await page.addInitScript(()=>{
   window.setupCalendarFrames=[];let seenSetup=false;
   const scan=()=>{const setup=document.getElementById('onboarding-dialog'),calendar=document.getElementById('view-calendar');
    if(setup?.open)seenSetup=true;
    if(!seenSetup&&calendar&&getComputedStyle(calendar).visibility==='visible'&&calendar.getBoundingClientRect().height>0)setupCalendarFrames.push(document.readyState);
    if(!seenSetup)requestAnimationFrame(scan);
   };requestAnimationFrame(scan);
  });
  await page.goto(url('/welcome.html'));await page.locator('#start-app').waitFor({state:'visible'});
  let releaseScript,releaseImages,enteredScript,imageRequests=0;
  const scriptGate=new Promise(r=>releaseScript=r),imageGate=new Promise(r=>releaseImages=r),scriptEntered=new Promise(r=>enteredScript=r);
  await page.route('**/*',async route=>{
   if(new URL(route.request().url()).pathname==='/app-currency.js'){enteredScript();await scriptGate;}
   if(route.request().resourceType()==='image'){imageRequests++;await imageGate;}
   await route.fallback();
  });
  const navigation=page.waitForNavigation({waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'앱 시작하기',exact:true}).click({noWaitAfter:true});await scriptEntered;
  assert.equal(await page.locator('#view-calendar').evaluate(el=>getComputedStyle(el).visibility),'hidden','calendar stays hidden while setup scripts are loading');
  releaseScript();await navigation;
  assert(imageRequests>0,'test must keep image loads pending');
  assert.equal(await page.evaluate(()=>document.readyState),'interactive','setup must not depend on window.load');
  assert.equal(await page.locator('#onboarding-dialog').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#onboarding-step-label').textContent(),'1 / 3');
  assert.deepEqual(await page.evaluate(()=>setupCalendarFrames),[],'no calendar frame before first setup');
  releaseImages();await page.waitForLoadState('load');
  await page.screenshot({path:'/tmp/onboarding-startup-'+engine.name()+'.png'});
  await page.locator('#onboarding-date').evaluate(el=>el.value='2020-01-02');await page.locator('#onboarding-next').click();
  await page.locator('[data-onboarding-group=B]').click();await page.locator('#onboarding-next').click();
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#onboarding-dialog').evaluate(el=>el.open),true);
  assert.equal(await page.locator('#onboarding-step-label').textContent(),'3 / 3','resume unfinished setup');
  assert.equal(await page.locator('#onboarding-date').inputValue(),'2020-01-02');
  await page.locator('#onboarding-next').click();await settled(page);
  await page.locator('#wage-manual-base').fill('11050');await page.locator('#payroll-sms-apply').click();await settled(page);
  await page.locator('#wage-manual-ordinary').fill('14482');await page.locator('#payroll-sms-apply').click();await settled(page);
  await page.locator('[data-guided-allowance=none]').click();await page.locator('#payroll-sms-apply').click();
  await page.waitForFunction(()=>!document.getElementById('onboarding-dialog').open);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_onboarding_v1')).status),'complete');
  await page.reload();assert.equal(await page.locator('#onboarding-dialog').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#view-calendar').isVisible(),true);assert.deepEqual(errors,[]);await page.close();
  const returning=await browser.newPage({viewport:{width:320,height:844}});
  if(new URL(base).protocol==='https:')await returning.context().addCookies([{name:'__Host-work-routine-ready',value:'1',url:url('/'),secure:true,sameSite:'Lax'}]);
  await returning.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
  await returning.addInitScript(()=>{localStorage.setItem('shift_origin_ready_v1','1');localStorage.setItem('shift_day_memos','{"2026-11-04":"기존 메모"}');document.cookie='__Host-work-routine-ready=1; Path=/; Secure; SameSite=Lax';});
  await returning.goto(url('/'));
  assert.equal(await returning.locator('#onboarding-dialog').evaluate(el=>el.open),false,'legacy data must not be reset or forced through setup');
  assert.equal(await returning.evaluate(()=>localStorage.getItem('shift_day_memos')),'{"2026-11-04":"기존 메모"}');await returning.close();
  console.log('PASS '+engine.name()+': start→setup before window.load, no calendar flash during slow scripts/images, resume, complete, reload and legacy data preserved');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1});
