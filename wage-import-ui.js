/* Clipboard access remains user-initiated; stale results never replace a newer draft. */
(()=>{'use strict';const dialog=document.getElementById('payroll-sms-dialog'),status=document.getElementById('payroll-sms-status'),help=document.getElementById('wage-import-help'),info=document.getElementById('wage-import-info');let revision=0;
function busy(button,value){button.disabled=value;button.setAttribute('aria-busy',String(value));if(value){if(!button.querySelector('.wage-progress-dots')){const dots=document.createElement('span');dots.className='wage-progress-dots';dots.setAttribute('aria-hidden','true');dots.innerHTML='<i></i><i></i><i></i>';button.append(dots);}}else button.querySelector('.wage-progress-dots')?.remove();}
const invalidate=()=>{++revision;for(const button of dialog.querySelectorAll('[data-wage-paste]'))busy(button,false);};dialog.addEventListener('close',()=>{if(!dialog.open)invalidate();});dialog.addEventListener('wage-draft-reset',invalidate);dialog.addEventListener('wage-draft-navigation',invalidate);dialog.addEventListener('input',invalidate);dialog.addEventListener('paste',invalidate);
for(const button of dialog.querySelectorAll('[data-wage-paste]'))button.addEventListener('click',async()=>{const token=++revision;busy(button,true);try{if(!navigator.clipboard?.readText)throw Error();const value=await navigator.clipboard.readText();if(token!==revision||!dialog.open||dialog.dataset.sheetClosing==='true')return;if(!value.trim()){status.textContent='복사한 문자가 없어요. 급여 문자를 먼저 복사해 주세요.';return;}PayrollEstimate.importText(button.dataset.wagePaste==='payroll-bonus-sms-text'?'bonus':'salary',value);}catch{if(token!==revision||!dialog.open||dialog.dataset.sheetClosing==='true')return;status.textContent='아래 입력칸을 길게 눌러 붙여넣어 주세요.';const target=document.getElementById(button.dataset.wagePaste);if(target.id==='payroll-sms-text')document.getElementById('wage-paste-fallback').open=true;target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});}finally{if(token===revision)busy(button,false);}});
info.addEventListener('click',()=>{document.getElementById('wage-tax-import').open=true;help.open=!help.open;if(help.open)help.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});});help.addEventListener('toggle',()=>info.setAttribute('aria-expanded',String(help.open)));
})();

