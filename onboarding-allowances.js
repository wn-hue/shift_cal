/* The guided flow edits only chosen fixed allowances; the shared wage draft owns saving. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),entry=$('guided-allowance-entry'),list=$('guided-allowance-list'),add=$('guided-allowance-add');
 const categories=[['duty','직책수당'],['qualification','자격수당'],['family','가족수당'],['job','직무수당'],['legacy','기타 고정수당']];
 let rows=[],nextId=0;
 const makeRow=(key='',value='')=>({id:++nextId,key,value});
 function sync(){
  const amounts=Object.fromEntries(categories.map(([key])=>[key,'0']));
  for(const row of rows)if(row.key)amounts[row.key]=row.value;
  for(const [key,value]of Object.entries(amounts)){
   const input=$('wage-'+key);if(input.value===value)continue;
   input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
  }
 }
 function options(){
  const used=new Set(rows.map(row=>row.key));
  for(const row of rows){const select=$('guided-allowance-kind-'+row.id);for(const option of select.options)option.disabled=!option.value||(option.value!==row.key&&used.has(option.value));}
  add.disabled=rows.length>=categories.length;
 }
 function render(){
  list.replaceChildren();
  for(const row of rows){
   const item=document.createElement('div');item.className='guided-allowance-row';
   const field=document.createElement('div');field.className='guided-allowance-field';
   const select=document.createElement('select');select.id='guided-allowance-kind-'+row.id;select.setAttribute('aria-label','고정수당 종류');
   const empty=new Option('수당 선택','');empty.disabled=true;select.append(empty,...categories.map(([key,label])=>new Option(key==='legacy'?'기타수당':label,key)));select.value=row.key;
   const kind=document.createElement('label');kind.className='guided-allowance-kind';kind.append(select);
   const amount=document.createElement('label');amount.className='wage-value';
   const input=document.createElement('input');input.id='guided-allowance-amount-'+row.id;input.type='text';input.inputMode='numeric';input.autocomplete='off';input.maxLength=13;input.placeholder='금액 입력';input.value=row.value;input.setAttribute('aria-label',(categories.find(([key])=>key===row.key)?.[1]||'고정수당')+' 금액');input.setAttribute('aria-describedby','wage-manual-status');
   const unit=document.createElement('small');unit.textContent='원';amount.append(input,unit);field.append(kind,amount);item.append(field);
   if(rows.length>1){const remove=document.createElement('button');remove.type='button';remove.className='guided-allowance-remove';remove.setAttribute('aria-label',(categories.find(([key])=>key===row.key)?.[1]||'수당')+' 삭제');remove.textContent='×';remove.onclick=()=>{const index=rows.indexOf(row);rows.splice(index,1);sync();render();$('guided-allowance-kind-'+rows[Math.min(index,rows.length-1)].id).focus({preventScroll:true});};item.append(remove);}
   select.onchange=()=>{const key=select.value;if(!categories.some(([value])=>value===key)){select.value=row.key;return;}if(rows.some(other=>other!==row&&other.key===key)){select.value=row.key;return;}row.key=key;input.setAttribute('aria-label',categories.find(([k])=>k===key)[1]+' 금액');item.querySelector('.guided-allowance-remove')?.setAttribute('aria-label',categories.find(([k])=>k===key)[1]+' 삭제');select.removeAttribute('aria-invalid');options();sync();$('wage-manual-status').textContent='';input.focus({preventScroll:true});};
   input.oninput=()=>{row.value=input.value;input.removeAttribute('aria-invalid');$('wage-manual-status').textContent='';sync();};
   list.append(item);
  }
  options();
  const seniority=$('wage-seniority').value;
  const note=$('guided-allowance-seniority');note.hidden=!(Number(seniority.replace(/,/g,''))>0);note.textContent='근속수당 '+seniority+'원은 입사일에 따라 자동 반영돼요.';
 }
 function refresh(){
  rows=categories.filter(([key])=>Number($('wage-'+key).value.replace(/,/g,''))>0).map(([key])=>makeRow(key,$('wage-'+key).value));
  if(!rows.length)rows=[makeRow()];render();
 }
 function validate(){
  const used=new Set();let total=0;
  for(const row of rows){
   const select=$('guided-allowance-kind-'+row.id),input=$('guided-allowance-amount-'+row.id);
   if(!row.key||used.has(row.key)){$('wage-manual-status').textContent=row.key?'이미 선택한 수당이에요. 다른 종류를 선택해 주세요.':'수당 종류를 선택해 주세요.';select.setAttribute('aria-invalid','true');select.focus({preventScroll:true});return false;}
   used.add(row.key);
   const amount=PayrollEstimate.validateAllowance(input,categories.find(([key])=>key===row.key)[1]);if(amount===null)return false;total+=amount;
  }
  if(total>1000000000){$('wage-manual-status').textContent='고정수당 합계는 10억 원 이하여야 합니다.';return false;}
  sync();return true;
 }
 add.onclick=()=>{
  if(rows.length>=categories.length)return;
  if(!validate())return;
  const row=makeRow();rows.push(row);render();$('guided-allowance-kind-'+row.id).focus({preventScroll:true});
 };
 window.OnboardingAllowances={refresh,validate,hide(){entry.hidden=true;},show(){entry.hidden=false;}};
})();
