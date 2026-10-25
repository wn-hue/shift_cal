/* Bottom-sheet affordances preserve each feature's existing dismissal and draft guards. */
(()=>{'use strict';
 const attached=new WeakSet(),backdrops=new WeakSet();
 function backdrop(target,sheet,dismiss){
  if(backdrops.has(target))return;backdrops.add(target);let pressedOutside=false;
  const outside=e=>{if(e.target!==target)return false;if(target!==sheet)return true;const r=sheet.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
  target.addEventListener('pointerdown',e=>{pressedOutside=outside(e);},true);
  target.addEventListener('click',e=>{if(!outside(e))return;const shouldDismiss=pressedOutside;pressedOutside=false;e.preventDefault();e.stopImmediatePropagation();if(shouldDismiss)dismiss();},true);
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
  let start=null,delta=0,suppressUntil=0;
  const reset=()=>{start=null;delta=0;sheet.style.removeProperty('--sheet-drag');};
  sheet.addEventListener('touchstart',e=>{reset();if(e.touches.length!==1)return;const target=e.target;if(target.closest('input,textarea,select,a,button')!==handle&&target.closest('input,textarea,select,a,button'))return;
   if(!handle.contains(target)&&!target.closest('.sms-dialog-header,.override-header,.stats-header,.payslip-header,.modal-title,.sticker-dialog-heading')&&e.touches[0].clientY>sheet.getBoundingClientRect().top+64)return;
   start={x:e.touches[0].clientX,y:e.touches[0].clientY};},{passive:true});
  sheet.addEventListener('touchmove',e=>{if(!start)return;if(e.touches.length!==1){reset();return;}const dx=e.touches[0].clientX-start.x;delta=e.touches[0].clientY-start.y;if(Math.abs(dx)>Math.abs(delta)*1.3){reset();return;}if(delta>10){if(e.cancelable)e.preventDefault();if(!matchMedia('(prefers-reduced-motion:reduce)').matches)sheet.style.setProperty('--sheet-drag',Math.min(delta,220)+'px');}},{passive:false});
  sheet.addEventListener('touchend',()=>{const close=start&&delta>65;if(close)suppressUntil=performance.now()+500;reset();if(close)dismiss();},{passive:true});sheet.addEventListener('touchcancel',reset,{passive:true});
  handle.addEventListener('click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
  if(native){sheet.addEventListener('cancel',e=>{if(e.defaultPrevented||!sheet.open)return;e.preventDefault();dismiss();});new MutationObserver(fit).observe(sheet,{attributes:true,attributeFilter:['open']});}
  fit();
 }
 function scan(){document.querySelectorAll('dialog,.modal-overlay:not(#modal-override)>.modal-sheet').forEach(attach);
  const editor=document.getElementById('modal-override');backdrop(editor,editor.querySelector('.override-sheet'),()=>closeModalDirect());
  const onboarding=document.getElementById('onboarding-dialog');if(onboarding)backdrop(onboarding,onboarding,()=>document.getElementById('onboarding-exit').click());
 }
 window.AppSheets={attach,fit};scan();new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('dialog')||n.querySelector?.('dialog')))))scan();}).observe(document.body,{childList:true,subtree:true});visualViewport?.addEventListener('resize',fit);visualViewport?.addEventListener('scroll',fit);window.addEventListener('resize',fit);
})();
