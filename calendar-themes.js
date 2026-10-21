/* Optional month themes fit the space between their header and the fixed navigation. */
(()=>{'use strict';
 const grid=document.getElementById('calendar-grid');
 const nav=document.querySelector('.bottom-nav');
 if(!grid||!nav)return;
 let frame=0;
 function fit(){
  frame=0;
  if(!['routine','google'].includes(document.body.dataset.prefTheme)||document.body.dataset.view!=='calendar'||document.body.dataset.keyboard==='open')return;
  const rows=Math.ceil(grid.children.length/7);
  if(!rows)return;
  const viewport=window.visualViewport;
  if(viewport&&Math.abs(viewport.scale-1)>.01)return;
  const bottom=Math.min(nav.getBoundingClientRect().top,(viewport?.height||innerHeight)+(viewport?.offsetTop||0));
  const available=bottom-(grid.getBoundingClientRect().top+window.scrollY)-12;
  // Keep date targets usable on short screens, and allow natural scrolling for long notes.
  const height=Math.min(112,Math.max(54,Math.floor(available/rows)));
  grid.style.setProperty('--calendar-rows',String(rows));
  grid.style.setProperty('--calendar-row-height',height+'px');
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(fit)}
 new MutationObserver(schedule).observe(grid,{childList:true});
 new MutationObserver(schedule).observe(document.body,{attributes:true,attributeFilter:['data-pref-theme','data-view','data-keyboard']});
 if(window.ResizeObserver){const observer=new ResizeObserver(schedule);observer.observe(nav);const header=document.querySelector('.reference-header');if(header)observer.observe(header);const guide=document.getElementById('first-use-guide');if(guide)observer.observe(guide)}
 window.addEventListener('resize',schedule);
 window.addEventListener('load',schedule);
 window.addEventListener('pageshow',schedule);
 window.visualViewport?.addEventListener('resize',schedule);
 schedule();
})();
