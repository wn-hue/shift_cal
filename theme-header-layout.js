/* Fit the home calendar card between the actual header and fixed navigation. */
(()=>{'use strict';
 const header=document.querySelector('.reference-header'),grid=document.getElementById('calendar-grid'),nav=document.querySelector('.bottom-nav'),card=grid?.closest('.calendar-card'),weekdays=document.querySelector('.cal-weekdays');
 if(!header||!grid||!nav||!card||!weekdays)return;
 let previousHeight=0,frame=0,settleTimers=[];
 function size(name,value){const next=Math.round(value*100)/100+'px';if(card.style.getPropertyValue(name)!==next)card.style.setProperty(name,next);}
 function fit(){
  frame=0;
  const height=Math.ceil(header.getBoundingClientRect().height);
  if(height>0&&height!==previousHeight){previousHeight=height;document.documentElement.style.setProperty('--theme-header-height',height+'px');}
  if(document.body.dataset.view!=='calendar')return;
  if(window.visualViewport&&Math.abs(visualViewport.scale-1)>.01)return;
  // Give the card a definite viewport-based height. Grid tracks on iOS must
  // stretch inside that height rather than relying on a minimum grid height.
  const navStyle=getComputedStyle(nav),dayStyle=getComputedStyle(weekdays),cardStyle=getComputedStyle(card);
  size('--calendar-card-top',card.getBoundingClientRect().top+window.scrollY);
  size('--calendar-nav-space',nav.getBoundingClientRect().height+(parseFloat(navStyle.bottom)||0)+8);
  size('--calendar-weekday-space',weekdays.getBoundingClientRect().height+(parseFloat(dayStyle.marginTop)||0)+(parseFloat(dayStyle.marginBottom)||0));
  size('--calendar-card-padding',parseFloat(cardStyle.paddingTop)+parseFloat(cardStyle.paddingBottom));
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
