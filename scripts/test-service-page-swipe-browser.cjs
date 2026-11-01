'use strict';
const assert=require('node:assert/strict'),{webkit,chromium}=require('playwright');
async function drag(page,selector,dx,dy,{cancel=false,finish=true}={}){
 return page.locator(selector).first().evaluate((el,{dx,dy,cancel,finish})=>{
  const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+Math.min(20,r.height/2);
  function fire(type,offsetX,offsetY){const touch={clientX:x+offsetX,clientY:y+offsetY};const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:/end|cancel/.test(type)?[]:[touch]},changedTouches:{value:[touch]}});el.dispatchEvent(event);}
  fire('touchstart',0,0);fire('touchmove',dx/2,dy/2);fire('touchmove',dx,dy);
  const surface=el.closest('#bus-unified-search,#lost-found-dialog,#commute-dialog');const transform=getComputedStyle(surface).transform;
  if(finish)fire(cancel?'touchcancel':'touchend',dx,dy);
  return transform;
 },{dx,dy,cancel,finish});
}
(async()=>{for(const engine of [webkit,chromium])for(const motion of ['reduce','no-preference']){
 const browser=await engine.launch();try{
 const p=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:motion,timezoneId:'Asia/Seoul'}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('shift_active_group','C');localStorage.setItem('shift_onboarding_v1','{"status":"existing"}');});
 await p.route('**/api/**',r=>r.fulfill({json:r.request().url().includes('/api/lost-found')?{items:[],next:null,connected:true,csrf:'test',blockedCount:0}:{configured:false}}));
 await p.goto(process.env.TEST_URL||'http://127.0.0.1:8773');await p.locator('#account-menu-button').tap();
 const settled=()=>p.waitForFunction(()=>!Array.from(document.querySelectorAll('#commute-dialog,#lost-found-dialog,#bus-unified-search')).some(el=>el.getAnimations().length));
 const clear=id=>p.waitForFunction(id=>!document.getElementById(id).style.transform,id);
 for(const [id,entry,header,body,back]of [
  ['commute-dialog','commute-open','#commute-page-title','.commute-page-body','#commute-back'],
  ['lost-found-dialog','lost-found-open','#lost-page-title','.lost-page-body','#lost-close']]){
  await p.locator('#'+entry).tap();await settled();
  if(id==='lost-found-dialog')await p.waitForFunction(()=>document.getElementById('lost-new').getAttribute('aria-label')==='새 글 등록');
  await drag(p,header,110,10);assert(await p.locator('#'+id).isVisible(),'Horizontal gestures do not dismiss');
  await drag(p,header,0,25);await clear(id);assert(await p.locator('#'+id).isVisible(),'Short pulls return');
  await drag(p,header,0,120,{cancel:true});await clear(id);assert(await p.locator('#'+id).isVisible(),'Cancelled touches return');
  await p.locator(body).evaluate(el=>{const filler=document.createElement('div');filler.className='swipe-test-spacer';filler.style.height='1800px';el.append(filler);el.scrollTop=120;});
  await drag(p,body,0,120);assert(await p.locator('#'+id).isVisible(),'Scrolled content keeps its scrolling gesture');
  await p.locator(body).evaluate(el=>{el.scrollTop=0;el.querySelector('.swipe-test-spacer').remove();});
  const transform=await drag(p,header,0,125);
  if(motion==='no-preference')assert(Number(transform.split(',').at(-1).replace(')',''))>0,'Page follows the finger');
  await p.waitForFunction(id=>document.getElementById(id).hidden,id);
  assert.equal(await p.locator('.container').evaluate(el=>el.inert),false,'Underlying menu is usable again');
  assert.equal(await p.locator('#'+entry).evaluate(el=>document.activeElement===el),true,'Focus returns to the entry');
  assert.equal(await p.evaluate(()=>history.state?.shiftCommute||history.state?.shiftLostFound||false),false);
  // Reopening and the existing back button remain reliable after a drag.
  await p.locator('#'+entry).tap();await settled();await p.locator(back).tap();await p.waitForFunction(id=>document.getElementById(id).hidden,id);
  await p.locator('#'+entry).tap();await settled();await drag(p,body,0,125);await p.waitForFunction(id=>document.getElementById(id).hidden,id);
 }
 // A nested bus search dismisses only itself; its parent does not receive the drag.
 await p.locator('#commute-open').tap();await settled();await p.evaluate(()=>BusUnifiedSearch.open());await settled();
 await drag(p,'.bus-unified-topbar h2',0,125);await p.waitForFunction(()=>document.getElementById('bus-unified-search').hidden);assert(await p.locator('#commute-dialog').isVisible());
 await p.locator('#commute-back').tap();await p.waitForFunction(()=>document.getElementById('commute-dialog').hidden);
 // A dirty board draft keeps the same guard and one-level back behavior.
 await p.locator('#lost-found-open').tap();await settled();await p.waitForFunction(()=>document.getElementById('lost-new').getAttribute('aria-label')==='새 글 등록');await p.locator('#lost-new').tap();
 await p.locator('#lost-form').evaluate(el=>el.dispatchEvent(new Event('input',{bubbles:true})));
 p.once('dialog',d=>d.dismiss());await drag(p,'#lost-page-title',0,125);await clear('lost-found-dialog');assert(await p.locator('#lost-form').isVisible());
 p.once('dialog',d=>d.accept());await p.locator('#lost-close').tap();assert.equal(await p.locator('#lost-form').isVisible(),false);assert(await p.locator('#lost-found-dialog').isVisible());await p.locator('#lost-close').tap();await p.waitForFunction(()=>document.getElementById('lost-found-dialog').hidden);
 if(engine===chromium&&motion==='no-preference'){
  await p.locator('#commute-open').tap();await settled();const cdp=await p.context().newCDPSession(p),r=await p.locator('#commute-page-title').boundingBox(),x=r.x+20,y=r.y+10;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let dy=20;dy<=120;dy+=20){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy}]});await p.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForFunction(()=>document.getElementById('commute-dialog').hidden);await cdp.detach();
 }
 assert.deepEqual(errors,[]);console.log('PASS',engine.name(),motion,'page/header swipes / scroll protection / cancel / nested search / original back / draft guard / focus and history');
 }finally{await browser.close();}
}})().catch(e=>{console.error(e);process.exitCode=1});
