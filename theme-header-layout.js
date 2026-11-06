/* Fit the home calendar card between the actual header and fixed navigation. */
(()=>{'use strict';
 const header=document.querySelector('.reference-header'),grid=document.getElementById('calendar-grid'),nav=document.querySelector('.bottom-nav');
 if(!header||!grid||!nav)return;
 let previousHeight=0,previousRoom=0,frame=0,settleTimers=[];
 function fit(){
  frame=0;
  const height=Math.ceil(header.getBoundingClientRect().height);
  if(height>0&&height!==previousHeight){previousHeight=height;document.documentElement.style.setProperty('--theme-header-height',height+'px');}
  if(document.body.dataset.view!=='calendar')return;
  if(window.visualViewport&&Math.abs(visualViewport.scale-1)>.01)return;
  const room=Math.max(0,Math.floor(nav.getBoundingClientRect().top-(grid.getBoundingClientRect().top+window.scrollY)-24));
  if(room!==previousRoom){previousRoom=room;document.documentElement.style.setProperty('--theme-calendar-room',room+'px');}
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(fit);}
 function settle(){
  schedule();requestAnimationFrame(schedule);
  settleTimers.forEach(clearTimeout);settleTimers=[setTimeout(schedule,160),setTimeout(schedule,520)];
 }
 // A preceding setup guide can disappear after saved settings load. Its position
 // change also needs a fit, even if the header and navigation keep the same size.
 if(window.ResizeObserver){const observer=new ResizeObserver(schedule);for(const element of[header,nav,grid.closest('.calendar-card'),document.querySelector('.container'),document.querySelector('.cal-weekdays')])if(element)observer.observe(element);}
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-pref-theme','data-beige-round','data-view','data-ui-language']});
 // mobile-layout updates the visible viewport after standalone Safari settles.
 new MutationObserver(schedule).observe(document.documentElement,{attributes:true,attributeFilter:['style']});
 window.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});
 window.addEventListener('load',settle);window.addEventListener('pageshow',settle);window.addEventListener('orientationchange',settle);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)settle();});
 document.fonts?.ready.then(settle);settle();
})();
