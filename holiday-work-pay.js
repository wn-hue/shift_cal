/* The holiday amount belongs to the same editing transaction as that day's work. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),core=HolidayWorkPayCore,overlay=$('modal-override');
 let draft=null,choice='preset';
 const sheet=document.createElement('dialog');sheet.id='holiday-work-pay-dialog';sheet.className='sms-dialog';sheet.setAttribute('aria-labelledby','holiday-work-pay-title');
 sheet.innerHTML=`<button type="button" class="sms-close-btn" id="holiday-work-pay-close" aria-label="명절근무수당 닫기">×</button>
 <div class="holiday-pay-content"><h2 id="holiday-work-pay-title">명절근무수당을 선택해요</h2><p id="holiday-work-pay-description"></p>
 <div class="holiday-pay-options" role="group" aria-label="명절근무수당 금액">
 <button type="button" id="holiday-work-pay-preset" aria-pressed="true"><strong>5만원</strong><small>50,000원</small><i aria-hidden="true">✓</i></button>
 <button type="button" id="holiday-work-pay-custom" aria-pressed="false"><strong>기타 금액</strong><small>직접 입력</small><i aria-hidden="true">✓</i></button></div>
 <label id="holiday-work-pay-field" hidden>수당 금액<span><input id="holiday-work-pay-input" type="text" inputmode="numeric" autocomplete="off" maxlength="13" placeholder="금액 입력" aria-describedby="holiday-work-pay-error"><small>원</small></span></label>
 <p id="holiday-work-pay-error" role="alert"></p></div><button type="button" id="holiday-work-pay-done">선택 완료</button>`;
 document.body.append(sheet);window.AppSheets?.attach(sheet);
 const input=$('holiday-work-pay-input'),field=$('holiday-work-pay-field'),error=$('holiday-work-pay-error');
 const content=sheet.querySelector('.holiday-pay-content');
 new ResizeObserver(()=>requestAnimationFrame(()=>{
  if(!sheet.open||document.activeElement!==input)return;
  const frame=content.getBoundingClientRect(),box=input.getBoundingClientRect();
  if(box.bottom>frame.bottom-8)content.scrollTop+=box.bottom-frame.bottom+8;
  else if(box.top<frame.top+8)content.scrollTop-=frame.top-box.top+8;
 })).observe(content);
 const edit=document.createElement('button');edit.id='holiday-work-pay-edit';edit.type='button';edit.hidden=true;edit.setAttribute('aria-haspopup','dialog');edit.setAttribute('aria-controls',sheet.id);
 overlay.querySelector('.memo-inline-area').before(edit);
 function selected(){if(!selectedDateStr)return null;const p=ShiftTools.pending();return p?.date===selectedDateStr?ShiftTools.shiftAt(selectedDateStr,{[selectedDateStr]:p.type}):getActualShift(new Date(selectedDateStr+'T12:00'),currentGroup);}
 const eligible=()=>!!selectedDateStr&&!!core.festival(selectedDateStr,HOLIDAYS)&&core.working(selected());
 const current=()=>draft?.date===selectedDateStr&&draft.group===currentGroup?draft.amount:core.amount(config,currentGroup,selectedDateStr);
 function refresh(){edit.hidden=!eligible();if(!edit.hidden){const n=current();edit.textContent='명절근무수당 · '+(n===null?'금액 선택':n.toLocaleString('ko-KR')+'원')+'  ›';}}
 function mark(custom){choice=custom?'custom':'preset';$('holiday-work-pay-preset').setAttribute('aria-pressed',String(!custom));$('holiday-work-pay-custom').setAttribute('aria-pressed',String(custom));field.hidden=!custom;error.textContent='';}
 function open(){if(sheet.open||!eligible())return;const n=current();mark(n!==null&&n!==50000);input.value=n===null||n===0?'':n.toLocaleString('ko-KR');input.removeAttribute('aria-invalid');$('holiday-work-pay-description').textContent=Number(selectedDateStr.slice(5,7))+'월 '+Number(selectedDateStr.slice(8,10))+'일 · '+core.festival(selectedDateStr,HOLIDAYS)+' 근무수당';sheet.showModal();}
 function offer(previousType){
  refresh();
  if(overlay.classList.contains('active')&&previousType!==selected()?.type&&eligible()&&current()===null)open();
 }
 $('holiday-work-pay-preset').onclick=()=>{if(window.AppSheets?.resize)AppSheets.resize(sheet,()=>mark(false));else mark(false);};
 $('holiday-work-pay-custom').onclick=()=>{if(window.AppSheets?.resize)AppSheets.resize(sheet,()=>mark(true));else mark(true);input.focus({preventScroll:true});input.select();field.scrollIntoView({block:'nearest'});};
 $('holiday-work-pay-close').onclick=()=>sheet.close();
 function apply(){
  const raw=input.value.trim();let n=choice==='preset'?50000:raw===''?0:Number(raw.replace(/,/g,''));
  if(choice==='custom'&&(!/^(?:\d+|\d{1,3}(?:,\d{3})+)?$/.test(raw)||!core.validAmount(n))){error.textContent='금액을 0원 이상으로 입력해 주세요. 소수점은 빼 주세요.';input.setAttribute('aria-invalid','true');return;}
  if(!eligible())return sheet.close();draft={date:selectedDateStr,group:currentGroup,amount:n};refresh();sheet.close();
 }
 $('holiday-work-pay-done').onclick=apply;input.oninput=()=>{if(/^\d+$/.test(input.value))input.value=input.value.replace(/^0+(?=\d)/,'');error.textContent='';input.removeAttribute('aria-invalid');};input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();apply();}};
 edit.onclick=open;
 const choose=setDayOverride;
 setDayOverride=function(...args){
  const previousType=selected()?.type;
  const result=choose(...args);
  offer(previousType);
  return result;
 };
 const overtime=$('design-ot-toggle');
 let beforeToggle;
 overtime.addEventListener('click',()=>{beforeToggle=selected()?.type;},true);
 overtime.addEventListener('click',()=>offer(beforeToggle));
 const openDay=openOverrideModal;openOverrideModal=function(...args){if(draft&&(draft.date!==args[0]||draft.group!==currentGroup))draft=null;const result=openDay(...args);refresh();return result;};
 window.HolidayWorkPay={
  draftConfig(key){if(!draft||draft.date!==key||draft.group!==currentGroup)return null;return {...config,holidayWorkPay:{...config.holidayWorkPay,[currentGroup]:{...config.holidayWorkPay?.[currentGroup],[key]:draft.amount}}};},
  didSave(){draft=null;refresh();}
 };
 window.addEventListener('shift-account-changed',()=>{draft=null;if(sheet.open)sheet.close();refresh();});
})();
