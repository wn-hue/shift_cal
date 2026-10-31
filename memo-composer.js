/* A separate writing surface: the shift sheet never contains a focused memo field. */
(()=>{'use strict';
 const source=document.getElementById('modal-memo-input'),overlay=document.getElementById('modal-override');
 if(!source||!overlay)return;
 const tr=text=>window.AppI18n?.t(text)||text;
 const button=document.createElement('button');button.type='button';button.id='memo-compose-open';
 button.innerHTML='<span id="memo-compose-preview" data-no-i18n></span><span aria-hidden="true">›</span>';
 source.hidden=true;overlay.dataset.unifiedMemo='true';
 const list=document.createElement('div');list.id='memo-entry-list';source.after(list);
 const add=document.createElement('button');add.type='button';add.id='memo-compose-add';add.textContent='+ 새 메모';list.after(add);
 source.previousElementSibling?.setAttribute('for','memo-compose-open');
 const status=document.createElement('p');status.id='memo-compose-status';status.setAttribute('role','status');status.hidden=true;add.after(status);
 const context=document.createElement('p');context.id='memo-day-context';
 const heading=document.createElement('div');heading.className='memo-day-heading';const label=source.previousElementSibling;source.before(heading);heading.append(label,context);
 const dialog=document.createElement('dialog');dialog.id='memo-compose-dialog';dialog.setAttribute('aria-labelledby','memo-compose-title');
 dialog.innerHTML='<button type="button" id="memo-compose-dismiss" aria-label="창 내리기"><span aria-hidden="true"></span></button><header class="memo-compose-header"><button type="button" id="memo-compose-back" aria-label="취소"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><h2 id="memo-compose-title">메모</h2><button type="button" id="memo-compose-save" aria-label="변경사항 저장"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button></header><p id="memo-compose-date"></p><textarea id="memo-compose-input" maxlength="16000" placeholder="메모 입력" aria-labelledby="memo-compose-title" autofocus></textarea>';
 const content=document.createElement('div');content.id='memo-compose-content';
 content.append(dialog.querySelector('#memo-compose-input'));dialog.append(content);
 const description=document.createElement('textarea');description.id='memo-compose-details';description.maxLength=16000;description.rows=3;description.placeholder='내용을 더 적어 주세요 (선택)';
 const descriptionLabel=document.createElement('label');descriptionLabel.htmlFor=description.id;descriptionLabel.className='memo-field-label';descriptionLabel.textContent='내용';const bodySection=document.createElement('details');bodySection.id='memo-body-section';const bodySummary=document.createElement('summary');bodySummary.innerHTML='<span>내용 더 쓰기</span><span aria-hidden="true">＋</span>';bodySection.append(bodySummary,descriptionLabel,description);content.append(bodySection);
 const alarm=document.createElement('section');alarm.id='memo-alarm';alarm.innerHTML=`
 <label class="memo-alarm-toggle" for="memo-alarm-enabled"><span><strong>일정 설정</strong><small>날짜 · 시간 · 알림 · 반복</small></span><input id="memo-alarm-enabled" type="checkbox" role="switch"></label>
 <div id="memo-alarm-fields" hidden>
 <label class="memo-all-day-row" for="memo-alarm-all-day">하루 종일 <input id="memo-alarm-all-day" type="checkbox" role="switch"></label>
 <label for="memo-alarm-start">시작</label><input id="memo-alarm-start" type="datetime-local">
 <label for="memo-alarm-end">종료</label><input id="memo-alarm-end" type="datetime-local">
 <label for="memo-alarm-location">장소</label><input id="memo-alarm-location" maxlength="300" placeholder="장소 추가 (선택)">
 <label for="memo-alarm-reminder">알림</label><select id="memo-alarm-reminder"><option value="">알림 없음</option><option value="0">일정 시작할 때</option><option value="5">5분 전</option><option value="10">10분 전</option><option value="30">30분 전</option><option value="60">1시간 전</option><option value="1440">1일 전</option></select>
 <label for="memo-alarm-repeat">반복</label><select id="memo-alarm-repeat"><option value="">반복 안 함</option><option value="daily">매일</option><option value="weekly">매주</option><option value="monthly">매월</option><option value="yearly">매년</option></select>
 <div id="memo-repeat-until-row" hidden><label for="memo-alarm-until">반복 종료 (선택)</label><input id="memo-alarm-until" type="date"><p class="memo-alarm-help">비워두면 계속 반복해요. 반복 일정의 수정·삭제는 전체 반복에 적용돼요.</p></div>
 <p class="memo-alarm-help">앱 화면이 열려 있을 때 알려드려요. 잠금 화면 알림은 저장 후 휴대폰 캘린더로 내보내 설정해 주세요.</p>
 </div><p id="memo-compose-error" role="alert" hidden></p>`;
 content.append(alarm);document.body.append(dialog);
 for(const id of ['start','end','location','reminder','repeat']){const control=dialog.querySelector('#memo-alarm-'+id),label=control.previousElementSibling,row=document.createElement('div');row.className='memo-setting-row';label.before(row);row.append(label,control);}
 bodySection.addEventListener('toggle',()=>{bodySummary.querySelector('span').textContent=tr(description.value.trim()?'상세 내용':'내용 더 쓰기');scheduleFit();});
 const field=id=>dialog.querySelector('#memo-alarm-'+id),error=dialog.querySelector('#memo-compose-error');
 function alarmUI(){
  dialog.querySelector('#memo-alarm-fields').hidden=!field('enabled').checked;dialog.dataset.alarm=String(field('enabled').checked);dialog.querySelector('#memo-compose-title').textContent=tr(field('enabled').checked?'일정':'메모');
  const allDay=field('all-day').checked;field('reminder').querySelector('[value="0"]').textContent=allDay?'당일 오전 9시':'일정 시작할 때';
  for(const [id,time]of [['start','09:00'],['end','10:00']]){const control=field(id),value=control.value,type=allDay?'date':'datetime-local';if(control.type!==type){if(allDay)control.dataset.time=value.slice(11)||time;control.type=type;control.value=allDay?value.slice(0,10):value.slice(0,10)+'T'+(control.dataset.time||time);}}
  dialog.querySelector('#memo-repeat-until-row').hidden=!field('repeat').value;scheduleFit();
 }
 field('repeat').onchange=alarmUI;
 field('enabled').onchange=()=>{input.blur();alarmUI();};field('all-day').onchange=alarmUI;
 field('start').onchange=()=>{if(!field('end').value||field('end').value<=field('start').value)field('end').value=field('all-day').checked?field('start').value:oneHourAfter(field('start').value);};
 function oneHourAfter(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))return value;d.setHours(d.getHours()+1);return DaySchedulerCore.stamp(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
 function scheduleValue(){if(!field('enabled').checked)return null;const allDay=field('all-day').checked;return {start:field('start').value.slice(0,allDay?10:16)+(allDay?'T00:00':''),end:field('end').value.slice(0,allDay?10:16)+(allDay?'T00:00':''),allDay,location:field('location').value.trim(),reminder:field('reminder').value===''?null:Number(field('reminder').value),...(field('repeat').value?{repeat:{frequency:field('repeat').value,until:field('until').value||null}}:{})};}
 function fullText(){return [input.value,description.value].filter(value=>value.trim()).join('\n\n');}

 const input=dialog.querySelector('#memo-compose-input'),viewport=window.visualViewport;
 const savedList=document.createElement('button');savedList.type='button';savedList.id='memo-compose-list';savedList.textContent='목록 보기';const contextBar=document.createElement('div');contextBar.className='memo-compose-context';dialog.querySelector('.memo-compose-header').after(contextBar);contextBar.append(dialog.querySelector('#memo-compose-date'),savedList);savedList.onclick=()=>cancel(true,'list');
 let date='',initial='',entrySource=null,entryVersion='',rendered='',opener=null,closing=false,drag=null,offset=0,returnAnimation=null,entrance=null,suppressClickUntil=0,frame=0,restingHeight=0,restingWidth=0,finishClose=null,closeTimer=0;
 const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 function clearDrag(){returnAnimation?.cancel();returnAnimation=null;drag=null;offset=0;dialog.style.removeProperty('--compose-drag');}
 function settle(){const from=offset;clearDrag();if(from&&!reduced())returnAnimation=dialog.animate([{transform:`translateY(${from}px)`},{transform:'translateY(0)'}],{duration:160,easing:'ease-out'});}
 function readState(){const get=key=>{try{return JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{return {}}};return {memos:dayMemos,items:get(DayMemosCore.key),events:get(DaySchedulerCore.key)};}
 function readItems(){return DayEntryCore.notes(readState(),selectedDateStr);}
 function refresh(){
  const state=readState(),items=DayEntryCore.notes(state,selectedDateStr),events=DaySchedulerCore.onDate(state.events,selectedDateStr);
  const version=JSON.stringify([selectedDateStr,items,events,document.documentElement.lang]);if(version===rendered)return;rendered=version;list.replaceChildren();
  let index=0;
  function row(source,value,event){
   const wrap=document.createElement('div');wrap.className='memo-entry-row';
   const edit=index++===0?button:document.createElement('button');edit.type='button';edit.className='memo-entry-open';
   if(edit!==button)edit.innerHTML='<span class="memo-entry-preview" data-no-i18n></span><span aria-hidden="true">›</span>';
   edit.querySelector('span').textContent=value||tr('새 메모');edit.dataset.empty=String(!value);edit.setAttribute('aria-label',tr(value?'메모 수정':'새 메모'));edit.onclick=()=>open(source);
   const group=document.createElement('div');group.className='memo-entry-main';group.append(edit);
   if(event){const meta=document.createElement('small');meta.className='memo-entry-alarm';meta.textContent=(event.reminder===null?'':'알림 · ')+(event.allDay?tr('하루 종일'):event.start.slice(5).replace('T',' '))+(event.reminder===null?' · '+tr('알림 없음'):event.reminder===0?' · '+tr(event.allDay?'오전 9시 알림':'시작 알림'):' · '+(event.allDay?'오전 9시 기준 · ':'')+(event.reminder===1440?tr('1일 전 알림'):event.reminder+tr('분 전 알림')));if(event.repeat)meta.textContent+=' · '+({daily:'매일',weekly:'매주',monthly:'매월',yearly:'매년'}[event.repeat.frequency]);group.append(meta);
    const exportButton=document.createElement('button');exportButton.type='button';exportButton.className='memo-entry-export';exportButton.textContent=tr('휴대폰 캘린더로 내보내기');exportButton.onclick=()=>DayScheduler.exportEvent(event);group.append(exportButton);
   }
   wrap.append(group);
   if(source){const remove=document.createElement('button');remove.type='button';remove.className='memo-entry-delete';remove.setAttribute('aria-label',tr('메모 삭제'));remove.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/></svg>';remove.onclick=()=>removeMemo(source);wrap.append(remove);}
   list.append(wrap);
  }
  for(const [id,value]of Object.entries(items)){const found=DayEntryCore.linked(state,selectedDateStr,id),event=found?{date:selectedDateStr,id:found[0],...found[1]}:null;row({date:selectedDateStr,memoId:id,eventId:event?.id},value,event);}
  for(const event of events){if(event.date===selectedDateStr&&event.memoId&&items[event.memoId])continue;row({date:event.date,memoId:event.memoId&&DayEntryCore.notes(state,event.date)[event.memoId]?event.memoId:null,eventId:event.id},DayEntryCore.eventText(state,event),event);}
  const empty=index===0;if(empty)row(null,'',null);add.hidden=empty;add.disabled=Object.keys(items).length>=50;
  if(selectedDateStr)context.textContent=new Intl.DateTimeFormat(document.documentElement.lang||'ko',{month:'long',day:'numeric',weekday:'long'}).format(new Date(selectedDateStr+'T12:00:00'));
 }
 function persist(source,draft){
  try{const state=readState(),next=DayEntryCore.plan(state,source,draft,crypto.randomUUID());
   const bundle={shift_day_memos:next.memos,shift_day_memo_items_v1:next.items,shift_day_events:next.events};
   AccountDataCore.normalize(bundle);
   if(!window.DayEditorDesigns.save(next.memos[selectedDateStr]||'',{keepOpen:true,bundle}))return false;
   for(const day of new Set([...Object.keys(state.memos),...Object.keys(next.memos)]))if(day!==selectedDateStr&&state.memos[day]!==next.memos[day])window.GoogleSync?.changed(day);
   status.textContent=tr('저장했어요');status.hidden=false;refresh();return true;
  }catch(e){if(dialog.open){error.textContent=e.message;error.hidden=false;}else{status.textContent=e.message;status.hidden=false;}return false;}
 }
 function removeMemo(source){
  const recurring=source.eventId&&readState().events[source.date]?.[source.eventId]?.repeat;if(!confirm(tr(recurring?'이 일정의 전체 반복과 메모를 삭제할까요?':'이 메모와 연결된 알림을 삭제할까요?')))return;
  if(persist(source,{text:'',date:selectedDateStr,schedule:null}))(add.hidden?button:add).focus({preventScroll:true});
 }

 function fit(){
  frame=0;if(!dialog.open)return;if(viewport&&Math.abs(viewport.scale-1)>.01)return;
  const values={height:viewport?.height||innerHeight,width:viewport?.width||innerWidth,top:viewport?.offsetTop||0,left:viewport?.offsetLeft||0};
  // Once released, keep the sheet geometry fixed while the keyboard retracts.
  if(closing){if(finishClose&&(values.height>=restingHeight-80||Math.abs(values.width-restingWidth)>80))finishClose();return;}
  for(const [key,value]of Object.entries(values))dialog.style.setProperty('--compose-'+key,value+'px');
  dialog.dataset.compact=String(values.height<300);
  dialog.dataset.keyboard=String(restingHeight-values.height>120);
  if(finishClose&&(values.height>=restingHeight-80||Math.abs(values.width-restingWidth)>80))finishClose();
 }
 function scheduleFit(){if(!frame)frame=requestAnimationFrame(fit);}
 // Keep the underlying day sheet and body locked until the keyboard finishes retracting.
 function afterKeyboard(callback){
  if(restingHeight-(viewport?.height||innerHeight)<=120){callback();return;}
  finishClose=()=>{const finish=finishClose;if(!finish)return;finishClose=null;clearTimeout(closeTimer);callback();};
  closeTimer=setTimeout(()=>finishClose?.(),600);
 }

 function open(source){
  if(dialog.open||!selectedDateStr)return;
  if(source===undefined){const id=Object.keys(readItems())[0];source=id?{date:selectedDateStr,memoId:id,eventId:DayEntryCore.linked(readState(),selectedDateStr,id)?.[0]}:null;}
  savedList.hidden=!Object.keys(readItems()).length&&!DaySchedulerCore.onDate(readState().events,selectedDateStr).length;status.hidden=true;error.hidden=true;clearDrag();closing=false;date=selectedDateStr;entrySource=source;
  const state=readState(),event=source?.eventId?state.events[source.date]?.[source.eventId]:null;
  entryVersion=DayEntryCore.signature(state,source);
  initial=source?.memoId?DayEntryCore.notes(state,source.date)[source.memoId]||'':event?DayEntryCore.eventText(state,{date:source.date,...event}):'';
  const split=initial.indexOf('\n\n');input.value=split<0?initial:initial.slice(0,split);description.value=split<0?'':initial.slice(split+2);bodySection.open=!!description.value;bodySummary.querySelector('span').textContent=tr(description.value.trim()?'상세 내용':'내용 더 쓰기');input.scrollTop=0;description.scrollTop=0;content.scrollTop=0;opener=document.activeElement;restingHeight=viewport?.height||innerHeight;restingWidth=viewport?.width||innerWidth;
  field('enabled').checked=!!event;field('start').type=field('end').type='datetime-local';field('start').value=event?.start||date+'T09:00';field('end').value=event?.end||oneHourAfter(field('start').value);field('start').dataset.time=event?.start.slice(11)||'09:00';field('end').dataset.time=event?.end.slice(11)||'10:00';field('all-day').checked=event?.allDay||false;field('location').value=event?.location||'';field('reminder').value=event?event.reminder===null?'':String(event.reminder):'0';field('repeat').value=event?.repeat?.frequency||'';field('until').value=event?.repeat?.until||'';alarmUI();
  dialog.dataset.design=overlay.dataset.editorDesign;const css=getComputedStyle(overlay);for(const key of ['--ed-card','--ed-text','--ed-sub','--ed-blue','--ed-line'])dialog.style.setProperty(key,css.getPropertyValue(key));
  dialog.querySelector('#memo-compose-title').textContent=tr(event?'일정':'메모');input.placeholder=tr('어떤 내용을 남길까요?');
  const locale={ko:'ko-KR',en:'en',zh:'zh-CN',ja:'ja'}[localStorage.getItem('shift_display_language')]||'ko-KR';
  dialog.querySelector('#memo-compose-date').textContent=new Intl.DateTimeFormat(locale,{month:'long',day:'numeric',weekday:'long'}).format(new Date((source?.date||date)+'T12:00:00'));
  overlay.dataset.memoComposing='true';document.body.classList.add('memo-composer-open');dialog.showModal();dialog.scrollTop=0;fit();
  if(!reduced())entrance=dialog.animate([{opacity:.7},{opacity:1}],{duration:220,easing:'cubic-bezier(.2,.7,.2,1)'});
  input.focus({preventScroll:true});scheduleFit();
 }

 function close(animated=false,restoreFocus=true,destination='list'){if(closing)return;closing=true;dialog.dataset.closing='true';
  // Remove the underlying memo preview before dismissal, so it cannot appear as a smaller popup.
  if(destination==='calendar')overlay.classList.remove('active');
  else if(destination==='work')DayEditorDesigns.showPane('work');
 const css=getComputedStyle(dialog);offset=(css.transform==='none'?0:new DOMMatrixReadOnly(css.transform).m42)+(parseFloat(css.translate.split(/\s+/)[1])||0);entrance?.cancel();entrance=null;returnAnimation?.cancel();returnAnimation=null;dialog.style.setProperty('--compose-drag',offset+'px');dialog.querySelectorAll('input,textarea,select').forEach(el=>el.blur());
  const finish=()=>{if(animated)suppressClickUntil=performance.now()+400;dialog.close();clearDrag();dialog.style.removeProperty('opacity');delete dialog.dataset.closing;closing=false;delete overlay.dataset.memoComposing;document.body.classList.remove('memo-composer-open');refresh();if(destination==='calendar'){input.value='';description.value='';document.querySelector('.cal-day[data-date="'+date+'"] .day-num')?.focus({preventScroll:true});}else if(destination==='work'){input.value='';description.value='';const target=overlay.querySelector('.design-memo-link');(target?.getClientRects().length?target:overlay.querySelector('#design-back'))?.focus({preventScroll:true});}else if(restoreFocus&&overlay.classList.contains('active')&&opener?.isConnected)opener.focus({preventScroll:true});else if(restoreFocus&&overlay.classList.contains('active'))button.focus({preventScroll:true});window.dispatchEvent(new Event('resize'));};
  // Start the exit now; keyboard cleanup runs alongside it, never before it.
  // Keep the invisible modal's scroll lock until both operations finish.
  let animationDone=false,keyboardDone=false,finished=false;
  const complete=()=>{if(!finished&&animationDone&&keyboardDone){finished=true;finish();}};
  if(animated&&!reduced()){
   const distance=Math.max(restingHeight,innerHeight,(viewport?.height||0)+(viewport?.offsetTop||0),offset+1);
   returnAnimation=dialog.animate([{transform:`translateY(${offset}px)`,opacity:1},{transform:`translateY(${distance}px)`,opacity:0}],{duration:220,easing:'cubic-bezier(.16,.75,.3,1)',fill:'forwards'});
   returnAnimation.finished.then(()=>{animationDone=true;complete();},()=>{animationDone=true;complete();});
  }else{dialog.style.opacity='0';animationDone=true;}
  afterKeyboard(()=>{keyboardDone=true;complete();});
 }
 function cancel(animated=true,destination='work'){if(closing)return;close(animated,true,destination);}
 function save(){
  if(closing||date!==selectedDateStr)return;
  if(DayEntryCore.signature(readState(),entrySource)!==entryVersion){alert(tr('다른 곳에서 메모가 변경됐어요. 작성한 내용을 복사한 뒤 다시 열어 주세요.'));return;}
  const value=fullText().trim();if(!value&&!entrySource){close(true,true,'calendar');return;}
  if(persist(entrySource,{text:value,date:entrySource?.date||date,schedule:scheduleValue()}))close(true,true,'calendar');
 }

 add.onclick=()=>open(null);dialog.querySelector('#memo-compose-back').onclick=()=>cancel();dialog.querySelector('#memo-compose-dismiss').onclick=()=>cancel(true,'calendar');dialog.querySelector('#memo-compose-save').onclick=save;
 dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});
 dialog.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();save();}});
 // Only the header/handle starts dismissal. Text selection and textarea scrolling stay native.
 dialog.addEventListener('pointerdown',e=>{
  if(!e.isPrimary){if(drag)settle();return;}
  if(closing||e.button!==0||!e.target.closest('#memo-compose-dismiss,.memo-compose-header,#memo-compose-date')||e.target.closest('button:not(#memo-compose-dismiss)'))return;
  const css=getComputedStyle(dialog),from=(css.transform==='none'?0:new DOMMatrixReadOnly(css.transform).m42)+(parseFloat(css.translate.split(/\s+/)[1])||0);entrance?.cancel();entrance=null;clearDrag();offset=from;dialog.style.setProperty('--compose-drag',from+'px');drag={id:e.pointerId,x:e.clientX,y:e.clientY-from,moved:false};try{e.target.setPointerCapture(e.pointerId);}catch{}
 });
 dialog.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(Math.abs(dx)>8||Math.abs(dy)>8)drag.moved=true;
  if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.3||dy< -12){suppressClickUntil=performance.now()+400;settle();return;}
  if(dy>8&&dy>Math.abs(dx)*1.3){e.preventDefault();offset=dy;if(!reduced())dialog.style.setProperty('--compose-drag',offset+'px');}
 });
 dialog.addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y,moved=drag.moved;drag=null;
  if(moved)suppressClickUntil=performance.now()+400;
  if(dy>=72&&dy>Math.abs(dx)*1.3){suppressClickUntil=performance.now()+600;cancel(true,'calendar');}else settle();
 });
 dialog.addEventListener('pointercancel',()=>{if(drag){suppressClickUntil=performance.now()+400;settle();}});
 dialog.addEventListener('lostpointercapture',()=>{if(drag)settle();});
 dialog.addEventListener('click',e=>{if(closing||performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
 // A fresh pointer gesture is intentional; only the previous gesture's delayed click is fenced.
 window.addEventListener('pointerdown',()=>{if(!closing)suppressClickUntil=0;},true);
 // Consume the delayed touch click even if the dialog has already gone away.
 window.addEventListener('click',e=>{if(e.isTrusted&&performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
 viewport?.addEventListener('resize',scheduleFit);viewport?.addEventListener('scroll',scheduleFit);window.addEventListener('resize',scheduleFit);window.addEventListener('orientationchange',scheduleFit);window.addEventListener('pageshow',scheduleFit);input.addEventListener('focus',scheduleFit);description.addEventListener('focus',scheduleFit);
 new MutationObserver(refresh).observe(overlay,{attributes:true,attributeFilter:['class','data-editor-tab','data-design-pane']});source.addEventListener('input',refresh);
 window.MemoComposer={open,refresh,enter:source=>{DayEditorDesigns.showPane('memo');open(source);},openEvent:event=>open(event?{date:event.date,eventId:event.id,memoId:event.memoId&&DayEntryCore.notes(readState(),event.date)[event.memoId]?event.memoId:null}:null)};document.getElementById('memo-tab').onclick=()=>MemoComposer.enter(null);refresh();
})();
