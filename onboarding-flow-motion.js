/* Keep the previous scene visible until its replacement has arrived. */
(()=>{'use strict';
 const running=new WeakMap(),reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 function cancel(element){running.get(element)?.finish();}
 function swap(element,update,direction=1){
  cancel(element);
  if(reduced()||!element.animate){update();return Promise.resolve();}
  const bounds=element.getBoundingClientRect(),parent=element.parentElement.getBoundingClientRect();
  const copy=element.cloneNode(true);copy.removeAttribute('id');copy.classList.add('onboarding-scene-copy');copy.setAttribute('aria-hidden','true');copy.inert=true;
  for(const node of copy.querySelectorAll('[id]'))node.removeAttribute('id');
  for(const node of copy.querySelectorAll('[autofocus]'))node.removeAttribute('autofocus');
  Object.assign(copy.style,{position:'absolute',left:(bounds.left-parent.left)+'px',top:(bounds.top-parent.top)+'px',width:bounds.width+'px',height:bounds.height+'px',maxHeight:'none',margin:'0',pointerEvents:'none',zIndex:'2'});
  element.after(copy);copy.scrollTop=element.scrollTop;
  try{update();}catch(error){copy.remove();throw error;}
  const options={duration:320,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'};
  const outgoing=copy.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-20*direction}px)`}],options);
  const incoming=element.animate([{opacity:0,transform:`translateX(${24*direction}px)`},{opacity:1,transform:'translateX(0)'}],options);
  return new Promise(resolve=>{
   let done=false;
   const state={finish(){if(done)return;done=true;outgoing.cancel();incoming.cancel();copy.remove();if(running.get(element)===state)running.delete(element);resolve();}};
   running.set(element,state);incoming.finished.then(state.finish,state.finish);
  });
 }
 window.OnboardingFlowMotion={swap,cancel};
})();
