/* Intentional gestures on blank space; form controls keep their native scrolling. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),overlay=$('modal-override'),sheet=overlay.querySelector('.override-sheet'),content=overlay.querySelector('.editor-content'),header=overlay.querySelector('.override-header');
 const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 function move(direction){
  if(!overlay.classList.contains('active')||$('sticker-dialog').open)return;
  const tab=overlay.dataset.editorTab;
  if(direction>0&&tab==='work'){switchEditorTab('memo');return}
  if(direction<0&&tab==='memo'){switchEditorTab('work');return}
  if(window.ShiftTools?.canLeave&&!ShiftTools.canLeave())return;
  if(window.DayScheduler?.canLeave&&!DayScheduler.canLeave())return;
  if($('modal-memo-input').value.trim()!==(dayMemos[selectedDateStr]||'').trim()&&!confirm('작성 중인 메모를 저장하지 않고 이동할까요?'))return;
  const [y,m,d]=selectedDateStr.split('-').map(Number),next=new Date(y,m-1,d+direction,12),key=toDateKey(next.getFullYear(),next.getMonth(),next.getDate());
  currentCalDate=new Date(next.getFullYear(),next.getMonth(),1);renderCalendar();
  openOverrideModal(key,next,getActualShift(next,currentGroup));
  if(direction<0)switchEditorTab('memo');
 }
 function bind(target,kind){
  let start=null,axis='',dx=0,dy=0,suppressUntil=0;
  function reset(){start=null;axis='';dx=dy=0;sheet.style.transform='';}
  target.addEventListener('touchstart',e=>{
   reset();if(e.touches.length!==1||$('sticker-dialog').open)return;
   const blank=e.target===content||e.target===$('editor-swipe-space');
   if(kind==='page'&&!blank)return;
   if(kind==='dismiss'&&e.target.closest('button')!==$('editor-dismiss')&&e.target.closest('button,input,textarea,select,a'))return;
   start={x:e.touches[0].clientX,y:e.touches[0].clientY};
  },{passive:true});
  target.addEventListener('touchmove',e=>{
   if(!start)return;if(e.touches.length!==1){reset();return}
   dx=e.touches[0].clientX-start.x;dy=e.touches[0].clientY-start.y;
   if(!axis&&Math.max(Math.abs(dx),Math.abs(dy))>10)axis=Math.abs(dx)>Math.abs(dy)*1.3?'x':'y';
   const active=kind==='page'?axis==='x':axis==='y'&&dy>0;
   if(active){if(e.cancelable)e.preventDefault();if(kind==='dismiss'&&!reduced())sheet.style.transform=`translateY(${Math.min(dy,200)}px)`;}
  },{passive:false});
  target.addEventListener('touchend',e=>{
   if(!start)return;
   dx=e.changedTouches[0].clientX-start.x;dy=e.changedTouches[0].clientY-start.y;
   const advance=kind==='page'&&axis!=='y'&&Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.3;
   const dismiss=kind==='dismiss'&&axis!=='x'&&dy>70&&dy>Math.abs(dx)*1.3;
   if(advance||dismiss)suppressUntil=performance.now()+500;
   const direction=dx>0?1:-1;reset();
   if(advance)move(direction);if(dismiss)closeModalDirect();
  },{passive:true});
  target.addEventListener('touchcancel',reset,{passive:true});
  target.addEventListener('click',e=>{if(performance.now()<suppressUntil){e.preventDefault();e.stopPropagation();}},true);
 }
 bind(content,'page');bind(header,'dismiss');
 $('editor-swipe-space').addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();move(e.key==='ArrowRight'?1:-1)}});
})();
