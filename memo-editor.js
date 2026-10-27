/* Follow Safari/Android keyboard resize and pan, keeping the sheet inside the visible screen. */
(()=>{'use strict';
 const overlay=document.getElementById('modal-override');
 if(!overlay)return;
 const viewport=window.visualViewport;
 const content=overlay.querySelector('.editor-content'),tabs=overlay.querySelector('.editor-tabs');
 // Tabs must not move with the long sticker grid or focused memo content.
 content.before(tabs);
 let frame=0,locked=false,scrollYBefore=0,savedBody=null,normalHeight=0,keyboardOpen=false,settleTimer=0,previousHeight=-1;
 function lock(active){
  if(active===locked)return;
  locked=active;
  if(active){
   scrollYBefore=window.scrollY;
   normalHeight=viewport?.height||innerHeight;keyboardOpen=false;previousHeight=-1;
   clearTimeout(settleTimer);settleTimer=setTimeout(()=>{if(locked&&overlay.classList.contains('active')&&overlay.dataset.sheetClosing!=='true')overlay.dataset.editorSettled='true'},240);
   savedBody={};for(const name of ['position','top','left','right','width'])savedBody[name]=document.body.style[name];
   Object.assign(document.body.style,{position:'fixed',top:-scrollYBefore+'px',left:'0',right:'0',width:'100%'});
   content.scrollTop=0;
  }else{
   clearTimeout(settleTimer);delete overlay.dataset.editorSettled;
   Object.assign(document.body.style,savedBody);
   window.scrollTo({top:scrollYBefore,left:0,behavior:'instant'});
   for(const name of ['height','width','top','left'])overlay.style.removeProperty('--memo-viewport-'+name);
   overlay.style.removeProperty('--editor-sheet-height');delete overlay.dataset.editorKeyboard;delete overlay.dataset.editorFocus;keyboardOpen=false;
  }
 }
 function fit(){
  frame=0;
  const active=overlay.classList.contains('active');
  lock(active);
  document.body.classList.toggle('memo-editor-open',active&&overlay.dataset.editorTab==='memo');
  document.body.classList.toggle('work-editor-open',active&&['work','memo','stickers'].includes(overlay.dataset.editorTab));
  if(!active){delete overlay.dataset.memoCompact;return}
  if(overlay.dataset.sheetClosing==='true')return;
  // A 16px input prevents focus zoom; preserve user-initiated pinch zoom.
  if(viewport&&Math.abs(viewport.scale-1)>.01)return;
  const focused=document.activeElement,editing=overlay.contains(focused)&&focused.matches('input,textarea,select,[contenteditable=true]');
  const height=viewport?.height||innerHeight;
  if(!editing&&!keyboardOpen)normalHeight=height;
  keyboardOpen=(editing||keyboardOpen)&&normalHeight-height>120;
  const values={height,width:viewport?.width||innerWidth,top:keyboardOpen?(viewport?.offsetTop||0):0,left:viewport?.offsetLeft||0};
  for(const [name,value]of Object.entries(values))overlay.style.setProperty('--memo-viewport-'+name,value+'px');
  overlay.dataset.editorKeyboard=String(keyboardOpen);overlay.dataset.editorFocus=keyboardOpen&&focused.id==='modal-memo-input'?'memo':keyboardOpen&&editing?'event':'';
  overlay.dataset.memoCompact=String(keyboardOpen||height<540);overlay.dataset.editorTiny=String(height<300);
  const panel=document.getElementById(overlay.dataset.editorTab==='memo'?'memo-panel':'work-panel');
  const padding=getComputedStyle(content),header=overlay.querySelector('.override-header');
  // The panel has natural height even when its parent scrolls. Do not measure the parent's stretched height.
  const natural=header.offsetHeight+tabs.offsetHeight+Math.max(panel.offsetHeight,panel.scrollHeight)+44+parseFloat(padding.paddingTop)+parseFloat(padding.paddingBottom);
  const limit=normalHeight<540?normalHeight-24:Math.min(740,normalHeight*.78);
  const resting=Math.min(limit,natural);
  const target=Math.ceil(Math.max(0,keyboardOpen?height-12:Math.min(resting,height)));
  if(target!==previousHeight){previousHeight=target;overlay.style.setProperty('--editor-sheet-height',target+'px');}
  // Scroll the editable pane, never the fixed sheet or its backdrop, to reveal a field.
  if(keyboardOpen&&editing&&content.contains(focused)){
   const pane=content.getBoundingClientRect(),field=focused.getBoundingClientRect();
   if(field.top<pane.top+6)content.scrollTop-=pane.top+6-field.top;
   else if(field.bottom>pane.bottom-6)content.scrollTop+=field.bottom-pane.bottom+6;
  }
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(fit)}
 new MutationObserver(fit).observe(overlay,{attributes:true,attributeFilter:['class','data-editor-tab']});
 // Selection previews, agenda rows and translated labels can change the natural panel height.
 if(window.ResizeObserver){const observer=new ResizeObserver(schedule);for(const el of[overlay.querySelector('.override-header'),tabs,document.getElementById('work-panel'),document.getElementById('memo-panel')])observer.observe(el);}
 new MutationObserver(schedule).observe(content,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
 overlay.addEventListener('focusin',schedule);
 overlay.addEventListener('focusout',schedule);
 viewport?.addEventListener('resize',schedule);
 viewport?.addEventListener('scroll',schedule);
 window.addEventListener('resize',schedule);
 window.addEventListener('orientationchange',schedule);
 window.addEventListener('pageshow',schedule);
})();
