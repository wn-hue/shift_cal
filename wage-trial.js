(() => {
  'use strict';
  const dialog=document.getElementById('payroll-sms-dialog');
  const tabs=[1,2].map(n=>document.getElementById('wage-method-'+n));
  const panels=['wage-trial-sms','wage-trial-table'].map(id=>document.getElementById(id));
  const values=document.getElementById('wage-trial-values'),role=document.getElementById('wage-trial-role'),status=document.getElementById('wage-trial-status');
  function render(){
    let reference={};try{reference=JSON.parse(localStorage.getItem('shift_salary_config_master'))||{};}catch(_){}
    values.replaceChildren();
    for(const [label,key] of [['시급','baseHourly'],['통상시급','ordinaryHourly'],['직책수당','dutyPay']]){
      const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=label;
      const amount=key==='dutyPay'&&role.value==='none'?0:reference[key];
      dd.textContent=Number.isFinite(amount)&&amount>=0?amount.toLocaleString('ko-KR')+'원':'기준 미등록';
      row.append(dt,dd);values.append(row);
    }
  }
  function select(index){tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;panels[i].hidden=i!==index;});status.textContent='';if(index===1)render();}
  tabs.forEach((tab,i)=>{tab.addEventListener('click',()=>select(i));tab.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-i;select(next);tabs[next].focus();}});});
  role.addEventListener('change',()=>{status.textContent='';render();});
  document.getElementById('wage-trial-save').addEventListener('click',()=>{render();status.textContent='선택한 기준으로 미리보기 중입니다. 실제 시급과 계산값은 유지됩니다.';});
  dialog.addEventListener('close',()=>{select(0);role.value='none';values.replaceChildren();});
  window.addEventListener('shift-account-changed',()=>{role.value='none';status.textContent='';values.replaceChildren();if(!panels[1].hidden)render();});
})();
