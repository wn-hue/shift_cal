/* Choose every applicable allowance, then edit only those cards. The shared draft saves once. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),entry=$('guided-allowance-entry'),list=$('guided-allowance-list'),choice=$('guided-wage-choice');
 const categories=[['seniority','근속수당'],['duty','직책수당'],['qualification','자격수당'],['family','가족수당'],['job','직무수당'],['legacy','기타 고정수당']];
 let selected=new Set(),values={},decided=false;
 const number=value=>Number(String(value).replace(/,/g,''));
 function syncDraft(){
  for(const [key]of categories){
   const input=$('wage-'+key),value=selected.has(key)?values[key]:'0';
   // Explicitly choosing no seniority allowance also disables its automatic amount.
   if(input.value!==value||(key==='seniority'&&!selected.has(key))){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}
  }
 }
 function renderChoice(){
  choice.replaceChildren();
  for(const [key,label]of [...categories,['none','없어요']]){
   const button=document.createElement('button');button.type='button';button.dataset.guidedAllowance=key;
   button.setAttribute('aria-pressed',String(key==='none'?decided&&!selected.size:selected.has(key)));
   const name=document.createElement('strong');name.textContent=label;
   const hint=document.createElement('span');hint.textContent=key==='none'?'추가할 수당 없이 완료해요':number(values[key])>0?number(values[key]).toLocaleString('ko-KR')+'원':'매월 받는 수당';
   const check=document.createElement('i');check.setAttribute('aria-hidden','true');check.textContent='✓';button.append(name,hint,check);choice.append(button);
  }
 }
 function choose(key){
  if(key==='none'){selected.clear();decided=true;}
  else if(categories.some(([k])=>k===key)){selected.has(key)?selected.delete(key):selected.add(key);decided=selected.size>0;}
  syncDraft();renderChoice();
  // Keep focus on the same card for keyboard and assistive-technology users.
  choice.querySelector('[data-guided-allowance="'+key+'"]')?.focus({preventScroll:true});
 }
 function render(){
  list.replaceChildren();
  for(const [key,label]of categories.filter(([key])=>selected.has(key))){
   const card=document.createElement('label');card.className='guided-allowance-card';card.htmlFor='guided-allowance-amount-'+key;
   const name=document.createElement('span');name.className='guided-allowance-name';name.textContent=label;
   const hint=document.createElement('small');hint.textContent=key==='seniority'&&$('wage-seniority-reset').hidden?'입사일 기준 · 직접 수정 가능':'매월 받는 금액';name.append(hint);
   const amount=document.createElement('span');amount.className='wage-value';
   const input=document.createElement('input');input.id=card.htmlFor;input.type='text';input.inputMode='numeric';input.autocomplete='off';input.maxLength=13;input.placeholder='0';input.value=values[key]||'';input.setAttribute('aria-label',label+' 금액');input.setAttribute('aria-describedby','wage-manual-status');
   input.oninput=()=>{values[key]=input.value;input.removeAttribute('aria-invalid');$('wage-manual-status').textContent='';const target=$('wage-'+key);target.value=input.value;target.dispatchEvent(new Event('input',{bubbles:true}));if(key==='seniority')hint.textContent='매월 받는 금액';};
   const unit=document.createElement('small');unit.textContent='원';amount.append(input,unit);card.append(name,amount);list.append(card);
  }
 }
 function refresh(){
  values=Object.fromEntries(categories.map(([key])=>[key,$('wage-'+key).value]));
  selected=new Set(categories.filter(([key])=>number(values[key])>0).map(([key])=>key));decided=selected.size>0;renderChoice();
 }
 function validate(){
  let fixedTotal=0;
  for(const [key,label]of categories){
   if(!selected.has(key))continue;
   const input=$('guided-allowance-amount-'+key),amount=PayrollEstimate.validateAllowance(input,label);if(amount===null)return false;
   if(key!=='seniority')fixedTotal+=amount;
  }
  if(fixedTotal>1000000000){$('wage-manual-status').textContent='고정수당 합계는 10억 원 이하여야 합니다.';return false;}
  syncDraft();
  return true;
 }
 window.OnboardingAllowances={refresh,choose,validate,count:()=>selected.size,ready:()=>decided,renderChoice,hide(){entry.hidden=true;},show(){render();entry.hidden=false;}};
})();
