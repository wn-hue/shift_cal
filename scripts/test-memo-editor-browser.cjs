'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();
 for(const width of [320,390])for(const theme of ['current','toss','gpt','dark','test']){
  if(process.env.MEMO_TEST_QUICK&&(engine.name()!=='chromium'||width!==390||theme!=='test'))continue;
  const page=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Seoul'});
  await page.clock.setFixedTime(new Date('2026-10-23T12:00:00+09:00'));
  await page.addInitScript(({theme,width})=>{
   if(!localStorage.getItem('shift_active_group')){
    localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1',JSON.stringify({status:'existing'}));
    localStorage.setItem('shift_display_theme',theme);localStorage.setItem('shift_salary_config_master',JSON.stringify({hireDate:'2015-06-16',baseHourly:10320,ordinaryHourly:11000}));
   }
   const viewport=Object.assign(new EventTarget(),{width,height:844,offsetTop:0,offsetLeft:0,scale:1});
   Object.defineProperty(window,'visualViewport',{get:()=>viewport});window.memoTestViewport=viewport;
  },{theme,width});
  await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
  await page.goto(process.env.TEST_URL||'http://localhost:8768/');
  await page.locator('.cal-day[data-date="2026-10-23"]').click();
  await page.getByRole('tab',{name:'메모',exact:true}).click();
  await page.waitForFunction(()=>document.body.classList.contains('memo-editor-open')).catch(async error=>{console.error(await page.evaluate(()=>({ready:document.readyState,editor:document.getElementById('modal-override').outerHTML.slice(0,700),body:document.body.className,tab:document.getElementById('memo-tab').getAttribute('aria-selected')})));throw error});
  const text='메모 테스트 · 줄바꿈\n'+('긴 메모 내용 '.repeat(400));
  await page.locator('#modal-memo-input').fill(text);
  await page.locator('.override-sheet').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
  for(const [height,top]of [[844,0],[360,0],[300,160],[220,200],[844,0]]){
   await page.evaluate(({height,top})=>{Object.assign(window.memoTestViewport,{height,offsetTop:top});window.memoTestViewport.dispatchEvent(new Event('resize'));window.memoTestViewport.dispatchEvent(new Event('scroll'))},{height,top});
   await page.waitForFunction(h=>document.getElementById('modal-override').style.getPropertyValue('--memo-viewport-height')===h+'px',height);
   await page.locator('#day-note .btn-save').scrollIntoViewIfNeeded();
   const geometry=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}};return {sheet:rect('#modal-override .override-sheet'),input:rect('#modal-memo-input'),save:rect('#day-note .btn-save'),font:getComputedStyle(document.getElementById('modal-memo-input')).fontSize,overflow:document.documentElement.scrollWidth>innerWidth}});
   assert(geometry.sheet.top>=top,JSON.stringify(geometry));assert(geometry.sheet.bottom<=top+height+1,JSON.stringify(geometry));
   assert(geometry.input.height>=43);assert(geometry.input.right<=width+1);assert.equal(geometry.font,'16px');assert.equal(geometry.overflow,false);
   assert(geometry.save.bottom<=top+height+1,JSON.stringify({height,top,geometry}));
   assert(geometry.save.top>=geometry.input.bottom-1,JSON.stringify(geometry));
   if(width===390&&theme==='current'&&height===300)await page.screenshot({animations:'disabled',path:`/tmp/memo-keyboard-${engine.name()}.png`});
  }
  // Repeated keyboard-to-sticker switches preserve sheet width, reachable tabs and content.
  for(let cycle=0;cycle<3;cycle++){
   await page.locator('#modal-memo-input').focus();
   await page.evaluate(()=>{Object.assign(memoTestViewport,{height:300,offsetTop:160});memoTestViewport.dispatchEvent(new Event('resize'))});
   await page.getByRole('tab',{name:'스티커',exact:true}).click();
   assert.notEqual(await page.evaluate(()=>document.activeElement.id),'modal-memo-input');
   await page.evaluate(()=>{Object.assign(memoTestViewport,{height:844,offsetTop:0});memoTestViewport.dispatchEvent(new Event('resize'))});
   await page.waitForFunction(()=>document.getElementById('modal-override').style.getPropertyValue('--memo-viewport-height')==='844px');
   await page.locator('#calendar-sticker-options button').last().scrollIntoViewIfNeeded();
   assert.equal(await page.locator('#memo-tab').isVisible(),true);
   await page.getByRole('tab',{name:'메모',exact:true}).click();
   assert.equal(await page.locator('.editor-content').evaluate(e=>e.scrollTop),0);
   assert.equal(await page.locator('#modal-memo-input').inputValue(),text);
   const box=await page.locator('.override-sheet').boundingBox();assert(box.width<=width&&box.y>=0&&box.y+box.height<=845,JSON.stringify(box));
  }
  await page.getByRole('button',{name:'메모 저장',exact:true}).click();
  await page.waitForFunction(()=>!document.body.classList.contains('memo-editor-open'));
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shift_day_memos'))['2026-10-23']),text.trim());
  await page.reload();await page.locator('.cal-day[data-date="2026-10-23"]').click();await page.getByRole('tab',{name:'메모',exact:true}).click();assert.equal(await page.locator('#modal-memo-input').inputValue(),text.trim());
  await page.getByRole('tab',{name:'근무',exact:true}).click();await page.waitForFunction(()=>!document.body.classList.contains('memo-editor-open'));
  assert.equal(await page.locator('#work-panel').isVisible(),true);assert.equal(await page.locator('.editor-current-shift').isVisible(),true);
  console.log(engine.name(),width,theme,'PASS keyboard resize/pan, reachable save, long memo persistence and work tab');await page.close();
 }
 await browser.close();
}})().catch(error=>{console.error(error);process.exit(1)});
