/* Bottom-sheet affordances preserve each feature's existing dismissal and draft guards. */
(()=>{'use strict';
 const attached=new WeakSet(),backdrops=new WeakSet(),draggables=new WeakSet();
 // Programmatic focus restoration after a touch must not paint a keyboard ring.
 const pointerMode=()=>document.documentElement.dataset.inputMethod='pointer';
 document.addEventListener('pointerdown',pointerMode,true);
 document.addEventListener('touchstart',pointerMode,{capture:true,passive:true});
 document.addEventListener('keydown',e=>{if(['Tab','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))document.documentElement.dataset.inputMethod='keyboard';},true);
 function backdrop(target,sheet,dismiss){
  if(!target||!sheet||backdrops.has(target))return;backdrops.add(target);
  let pressedOutside=null,touch=null,suppressUntil=0;
  const outside=e=>{if(e.target!==target)return false;const r=sheet.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
  target.addEventListener('pointerdown',e=>{pressedOutside=outside(e);suppressUntil=0;},true);
  // Handle actual touchend too: some iOS/WKWebView paths omit the synthetic click.
  target.addEventListener('touchstart',e=>{const t=e.touches[0];touch=e.touches.length===1&&outside({target:e.target,clientX:t.clientX,clientY:t.clientY})?{x:t.clientX,y:t.clientY}:null;},{capture:true,passive:true});
  target.addEventListener('touchend',e=>{const t=e.changedTouches[0],start=touch;touch=null;if(!start||!t||Math.hypot(t.clientX-start.x,t.clientY-start.y)>12||!outside({target:e.target,clientX:t.clientX,clientY:t.clientY}))return;
   if(e.cancelable)e.preventDefault();e.stopImmediatePropagation();pressedOutside=null;suppressUntil=performance.now()+600;dismiss();},{capture:true,passive:false});
  target.addEventListener('touchcancel',()=>{touch=null;pressedOutside=null;},{passive:true});
  target.addEventListener('click',e=>{if(!outside(e))return;const shouldDismiss=pressedOutside!==false&&performance.now()>=suppressUntil;pressedOutside=null;e.preventDefault();e.stopImmediatePropagation();if(shouldDismiss)dismiss();},true);
 }
 function bindDrag(sheet,dismiss){
  if(draggables.has(sheet))return;draggables.add(sheet);let start=null,delta=0,suppressUntil=0;
  const reset=()=>{start=null;delta=0;sheet.style.removeProperty('--sheet-drag');};
  sheet.addEventListener('pointerdown',()=>{suppressUntil=0;},true);
  sheet.addEventListener('touchstart',e=>{
   reset();suppressUntil=0;if(e.touches.length!==1||e.target.closest('input,textarea,select,[contenteditable=true]'))return;
   const t=e.touches[0],r=sheet.getBoundingClientRect();if(t.clientX<r.left||t.clientX>r.right||t.clientY<r.top||t.clientY>r.bottom)return;
   // A scrolled list gets its normal scroll gesture. Pull to dismiss only at its top.
   for(let el=e.target;!e.target.closest('.sheet-dismiss-handle,#editor-dismiss')&&el&&sheet.contains(el);el=el.parentElement){if(el.scrollTop>1&&el.scrollHeight>el.clientHeight+1)return;if(el===sheet)break;}
   start={x:t.clientX,y:t.clientY};
  },{passive:true});
  sheet.addEventListener('touchmove',e=>{
   if(!start)return;if(e.touches.length!==1){reset();return;}
   const dx=e.touches[0].clientX-start.x;delta=e.touches[0].clientY-start.y;
   if(Math.abs(dx)>10&&Math.abs(dx)>Math.abs(delta)*1.3||delta < -10){reset();return;}
   if(delta>10&&delta>Math.abs(dx)*1.3){if(e.cancelable)e.preventDefault();if(!matchMedia('(prefers-reduced-motion:reduce)').matches)sheet.style.setProperty('--sheet-drag',Math.min(delta,220)+'px');}
  },{passive:false});
  sheet.addEventListener('touchend',e=>{const t=e.changedTouches[0],close=start&&t&&t.clientY-start.y>70&&t.clientY-start.y>Math.abs(t.clientX-start.x)*1.3;
   if(close){suppressUntil=performance.now()+600;if(e.cancelable)e.preventDefault();}reset();if(close)dismiss();},{passive:false});
  sheet.addEventListener('touchcancel',reset,{passive:true});
  sheet.addEventListener('click',e=>{if(performance.now()<suppressUntil&&!e.target.closest('.sheet-original-close')){e.preventDefault();e.stopImmediatePropagation();}},true);
 }

 function fit(){const vp=visualViewport,w=vp?.width||innerWidth,h=vp?.height||innerHeight,top=vp?.offsetTop||0,left=vp?.offsetLeft||0,gap=h<420?24:Math.max(56,h*.08);
  for(const d of document.querySelectorAll('dialog.app-bottom-sheet')){d.style.setProperty('--sheet-limit',Math.max(120,h-gap)+'px');d.style.setProperty('--sheet-width',Math.min(w,560)+'px');d.style.setProperty('--sheet-left',left+(w-Math.min(w,560))/2+'px');d.style.setProperty('--sheet-bottom',Math.max(0,innerHeight-top-h)+'px');}
 }
 function attach(sheet){if(attached.has(sheet)||sheet.id==='onboarding-dialog'||sheet.closest('#modal-override'))return;attached.add(sheet);
  const native=sheet.tagName==='DIALOG',original=sheet.querySelector('button[aria-label*="닫기"],.sms-close-btn,.login-sheet-close,#lost-close,.override-close,.picker-close');
  if(!native&&!original)return;
  const dismiss=()=>original?original.click():sheet.close();
  backdrop(native?sheet:sheet.parentElement,sheet,dismiss);
  const handle=document.createElement('button');handle.type='button';handle.className='sheet-dismiss-handle';handle.setAttribute('aria-label',original?.getAttribute('aria-label')||'창 내리기');handle.innerHTML='<span aria-hidden="true"></span>';handle.onclick=dismiss;
  if(original){original.classList.add('sheet-original-close');original.tabIndex=-1;original.setAttribute('aria-hidden','true');}
  sheet.prepend(handle);sheet.classList.add(native?'app-bottom-sheet':'app-overlay-sheet');
  bindDrag(sheet,dismiss);
  if(native){sheet.addEventListener('cancel',e=>{if(e.defaultPrevented||!sheet.open)return;e.preventDefault();dismiss();});new MutationObserver(fit).observe(sheet,{attributes:true,attributeFilter:['open']});}
  fit();
 }
 function scan(){document.querySelectorAll('dialog,.modal-overlay:not(#modal-override)>.modal-sheet').forEach(attach);
  const editor=document.getElementById('modal-override');if(editor){const sheet=editor.querySelector('.override-sheet');backdrop(editor,sheet,()=>closeModalDirect());bindDrag(sheet,()=>closeModalDirect());}
  const onboarding=document.getElementById('onboarding-dialog');if(onboarding)backdrop(onboarding,onboarding,()=>document.getElementById('onboarding-exit').click());
 }
 window.AppSheets={attach,fit};scan();new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('dialog,.modal-overlay')||n.querySelector?.('dialog,.modal-overlay')))))scan();}).observe(document.body,{childList:true,subtree:true});visualViewport?.addEventListener('resize',fit);visualViewport?.addEventListener('scroll',fit);window.addEventListener('resize',fit);
})();
