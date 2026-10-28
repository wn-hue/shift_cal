/* Reuse the rendered calendar palette instead of maintaining a second set of shift colors. */
(()=>{'use strict';
 function syncColors(baseType){
  const grid=document.getElementById('calendar-grid');
  const cell=document.createElement('div');cell.className='cal-day';cell.setAttribute('aria-hidden','true');cell.style.cssText='position:absolute;visibility:hidden;pointer-events:none;';
  const badge=document.createElement('div');cell.append(badge);grid.append(cell);
  try{
   for(const button of document.querySelectorAll('#work-panel .shift-scroll .opt-btn')){
    const cls=button.classList;
    badge.className=cls.contains('day-sp')?'shift-badge special special-day':cls.contains('night-sp')?'shift-badge special special-night':cls.contains('day')?'shift-badge day':cls.contains('night')?'shift-badge night':cls.contains('off')?'shift-badge off':cls.contains('no-ot')?'shift-badge '+(baseType==='NIGHT'?'night':'day'):cls.contains('leave')?'attendance-pill leave':cls.contains('half')?'attendance-pill half':'attendance-pill unpaid';
    const style=getComputedStyle(badge);
    button.style.setProperty('--calendar-choice-fill',style.backgroundColor);
    button.style.setProperty('--calendar-choice-ink',style.color);
   }
  }finally{cell.remove()}
  for(const row of document.querySelectorAll('#work-panel .shift-scroll'))row.scrollLeft=0;
 }
 function filterOptions(date){
  const base=getBaseShift(new Date(date+'T12:00:00'),currentGroup).type;
  const guided=document.getElementById('modal-override').dataset.editorDesign==='toss';
  for(const button of document.querySelectorAll('#work-panel .opt-btn')){
   const type=button.dataset.override||null;
   // Keep the guided editor on the scheduled day/night shift. Stored changes remain untouched.
   const opposite=guided&&((base==='DAY'&&type==='NIGHT')||(base==='NIGHT'&&type==='DAY'));
   const unavailable=opposite||!!validateDayOverride(date,type);
   button.hidden=unavailable;button.disabled=unavailable;
  }
  for(const row of document.querySelectorAll('#work-panel .shift-scroll')){
   const empty=![...row.querySelectorAll('button')].some(b=>!b.hidden);
   row.hidden=empty;
   if(row.previousElementSibling?.matches('h3'))row.previousElementSibling.hidden=empty;
  }
 }
 window.WorkEditor={syncColors,filterOptions};
})();
