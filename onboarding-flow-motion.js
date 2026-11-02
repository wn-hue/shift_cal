/* Continuous form transitions: headline first, then the next question's fields. */
(()=>{'use strict';
 const running=new WeakMap(),reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 const ease='cubic-bezier(.22,1,.36,1)';
 function cancel(element){running.get(element)?.finish();}
 function accents(element,direction=1,fieldOpacity=0){
  const animations=[],title=element.querySelector('.onboarding-title,#payroll-sms-title');
  if(title){
   // A soft left-to-right reveal keeps the text intact for reading and translation.
   animations.push(title.animate([
    {opacity:.3,maskImage:'linear-gradient(90deg,#000 40%,transparent 60%)',maskSize:'250% 100%',maskPosition:'100% 0'},
    {opacity:1,maskImage:'linear-gradient(90deg,#000 40%,transparent 60%)',maskSize:'250% 100%',maskPosition:'0% 0'}
   ],{duration:360,easing:ease,fill:'both'}));
  }
  const groups=element.querySelectorAll('.onboarding-panel:not([hidden]),.wage-unified-body,.guided-wage-import:not([hidden])');
  [...groups].filter(node=>node.getClientRects().length).forEach((node,index)=>animations.push(node.animate([
   {opacity:fieldOpacity,transform:`translateY(${12*direction}px)`},{opacity:1,transform:'translateY(0)'}
  ],{duration:280,delay:60+Math.min(index,2)*30,easing:ease,fill:'both'})));
  return animations;
 }
 function own(element,animations,cleanup=()=>{}){
  return new Promise(resolve=>{
   let done=false;
   const state={finish(){if(done)return;done=true;animations.forEach(a=>a.cancel());cleanup();if(running.get(element)===state)running.delete(element);resolve();}};
   running.set(element,state);Promise.all(animations.map(a=>a.finished)).then(state.finish,state.finish);
  });
 }
 function reveal(element){
  cancel(element);if(reduced()||!element.animate)return Promise.resolve();
  const entering=element.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],{duration:320,easing:ease,fill:'both'});
  return own(element,[entering,...accents(element)]);
 }
 function replace(element,update,direction=1){
  // Different layouts (import → review → edit) should not paint two forms on top
  // of each other. Keep the new amounts visible while the sheet changes height.
  cancel(element);update();if(reduced()||!element.animate)return Promise.resolve();
  const incoming=element.animate([{transform:`translateY(${8*direction}px)`},{transform:'translateY(0)'}],{duration:320,easing:ease,fill:'both'});
  return own(element,[incoming,...accents(element,direction,.45)]);
 }
 function swap(element,update,direction=1){
  cancel(element);
  if(reduced()||!element.animate){update();return Promise.resolve();}
  const bounds=element.getBoundingClientRect(),parent=element.parentElement.getBoundingClientRect();
  const copy=element.cloneNode(true);copy.removeAttribute('id');copy.classList.add('onboarding-scene-copy');copy.setAttribute('aria-hidden','true');copy.inert=true;
  for(const node of copy.querySelectorAll('[id]'))node.removeAttribute('id');
  for(const node of copy.querySelectorAll('[autofocus]'))node.removeAttribute('autofocus');
  window.OnboardingStory?.freeze(element,copy);
  Object.assign(copy.style,{position:'absolute',left:(bounds.left-parent.left)+'px',top:(bounds.top-parent.top)+'px',width:bounds.width+'px',height:bounds.height+'px',maxHeight:'none',margin:'0',pointerEvents:'none',zIndex:'2'});
  element.after(copy);copy.scrollTop=element.scrollTop;
  try{update();}catch(error){copy.remove();throw error;}
  const options={duration:320,easing:ease,fill:'both'};
  const outgoing=copy.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:`translateY(${-8*direction}px)`}],options);
  const incoming=element.animate([{opacity:0,transform:`translateY(${12*direction}px)`},{opacity:1,transform:'translateY(0)'}],options);
  return own(element,[outgoing,incoming,...accents(element,direction)],()=>copy.remove());
 }
 function field(element){
  if(!element||reduced()||!element.animate)return;
  cancel(element);
  return own(element,[element.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:ease,fill:'both'})]);
 }
 window.OnboardingFlowMotion={swap,replace,cancel,reveal,field};
})();
