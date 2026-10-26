/* Dedicated bus screen. Existing route search, shift matching and favorites are shared. */
(()=>{'use strict';
 const page=document.getElementById('commute-dialog'),body=page.querySelector('.commute-page-body');let active=false,showing=false,locked=[],returnScroll=0;
 function show(){
  if(showing)return;showing=true;
  if(!active){active=true;returnScroll=scrollY;locked=[...document.querySelectorAll('body>.container,body>.bottom-nav')].map(el=>[el,el.inert]);locked.forEach(([el])=>el.inert=true);ShiftBusBrowser.mount(body);body.scrollTop=0;}
  page.hidden=false;document.body.classList.add('commute-page-open');AppMotion.page(page,true);document.getElementById('commute-page-title').focus({preventScroll:true});window.AppI18n?.refresh();
 }
 function hide(){
  if(!active||!showing)return;window.ShiftBusBrowser?.dismiss();showing=false;
  AppMotion.page(page,false,()=>{active=false;page.hidden=true;document.body.classList.remove('commute-page-open');locked.forEach(([el,value])=>el.inert=value);window.scrollTo({top:returnScroll,behavior:'instant'});document.getElementById('commute-open').focus({preventScroll:true});});
 }
 function open(){if(active)return;history.pushState({...history.state,shiftCommute:true,shiftBusSearch:false},'','#commute');show();}
 document.getElementById('commute-back').onclick=()=>{if(history.state?.shiftCommute)history.back();else{history.replaceState({...history.state,shiftCommute:false},'',location.pathname+location.search);hide();}};
 window.addEventListener('popstate',()=>{if(history.state?.shiftCommute)show();else hide();window.BusUnifiedSearch?.syncHistory();});
 if(location.hash==='#commute'){history.replaceState({...history.state,shiftCommute:true,shiftBusSearch:false},'');show();}
 window.CommutePage={open};
})();