/* The regular wage form uses the same two-card amount choice as first setup.
   Choices update only the existing draft; the parent retains its one save path. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),parent=$('payroll-sms-dialog'),picker=$('wage-amount-dialog');
 const field=$('wage-amount-field'),amount=$('wage-amount-input'),done=$('wage-amount-done'),status=$('wage-amount-status');
 const preset=$('wage-amount-preset'),custom=$('wage-amount-custom');
 const categories=[['seniority','근속수당'],['duty','직책수당'],['qualification','자격수당'],['family','가족수당'],['job','직무수당'],['legacy','기타 고정수당']];
 let target=null,source=null,label='',presetAmount=70000;
 const switches=new Map();
 const refresh=()=>{if(parent.dataset.guided==='true')return;for(const [key]of categories){const input=$('wage-'+key),toggle=switches.get(key);if(toggle)toggle.checked=value(input)>0;}};
 const value=input=>Number(input.value.replace(/,/g,''))||0;
 function open(input,key,name,card){
  if(!parent.open||parent.dataset.guided==='true'||picker.open)return;
  target=input;source=card;label=name;presetAmount=70000;
  const current=value(input);
  $('wage-amount-title').textContent=name+'은 얼마인가요?';
  $('wage-amount-description').textContent='7만원을 선택하거나 다른 금액을 직접 입력해 주세요.';
  $('wage-amount-preset-label').textContent='7만원';
  $('wage-amount-preset-hint').textContent='매월 70,000원';
  preset.setAttribute('aria-pressed',String(current===presetAmount));custom.setAttribute('aria-pressed',String(current>0&&current!==presetAmount));
  amount.value=current===0?'':input.value;amount.setAttribute('aria-label',name+' 금액');amount.removeAttribute('aria-invalid');
  field.hidden=done.hidden=true;status.textContent='';picker.showModal();
 }
 function setDraft(n){
  if(!target||!parent.open)return;
  target.value=n.toLocaleString('ko-KR');target.dispatchEvent(new Event('input',{bubbles:true}));
  picker.close();
 }
 preset.addEventListener('click',()=>setDraft(presetAmount));
 custom.addEventListener('click',()=>{
  const reveal=()=>{preset.setAttribute('aria-pressed','false');custom.setAttribute('aria-pressed','true');field.hidden=done.hidden=false;};
  if(window.AppSheets?.resize)AppSheets.resize(picker,reveal);else reveal();
  amount.focus({preventScroll:true});amount.select();field.scrollIntoView({block:'nearest'});
 });
 function apply(){const n=PayrollEstimate.validateAllowance(amount,label);if(n===null){status.textContent=$('wage-manual-status').textContent;return;}status.textContent='';setDraft(n);}
 done.addEventListener('click',apply);
 amount.addEventListener('input',()=>{if(/^\d+$/.test(amount.value))amount.value=amount.value.replace(/^0+(?=\d)/,'');amount.removeAttribute('aria-invalid');status.textContent='';});
 amount.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply();}});
 $('wage-amount-close').addEventListener('click',()=>{refresh();picker.close();});
 picker.addEventListener('close',()=>{if(picker.open)return;amount.value='';status.textContent='';refresh();if(parent.open&&source?.isConnected){source.tabIndex=-1;source.focus({preventScroll:true});}target=source=null;});
 parent.addEventListener('wage-draft-reset',()=>{target=source=null;if(picker.open)picker.close();});
 $('wage-seniority-reset').addEventListener('click',refresh);
 const content=picker.querySelector('.wage-amount-content');
 new ResizeObserver(()=>requestAnimationFrame(()=>{
  if(!picker.open||document.activeElement!==amount)return;
  const frame=content.getBoundingClientRect(),box=amount.getBoundingClientRect();
  if(box.bottom>frame.bottom-8)content.scrollTop+=box.bottom-frame.bottom+8;
  else if(box.top<frame.top+8)content.scrollTop-=frame.top-box.top+8;
 })).observe(content);
 for(const [key,name]of categories){
  const input=$('wage-'+key),card=input.closest('label,.wage-mini-card');
  input.setAttribute('aria-haspopup','dialog');input.setAttribute('aria-controls',picker.id);input.setAttribute('aria-label',name+' 금액');
  card.classList.add('wage-allowance-toggle-row');card.dataset.allowance=key;
  const toggleWrap=document.createElement('span');toggleWrap.className='wage-allowance-switch';
  const toggle=document.createElement('input');toggle.type='checkbox';toggle.id='wage-toggle-'+key;toggle.setAttribute('role','switch');toggle.setAttribute('aria-label',name);toggleWrap.append(toggle);card.append(toggleWrap);switches.set(key,toggle);
  toggle.addEventListener('change',()=>{if(toggle.checked)open(input,key,name,card);else{input.value='0';input.dispatchEvent(new Event('input',{bubbles:true}));refresh();}});
  input.addEventListener('input',refresh);
  const enabled=event=>parent.dataset.guided!=='true'&&!event.target.closest('button,a,select,.wage-allowance-switch');
  // Keep keyboard entry and the existing input/validation contract intact, while
  // touch and mouse open the chooser without briefly presenting the keyboard.
  card.addEventListener('pointerdown',event=>{if(enabled(event)&&event.button===0)event.preventDefault();});
  card.addEventListener('click',event=>{if(!enabled(event))return;event.preventDefault();open(input,key,name,card);});
  input.addEventListener('keydown',event=>{if(enabled(event)&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open(input,key,name,card);}});
 }
 function normalRows(){
  if(!parent.open||parent.dataset.guided==='true')return;
  for(const [key,name]of categories){const card=$('wage-'+key).closest('label,.wage-mini-card'),labelNode=key==='legacy'?card:card.firstElementChild;labelNode.firstChild.textContent=key==='legacy'?'기타 ':name.replace(/수당$/,'');}
  refresh();
 }
 new MutationObserver(normalRows).observe(parent,{attributes:true,attributeFilter:['open','data-guided']});
 window.AppSheets?.attach(picker);
})();
