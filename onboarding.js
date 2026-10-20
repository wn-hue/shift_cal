/* First-run setup reuses the app's existing settings and payroll import. */
(function(){
 'use strict';
 const KEY='shift_onboarding_v1', $=id=>document.getElementById(id);
 const dialog=$('onboarding-dialog');
 const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}};
 const text=key=>{try{return localStorage.getItem(key)}catch{return null}};
 const saved=read(KEY);
 const legacy=()=>{
  const salary=read('shift_salary_config_master');
  if(['A','B','C'].includes(text('shift_active_group')))return true;
  if(salary && (salary.hireDate || ['baseHourly','ordinaryHourly','dutyPay','seniorityPay'].some(k=>salary[k]>0) || Object.values(salary.leaveByYear||{}).some(v=>v>0)))return true;
  if(['A','B','C'].some(g=>Object.keys(read('shift_overrides_'+g)||{}).length))return true;
  if(Object.keys(read('shift_day_memos')||{}).length)return true;
  if(['shift_today_menu_cache_v1','shift_bus_favorites_v1','shift_weather_city','shift_account_owner_v1'].some(k=>text(k)!==null))return true;
  return ['theme','shape','memos','holidays','adjacent'].some(k=>text('shift_display_'+k)!==null);
 };
 let state=saved?.status==='in_progress'?{status:'in_progress',step:Math.max(0,Math.min(2,Math.trunc(Number(saved.step)||0)))}:
  saved?.status==='complete'||saved?.status==='existing'?saved:{status:legacy()?'existing':'in_progress',step:0};
 let step=state.step||0, selected='', manual=false, active=false, saving=false;
 function remember(next){try{localStorage.setItem(KEY,JSON.stringify(next));state=next;return true}catch{$('onboarding-error').textContent='설정을 저장하지 못했어요. 기기 저장 공간을 확인해 주세요.';return false}}
 // Decide from the pre-existing settings, before the app's load handlers run.
 remember(state);
 const today=()=>new Date(Date.now()+9*3600000).toISOString().slice(0,10);
 function validDate(value){const date=new Date(value+'T00:00:00Z');return /^\d{4}-\d{2}-\d{2}$/.test(value||'') && value>='1900-01-01' && value<=today() && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value}
 const ready=()=>validDate(config.hireDate) && ['A','B','C'].includes(text('shift_active_group')) && config.baseHourly>0 && config.ordinaryHourly>0;
 function finish(){
  if(!ready())return false;
  if(!remember({status:'complete',step:2}))return false;
  active=false;delete document.body.dataset.onboarding;
  dialog.close();switchView('calendar');
  requestAnimationFrame(()=>$('cal-month-title-btn').focus());
  return true;
 }
 function paint(){
  $('onboarding-error').textContent='';
  $('onboarding-back').hidden=step===0;
  $('onboarding-exit').hidden=!manual;
  $('onboarding-login').hidden=step!==0;
  $('onboarding-step-label').textContent=`${step+1} / 3`;
  for(const [i,bar] of [...dialog.querySelectorAll('.onboarding-progress span')].entries())bar.dataset.filled=String(i<=step);
  for(const [i,panel] of [...dialog.querySelectorAll('.onboarding-panel')].entries())panel.hidden=i!==step;
  const titles=['입사일을\n알려주세요','어느 조에서\n근무하시나요?','시급을 설정하면\n준비가 끝나요'];
  const copies=['내 연차와 예상 급여를 계산하는 기준이에요.','선택한 조에 맞춰 내 근무표를 만들어요.','급여 문자를 붙여넣으면 필요한 금액만 읽어와요.'];
  $('onboarding-title').textContent=titles[step];$('onboarding-description').textContent=copies[step];
  $('onboarding-date').max=today();$('onboarding-date').value=config.hireDate||'';
  selected=['A','B','C'].includes(text('shift_active_group'))?text('shift_active_group'):'';
  for(const button of dialog.querySelectorAll('[data-onboarding-group]'))button.setAttribute('aria-pressed',String(button.dataset.onboardingGroup===selected));
  const wagesReady=config.baseHourly>0&&config.ordinaryHourly>0;
  $('onboarding-wage-summary').hidden=!wagesReady;
  $('onboarding-base-wage').textContent=Number(config.baseHourly||0).toLocaleString('ko-KR')+'원';
  $('onboarding-ordinary-wage').textContent=Number(config.ordinaryHourly||0).toLocaleString('ko-KR')+'원';
  $('onboarding-import-again').hidden=!wagesReady;
  $('onboarding-next').textContent=step===2?(wagesReady?'캘린더 시작하기':'급여 문자로 시급 설정하기'):'다음';
  $('onboarding-next').disabled=step===1&&!selected;
  $('onboarding-heading').focus();dialog.querySelector('.onboarding-main').scrollTop=0;
 }
 function open(revisit=false){
  manual=revisit;step=revisit?0:state.step||0;
  if(!validDate(config.hireDate))step=0;
  else if(step===2&&!['A','B','C'].includes(text('shift_active_group')))step=1;
  active=true;document.body.dataset.onboarding='open';
  if(!dialog.open)dialog.showModal();paint();
 }
 function next(){
  $('onboarding-error').textContent='';saving=true;
  try{
   if(step===0){
    const value=$('onboarding-date').value;
    if(!validDate(value)){$('onboarding-error').textContent='오늘까지의 올바른 입사일을 입력해 주세요.';$('onboarding-date').focus();return;}
    $('input-hire-date').value=value;onHireDateChange();
   }else if(step===1){if(!selected)return;setGroup(selected);}
   else {if(ready())finish();else PayrollEstimate.open({onboarding:true});return;}
   if(!manual&&!remember({status:'in_progress',step:step+1}))return;
   step++;paint();
  }catch{$('onboarding-error').textContent='설정을 저장하지 못했어요. 다시 시도해 주세요.';}
  finally{saving=false;}
 }
 $('onboarding-next').addEventListener('click',next);
 $('onboarding-date').addEventListener('input',()=>{$('onboarding-error').textContent='';});
 $('onboarding-back').addEventListener('click',()=>{if(step>0){step--;if(!manual)remember({status:'in_progress',step});paint()}});
 $('onboarding-exit').addEventListener('click',()=>{active=false;delete document.body.dataset.onboarding;dialog.close();$('onboarding-reopen').focus()});
 dialog.addEventListener('cancel',event=>{if(!manual){event.preventDefault();$('onboarding-error').textContent='세 가지 설정을 완료하면 내 캘린더를 볼 수 있어요.';}});
 dialog.addEventListener('close',()=>{if(!dialog.open){active=false;delete document.body.dataset.onboarding;}});
 for(const button of dialog.querySelectorAll('[data-onboarding-group]'))button.addEventListener('click',()=>{
  selected=button.dataset.onboardingGroup;
  for(const option of dialog.querySelectorAll('[data-onboarding-group]'))option.setAttribute('aria-pressed',String(option===button));
  $('onboarding-next').disabled=false;
 });
 $('onboarding-import-again').addEventListener('click',()=>PayrollEstimate.open({onboarding:true}));
 $('onboarding-login').addEventListener('click',()=>$('account-sheet-open').click());
 $('onboarding-reopen').addEventListener('click',()=>open(true));
 $('payroll-sms-dialog').addEventListener('close',()=>{if(active)requestAnimationFrame(()=>{if(active){paint();if(step===2&&(config.baseHourly>0||config.ordinaryHourly>0)&&!(config.baseHourly>0&&config.ordinaryHourly>0))$('onboarding-error').textContent='기본시급과 통상시급이 함께 있는 급여 문자를 확인해 주세요.';$('onboarding-next').focus()}})});
 window.addEventListener('shift-payroll-applied',()=>{if(active&&step===2){if(!finish()){$('onboarding-error').textContent='기본시급과 통상시급이 함께 있는 급여 문자를 확인해 주세요.';}}});
 window.ShiftOnboarding={open:()=>open(true),needsSetup:()=>state.status==='in_progress',refresh(){if(active&&!saving&&!manual&&ready())finish();}};
 window.addEventListener('load',()=>{if(state.status==='in_progress'){if(ready())remember({status:'complete',step:2});else open();}});
})();
