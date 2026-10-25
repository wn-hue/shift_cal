/* Recheck on app resume and midnight; acknowledge only when the user dismisses the visible alert. */
(()=>{'use strict';
 let frame=0;
 function schedule(){
  if(frame)return;
  frame=requestAnimationFrame(()=>{frame=0;if(document.readyState==='complete')checkPayslipPopup()});
 }
 window.addEventListener('load',schedule);
 window.addEventListener('pageshow',schedule);
 window.addEventListener('focus',schedule);
 document.addEventListener('visibilitychange',schedule);
 // Covers an app left in the foreground while the statement date begins.
 setInterval(schedule,60000);
 // A closed setup/account/work sheet must not swallow today's alert.
 for(const dialog of document.querySelectorAll('dialog,.modal-overlay,.settings-page,.commute-page')){
  new MutationObserver(schedule).observe(dialog,{attributes:true,attributeFilter:['open','class','hidden']});
 }
 schedule();
})();
