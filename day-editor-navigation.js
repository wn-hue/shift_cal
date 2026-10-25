/* Intentional gestures on blank space; form controls keep their native scrolling. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),overlay=$('modal-override'),sheet=overlay.querySelector('.override-sheet'),content=overlay.querySelector('.editor-content');
 const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 function move(direction){
  if(!overlay.classList.contains('active')||$('sticker-dialog').open)return;
  const tab=overlay.dataset.editorTab;
  if(direction>0&&tab==='work'){switchEditorTab('memo');return;}
  if(direction<0&&tab==='memo'){switchEditorTab('work');return;}
  if(window.ShiftTools?.canLeave&&!ShiftTools.canLeave())return;
  if(window.DayScheduler?.canLeave&&!DayScheduler.canLeave())return;
  if($('modal-memo-input').value.trim()!==(dayMemos[selectedDateStr]||'').trim()&&!confirm('작성 중인 메모를 저장하지 않고 이동할까요?'))return;
  const [y,m,d]=selectedDateStr.split('-').map(Number),next=new Date(y,m-1,d+direction,12),key=toDateKey(next.getFullYear(),next.getMonth(),next.getDate());
  currentCalDate=new Date(next.getFullYear(),next.getMonth(),1);renderCalendar();
  openOverrideModal(key,next,getActualShift(next,currentGroup));
  switchEditorTab(direction>0?'work':'memo');
 }
 function advance(direction){
  overlay.dataset.editorSwiping='true';
  const before=selectedDateStr+':'+overlay.dataset.editorTab;
  try{move(direction);}finally{delete overlay.dataset.editorSwiping;}
  if(before!==selectedDateStr+':'+overlay.dataset.editorTab&&!reduced()){
   content.getAnimations().forEach(a=>a.cancel());
   content.animate([{opacity:.65,transform:`translateX(${direction*24}px)`},{opacity:1,transform:'translateX(0)'}],{duration:180,easing:'ease-out'});
  }
 }
 // Match calendar/payroll/menu: finger moves LEFT to advance work -> memo -> next day's work.
 let start=null,axis='',suppressUntil=0;
 const reset=()=>{start=null;axis='';content.style.transform='';};
 sheet.addEventListener('touchstart',e=>{
  reset();if(e.touches.length!==1||$('sticker-dialog').open||sheet.dataset.sheetClosing==='true')return;
  if(e.target.closest('button,a,input,textarea,select,label,[contenteditable=true],.shift-scroll,.editor-tabs'))return;
  start={x:e.touches[0].clientX,y:e.touches[0].clientY};
 },{passive:true});
 sheet.addEventListener('touchmove',e=>{
  if(!start)return;if(e.touches.length!==1){reset();return;}
  const dx=e.touches[0].clientX-start.x,dy=e.touches[0].clientY-start.y;
  if(!axis&&Math.max(Math.abs(dx),Math.abs(dy))>10)axis=Math.abs(dx)>Math.abs(dy)*1.3?'x':'y';
  if(axis==='x'){if(e.cancelable)e.preventDefault();if(!reduced())content.style.transform=`translateX(${Math.max(-60,Math.min(60,dx*.25))}px)`;}
 },{passive:false});
 sheet.addEventListener('touchend',e=>{
  if(!start)return;const t=e.changedTouches[0],dx=t.clientX-start.x,dy=t.clientY-start.y;
  const horizontal=axis!=='y'&&Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3;
  reset();if(horizontal){if(e.cancelable)e.preventDefault();suppressUntil=performance.now()+500;advance(dx<0?1:-1);}
 },{passive:false});
 sheet.addEventListener('touchcancel',reset,{passive:true});
 sheet.addEventListener('click',e=>{if(performance.now()<suppressUntil&&!e.target.closest('.sheet-original-close')){e.preventDefault();e.stopPropagation();}},true);
 sheet.addEventListener('pointerdown',()=>{suppressUntil=0;},true);
 // The fixed segment control changes sections; blank content gestures change dates.
 const tabs=sheet.querySelector('.editor-tabs');
 tabs.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();
  const next=e.key==='Home'?'work':e.key==='End'?'memo':overlay.dataset.editorTab==='work'?'memo':'work';
  switchEditorTab(next);$(next+'-tab').focus({preventScroll:true});
 });
 $('editor-swipe-space').addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();advance(e.key==='ArrowRight'?1:-1)}});
})();
