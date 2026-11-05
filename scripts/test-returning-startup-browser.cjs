'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require('playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:8767/';
(async()=>{for(const engine of[webkit,chromium]){
 const browser=await engine.launch();
 try{for(const kind of['complete','legacy','incomplete']){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  if(base.startsWith('https:'))await context.addCookies([{name:'__Host-work-routine-ready',value:'1',url:base,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
  await page.addInitScript(kind=>{
   localStorage.setItem('shift_origin_ready_v1','1');localStorage.setItem('shift_active_group','C');
   localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2020-01-01',baseHourly:kind==='incomplete'?0:11050,ordinaryHourly:kind==='incomplete'?0:14482,leaveByYear:{}}));
   localStorage.setItem('shift_day_memos',JSON.stringify({'2026-11-05':'기존 메모'}));
   if(kind!=='legacy')localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'complete',step:2}));
   window.startupPrompts=[];window.startupFrameCount=0;
   function scan(){for(const id of['first-use-guide','onboarding-dialog']){const el=document.getElementById(id);if(el&&el.getBoundingClientRect().height&&getComputedStyle(el).visibility==='visible')startupPrompts.push({id,state:document.readyState});}if(++startupFrameCount<180)requestAnimationFrame(scan);}requestAnimationFrame(scan);
  },kind);
  let releaseImages,imageRequests=0;const imageGate=new Promise(r=>releaseImages=r);
  await page.route('**/*',async route=>{if(route.request().resourceType()==='image'){imageRequests++;await imageGate;}await route.fallback();});
  try{
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.SettingsUI&&startupFrameCount>2);
   assert(imageRequests>0);assert.equal(await page.evaluate(()=>document.readyState),'interactive');
   assert.equal(await page.locator('#first-use-guide').isVisible(),false,'no incomplete-settings banner while saved config is still loading');
   assert.deepEqual(await page.evaluate(()=>startupPrompts),[],'no setup prompts in any startup frame');
  }finally{releaseImages();}
  await page.waitForLoadState('load');
  assert.equal(await page.locator('#onboarding-dialog').evaluate(e=>e.open),false);
  assert.equal(await page.locator('#first-use-guide').isVisible(),kind==='incomplete');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_day_memos'))['2026-11-05']),'기존 메모');
  if(kind==='incomplete')assert.match(await page.locator('#first-use-copy').textContent(),/시급/);
  else{
   assert.equal(await page.evaluate(()=>config.hireDate),'2020-01-01');
   await page.waitForFunction(()=>startupFrameCount>5);assert.deepEqual(await page.evaluate(()=>startupPrompts),[]);
   if(kind==='complete')await page.screenshot({path:'/tmp/work-routine-returning-fixed-'+engine.name()+'.png'});
  }
  assert.deepEqual(errors,[]);console.log('PASS '+engine.name()+' '+kind+': delayed images, no premature setup banner, genuine missing settings preserved, stored memo unchanged');
  await context.close();
 }}finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1});
