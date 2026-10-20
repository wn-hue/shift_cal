/* Size the calendar after its header, setup guide and navigation have laid out. */
(()=>{'use strict';
 const grid=document.getElementById('calendar-grid'),nav=document.querySelector('.bottom-nav');
 if(!grid||!nav)return;
 const root=document.documentElement;
 let frame=0;
 function set(element,key,value){if(element.style.getPropertyValue(key)!==value)element.style.setProperty(key,value);}
 function fit(){
  frame=0;
  // A pinch zoom is a reading aid; it must not resize the underlying calendar.
  if(window.visualViewport&&Math.abs(window.visualViewport.scale-1)>.05)return;
  const navHeight=Math.ceil(nav.getBoundingClientRect().height);
  set(root,'--app-nav-reserve',(navHeight+12)+'px');
  if(document.body.dataset.view!=='calendar'||!grid.children.length)return;
  const rows=Math.ceil(grid.children.length/7),minimum=parseFloat(getComputedStyle(grid).getPropertyValue('--calendar-cell-min'))||64;
  const gridTop=grid.getBoundingClientRect().top+window.scrollY;
  const height=window.visualViewport?.height||window.innerHeight;
  const available=Math.floor(height-navHeight-gridTop-16);
  set(grid,'--calendar-height',Math.max(rows*minimum,Math.min(660,available))+'px');
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(fit);}
 const resize=typeof ResizeObserver==='function'?new ResizeObserver(schedule):null;
 for(const element of [nav,document.querySelector('.reference-header'),document.getElementById('first-use-guide'),document.querySelector('.cal-weekdays')])if(element)resize?.observe(element);
 new MutationObserver(schedule).observe(grid,{childList:true});
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-view','data-pref-theme','data-pref-shape']});
 const guide=document.getElementById('first-use-guide');
 if(guide)new MutationObserver(schedule).observe(guide,{attributes:true,childList:true,subtree:true,characterData:true});
 window.addEventListener('resize',schedule);window.addEventListener('pageshow',schedule);
 window.visualViewport?.addEventListener('resize',schedule);
 if(document.fonts?.ready)document.fonts.ready.then(schedule);
 schedule();
})();
