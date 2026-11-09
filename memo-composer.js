/* Quick notes and the full schedule editor share one persistence path. */
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
 const arrow='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg>';
 function composerBar(inputId,saveId,optionsId,deleteId){
  const bar=document.createElement('div');bar.className='memo-chat-bar';
  bar.innerHTML=`<button type="button" class="memo-chat-plus" id="${optionsId}" aria-label="일정 옵션">+</button><textarea id="${inputId}" rows="1" maxlength="16000" placeholder="메모 입력" aria-label="메모 내용"></textarea><button type="button" class="memo-chat-delete" id="${deleteId}" hidden>삭제</button><button type="button" class="memo-chat-save" id="${saveId}" aria-label="메모 저장"><span>${arrow}</span></button>`;
  const input=bar.querySelector('textarea');
  function grow(){input.style.height='auto';const max=parseFloat(getComputedStyle(input).maxHeight);input.style.height=Math.min(input.scrollHeight,max)+'px';}
  input.addEventListener('input',grow);return {bar,input,grow,save:bar.querySelector('.memo-chat-save'),remove:bar.querySelector('.memo-chat-delete'),options:bar.querySelector('.memo-chat-plus')};
 }
 dialog.innerHTML='<button type="button" id="memo-compose-dismiss" aria-label="메모 닫기"><span aria-hidden="true"></span></button><header class="memo-compose-header"><button type="button" id="memo-compose-back" aria-label="저장하고 돌아가기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><h2 id="memo-compose-title">메모</h2><span class="memo-header-spacer" aria-hidden="true"></span></header><p id="memo-compose-date"></p>';
 const content=document.createElement('div');content.id='memo-compose-content';dialog.append(content);
 const full=composerBar('memo-compose-input','memo-compose-save','memo-compose-options','memo-compose-delete');
 const inline=composerBar('memo-inline-input','memo-inline-save','memo-inline-options','memo-inline-delete');
 const inlineArea=document.createElement('section');inlineArea.className='memo-inline-area';
 const inlineHistory=document.createElement('button');inlineHistory.type='button';inlineHistory.className='memo-inline-history';inlineHistory.hidden=true;
 const inlineError=document.createElement('p');inlineError.className='memo-inline-error';inlineError.hidden=true;inlineError.setAttribute('role','alert');
 inlineArea.append(inlineHistory,inlineError,inline.bar);overlay.querySelector('.design-memo-link').replaceWith(inlineArea);
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
 content.append(alarm);dialog.append(full.bar);document.body.append(dialog);
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

 const input=full.input,viewport=window.visualViewport;
 const savedList=document.createElement('button');savedList.type='button';savedList.id='memo-compose-list';savedList.textContent='메모 목록 보기';const contextBar=document.createElement('div');contextBar.className='memo-compose-context';dialog.querySelector('.memo-compose-header').after(contextBar);contextBar.append(dialog.querySelector('#memo-compose-date'),savedList);savedList.onclick=()=>cancel(true,'list');
 let date='',initial='',initialDraft='',entrySource=null,entryVersion='',rendered='',opener=null,closing=false,drag=null,offset=0,returnAnimation=null,entrance=null,suppressClickUntil=0,frame=0,restingHeight=0,restingWidth=0,finishClose=null,closeTimer=0;
 const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 function clearDrag(){returnAnimation?.cancel();returnAnimation=null;drag=null;offset=0;dialog.style.removeProperty('--compose-drag');}
 function settle(){const from=offset;clearDrag();if(from&&!reduced())returnAnimation=dialog.animate([{transform:`translateY(${from}px)`},{transform:'translateY(0)'}],{duration:160,easing:'ease-out'});}
 function readState(){const get=key=>{try{return JSON.parse(localStorage.getItem(key)||'{}')||{}}catch{return {}}};return {memos:dayMemos,items:get(DayMemosCore.key),events:get(DaySchedulerCore.key)};}
 function readItems(){return DayEntryCore.notes(readState(),selectedDateStr);}
 function newestMemo(){
  if(!selectedDateStr)return null;
  const state=readState(),note=Object.entries(readItems()).at(-1);
  if(note){const [memoId,value]=note;return {source:{date:selectedDateStr,memoId,eventId:DayEntryCore.linked(state,selectedDateStr,memoId)?.[0]},value};}
  const event=DaySchedulerCore.onDate(state.events,selectedDateStr).at(-1);
  return event?{source:{date:event.date,eventId:event.id},value:DayEntryCore.eventText(state,event)}:null;
 }
 function refreshControls(){
  const last=newestMemo();
  inlineHistory.hidden=!last;inlineHistory.textContent=last?.value||'';
  inline.remove.hidden=!last;full.remove.hidden=!entrySource&&!last;
  inline.input.placeholder=tr('메모 입력');
  inline.save.disabled=!inline.input.value.trim();
  full.save.disabled=!entrySource&&!fullText().trim();
 }
 function setFullOptions(show){
  content.hidden=!show;full.options.setAttribute('aria-expanded',String(show));
 }
 full.options.setAttribute('aria-controls',content.id);
 full.options.onclick=()=>{input.blur();setFullOptions(content.hidden);scheduleFit();};
 function dismissKeyboard(area){
  area.addEventListener('click',event=>{
   if(!event.target.closest('input,textarea,select,label,button,summary,[contenteditable]')&&area.contains(document.activeElement)&&document.activeElement.matches('textarea'))document.activeElement.blur();
  });
 }
 dismissKeyboard(dialog);dismissKeyboard(overlay);
 for(const control of [input,description,inline.input])control.addEventListener('input',refreshControls);
 function openInlineFull(source,draft){
  if(open(source,draft)){inline.input.value='';inline.grow();refreshControls();}
 }
 inlineHistory.onclick=()=>{if(saveInline())openInlineFull(newestMemo()?.source);};
 inline.options.onclick=()=>openInlineFull(null,inline.input.value);
 inline.save.onclick=()=>saveInline();
 function resetInline(){inline.input.value='';inlineError.hidden=true;inline.grow();refreshControls();}
 function saveInline(){
  const value=inline.input.value.trim();if(!value)return true;
  if(!persist(null,{text:value,date:selectedDateStr,schedule:null},{stayPane:true}))return false;
  resetInline();inline.input.blur();return true;
 }
 inline.remove.onclick=()=>deleteLatest(newestMemo()?.source);
 full.remove.onclick=()=>{
  if(entrySource){if(deleteLatest(entrySource)){entrySource=null;entryVersion='';initialDraft=JSON.stringify({text:'',schedule:null});input.value='';description.value='';field('enabled').checked=false;alarmUI();full.grow();refreshControls();}}
  else deleteLatest(newestMemo()?.source);
 };
 function deleteLatest(source){
  if(!source)return false;
  if(source.eventId&&readState().events[source.date]?.[source.eventId]?.repeat&&!confirm(tr('반복 일정과 메모를 모두 지울까요?')))return false;
  return persist(source,{text:'',date:selectedDateStr,schedule:null},{stayPane:true});
 }
 function refresh(){
  const state=readState(),items=DayEntryCore.notes(state,selectedDateStr),events=DaySchedulerCore.onDate(state.events,selectedDateStr);
  refreshControls();
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
 function persist(source,draft,options={}){
  try{const state=readState(),next=DayEntryCore.plan(state,source,draft,crypto.randomUUID());
   const bundle={shift_day_memos:next.memos,shift_day_memo_items_v1:next.items,shift_day_events:next.events};
   AccountDataCore.normalize(bundle);
   if(!window.DayEditorDesigns.save(next.memos[selectedDateStr]||'',{keepOpen:true,bundle,...options})){error.textContent=document.getElementById('design-save-error')?.textContent||tr('저장하지 못했어요. 작성한 내용은 그대로 남아 있어요. 다시 시도해 주세요.');error.hidden=false;inlineError.textContent=error.textContent;inlineError.hidden=false;return false;}
   inlineError.hidden=true;
   for(const day of new Set([...Object.keys(state.memos),...Object.keys(next.memos)]))if(day!==selectedDateStr&&state.memos[day]!==next.memos[day])window.GoogleSync?.changed(day);
   status.textContent=tr('저장했어요');status.hidden=false;refresh();return true;
  }catch(e){if(dialog.open){error.textContent=e.message;error.hidden=false;}else{status.textContent=e.message;status.hidden=false;inlineError.textContent=e.message;inlineError.hidden=false;}return false;}
 }
 function removeMemo(source){
  const recurring=source.eventId&&readState().events[source.date]?.[source.eventId]?.repeat;if(!confirm(tr(recurring?'반복 일정과 메모를 모두 지울까요?':'이 메모와 알림을 지울까요?')))return;
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

 function open(source,draftText){
  if(dialog.open||!selectedDateStr)return;
  if(source===undefined){const id=Object.keys(readItems())[0];source=id?{date:selectedDateStr,memoId:id,eventId:DayEntryCore.linked(readState(),selectedDateStr,id)?.[0]}:null;}
  savedList.hidden=!Object.keys(readItems()).length&&!DaySchedulerCore.onDate(readState().events,selectedDateStr).length;status.hidden=true;error.hidden=true;clearDrag();closing=false;date=selectedDateStr;entrySource=source;
  const state=readState(),event=source?.eventId?state.events[source.date]?.[source.eventId]:null;
  entryVersion=DayEntryCore.signature(state,source);
  initial=source?.memoId?DayEntryCore.notes(state,source.date)[source.memoId]||'':event?DayEntryCore.eventText(state,{date:source.date,...event}):'';
  const split=initial.indexOf('\n\n');input.value=split<0?initial:initial.slice(0,split);description.value=split<0?'':initial.slice(split+2);bodySection.open=!!description.value;bodySummary.querySelector('span').textContent=tr(description.value.trim()?'상세 내용':'내용 더 쓰기');input.scrollTop=0;description.scrollTop=0;content.scrollTop=0;opener=document.activeElement;restingHeight=viewport?.height||innerHeight;restingWidth=viewport?.width||innerWidth;
  field('enabled').checked=!!event;field('start').type=field('end').type='datetime-local';field('start').value=event?.start||date+'T09:00';field('end').value=event?.end||oneHourAfter(field('start').value);field('start').dataset.time=event?.start.slice(11)||'09:00';field('end').dataset.time=event?.end.slice(11)||'10:00';field('all-day').checked=event?.allDay||false;field('location').value=event?.location||'';field('reminder').value=event?event.reminder===null?'':String(event.reminder):'0';field('repeat').value=event?.repeat?.frequency||'';field('until').value=event?.repeat?.until||'';alarmUI();initialDraft=JSON.stringify({text:fullText().trim(),schedule:scheduleValue()});
  dialog.dataset.design=overlay.dataset.editorDesign;const css=getComputedStyle(overlay);for(const key of ['--ed-card','--ed-text','--ed-sub','--ed-blue','--ed-line'])dialog.style.setProperty(key,css.getPropertyValue(key));
  dialog.querySelector('#memo-compose-title').textContent=tr(event?'일정':'메모');input.placeholder=inline.input.placeholder=tr('메모 입력');setFullOptions(draftText!==undefined||!!event||!!description.value);if(draftText!==undefined)input.value=draftText;
  const locale={ko:'ko-KR',en:'en',zh:'zh-CN',ja:'ja'}[localStorage.getItem('shift_display_language')]||'ko-KR';
  dialog.querySelector('#memo-compose-date').textContent=new Intl.DateTimeFormat(locale,{month:'long',day:'numeric',weekday:'long'}).format(new Date((source?.date||date)+'T12:00:00'));
  overlay.dataset.memoComposing='true';document.body.classList.add('memo-composer-open');dialog.showModal();dialog.scrollTop=0;fit();
  if(!reduced())entrance=dialog.animate([{translate:'0 '+(Math.max(restingHeight,innerHeight)+24)+'px'},{translate:'0 0'}],{duration:360,easing:'cubic-bezier(.22,1,.36,1)'});
  full.grow();refreshControls();input.focus({preventScroll:true});scheduleFit();return true;
 }

 function close(animated=false,restoreFocus=true,destination='list'){if(closing)return;closing=true;dialog.dataset.closing='true';
  // Remove the underlying memo preview before dismissal, so it cannot appear as a smaller popup.
  if(destination==='calendar')overlay.classList.remove('active');
  else if(destination==='work')DayEditorDesigns.showPane('work');
 const css=getComputedStyle(dialog);offset=(css.transform==='none'?0:new DOMMatrixReadOnly(css.transform).m42)+(parseFloat(css.translate.split(/\s+/)[1])||0);entrance?.cancel();entrance=null;returnAnimation?.cancel();returnAnimation=null;dialog.style.setProperty('--compose-drag',offset+'px');dialog.querySelectorAll('input,textarea,select').forEach(el=>el.blur());
  const finish=()=>{if(animated)suppressClickUntil=performance.now()+400;dialog.close();clearDrag();dialog.style.removeProperty('opacity');delete dialog.dataset.closing;closing=false;delete overlay.dataset.memoComposing;document.body.classList.remove('memo-composer-open');refresh();if(destination==='calendar'){input.value='';description.value='';document.querySelector('.cal-day[data-date="'+date+'"] .day-num')?.focus({preventScroll:true});}else if(destination==='work'){input.value='';description.value='';const target=inline.options;(target?.getClientRects().length?target:overlay.querySelector('#design-back'))?.focus({preventScroll:true});}else if(restoreFocus&&overlay.classList.contains('active')&&opener?.isConnected)opener.focus({preventScroll:true});else if(restoreFocus&&overlay.classList.contains('active'))button.focus({preventScroll:true});window.dispatchEvent(new Event('resize'));};
  // Start the exit now; keyboard cleanup runs alongside it, never before it.
  // Keep the invisible modal's scroll lock until both operations finish.
  let animationDone=false,keyboardDone=false,finished=false;
  const complete=()=>{if(!finished&&animationDone&&keyboardDone){finished=true;finish();}};
  if(animated&&!reduced()){
   const distance=Math.max(restingHeight,innerHeight,(viewport?.height||0)+(viewport?.offsetTop||0),offset+1);
   returnAnimation=dialog.animate([{transform:`translateY(${offset}px)`,opacity:1},{transform:`translateY(${distance}px)`,opacity:0}],{duration:240,easing:'cubic-bezier(.2,.65,.3,1)',fill:'forwards'});
   returnAnimation.finished.then(()=>{animationDone=true;complete();},()=>{animationDone=true;complete();});
  }else{dialog.style.opacity='0';animationDone=true;}
  afterKeyboard(()=>{keyboardDone=true;complete();});
 }
 function cancel(animated=true,destination='work'){return save(destination,animated);}
 function save(destination='calendar',animated=true){
  if(closing||date!==selectedDateStr)return false;
  const value=fullText().trim(),schedule=scheduleValue(),unchanged=JSON.stringify({text:value,schedule})===initialDraft;
  // Closing an untouched/empty entry still commits any pending work change, without duplicating a memo.
  if(unchanged||(!value&&!entrySource&&!schedule)){
   if(!DayEditorDesigns.flush()){error.textContent=document.getElementById('design-save-error')?.textContent||tr('저장하지 못했어요. 작성한 내용은 그대로 남아 있어요. 다시 시도해 주세요.');error.hidden=false;settle();return false;}
   close(animated,true,destination);return true;
  }
  if(DayEntryCore.signature(readState(),entrySource)!==entryVersion){error.textContent=tr('다른 곳에서 이 메모를 바꿨어요. 지금 쓴 내용을 복사한 뒤 메모를 다시 열어 주세요.');error.hidden=false;settle();return false;}
  if(!value&&schedule){error.textContent=tr('일정 내용을 입력해 주세요.');error.hidden=false;settle();return false;}
  if(persist(entrySource,{text:value,date:entrySource?.date||date,schedule})){close(animated,true,destination);return true;}
  settle();return false;
 }

 add.onclick=()=>open(null);dialog.querySelector('#memo-compose-back').onclick=()=>cancel();dialog.querySelector('#memo-compose-dismiss').onclick=()=>cancel(true,'calendar');dialog.querySelector('#memo-compose-save').onclick=()=>save();
 dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});
 dialog.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();save();}});
 // Pull from the header or blank content at its top. Fields retain text selection and native scrolling.
 function canDrag(target){
  if(closing||target.closest('input,textarea,select,summary,a,label,[contenteditable=true],button:not(#memo-compose-dismiss)'))return false;
  if(target.closest('#memo-compose-dismiss,.memo-compose-header,.memo-compose-context'))return true;
  for(let node=target;node&&dialog.contains(node);node=node.parentElement){if(node.scrollTop>1&&node.scrollHeight>node.clientHeight+1)return false;if(node===dialog)break;}
  return target===dialog||content.contains(target);
 }
 function startDrag(target,x,y,id,kind){
  if(!canDrag(target))return;
  const css=getComputedStyle(dialog),from=(css.transform==='none'?0:new DOMMatrixReadOnly(css.transform).m42)+(parseFloat(css.translate.split(/\s+/)[1])||0);
  entrance?.cancel();entrance=null;clearDrag();offset=from;dialog.style.setProperty('--compose-drag',from+'px');drag={id,kind,x,y,from,moved:false};
 }
 function moveDrag(x,y,event){
  const dx=x-drag.x,dy=y-drag.y;
  if(Math.abs(dx)>8||Math.abs(dy)>8)drag.moved=true;
  if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.3||dy< -12){suppressClickUntil=performance.now()+400;settle();return;}
  if(dy>8&&dy>Math.abs(dx)*1.3){if(event.cancelable)event.preventDefault();offset=Math.max(0,drag.from+dy);if(!reduced())dialog.style.setProperty('--compose-drag',offset+'px');}
 }
 function endDrag(x,y,event){
  const dx=x-drag.x,dy=y-drag.y,moved=drag.moved;drag=null;
  if(moved){suppressClickUntil=performance.now()+400;if(event.cancelable)event.preventDefault();}
  if(dy>=72&&dy>Math.abs(dx)*1.3){suppressClickUntil=performance.now()+600;cancel(true,'calendar');}else settle();
 }
 dialog.addEventListener('pointerdown',e=>{
  if(!e.isPrimary){if(drag)settle();return;}if(e.button!==0)return;
  startDrag(e.target,e.clientX,e.clientY,e.pointerId,'pointer');
  if(drag&&e.pointerType==='mouse')try{e.target.setPointerCapture(e.pointerId);}catch{}
 });
 dialog.addEventListener('pointermove',e=>{if(drag?.kind==='pointer'&&e.pointerId===drag.id)moveDrag(e.clientX,e.clientY,e);});
 dialog.addEventListener('pointerup',e=>{if(drag?.kind==='pointer'&&e.pointerId===drag.id)endDrag(e.clientX,e.clientY,e);});
 dialog.addEventListener('pointercancel',()=>{if(drag?.kind==='pointer'){suppressClickUntil=performance.now()+400;settle();}});
 dialog.addEventListener('lostpointercapture',()=>{if(drag?.kind==='pointer')settle();});
 // iOS can cancel a pointer sequence when native scrolling begins. A non-passive
 // touchmove owns only downward pulls on blank space, without intercepting input gestures.
 dialog.addEventListener('touchstart',e=>{if(e.touches.length!==1){if(drag)settle();return;}const t=e.touches[0];startDrag(e.target,t.clientX,t.clientY,t.identifier,'touch');},{passive:true});
 dialog.addEventListener('touchmove',e=>{if(drag?.kind!=='touch')return;if(e.touches.length!==1){settle();return;}const t=e.touches[0];moveDrag(t.clientX,t.clientY,e);},{passive:false});
 dialog.addEventListener('touchend',e=>{if(drag?.kind!=='touch')return;const t=[...e.changedTouches].find(t=>t.identifier===drag.id);if(t)endDrag(t.clientX,t.clientY,e);},{passive:false});
 dialog.addEventListener('touchcancel',()=>{if(drag?.kind==='touch'){suppressClickUntil=performance.now()+400;settle();}},{passive:true});
 dialog.addEventListener('click',e=>{if(closing||performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
 // A fresh pointer gesture is intentional; only the previous gesture's delayed click is fenced.
 window.addEventListener('pointerdown',()=>{if(!closing)suppressClickUntil=0;},true);
 // Consume the delayed touch click even if the dialog has already gone away.
 window.addEventListener('click',e=>{if(e.isTrusted&&performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
 viewport?.addEventListener('resize',scheduleFit);viewport?.addEventListener('scroll',scheduleFit);window.addEventListener('resize',scheduleFit);window.addEventListener('orientationchange',scheduleFit);window.addEventListener('pageshow',scheduleFit);input.addEventListener('focus',scheduleFit);description.addEventListener('focus',scheduleFit);
 new MutationObserver(refresh).observe(overlay,{attributes:true,attributeFilter:['class','data-editor-tab','data-design-pane']});source.addEventListener('input',refresh);
 window.MemoComposer={open,refresh,saveInline,resetInline,saveAndClose:save,enter:source=>{if(saveInline()){DayEditorDesigns.showPane('memo');open(source);}},openEvent:event=>open(event?{date:event.date,eventId:event.id,memoId:event.memoId&&DayEntryCore.notes(readState(),event.date)[event.memoId]?event.memoId:null}:null)};document.getElementById('memo-tab').onclick=()=>MemoComposer.enter(null);refresh();
})();
