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
 const alarm=document.createElement('section');alarm.id='memo-alarm';alarm.innerHTML=`
 <label class="memo-alarm-toggle" for="memo-alarm-enabled"><span><strong>알림</strong><small>켜면 일정으로 함께 표시해요</small></span><input id="memo-alarm-enabled" type="checkbox" role="switch"></label>
 <div id="memo-alarm-fields" hidden>
 <label for="memo-alarm-start">날짜와 시간</label><input id="memo-alarm-start" type="datetime-local">
 <label for="memo-alarm-reminder">알려줄 시간</label><select id="memo-alarm-reminder"><option value="0">일정 시작할 때</option><option value="5">5분 전</option><option value="10">10분 전</option><option value="30">30분 전</option><option value="60">1시간 전</option><option value="1440">1일 전</option><option value="">알림 없음</option></select>
 <details id="memo-alarm-more"><summary>종료 시간 · 장소</summary><label for="memo-alarm-all-day">하루 종일 <input id="memo-alarm-all-day" type="checkbox"></label><label for="memo-alarm-end">종료</label><input id="memo-alarm-end" type="datetime-local"><label for="memo-alarm-location">장소</label><input id="memo-alarm-location" maxlength="300" placeholder="장소 추가"></details>
 <p class="memo-alarm-help">앱 화면이 열려 있을 때 알려드려요. 잠금 화면 알림은 저장 후 휴대폰 캘린더로 내보내 설정해 주세요.</p>
 </div><p id="memo-compose-error" role="alert" hidden></p>`;
 content.append(alarm);document.body.append(dialog);
 const field=id=>dialog.querySelector('#memo-alarm-'+id),error=dialog.querySelector('#memo-compose-error');
 function alarmUI(){dialog.querySelector('#memo-alarm-fields').hidden=!field('enabled').checked;dialog.dataset.alarm=String(field('enabled').checked);field('reminder').options[0].textContent=field('all-day').checked?'당일 오전 9시':'일정 시작할 때';scheduleFit();}
 field('enabled').onchange=()=>{input.blur();alarmUI();};field('all-day').onchange=alarmUI;
 field('start').onchange=()=>{if(!field('end').value||field('end').value<=field('start').value)field('end').value=oneHourAfter(field('start').value);};
 function oneHourAfter(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))return value;d.setHours(d.getHours()+1);return DaySchedulerCore.stamp(d)+'T'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');}
 function scheduleValue(){if(!field('enabled').checked)return null;const allDay=field('all-day').checked;return {start:field('start').value.slice(0,allDay?10:16)+(allDay?'T00:00':''),end:field('end').value.slice(0,allDay?10:16)+(allDay?'T00:00':''),allDay,location:field('location').value.trim(),reminder:field('reminder').value===''?null:Number(field('reminder').value)};}
 function draftSignature(){return JSON.stringify({text:input.value,schedule:scheduleValue()});}

 const input=dialog.querySelector('textarea'),viewport=window.visualViewport;
 let date='',initial='',initialDraft='',entrySource=null,entryVersion='',rendered='',opener=null,closing=false,drag=null,offset=0,returnAnimation=null,entrance=null,suppressClickUntil=0,frame=0,restingHeight=0,restingWidth=0,finishClose=null,closeTimer=0;
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
   if(event){const meta=document.createElement('small');meta.className='memo-entry-alarm';meta.textContent=(event.reminder===null?'':'알림 · ')+(event.allDay?tr('하루 종일'):event.start.slice(5).replace('T',' '))+(event.reminder===null?' · '+tr('알림 없음'):event.reminder===0?' · '+tr(event.allDay?'오전 9시 알림':'시작 알림'):' · '+(event.allDay?'오전 9시 기준 · ':'')+(event.reminder===1440?tr('1일 전 알림'):event.reminder+tr('분 전 알림')));group.append(meta);
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
  if(!confirm(tr('이 메모와 연결된 알림을 삭제할까요?')))return;
  if(persist(source,{text:'',date:selectedDateStr,schedule:null}))(add.hidden?button:add).focus({preventScroll:true});
 }

 function fit(){
  frame=0;if(!dialog.open)return;if(viewport&&Math.abs(viewport.scale-1)>.01)return;
  const values={height:viewport?.height||innerHeight,width:viewport?.width||innerWidth,top:viewport?.offsetTop||0,left:viewport?.offsetLeft||0};
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
  status.hidden=true;error.hidden=true;clearDrag();closing=false;date=selectedDateStr;entrySource=source;
  const state=readState(),event=source?.eventId?state.events[source.date]?.[source.eventId]:null;
  entryVersion=DayEntryCore.signature(state,source);
  initial=source?.memoId?DayEntryCore.notes(state,source.date)[source.memoId]||'':event?DayEntryCore.eventText(state,{date:source.date,...event}):'';
  input.value=initial;input.scrollTop=0;content.scrollTop=0;opener=document.activeElement;restingHeight=viewport?.height||innerHeight;restingWidth=viewport?.width||innerWidth;
  field('enabled').checked=!!event;field('start').value=event?.start||date+'T09:00';field('end').value=event?.end||oneHourAfter(field('start').value);field('all-day').checked=event?.allDay||false;field('location').value=event?.location||'';field('reminder').value=event?event.reminder===null?'':String(event.reminder):'0';dialog.querySelector('#memo-alarm-more').open=false;alarmUI();initialDraft=draftSignature();
  dialog.dataset.design=overlay.dataset.editorDesign;const css=getComputedStyle(overlay);for(const key of ['--ed-card','--ed-text','--ed-sub','--ed-blue','--ed-line'])dialog.style.setProperty(key,css.getPropertyValue(key));
  dialog.querySelector('#memo-compose-title').textContent=tr('메모');input.placeholder=tr('메모 입력');
  const locale={ko:'ko-KR',en:'en',zh:'zh-CN',ja:'ja'}[localStorage.getItem('shift_display_language')]||'ko-KR';
  dialog.querySelector('#memo-compose-date').textContent=new Intl.DateTimeFormat(locale,{month:'long',day:'numeric',weekday:'long'}).format(new Date((source?.date||date)+'T12:00:00'));
  overlay.dataset.memoComposing='true';document.body.classList.add('memo-composer-open');dialog.showModal();dialog.scrollTop=0;fit();
  if(!reduced())entrance=dialog.animate([{opacity:.65},{opacity:1}],{duration:180,easing:'cubic-bezier(.2,.7,.2,1)'});
  input.focus({preventScroll:true});scheduleFit();
 }

 function close(animated=false,restoreFocus=true){if(closing)return;closing=true;const css=getComputedStyle(dialog);offset=(css.transform==='none'?0:new DOMMatrixReadOnly(css.transform).m42)+(parseFloat(css.translate.split(/\s+/)[1])||0);entrance?.cancel();entrance=null;returnAnimation?.cancel();returnAnimation=null;dialog.style.setProperty('--compose-drag',offset+'px');dialog.querySelectorAll('input,textarea,select').forEach(el=>el.blur());
  const finish=()=>{if(animated)suppressClickUntil=performance.now()+400;dialog.close();clearDrag();closing=false;delete overlay.dataset.memoComposing;document.body.classList.remove('memo-composer-open');refresh();if(restoreFocus&&overlay.classList.contains('active')&&opener?.isConnected)opener.focus({preventScroll:true});else if(restoreFocus&&overlay.classList.contains('active'))button.focus({preventScroll:true});window.dispatchEvent(new Event('resize'));};
  afterKeyboard(()=>{
   if(animated&&!reduced()){returnAnimation?.cancel();const animation=dialog.animate([{transform:`translateY(${offset}px)`},{transform:`translateY(${viewport?.height||innerHeight}px)`}],{duration:180,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});animation.finished.then(()=>{finish();animation.cancel();},finish);}else finish();
  });
 }
 function cancel(animated=true){if(closing)return;if(draftSignature()!==initialDraft&&!confirm(tr('작성 중인 메모를 저장하지 않고 이동할까요?'))){if(animated)suppressClickUntil=performance.now()+400;settle();return;}close(animated);}
 function save(){
  if(closing||date!==selectedDateStr)return;
  if(DayEntryCore.signature(readState(),entrySource)!==entryVersion){alert(tr('다른 곳에서 메모가 변경됐어요. 작성한 내용을 복사한 뒤 다시 열어 주세요.'));return;}
  const value=input.value.trim();if(!value&&!entrySource){close(true,true);return;}
  if(persist(entrySource,{text:value,date:entrySource?.date||date,schedule:scheduleValue()}))close(true,true);
 }

 add.onclick=()=>open(null);dialog.querySelector('#memo-compose-back').onclick=()=>cancel();dialog.querySelector('#memo-compose-dismiss').onclick=()=>cancel(true);dialog.querySelector('#memo-compose-save').onclick=save;
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
  if(dy>8&&dy>Math.abs(dx)*1.3){e.preventDefault();offset=Math.min(dy,240);if(!reduced())dialog.style.setProperty('--compose-drag',offset+'px');}
 });
 dialog.addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y,moved=drag.moved;drag=null;
  if(moved)suppressClickUntil=performance.now()+400;
  if(dy>=72&&dy>Math.abs(dx)*1.3){suppressClickUntil=performance.now()+600;cancel(true);}else settle();
 });
 dialog.addEventListener('pointercancel',()=>{if(drag){suppressClickUntil=performance.now()+400;settle();}});
 dialog.addEventListener('lostpointercapture',()=>{if(drag)settle();});
 dialog.addEventListener('click',e=>{if(closing||performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
 // A fresh pointer gesture is intentional; only the previous gesture's delayed click is fenced.
 window.addEventListener('pointerdown',()=>{if(!closing)suppressClickUntil=0;},true);
 // Consume the delayed touch click even if the dialog has already gone away.
 window.addEventListener('click',e=>{if(e.isTrusted&&performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
 viewport?.addEventListener('resize',scheduleFit);viewport?.addEventListener('scroll',scheduleFit);window.addEventListener('resize',scheduleFit);window.addEventListener('orientationchange',scheduleFit);window.addEventListener('pageshow',scheduleFit);input.addEventListener('focus',scheduleFit);
 new MutationObserver(refresh).observe(overlay,{attributes:true,attributeFilter:['class','data-editor-tab','data-design-pane']});source.addEventListener('input',refresh);
 window.MemoComposer={open,refresh,openEvent:event=>open(event?{date:event.date,eventId:event.id,memoId:event.memoId&&DayEntryCore.notes(readState(),event.date)[event.memoId]?event.memoId:null}:null)};refresh();
})();
