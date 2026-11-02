/* The first wage entry asks one question at a time, sharing the existing draft and save path. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),dialog=$('payroll-sms-dialog'),content=dialog.querySelector('.guided-wage-content'),apply=$('payroll-sms-apply');
 const top=dialog.querySelector('.guided-wage-top'),back=$('guided-wage-back'),summary=$('guided-wage-summary'),choice=$('guided-wage-choice'),optional=$('guided-wage-import');
 const cards=dialog.querySelector('.wage-main-cards'),baseLabel=dialog.querySelector('label[for="wage-manual-base"]'),ordinaryLabel=dialog.querySelector('label[for="wage-manual-ordinary"]');
 const heading=dialog.querySelector('.wage-allowance-heading'),allowances=dialog.querySelector('.wage-mini-cards');
 const importNodes=[$('wage-tax-settings')];
 const amount=id=>Number($(id).value.replace(/,/g,'')),money=value=>value.toLocaleString('ko-KR')+'원';
 let enabled=false,stage='base',returnStage='base',busy=false,revision=0;
 const only=(element,visible)=>element.classList.toggle('guided-offstage',!visible);
 function focus(){if(enabled){$('payroll-sms-title').tabIndex=-1;$('payroll-sms-title').focus({preventScroll:true});}}
 function paint(){
  dialog.dataset.wageStep=stage;
  dialog.style.setProperty('--guided-wage-height',((stage==='choice'||stage==='import')?640:stage==='allowances'&&['seniority','duty'].includes(OnboardingAllowances.current()[0])?560:460)+'px');
  const importing=stage==='import',editing=stage==='allowances';
  const titles={base:'기본시급을 알려주세요',ordinary:'통상시급은 얼마인가요?',choice:'받고 있는 수당이 있나요?',allowances:'선택한 수당은 얼마인가요?',import:'개인 공제 기준 설정'};
  const descriptions={base:'급여명세서에 적힌 기본시급을 입력해 주세요.',ordinary:'기본시급과 별도로 적힌 통상시급을 확인해 주세요.',choice:'받는 수당을 모두 선택해 주세요. 여러 개 선택할 수 있어요.',allowances:'선택한 수당의 월 금액을 입력해 주세요.',import:'선택 사항이에요. 등록하지 않아도 기본 공제 기준으로 추정해요.'};
  $('payroll-sms-title').textContent=editing?OnboardingAllowances.current()[1]+'은 얼마인가요?':titles[stage];
  $('wage-import-intro').textContent=editing?['seniority','duty'].includes(OnboardingAllowances.current()[0])?'7만원을 선택하거나 다른 금액을 직접 입력해 주세요.':'매월 받는 수당 금액을 입력해 주세요.':descriptions[stage];
  $('guided-wage-progress').textContent=editing?'고정수당 '+(OnboardingAllowances.index()+1)+' / '+OnboardingAllowances.count():importing?'세금 추정 · 선택':stage==='base'?'시급 설정 1 / 3':stage==='ordinary'?'시급 설정 2 / 3':'시급 설정 3 / 3';
  back.hidden=stage==='base';
  const base=amount('wage-manual-base'),ordinary=amount('wage-manual-ordinary');
  summary.textContent=[stage!=='base'&&base>0?'기본시급 '+money(base):'',(stage==='choice'||editing||importing)&&ordinary>0?'통상시급 '+money(ordinary):''].filter(Boolean).join(' · ');
  summary.hidden=editing||stage==='choice'||!summary.textContent;
  only(cards,stage==='base'||stage==='ordinary');only(baseLabel,stage==='base');only(ordinaryLabel,stage==='ordinary');
  choice.hidden=stage!=='choice';only(heading,false);only(allowances,false);only($('wage-legacy-row'),false);
  if(editing)OnboardingAllowances.show();else OnboardingAllowances.hide();
  $('wage-legacy-row').hidden=false;
  for(const node of importNodes)only(node,importing);
  optional.hidden=importing;
  $('wage-tax-import').open=importing;
  if(stage==='choice')OnboardingAllowances.renderChoice();
  apply.textContent=stage==='choice'&&OnboardingAllowances.count()>0?'선택한 수당 금액 입력':importing?'시급 입력 계속하기':stage==='base'||stage==='ordinary'||editing&&!OnboardingAllowances.isLast()?'다음':'설정 완료하기';
  apply.disabled=busy||!ready();
  $('wage-manual-status').textContent='';content.scrollTop=0;
 }
 function ready(){return stage==='choice'?OnboardingAllowances.ready():stage==='allowances'?OnboardingAllowances.readyCurrent():true;}
 async function go(next,direction=1,updateState=()=>{}){
  if(busy||!enabled)return;
  const token=revision;
  dialog.dispatchEvent(new Event('wage-draft-navigation'));
  dialog.dataset.wageMoving='true';
  busy=true;apply.disabled=back.disabled=true;
  const transition=(['base','ordinary'].includes(stage)&&['base','ordinary'].includes(next))||(stage==='allowances'&&next==='allowances')?'swap':'replace';
  let motion;const update=()=>{motion=OnboardingFlowMotion[transition](content,()=>{
   updateState();stage=next;paint();
   if(next==='base'||next==='ordinary')$(next==='base'?'wage-manual-base':'wage-manual-ordinary').focus({preventScroll:true});else focus();
  },direction);};
  if(window.AppSheets?.resize)AppSheets.resize(dialog,update);else update();
  await motion;
  if(token!==revision)return;
  busy=false;back.disabled=false;delete dialog.dataset.wageMoving;
  if(enabled&&dialog.open)apply.disabled=!ready();
 }
 function prepare(options){
  revision++;delete dialog.dataset.wageMoving;
  OnboardingFlowMotion.cancel(content);enabled=options?.onboarding===true;busy=false;back.disabled=false;dialog.dataset.guided=String(enabled);
  dialog.querySelectorAll('.guided-offstage').forEach(node=>node.classList.remove('guided-offstage'));
  content.scrollTop=0;
  top.hidden=optional.hidden=!enabled;summary.hidden=choice.hidden=true;OnboardingAllowances.hide();
  only($('wage-import-info'),!enabled);
  if(!enabled){
   delete dialog.dataset.wageStep;
   $('payroll-sms-title').textContent='시급 설정';$('wage-import-intro').textContent='기본시급·통상시급과 받는 수당을 직접 입력해 주세요.';apply.textContent='설정 완료하기';
   $('wage-legacy-row').firstChild.textContent='기존 고정수당 ';return;
  }
  OnboardingAllowances.refresh();
  returnStage='base';stage=options?.importFirst?'import':'base';
  $('wage-legacy-row').firstChild.textContent='기타 고정수당 ';paint();
 }
 apply.addEventListener('click',event=>{
  if(!enabled)return;
  const stop=()=>{event.preventDefault();event.stopImmediatePropagation();};
  if(busy){stop();return;}
  if(stage==='base'||stage==='ordinary'){
   stop();if(PayrollEstimate.validateHourly(stage)===null)return;
   go(stage==='base'?'ordinary':'choice');return;
  }
  if(stage==='import'){
   stop();
   go(returnStage,-1);return;
  }
  if(stage==='choice'){
   if(!OnboardingAllowances.ready()){stop();return;}
   if(OnboardingAllowances.count()){stop();go('allowances',1,()=>OnboardingAllowances.start());return;}
   OnboardingAllowances.validate();
  }
  if(stage==='allowances'){
   if(!OnboardingAllowances.validateCurrent()){stop();return;}
   if(!OnboardingAllowances.isLast()){stop();go('allowances',1,()=>OnboardingAllowances.move(1));return;}
   if(!OnboardingAllowances.validate()){stop();return;}
  }
  // The original save handler validates and commits all amounts exactly once.
 },true);
 choice.addEventListener('click',event=>{
  const button=event.target.closest('[data-guided-allowance]');if(!button||busy)return;
  OnboardingAllowances.choose(button.dataset.guidedAllowance);
  apply.textContent=OnboardingAllowances.count()?'선택한 수당 금액 입력':'설정 완료하기';
  apply.disabled=!OnboardingAllowances.ready();
  $('wage-manual-status').textContent='';
 });
 $('guided-allowance-change').addEventListener('click',()=>go('choice',-1));
 optional.addEventListener('click',()=>{returnStage=stage;go('import');});
 back.addEventListener('click',()=>{
  if(stage==='allowances'&&OnboardingAllowances.index()>0){go('allowances',-1,()=>OnboardingAllowances.move(-1));return;}
  go(stage==='import'?returnStage:stage==='allowances'?'choice':stage==='choice'?'ordinary':'base',-1);
 });

 function keepInputVisible(){
  const input=document.activeElement;
  if(!dialog.open||!content.contains(input)||!input.matches('input,textarea,select'))return;
  const viewport=content.getBoundingClientRect(),label=input.closest('label')?.getBoundingClientRect();
  const field=label&&label.height<viewport.height-16?label:input.getBoundingClientRect();
  if(field.bottom>viewport.bottom-8)content.scrollTop+=field.bottom-viewport.bottom+8;
  else if(field.top<viewport.top+8)content.scrollTop-=viewport.top-field.top+8;
 }
 const observer=new ResizeObserver(()=>requestAnimationFrame(keepInputVisible));observer.observe(content);
 dialog.addEventListener('focusin',()=>requestAnimationFrame(keepInputVisible));
 dialog.addEventListener('close',()=>{if(!dialog.open){revision++;enabled=false;busy=false;delete dialog.dataset.wageMoving;OnboardingFlowMotion.cancel(content);}});
 window.OnboardingWage={prepare,focus,allowanceChanged(){if(enabled&&stage==='allowances')apply.disabled=busy||!ready();}};
})();
