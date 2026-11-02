'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require('playwright');
const url=process.env.TEST_URL||'http://127.0.0.1:8774/';
async function touch(p,selector,dy){await p.locator(selector).evaluate((el,dy)=>{const r=el.getBoundingClientRect(),x=r.x+10,y=r.y+10;for(const[type,offset]of[['touchstart',0],['touchmove',dy/2],['touchmove',dy],['touchend',dy]]){const point={identifier:3,clientX:x,clientY:y+offset},e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:type==='touchend'?[]:[point]},changedTouches:{value:[point]}});el.dispatchEvent(e);}},dy);}
(async()=>{for(const engine of[webkit,chromium]){const b=await engine.launch();for(const motion of['no-preference','reduce']){
 const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:motion}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{errors.push('Unexpected prompt');d.dismiss();});
 await p.addInitScript(()=>{localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');localStorage.setItem('shift_active_group','C');});await p.route('**/api/**',r=>r.fulfill({json:{configured:false}}));await p.goto(url);await p.locator('#account-menu-button').click();
 for(const[trigger,id]of[['#menu-leave-settings button','leave-settings-dialog'],['#menu-salary-settings button','payroll-sms-dialog'],['#menu-group-open','settings-options'],['#parking-open','parking-dialog'],['.lab-entry','community-lab']]){
  await p.locator(trigger).click();const sheet=p.locator('#'+id);await p.waitForTimeout(70);
  if(motion==='no-preference')assert(await sheet.evaluate(el=>el.getAnimations().some(a=>a.effect.getTiming().duration===360&&a.effect.getKeyframes().some(k=>k.translate))),id+' shares the entrance');
  await p.waitForTimeout(350);const geometry=await sheet.boundingBox();assert(geometry.y>=0&&geometry.y+geometry.height<=845,id+' fits viewport');
  // Long drags keep tracking the finger, rather than jumping back to a capped distance.
  await sheet.evaluate(el=>{const target=el.querySelector('.sheet-dismiss-handle'),r=target.getBoundingClientRect();for(const[type,dy]of[['touchstart',0],['touchmove',290]]){const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:[{clientX:r.x+30,clientY:r.y+dy}]},changedTouches:{value:[{clientX:r.x+30,clientY:r.y+dy}]}});target.dispatchEvent(e);}});
  if(motion==='no-preference')assert(Math.abs((await sheet.boundingBox()).y-geometry.y-290)<2,id+' tracks the full drag');
  await sheet.locator('.sheet-dismiss-handle').evaluate(el=>{const e=new Event('touchend',{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:[]},changedTouches:{value:[{clientX:el.getBoundingClientRect().x+30,clientY:el.getBoundingClientRect().y+290}]}});el.dispatchEvent(e);});
  await p.waitForFunction(id=>!document.getElementById(id).open,id);assert.equal(await p.locator('.sheet-closing').count(),0);
 }
 await p.evaluate(()=>{const d=new Date('2026-11-02T12:00');openOverrideModal('2026-11-02',d,getActualShift(d,currentGroup));});await p.waitForTimeout(70);
 if(motion==='no-preference')assert(await p.locator('#modal-override .override-sheet').evaluate(el=>el.getAnimations().some(a=>a.effect.getTiming().duration===360)),'work-change entrance');await p.waitForTimeout(350);await p.evaluate(()=>closeModalDirect());await p.waitForFunction(()=>!document.getElementById('modal-override').classList.contains('active'));
 const openMemo=async()=>{await p.evaluate(()=>{const d=new Date('2026-11-02T12:00');openOverrideModal('2026-11-02',d,getActualShift(d,currentGroup));MemoComposer.enter(null);});await p.waitForTimeout(70);if(motion==='no-preference')assert(await p.locator('#memo-compose-dialog').evaluate(el=>el.getAnimations().some(a=>a.effect.getTiming().duration===360)));await p.waitForTimeout(350);};
 await openMemo();await p.locator('#memo-compose-input').fill('메모 터치로 저장');await touch(p,'#memo-compose-input',120);assert(await p.locator('#memo-compose-dialog').isVisible(),'text drag is not dismissal');
 await touch(p,'#memo-compose-content',35);await p.waitForTimeout(200);assert(await p.locator('#memo-compose-dialog').isVisible(),'short pull returns');
 // Native scroll at a nonzero offset stays inside the composer.
 await p.locator('#memo-compose-content').evaluate(el=>{const long=document.createElement('div');long.id='memo-scroll-test';long.style.height='1400px';el.append(long);el.scrollTop=100;});await touch(p,'#memo-compose-content',110);assert(await p.locator('#memo-compose-dialog').isVisible());await p.locator('#memo-scroll-test').evaluate(el=>el.remove());await p.locator('#memo-compose-content').evaluate(el=>el.scrollTop=0);
 await touch(p,'#memo-compose-content',150);await p.waitForFunction(()=>!document.getElementById('memo-compose-dialog').open);assert.equal(await p.evaluate(()=>dayMemos['2026-11-02']),'메모 터치로 저장');assert.equal(await p.locator('#modal-override').evaluate(el=>el.classList.contains('active')),false);
 if(engine===chromium&&motion==='no-preference'){
  await openMemo();await p.locator('#memo-compose-input').fill('실제 터치');const cdp=await p.context().newCDPSession(p),box=await p.locator('#memo-compose-content').boundingBox(),x=box.x+3,y=box.y+150;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForFunction(()=>!document.getElementById('memo-compose-dialog').open);await cdp.detach();
 }
 assert.deepEqual(errors,[]);console.log('PASS shared sheet motion, long drags, memo blank-space touch, scroll/field protection and save-on-dismiss',engine.name(),motion);await p.close();
 }await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
