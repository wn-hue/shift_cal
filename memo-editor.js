/* Follow Safari/Android keyboard resize and pan, keeping the sheet inside the visible screen. */
(()=>{'use strict';
 const overlay=document.getElementById('modal-override');
 if(!overlay)return;
 const viewport=window.visualViewport;
 let frame=0;
 function fit(){
  frame=0;
  const active=overlay.classList.contains('active');
  document.body.classList.toggle('memo-editor-open',active&&overlay.dataset.editorTab==='memo');
  document.body.classList.toggle('work-editor-open',active&&['work','memo','stickers'].includes(overlay.dataset.editorTab));
  if(!active){delete overlay.dataset.memoCompact;return}
  // A 16px input prevents focus zoom; preserve user-initiated pinch zoom.
  if(viewport&&Math.abs(viewport.scale-1)>.01)return;
  const values={height:viewport?.height||innerHeight,width:viewport?.width||innerWidth,top:viewport?.offsetTop||0,left:viewport?.offsetLeft||0};
  for(const [name,value]of Object.entries(values))overlay.style.setProperty('--memo-viewport-'+name,value+'px');
  overlay.dataset.memoCompact=String(values.height<360);
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(fit)}
 new MutationObserver(fit).observe(overlay,{attributes:true,attributeFilter:['class','data-editor-tab']});
 overlay.addEventListener('focusin',schedule);
 overlay.addEventListener('focusout',schedule);
 viewport?.addEventListener('resize',schedule);
 viewport?.addEventListener('scroll',schedule);
 window.addEventListener('resize',schedule);
 window.addEventListener('orientationchange',schedule);
 window.addEventListener('pageshow',schedule);
})();
