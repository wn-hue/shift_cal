'use strict';
const assert=require('node:assert/strict');
const {webkit,chromium}=require('playwright');
(async()=>{for(const engine of [webkit,chromium]){
 const browser=await engine.launch();
 for(const width of [320,390]){
  const page=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Seoul',reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00+09:00'));
  await page.addInitScript(width=>{
   localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');
   const viewport=Object.assign(new EventTarget(),{width,height:844,offsetTop:0,offsetLeft:0,scale:1});
   Object.defineProperty(window,'visualViewport',{get:()=>viewport});window.testViewport=viewport;
  },width);
  await page.route('**/api/**',r=>r.fulfill({json:{configured:false}}));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:8772/');
  const changeViewport=async(height,offsetTop=0)=>{await page.evaluate(({height,offsetTop})=>{Object.assign(testViewport,{height,offsetTop});testViewport.dispatchEvent(new Event('resize'));testViewport.dispatchEvent(new Event('scroll'));},{height,offsetTop});await page.waitForFunction(h=>document.querySelector('#memo-compose-dialog').style.getPropertyValue('--compose-height')===h+'px',height);};
  const open=async()=>{await page.locator('.cal-day[data-date="2026-10-20"] .day-num').tap();await page.evaluate(()=>MemoComposer.enter());};
  await open();const input=page.locator('#memo-compose-input');
  const longMemo='한글 메모와 줄바꿈 확인\n'.repeat(300)+'마지막 줄';
  await input.fill(longMemo);
  for(const [height,top] of [[425,60],[300,140],[220,180]]){
   await changeViewport(height,top);
   const geometry=await page.evaluate(()=>{
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,right:r.right}};
    const field=document.querySelector('#memo-compose-input');
    return {sheet:rect('#memo-compose-dialog'),header:rect('.memo-compose-header'),save:rect('#memo-compose-save'),input:rect('#memo-compose-input'),scrollable:field.scrollHeight>field.clientHeight,outerScroll:document.querySelector('#memo-compose-dialog').scrollHeight>document.querySelector('#memo-compose-dialog').clientHeight,body:document.body.style.position};
   });
   assert(geometry.sheet.top>=top&&geometry.sheet.bottom<=top+height+1,JSON.stringify(geometry));
   assert(geometry.input.height>=44&&geometry.input.bottom<=geometry.sheet.bottom+1,JSON.stringify(geometry));
   assert(geometry.save.bottom<geometry.input.top&&geometry.save.top>=geometry.sheet.top);
   assert(geometry.scrollable&&!geometry.outerScroll);assert.equal(geometry.body,'fixed');
   const headerTop=geometry.header.top;await input.evaluate(e=>e.scrollTop=e.scrollHeight);
   assert.equal(await page.locator('.memo-compose-header').evaluate(e=>e.getBoundingClientRect().top),headerTop,'only text scrolls');
  }
  await changeViewport(425,60);
  if(width===390)await page.screenshot({path:'/tmp/memo-keyboard-'+engine.name()+'.png'});
  // Saving is one transaction, while body unlock waits for the keyboard to retract.
  await page.locator('#memo-compose-save').tap();
  assert.equal(await page.evaluate(()=>dayMemos['2026-10-20']),longMemo);
  assert.equal(await page.evaluate(()=>document.body.style.position),'fixed','do not unlock behind the retracting keyboard');
  await changeViewport(844);await page.waitForFunction(()=>!document.querySelector('#memo-compose-dialog').open);
  assert.equal(await page.evaluate(()=>document.body.style.position),'fixed','return to the parent with its scroll lock');
  assert.equal(await page.locator('#modal-override').evaluate(e=>e.classList.contains('active')),true);
  assert.equal(await page.locator('#apply-preview').textContent(),'닫기');
  await page.locator('#apply-preview').tap();await page.waitForFunction(()=>document.body.style.position!=='fixed');
  await page.waitForTimeout(750);await open();assert.equal(await input.inputValue(),longMemo);
  await changeViewport(425);await input.fill('취소할 초안');await page.locator('#memo-compose-back').tap();
  await changeViewport(844);await page.waitForFunction(()=>!document.querySelector('#memo-compose-dialog').open);
  assert.equal(await page.evaluate(()=>dayMemos['2026-10-20']),longMemo);
  assert.equal(await page.evaluate(()=>document.body.style.position),'fixed','parent sheet keeps its own scroll lock');
  assert(await page.locator('#modal-override').evaluate(e=>e.classList.contains('active')));
  const preview=await page.locator('#memo-compose-open').boundingBox();assert(preview.height<=110);
  // Hardware keyboards / missing final viewport events cannot leave an undismissable dialog.
  await page.locator('#memo-compose-open').tap();await changeViewport(425);await page.locator('#memo-compose-back').tap();
  await page.waitForFunction(()=>!document.querySelector('#memo-compose-dialog').open);
  assert.deepEqual(errors,[]);
  console.log(engine.name(),width,'PASS long memo internal scroll, fixed header, small/panned viewport, one save, keyboard-close lock, cancel preservation and fallback');
  await page.close();
 }await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
