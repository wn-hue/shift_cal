/* Reversible page motion: one owner per element, cleanup on finish or interruption. */
(()=>{'use strict';
 const running=new WeakMap(),reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 const swipeExits=new WeakSet(),bound=new WeakSet(),resetGestures=new WeakMap();let swipeClickUntil=0;
 document.addEventListener('click',event=>{if(event.isTrusted&&performance.now()<swipeClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('pointerdown',()=>{swipeClickUntil=0;},true);
 function cancel(el){const old=running.get(el);if(old){running.delete(el);old.cancel();}}
 function page(el,show,complete=()=>{}){
  if(show)resetGestures.get(el)?.();
  const old=running.get(el),down=!show&&swipeExits.has(el),from=old||down?getComputedStyle(el).transform:show?'translateX(100%)':'translateX(0)';
  cancel(el);
  const finish=()=>{swipeExits.delete(el);el.style.removeProperty('transform');el.style.removeProperty('will-change');complete();};
  if(reduced()||!el.animate){finish();return;}
  const animation=el.animate([{transform:from==='none'?'translateX(0)':from},{transform:show?'translateX(0)':down?'translateY('+(innerHeight+24)+'px)':'translateX(100%)'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'});
  running.set(el,animation);
  animation.finished.then(()=>{if(running.get(el)!==animation)return;running.delete(el);finish();animation.cancel();},()=>{});
 }
 function reveal(el,direction=1){cancel(el);if(reduced()||!el.animate)return;const a=el.animate([{opacity:.5,transform:`translateX(${direction*20}px)`},{opacity:1,transform:'translateX(0)'}],{duration:180,easing:'ease-out'});running.set(el,a);a.finished.then(()=>{if(running.get(el)===a)running.delete(el);},()=>{});}
 // Full-page features share the sheet gesture without changing their back/history actions.
 function bindSwipeDismiss(el,dismiss,{header,canStart=()=>true}={}){
  if(!el||bound.has(el))return;bound.add(el);let start=null,dy=0,finishing=false,finishTimer;
  function clear(){el.style.removeProperty('transform');el.style.removeProperty('will-change');swipeExits.delete(el);}
  resetGestures.set(el,()=>{clearTimeout(finishTimer);start=null;dy=0;finishing=false;clear();});
  function settle(){
   if(!el.style.transform||reduced()||el.hidden){clear();return;}
   const from=getComputedStyle(el).transform;cancel(el);
   const animation=el.animate([{transform:from},{transform:'translateY(0)'}],{duration:180,easing:'ease-out',fill:'both'});running.set(el,animation);
   animation.finished.then(()=>{if(running.get(el)!==animation)return;running.delete(el);clear();animation.cancel();},()=>{});
  }
  el.addEventListener('touchstart',event=>{
   start=null;dy=0;
   if(finishing||el.hidden||running.has(el)||event.touches.length!==1||!canStart()||document.querySelector('dialog[open]'))return;
   if(event.target.closest('input,textarea,select,button,a,[contenteditable=true]'))return;
   const onHeader=header&&event.target.closest(header);
   if(!onHeader)for(let node=event.target;node&&el.contains(node);node=node.parentElement){if(node.scrollTop>1&&node.scrollHeight>node.clientHeight+1)return;if(node===el)break;}
   const touch=event.touches[0];start={x:touch.clientX,y:touch.clientY};
  },{passive:true});
  el.addEventListener('touchmove',event=>{
   if(!start)return;if(event.touches.length!==1){start=null;settle();return;}
   const touch=event.touches[0],dx=touch.clientX-start.x;dy=touch.clientY-start.y;
   if(dy < -10 || Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.3){start=null;settle();return;}
   if(dy>10&&dy>Math.abs(dx)*1.3){if(event.cancelable)event.preventDefault();if(!reduced()){el.style.willChange='transform';el.style.transform='translate3d(0,'+Math.min(dy,innerHeight*.6)+'px,0)';}}
  },{passive:false});
  el.addEventListener('touchend',event=>{
   const touch=event.changedTouches[0],close=start&&touch&&touch.clientY-start.y>80&&touch.clientY-start.y>Math.abs(touch.clientX-start.x)*1.3;start=null;
   if(!close){settle();return;}
   if(event.cancelable)event.preventDefault();swipeClickUntil=performance.now()+700;finishing=true;swipeExits.add(el);
   dismiss();
   // Back may close a nested view or a draft guard may decline; return the page smoothly.
   finishTimer=setTimeout(()=>{finishing=false;if(!running.has(el))settle();},300);
  },{passive:false});
  el.addEventListener('touchcancel',()=>{start=null;settle();},{passive:true});
 }
 window.AppMotion={page,reveal,cancel,bindSwipeDismiss};
})();
