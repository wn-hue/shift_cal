/* The first wage entry asks one question at a time, sharing the existing draft and save path. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),dialog=$('payroll-sms-dialog'),content=dialog.querySelector('.guided-wage-content'),apply=$('payroll-sms-apply');
 const keys=['qualification','job','family','duty','legacy'];
 const top=dialog.querySelector('.guided-wage-top'),back=$('guided-wage-back'),summary=$('guided-wage-summary'),choice=$('guided-wage-choice'),optional=$('guided-wage-import');
 const cards=dialog.querySelector('.wage-main-cards'),baseLabel=dialog.querySelector('label[for="wage-manual-base"]'),ordinaryLabel=dialog.querySelector('label[for="wage-manual-ordinary"]');
 const heading=dialog.querySelector('.wage-allowance-heading'),allowances=dialog.querySelector('.wage-mini-cards');
 const importNodes=['wage-fill','wage-paste-fallback','payroll-sms-recognized','payroll-sms-status','wage-conversion','wage-bonus-input','wage-import-review','wage-import-help'].map($);
 const amount=id=>Number($(id).value.replace(/,/g,'')),money=value=>value.toLocaleString('ko-KR')+'원';
 let enabled=false,stage='base',returnStage='base',hasAllowance=null,busy=false,revision=0;
 const only=(element,visible)=>element.classList.toggle('guided-offstage',!visible);
 function focus(){if(enabled){$('payroll-sms-title').tabIndex=-1;$('payroll-sms-title').focus({preventScroll:true});}}
 function paint(){
  dialog.dataset.wageStep=stage;
  const importing=stage==='import',editing=stage==='allowances';
  const titles={base:'기본시급을 알려주세요',ordinary:'통상시급은 얼마인가요?',choice:'추가수당이 있나요?',allowances:'추가수당을 입력해 주세요',import:'급여 문자로 채우기'};
  const descriptions={base:'급여명세서에 적힌 기본시급을 입력해 주세요.',ordinary:'기본시급과 별도로 적힌 통상시급을 확인해 주세요.',choice:'매월 정해진 금액으로 받는 고정수당이 있나요?',allowances:'받는 수당의 월 금액만 입력하세요. 없으면 0원이에요.',import:'시급·수당과 세금 추정 기준을 가져올 수 있어요. 선택 사항이에요.'};
  $('payroll-sms-title').textContent=titles[stage];$('wage-import-intro').textContent=descriptions[stage];
  $('guided-wage-progress').textContent=importing?'문자 가져오기 · 선택':stage==='base'?'시급 설정 1 / 3':stage==='ordinary'?'시급 설정 2 / 3':'시급 설정 3 / 3';
  back.hidden=stage==='base';
  const base=amount('wage-manual-base'),ordinary=amount('wage-manual-ordinary');
  summary.textContent=[stage!=='base'&&base>0?'기본시급 '+money(base):'',(stage==='choice'||editing||importing)&&ordinary>0?'통상시급 '+money(ordinary):''].filter(Boolean).join(' · ');
  summary.hidden=!summary.textContent;
  only(cards,stage==='base'||stage==='ordinary');only(baseLabel,stage==='base');only(ordinaryLabel,stage==='ordinary');
  choice.hidden=stage!=='choice';only(heading,editing);only(allowances,editing);only($('wage-legacy-row'),editing);
  $('wage-legacy-row').hidden=false;
  for(const node of importNodes)only(node,importing);
  optional.hidden=importing;
  for(const button of choice.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.guidedAllowance===hasAllowance));
  apply.textContent=importing?'확인하고 계속하기':stage==='base'||stage==='ordinary'||(stage==='choice'&&hasAllowance==='yes')?'다음':'설정 완료하기';
  apply.disabled=busy||(stage==='choice'&&hasAllowance===null);
  $('wage-manual-status').textContent='';content.scrollTop=0;
 }
 async function go(next,direction=1){
  if(busy||!enabled)return;
  const token=revision;
  dialog.dispatchEvent(new Event('wage-draft-navigation'));
  dialog.dataset.wageMoving='true';
  busy=true;apply.disabled=back.disabled=true;
  await OnboardingFlowMotion.swap(content,()=>{
   stage=next;paint();
   if(next==='base'||next==='ordinary')$(next==='base'?'wage-manual-base':'wage-manual-ordinary').focus({preventScroll:true});else focus();
  },direction);
  if(token!==revision)return;
  busy=false;back.disabled=false;delete dialog.dataset.wageMoving;
  if(enabled&&dialog.open)apply.disabled=stage==='choice'&&hasAllowance===null;
 }
 function prepare(options){
  revision++;delete dialog.dataset.wageMoving;
  OnboardingFlowMotion.cancel(content);enabled=options?.onboarding===true;busy=false;back.disabled=false;dialog.dataset.guided=String(enabled);
  dialog.querySelectorAll('.guided-offstage').forEach(node=>node.classList.remove('guided-offstage'));
  top.hidden=optional.hidden=!enabled;summary.hidden=choice.hidden=true;
  only($('wage-import-info'),!enabled);
  if(!enabled){
   delete dialog.dataset.wageStep;
   $('payroll-sms-title').textContent='시급 설정';$('wage-import-intro').textContent='문자로 채우고, 숫자를 눌러 바로 수정하세요. 직접 입력해도 돼요.';apply.textContent='설정 완료하기';
   $('wage-legacy-row').firstChild.textContent='기존 고정수당 ';return;
  }
  hasAllowance=keys.some(key=>amount('wage-'+key)>0)?'yes':null;
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
   stop();if(!$('wage-conversion').hidden){$('wage-manual-status').textContent='환산 금액을 확인하거나, 이전 단계에서 기본시급을 직접 입력해 주세요.';return;}
   hasAllowance=keys.some(key=>amount('wage-'+key)>0)?'yes':null;
   go(returnStage,-1);return;
  }
  if(stage==='choice'){
   if(hasAllowance===null){stop();return;}
   if(hasAllowance==='yes'){stop();go('allowances');return;}
   for(const key of keys){$('wage-'+key).value='0';$('wage-'+key).dispatchEvent(new Event('input',{bubbles:true}));}
  }
  // The original save handler validates and commits all amounts exactly once.
 },true);
 choice.addEventListener('click',event=>{
  const button=event.target.closest('[data-guided-allowance]');if(!button||busy)return;
  hasAllowance=button.dataset.guidedAllowance;
  if(hasAllowance==='yes')go('allowances');else paint();
 });
 optional.addEventListener('click',()=>{returnStage=stage;go('import');});
 back.addEventListener('click',()=>go(stage==='import'?returnStage:stage==='allowances'?'choice':stage==='choice'?'ordinary':'base',-1));
 dialog.addEventListener('wage-draft-imported',()=>{if(enabled&&stage==='import'){const total=keys.reduce((sum,key)=>sum+amount('wage-'+key),0);summary.textContent=[amount('wage-manual-base')>0?'기본시급 '+money(amount('wage-manual-base')):'',amount('wage-manual-ordinary')>0?'통상시급 '+money(amount('wage-manual-ordinary')):'',total>0?'고정수당 '+money(total):''].filter(Boolean).join(' · ');summary.hidden=!summary.textContent;}});
 function keepInputVisible(){
  const input=document.activeElement;
  if(!enabled||!content.contains(input)||!input.matches('input,textarea'))return;
  const field=input.getBoundingClientRect(),viewport=content.getBoundingClientRect();
  if(field.bottom>viewport.bottom-8)content.scrollTop+=field.bottom-viewport.bottom+8;
  else if(field.top<viewport.top+8)content.scrollTop-=viewport.top-field.top+8;
 }
 const observer=new ResizeObserver(()=>requestAnimationFrame(keepInputVisible));observer.observe(content);
 dialog.addEventListener('focusin',()=>requestAnimationFrame(keepInputVisible));
 dialog.addEventListener('close',()=>{if(!dialog.open){revision++;enabled=false;busy=false;delete dialog.dataset.wageMoving;OnboardingFlowMotion.cancel(content);}});
 window.OnboardingWage={prepare,focus};
})();
