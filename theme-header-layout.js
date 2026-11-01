/* Fit experimental calendars between the actual header and fixed navigation. */
(()=>{'use strict';
 const header=document.querySelector('.reference-header'),grid=document.getElementById('calendar-grid'),nav=document.querySelector('.bottom-nav');
 if(!header||!grid||!nav)return;
 let previousHeight=0,previousRoom=0,frame=0;
 function fit(){
  frame=0;
  const height=Math.ceil(header.getBoundingClientRect().height);
  if(height>0&&height!==previousHeight){previousHeight=height;document.documentElement.style.setProperty('--theme-header-height',height+'px');}
  if(document.body.dataset.view!=='calendar'||!['test1','test3','test4'].includes(document.body.dataset.prefTheme))return;
  if(window.visualViewport&&Math.abs(visualViewport.scale-1)>.01)return;
  const room=Math.max(0,Math.floor(nav.getBoundingClientRect().top-(grid.getBoundingClientRect().top+window.scrollY)-20));
  if(room!==previousRoom){previousRoom=room;document.documentElement.style.setProperty('--theme-calendar-room',room+'px');}
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(fit);}
 if(window.ResizeObserver){const observer=new ResizeObserver(schedule);for(const element of[header,nav,document.querySelector('.cal-weekdays')])if(element)observer.observe(element);}
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-pref-theme','data-view','data-ui-language']});
 window.addEventListener('resize',schedule,{passive:true});window.visualViewport?.addEventListener('resize',schedule,{passive:true});
 document.fonts?.ready.then(schedule);schedule();
})();
