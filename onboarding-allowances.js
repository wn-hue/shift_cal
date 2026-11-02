/* Choose allowances together, then confirm each monthly amount in the same sheet. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),entry=$('guided-allowance-entry'),list=$('guided-allowance-list'),choice=$('guided-wage-choice');
 const categories=[['seniority','근속수당'],['duty','직책수당'],['qualification','자격수당'],['family','가족수당'],['job','직무수당'],['legacy','기타 고정수당']];
 let selected=new Set(),values={},customValues={},modes={},decided=false,index=0;
 const number=value=>Number(String(value).replace(/,/g,'')),hasPreset=key=>key==='seniority'||key==='duty';
 const ordered=()=>categories.filter(([key])=>selected.has(key)),current=()=>ordered()[index];
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
  index=0;syncDraft();renderChoice();
  choice.querySelector('[data-guided-allowance="'+key+'"]')?.focus({preventScroll:true});
 }
 function pick(mode){
  const [key]=current();modes[key]=mode;
  values[key]=mode==='preset'?'70000':customValues[key]||'';
  syncDraft();render();$('wage-manual-status').textContent='';window.OnboardingWage?.allowanceChanged();
  if(mode==='custom'){
   const input=$('guided-allowance-amount-'+key);input.focus({preventScroll:true});input.select();
   window.OnboardingFlowMotion?.field(input.closest('label'));
  }else list.querySelector('[data-allowance-option=preset]').focus({preventScroll:true});
 }
 function render(){
  list.replaceChildren();const item=current();if(!item)return;
  const [key,label]=item,preset=hasPreset(key);entry.dataset.allowance=key;
  if(preset){
   const options=document.createElement('div');options.className='guided-allowance-options';options.setAttribute('role','group');options.setAttribute('aria-label',label+' 금액 선택');
   for(const [mode,title,hint]of [['preset',label+' 7만원','매월 70,000원'],['custom','기타 금액','직접 입력']]){
    const button=document.createElement('button');button.type='button';button.dataset.allowanceOption=mode;button.setAttribute('aria-pressed',String(modes[key]===mode));
    const name=document.createElement('strong');name.textContent=title;
    const description=document.createElement('small');description.textContent=hint;
    const check=document.createElement('i');check.textContent='✓';check.setAttribute('aria-hidden','true');button.append(name,description,check);button.onclick=()=>pick(mode);options.append(button);
   }
   list.append(options);
  }
  if(!preset||modes[key]==='custom'){
   const card=document.createElement('label');card.className='guided-allowance-card';card.htmlFor='guided-allowance-amount-'+key;
   const name=document.createElement('span');name.className='guided-allowance-name';name.textContent=label;
   const hint=document.createElement('small');hint.textContent='매월 받는 금액';name.append(hint);
   const amount=document.createElement('span');amount.className='wage-value';
   const input=document.createElement('input');input.id=card.htmlFor;input.type='text';input.inputMode='numeric';input.autocomplete='off';input.maxLength=13;input.placeholder='금액 입력';input.value=number(values[key])===0?'':values[key]||'';input.setAttribute('aria-label',label+' 금액');input.setAttribute('aria-describedby','wage-manual-status');
   input.onfocus=()=>{if(number(input.value)===0)input.value='';};
   input.oninput=()=>{
    if(/^\d+$/.test(input.value))input.value=input.value.replace(/^0+(?=\d)/,'');
    values[key]=customValues[key]=input.value;input.removeAttribute('aria-invalid');$('wage-manual-status').textContent='';syncDraft();
   };
   const unit=document.createElement('small');unit.textContent='원';amount.append(input,unit);card.append(name,amount);list.append(card);
  }
 }
 function refresh(){
  values=Object.fromEntries(categories.map(([key])=>[key,$('wage-'+key).value]));
  modes=Object.fromEntries(categories.map(([key])=>[key,hasPreset(key)?number(values[key])===70000?'preset':number(values[key])>0?'custom':'':'custom']));
  customValues=Object.fromEntries(categories.map(([key])=>[key,modes[key]==='custom'&&number(values[key])!==0?values[key]:'']));
  selected=new Set(categories.filter(([key])=>number(values[key])>0).map(([key])=>key));decided=selected.size>0;index=0;renderChoice();
 }
 function readyCurrent(){const item=current();return !!item&&(!hasPreset(item[0])||!!modes[item[0]]);}
 function validateCurrent(){
  if(!readyCurrent()){$('wage-manual-status').textContent='수당 금액을 선택해 주세요.';return false;}
  const [key,label]=current(),input=$('guided-allowance-amount-'+key);
  if(input&&PayrollEstimate.validateAllowance(input,label)===null)return false;
  syncDraft();return true;
 }
 function validate(){
  let fixedTotal=0;
  for(const [key,label]of categories){
   if(!selected.has(key))continue;
   const amount=PayrollEstimate.validateAllowance($('wage-'+key),label);if(amount===null)return false;
   if(key!=='seniority')fixedTotal+=amount;
  }
  if(fixedTotal>1000000000){$('wage-manual-status').textContent='고정수당 합계는 10억 원 이하여야 합니다.';return false;}
  syncDraft();return true;
 }
 window.OnboardingAllowances={refresh,choose,validate,validateCurrent,readyCurrent,current,index:()=>index,start(){index=0;},move(delta){index=Math.max(0,Math.min(ordered().length-1,index+delta));},isLast:()=>index===selected.size-1,count:()=>selected.size,ready:()=>decided,renderChoice,hide(){entry.hidden=true;},show(){render();entry.hidden=false;}};
})();
