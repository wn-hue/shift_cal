/* First-run setup reuses the app's existing settings and payroll import. */
(function(){
 'use strict';
 const KEY='shift_onboarding_v1', $=id=>document.getElementById(id);
 const dialog=$('onboarding-dialog');
 const text=key=>{try{return localStorage.getItem(key)}catch{return null}};
 let state=window.ShiftOnboardingInitialState||OnboardingState.resolve(localStorage);
 let step=state.step||0, selected='', manual=false, active=false, saving=false, navigating=false, paintedStep=-1;
 const main=dialog.querySelector('.onboarding-main');
 let waitingForAccount=state.status==='in_progress'&&new URLSearchParams(location.search).get('cloud')==='connected';
 window.addEventListener('shift-account-ready',event=>{if(!waitingForAccount||event.detail?.pending)return;waitingForAccount=false;document.documentElement.removeAttribute('data-account-restoring');if(event.detail?.ready&&event.detail?.hasSavedData)remember({status:'existing',step:0});start();});
 function reveal(){OnboardingFlowMotion.reveal(main);}
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
  const changed=paintedStep!==step;paintedStep=step;
  $('onboarding-error').textContent='';
  dialog.dataset.step=String(step);
  $('onboarding-back').hidden=step===0;
  $('onboarding-exit').hidden=!manual;
  $('onboarding-login').hidden=step!==0;
  $('onboarding-step-label').textContent=`${step+1} / 3`;
  for(const [i,bar] of [...dialog.querySelectorAll('.onboarding-progress span')].entries())bar.dataset.filled=String(i<=step);
  for(const [i,panel] of [...main.querySelectorAll('.onboarding-panel')].entries())panel.hidden=i!==step;
  const titles=['입사일을\n알려 주세요','어느 조에서\n일하시나요?','시급을 입력하면\n준비가 끝나요'];
  const copies=['입사일을 기준으로 연차와\n예상 급여를 계산해요.','선택한 조에 맞춰\n내 근무표를 만들어요.','시급을 입력하면\n예상 급여를 볼 수 있어요.'];
  $('onboarding-title').textContent=titles[step];$('onboarding-description').textContent=copies[step];
  $('onboarding-date').value=config.hireDate||'';window.OnboardingDatePicker.sync();
  selected=['A','B','C'].includes(text('shift_active_group'))?text('shift_active_group'):'';
  for(const button of main.querySelectorAll('[data-onboarding-group]'))button.setAttribute('aria-pressed',String(button.dataset.onboardingGroup===selected));
  const wagesReady=config.baseHourly>0&&config.ordinaryHourly>0;
  $('onboarding-wage-summary').hidden=!wagesReady;
  $('onboarding-base-wage').textContent=Number(config.baseHourly||0).toLocaleString('ko-KR')+'원';
  $('onboarding-ordinary-wage').textContent=Number(config.ordinaryHourly||0).toLocaleString('ko-KR')+'원';
  $('onboarding-import-again').hidden=!wagesReady;
  $('onboarding-next').textContent=step===2?(wagesReady?'내 캘린더 보기':'시급 설정하기'):'다음';
  $('onboarding-next').disabled=navigating||(step===1&&!selected);
  if(changed){main.scrollTop=0;if(dialog.open)$('onboarding-heading').focus({preventScroll:true});}
 }
 async function changeStep(target){
  if(navigating)return;
  const direction=target>step?1:-1;navigating=true;OnboardingFlowMotion.cancel(main);
  dialog.dataset.transitioning='true';
  $('onboarding-next').disabled=$('onboarding-back').disabled=true;
  try{await OnboardingFlowMotion.swap(main,()=>{step=target;paint();},direction);}
  finally{navigating=false;delete dialog.dataset.transitioning;$('onboarding-back').disabled=false;if(active)$('onboarding-next').disabled=step===1&&!selected;}
 }
 function open(revisit=false){
  manual=revisit;step=revisit?0:state.step||0;
  if(!validDate(config.hireDate))step=0;
  else if(step===2&&!['A','B','C'].includes(text('shift_active_group')))step=1;
  active=true;document.body.dataset.onboarding='open';
  paintedStep=-1;paint();
  if(!dialog.open)dialog.showModal();
  document.documentElement.removeAttribute('data-onboarding-pending');
  $('onboarding-heading').focus({preventScroll:true});reveal();
 }
 async function next(){
  if(saving||navigating)return;
  $('onboarding-error').textContent='';saving=true;
  try{
   if(step===0){
    const value=$('onboarding-date').value;
    if(!validDate(value)){$('onboarding-error').textContent='입사일을 다시 확인해 주세요. 오늘까지의 날짜를 고를 수 있어요.';$('onboarding-date-open').focus({preventScroll:true});return;}
    $('input-hire-date').value=value;onHireDateChange();
   }else if(step===1){if(!selected)return;setGroup(selected);}
   else {if(ready())finish();else PayrollEstimate.open({onboarding:true});return;}
   if(!manual&&!remember({status:'in_progress',step:step+1}))return;
   await changeStep(step+1);
  }catch{$('onboarding-error').textContent='설정을 저장하지 못했어요. 다시 시도해 주세요.';}
  finally{saving=false;}
 }
 $('onboarding-next').addEventListener('click',next);
 $('onboarding-date').addEventListener('input',()=>{$('onboarding-error').textContent='';});
 $('onboarding-back').addEventListener('click',()=>{if(step>0&&!navigating){if(!manual&&!remember({status:'in_progress',step:step-1}))return;changeStep(step-1);}});
 $('onboarding-exit').addEventListener('click',()=>{active=false;delete document.body.dataset.onboarding;dialog.close();$('onboarding-reopen').focus()});
 dialog.addEventListener('cancel',event=>{if(!manual){event.preventDefault();$('onboarding-error').textContent='남은 설정을 마치면 내 캘린더를 볼 수 있어요.';}});
 dialog.addEventListener('close',()=>{if(!dialog.open){OnboardingFlowMotion.cancel(main);active=false;delete document.body.dataset.onboarding;}});
 for(const button of dialog.querySelectorAll('[data-onboarding-group]'))button.addEventListener('click',()=>{
  selected=button.dataset.onboardingGroup;
  for(const option of dialog.querySelectorAll('[data-onboarding-group]'))option.setAttribute('aria-pressed',String(option===button));
  $('onboarding-next').disabled=navigating;
 });
 $('onboarding-import-again').addEventListener('click',()=>PayrollEstimate.open({onboarding:true}));
 $('onboarding-login').addEventListener('click',()=>$('account-sheet-open').click());
 $('onboarding-reopen').addEventListener('click',()=>open(true));
 $('payroll-sms-dialog').addEventListener('close',()=>{if(active)requestAnimationFrame(()=>{if(active){paint();if(step===2&&(config.baseHourly>0||config.ordinaryHourly>0)&&!(config.baseHourly>0&&config.ordinaryHourly>0))$('onboarding-error').textContent='기본시급과 통상시급을 모두 설정해 주세요.';$('onboarding-next').focus()}})});
 window.addEventListener('shift-payroll-applied',()=>{if(active&&step===2){if(!finish()){$('onboarding-error').textContent='기본시급과 통상시급을 모두 설정해 주세요.';}}});
 window.ShiftOnboarding={open:()=>open(true),needsSetup:()=>state.status==='in_progress',refresh(){if(active&&!saving&&!navigating&&!manual&&!$('payroll-sms-dialog').open&&ready())finish();}};
 function start(){
  if(window.CommutePage?.isDirectEntry){
   document.documentElement.removeAttribute('data-onboarding-pending');
   return;
  }
  if(waitingForAccount)return;
  if(state.status==='in_progress'){
   loadConfig();
   if(ready()&&remember({status:'complete',step:2}))document.documentElement.removeAttribute('data-onboarding-pending');
   else open();
  }else document.documentElement.removeAttribute('data-onboarding-pending');
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
