/* Decide before app defaults are written, and before the calendar can paint. */
(function(root){
 'use strict';
 function resolve(storage){
  const text=key=>{try{return storage.getItem(key)}catch{return null}};
  const read=key=>{try{return JSON.parse(text(key)||'null')}catch{return null}};
  const saved=read('shift_onboarding_v1');
  if(saved?.status==='in_progress')return {status:'in_progress',step:Math.max(0,Math.min(2,Math.trunc(Number(saved.step)||0)))};
  if(saved?.status==='complete'||saved?.status==='existing')return saved;
  const salary=read('shift_salary_config_master');
  const existing=['A','B','C'].includes(text('shift_active_group'))||
   !!(salary&&(salary.hireDate||['baseHourly','ordinaryHourly','dutyPay','seniorityPay'].some(k=>salary[k]>0)||Object.values(salary.leaveByYear||{}).some(v=>v>0)))||
   ['A','B','C'].some(g=>Object.keys(read('shift_overrides_'+g)||{}).length>0)||
   Object.keys(read('shift_day_memos')||{}).length>0||
   ['shift_today_menu_cache_v1','shift_bus_favorites_v1','shift_weather_city','shift_account_owner_v1'].some(k=>text(k)!==null)||
   ['theme','shape','memos','holidays','adjacent'].some(k=>text('shift_display_'+k)!==null);
  return {status:existing?'existing':'in_progress',step:0};
 }
 if(typeof module==='object'&&module.exports){module.exports={resolve};return;}
 root.OnboardingState={resolve};
 let storage;try{storage=root.localStorage}catch{}
 root.ShiftOnboardingInitialState=resolve(storage);
 if(root.ShiftOnboardingInitialState.status==='in_progress'){document.documentElement.setAttribute('data-onboarding-pending','');if(new URLSearchParams(root.location.search).get('cloud')==='connected')document.documentElement.setAttribute('data-account-restoring','');}
})(typeof window==='undefined'?globalThis:window);
