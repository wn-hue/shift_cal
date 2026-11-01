/* Reversible page motion: one owner per element, cleanup on finish or interruption. */
(()=>{'use strict';
 const running=new WeakMap(),reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 function cancel(el){const old=running.get(el);if(old){running.delete(el);old.cancel();}}
 function page(el,show,complete=()=>{}){
  const old=running.get(el),from=old?getComputedStyle(el).transform:show?'translateX(100%)':'translateX(0)';
  cancel(el);
  if(reduced()||!el.animate){complete();return;}
  const animation=el.animate([{transform:from==='none'?'translateX(0)':from},{transform:show?'translateX(0)':'translateX(100%)'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)',fill:'both'});
  running.set(el,animation);
  animation.finished.then(()=>{if(running.get(el)!==animation)return;running.delete(el);complete();animation.cancel();},()=>{});
 }
 function reveal(el,direction=1){cancel(el);if(reduced()||!el.animate)return;const a=el.animate([{opacity:.5,transform:`translateX(${direction*20}px)`},{opacity:1,transform:'translateX(0)'}],{duration:180,easing:'ease-out'});running.set(el,a);a.finished.then(()=>{if(running.get(el)===a)running.delete(el);},()=>{});}
 window.AppMotion={page,reveal,cancel};
})();
