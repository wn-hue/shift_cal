/* Follow Safari/Android keyboard resize and pan, keeping the sheet inside the visible screen. */
(()=>{'use strict';
 const overlay=document.getElementById('modal-override');
 if(!overlay)return;
 const viewport=window.visualViewport;
 const content=overlay.querySelector('.editor-content'),tabs=overlay.querySelector('.editor-tabs');
 // Tabs must not move with the long sticker grid or focused memo content.
 content.before(tabs);
 let frame=0,locked=false,scrollYBefore=0,savedBody=null,normalHeight=0,keyboardOpen=false,previousLimit=-1;
 function lock(active){
  if(active===locked)return;
  locked=active;
  if(active){
   scrollYBefore=window.scrollY;
   normalHeight=viewport?.height||innerHeight;keyboardOpen=false;previousLimit=-1;
   savedBody={};for(const name of ['position','top','left','right','width'])savedBody[name]=document.body.style[name];
   Object.assign(document.body.style,{position:'fixed',top:-scrollYBefore+'px',left:'0',right:'0',width:'100%'});
   content.scrollTop=0;
  }else{
   Object.assign(document.body.style,savedBody);
   window.scrollTo({top:scrollYBefore,left:0,behavior:'instant'});
   for(const name of ['height','width','top','left'])overlay.style.removeProperty('--memo-viewport-'+name);
   overlay.style.removeProperty('--editor-sheet-limit');delete overlay.dataset.editorKeyboard;delete overlay.dataset.editorFocus;keyboardOpen=false;
  }
 }
 function fit(){
  frame=0;
  const active=overlay.classList.contains('active');
  lock(active);
  document.body.classList.toggle('memo-editor-open',active&&overlay.dataset.editorTab==='memo');
  document.body.classList.toggle('work-editor-open',active&&['work','memo','stickers'].includes(overlay.dataset.editorTab));
  if(!active){delete overlay.dataset.memoCompact;return}
  if(overlay.dataset.sheetClosing==='true'||overlay.dataset.memoComposing==='true')return;
  // A 16px input prevents focus zoom; preserve user-initiated pinch zoom.
  if(viewport&&Math.abs(viewport.scale-1)>.01)return;
  const focused=document.activeElement,editing=overlay.contains(focused)&&focused.matches('input,textarea,select,[contenteditable=true]');
  const height=viewport?.height||innerHeight;
  if(!editing&&!keyboardOpen)normalHeight=height;
  keyboardOpen=(editing||keyboardOpen)&&normalHeight-height>120;
  // Opening the keyboard during the entry animation must not translate the sheet below it.
  if(keyboardOpen)overlay.querySelector('.override-sheet').getAnimations().forEach(animation=>animation.cancel());
  const values={height,width:viewport?.width||innerWidth,top:viewport?.offsetTop||0,left:viewport?.offsetLeft||0};
  for(const [name,value]of Object.entries(values))overlay.style.setProperty('--memo-viewport-'+name,value+'px');
  overlay.dataset.editorKeyboard=String(keyboardOpen);overlay.dataset.editorFocus=keyboardOpen&&focused.id==='modal-memo-input'?'memo':keyboardOpen&&editing?'event':'';
  overlay.dataset.memoCompact=String(keyboardOpen||height<540);overlay.dataset.editorTiny=String(height<300);
  // Only cap the available viewport. CSS lays out the real content at its intrinsic height.
  // Measuring a panel that is hidden or mid-layout can report zero and clip every choice below the tabs.
  const restingLimit=normalHeight<540?normalHeight-24:overlay.dataset.editorDesign==='toss'?Math.min(720,normalHeight*.84):overlay.dataset.editorDesign?normalHeight-Math.max(12,parseFloat(getComputedStyle(overlay).getPropertyValue('--editor-top-inset'))||0):Math.min(740,normalHeight*.78);
  const limit=Math.ceil(Math.max(0,keyboardOpen?height-12:Math.min(restingLimit,height)));
  if(limit!==previousLimit){previousLimit=limit;overlay.style.setProperty('--editor-sheet-limit',limit+'px');}
  // Scroll the editable pane, never the fixed sheet or its backdrop, to reveal a field.
  if(keyboardOpen&&editing&&content.contains(focused)){
   const pane=content.getBoundingClientRect(),field=focused.getBoundingClientRect();
   if(field.top<pane.top+6)content.scrollTop-=pane.top+6-field.top;
   else if(field.bottom>pane.bottom-6)content.scrollTop+=field.bottom-pane.bottom+6;
  }
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
