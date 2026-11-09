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
 function attendanceBalance(date){
  const year=Number(date.slice(0,4));
  const automatic=calculateFiscalYearLeave(config.hireDate,year,date);
  const granted=getGrantedLeave(year,automatic);
  const remaining=Math.max(0,granted-getUsedLeave(year));
  const availableToReplace=Math.max(0,granted-getUsedLeave(year,date));
  return {remaining,availableToReplace,unpaidAvailable:availableToReplace===0};
 }
 function filterOptions(date,selectedType=getActualShift(new Date(date+'T12:00:00'),currentGroup).type){
  const base=getBaseShift(new Date(date+'T12:00:00'),currentGroup).type;
  const active=selectedType==='NO_OT'?base:selectedType.replace(/_NO_OT$/,'');
  const canShowAttendance=base!=='OFF'&&active!=='OFF';
  const {unpaidAvailable}=attendanceBalance(date);
  for(const button of document.querySelectorAll('#work-panel .opt-btn, #attendance-picker .opt-btn')){
   const type=button.dataset.override;
   if(!type)continue;
   let available;
   if(['SPECIAL_DAY','SPECIAL_NIGHT'].includes(type)){
    available=type!==active&&!validateDayOverride(date,type);
   }else if(['LEAVE','HALF_PRE','HALF_POST'].includes(type)){
    available=canShowAttendance;
   }else if(type.startsWith('UNPAID_')){
    // Keep the three unpaid choices together. The monthly cap is checked when tapped.
    available=canShowAttendance&&unpaidAvailable;
   }else{
    // The date summary presents the scheduled shift and the O.T switch handles its variants.
    available=false;
   }
   button.hidden=!available;
   button.disabled=!available;
  }
  for(const row of document.querySelectorAll('#work-panel .shift-scroll')){
   const empty=![...row.querySelectorAll('button')].some(b=>!b.hidden);
   row.hidden=empty;
   if(row.previousElementSibling?.matches('h3'))row.previousElementSibling.hidden=empty;
  }
 }
 window.WorkEditor={syncColors,filterOptions,attendanceBalance};
})();
