/* Dedicated bus screen. Existing route search, shift matching and favorites are shared. */
(()=>{'use strict';
 const page=document.getElementById('commute-dialog'),body=page.querySelector('.commute-page-body');let active=false,locked=[],returnScroll=0;
 function show(){if(active)return;active=true;returnScroll=scrollY;locked=[...document.querySelectorAll('body>.container,body>.bottom-nav')].map(el=>[el,el.inert]);locked.forEach(([el])=>el.inert=true);page.hidden=false;document.body.classList.add('commute-page-open');ShiftBusBrowser.mount(body);body.scrollTop=0;if(!matchMedia('(prefers-reduced-motion:reduce)').matches)page.animate([{transform:'translateX(100%)'},{transform:'translateX(0)'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'});document.getElementById('commute-page-title').focus({preventScroll:true});window.AppI18n?.refresh();}
 function hide(){if(!active)return;active=false;page.hidden=true;document.body.classList.remove('commute-page-open');locked.forEach(([el,value])=>el.inert=value);window.scrollTo({top:returnScroll,behavior:'instant'});document.getElementById('commute-open').focus({preventScroll:true});}
 function open(){if(active)return;history.pushState({...history.state,shiftCommute:true},'','#commute');show();}
 document.getElementById('commute-back').onclick=()=>{if(history.state?.shiftCommute)history.back();else{history.replaceState({...history.state,shiftCommute:false},'',location.pathname+location.search);hide();}};
 window.addEventListener('popstate',()=>history.state?.shiftCommute?show():hide());
 if(location.hash==='#commute'){history.replaceState({...history.state,shiftCommute:true},'');show();}
 window.CommutePage={open};
})();
