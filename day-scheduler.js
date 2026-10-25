/* Stored locally and included in account sync. No background-delivery promise on the web. */
(()=>{'use strict';
 const C=DaySchedulerCore,$=id=>document.getElementById(id),panel=$('memo-panel');
 let data={},editing=null,original='',loadedDate='',announced=new Set();
 const memo=document.createElement('div');memo.id='day-note';while(panel.firstChild)memo.append(panel.firstChild);
 panel.append(memo);
 const agenda=document.createElement('section');agenda.className='day-agenda';agenda.innerHTML='<div class="agenda-heading"><h3>이날의 일정</h3><button type="button" id="event-add">+ 일정 추가</button></div><div id="event-list"></div><p id="event-status" role="status"></p>';
 panel.prepend(agenda);
 const form=document.createElement('form');form.id='event-form';form.hidden=true;form.innerHTML=`
 <div class="agenda-heading"><h3 id="event-form-title">새 일정</h3><button type="button" id="event-cancel">취소</button></div>
 <label class="event-title-label" for="event-title">제목</label><input id="event-title" class="event-title-input" placeholder="어떤 일정인가요?" maxlength="120" required>
 <label class="event-allday">하루 종일<input id="event-all-day" type="checkbox" role="switch"></label>
 <div class="event-dates"><div><label for="event-start-date">시작</label><input id="event-start-date" type="date" required><label class="sr-only" for="event-start-time">시작 시간</label><input id="event-start-time" type="time" required></div><div><label for="event-end-date">종료</label><input id="event-end-date" type="date" required><label class="sr-only" for="event-end-time">종료 시간</label><input id="event-end-time" type="time" required></div></div>
 <label for="event-location">장소</label><input id="event-location" placeholder="장소를 입력해 주세요" maxlength="300">
 <label for="event-reminder">알림</label><select id="event-reminder"><option value="">알림 없음</option><option value="0">일정 시작할 때</option><option value="5">5분 전</option><option value="10">10분 전</option><option value="30">30분 전</option><option value="60">1시간 전</option><option value="1440">1일 전</option></select>
 <p class="event-help" id="event-alarm-help">웹 화면이 열려 있을 때 알려드려요. 잠금 화면 알림은 저장 후 휴대폰 캘린더에 추가해 설정해 주세요.</p>
 <details class="event-more"><summary>설명 추가</summary><label class="sr-only" for="event-notes">일정 설명</label><textarea id="event-notes" maxlength="4000" placeholder="기억할 내용을 적어 주세요"></textarea></details>
 <p id="event-error" role="alert"></p><button type="submit" class="btn-save" id="event-save">일정 저장</button><button type="button" id="event-delete" hidden>일정 삭제</button>`;
 panel.append(form);
 const toast=document.createElement('aside');toast.id='schedule-reminder';toast.hidden=true;toast.setAttribute('role','alert');toast.innerHTML='<strong>일정 알림</strong><p></p><button type="button">확인</button>';toast.querySelector('button').onclick=()=>toast.hidden=true;document.body.append(toast);
 function begin(){try{data=AccountDataCore.normalize({[C.key]:JSON.parse(localStorage.getItem(C.key)||'null')})[C.key]||{};}catch{data={};}}
 function read(){return {title:$('event-title').value.trim(),allDay:$('event-all-day').checked,start:$('event-start-date').value+'T'+($('event-all-day').checked?'00:00':$('event-start-time').value),end:$('event-end-date').value+'T'+($('event-all-day').checked?'00:00':$('event-end-time').value),location:$('event-location').value.trim(),notes:$('event-notes').value.trim(),reminder:$('event-reminder').value===''?null:Number($('event-reminder').value)};}
 function dirty(){return !form.hidden&&JSON.stringify(read())!==original;}
 function discard(){return !dirty()||confirm('작성 중인 일정을 저장하지 않고 닫을까요?');}
 function timeFields(){const all=$('event-all-day').checked;for(const id of ['event-start-time','event-end-time']){$(id).hidden=all;$(id).required=!all;} $('event-reminder').options[1].textContent=all?'당일 오전 9시':'일정 시작할 때';$('event-alarm-help').textContent=(all?'종일 일정은 오전 9시를 기준으로 알려드려요. ':'')+'웹 화면이 열려 있을 때 알려드려요. 잠금 화면 알림은 저장 후 휴대폰 캘린더에 추가해 설정해 주세요.';}
 function edit(entry){
  if(!discard())return;
  editing=entry?{id:entry.id,date:entry.date}:null;
  const start=entry?.start||selectedDateStr+'T09:00',end=entry?.end||selectedDateStr+'T10:00';
  $('event-title').value=entry?.title||'';$('event-all-day').checked=entry?.allDay||false;
  $('event-start-date').value=start.slice(0,10);$('event-start-time').value=start.slice(11);$('event-end-date').value=end.slice(0,10);$('event-end-time').value=end.slice(11);
  $('event-location').value=entry?.location||'';$('event-notes').value=entry?.notes||'';$('event-reminder').value=entry?.reminder==null?'':String(entry.reminder);
  $('event-form-title').textContent=entry?'일정 수정':'새 일정';$('event-delete').hidden=!entry;$('event-error').textContent='';
  form.querySelector('details').open=!!entry?.notes;timeFields();original=JSON.stringify(read());if(editing)editing.source=read();form.hidden=false;memo.hidden=true;agenda.hidden=true;
  $('modal-override').querySelector('.editor-content').scrollTop=0;
 }
 function list(){
  begin();const host=$('event-list');host.replaceChildren();const events=C.onDate(data,selectedDateStr);
  if(!events.length){const p=document.createElement('p');p.className='event-empty';p.textContent='아직 일정이 없어요.';host.append(p);}
  for(const e of events){
   const row=document.createElement('div');row.className='event-card';const button=document.createElement('button');button.type='button';button.className='event-open';button.setAttribute('aria-label',e.title+' 일정 수정');
   const title=document.createElement('strong');title.textContent=e.title;const desc=document.createElement('span');desc.textContent=(e.allDay?'종일':e.start.slice(11)+' – '+(e.end.slice(0,10)!==e.start.slice(0,10)?e.end.slice(5,10).replace('-','/')+' ':'')+e.end.slice(11))+(e.location?' · '+e.location:'');
   const meta=document.createElement('small');meta.textContent=e.reminder===null?'알림 없음':(e.allDay?'오전 9시 기준 · ':'')+(e.reminder===0?'시작 알림':e.reminder===1440?'1일 전 알림':e.reminder+'분 전 알림');button.append(title,desc,meta);button.onclick=()=>edit(e);
   const exportButton=document.createElement('button');exportButton.className='event-export';exportButton.type='button';exportButton.textContent='캘린더로 내보내기';exportButton.setAttribute('aria-label',e.title+' 캘린더로 내보내기');exportButton.onclick=()=>exportEvent(e);row.append(button,exportButton);host.append(row);
  }
 }
 function overview(){form.hidden=true;memo.hidden=false;agenda.hidden=false;editing=null;original='';list();}
 function open(date){loadedDate=date;overview();$('event-status').textContent='';}
 function persist(next){const normalized=AccountDataCore.normalize({[C.key]:next})[C.key];localStorage.setItem(C.key,JSON.stringify(normalized));data=normalized;window.AccountSync?.changed();renderCalendar();}
 form.onsubmit=e=>{e.preventDefault();try{
  const event=read(),date=event.start.slice(0,10);if(!event.allDay&&(!Number.isFinite(new Date(event.start).getTime())||new Date(event.end)<=new Date(event.start)))throw Error('종료 시간은 시작 시간보다 늦게 설정해 주세요.');
  begin();if(editing&&!data[editing.date]?.[editing.id])throw Error('다른 기기에서 삭제된 일정이에요. 취소 후 새 일정으로 추가해 주세요.');
  if(editing&&!AccountDataCore.equal(data[editing.date][editing.id],editing.source))throw Error('다른 기기에서 변경된 일정이에요. 취소 후 최신 내용을 확인해 주세요.');
  const next=JSON.parse(JSON.stringify(data)),id=editing?.id||crypto.randomUUID();if(editing){delete next[editing.date][id];if(!Object.keys(next[editing.date]).length)delete next[editing.date];}
  (next[date]??={})[id]=event;persist(next);overview();$('event-status').textContent=date===selectedDateStr?'일정을 저장했어요.':date.replace(/-/g,'. ')+'에 일정을 저장했어요.';
 }catch(error){$('event-error').textContent=error.message;}};
 $('event-delete').onclick=()=>{if(!editing||!confirm('이 일정을 삭제할까요?'))return;try{begin();const next=JSON.parse(JSON.stringify(data));if(next[editing.date]){delete next[editing.date][editing.id];if(!Object.keys(next[editing.date]).length)delete next[editing.date];}persist(next);overview();$('event-status').textContent='일정을 삭제했어요.';}catch(e){$('event-error').textContent=e.message;}};
 $('event-add').onclick=()=>edit(null);$('event-cancel').onclick=()=>{if(discard())overview();};$('event-all-day').onchange=timeFields;
 $('event-start-date').onchange=()=>{if($('event-end-date').value<$('event-start-date').value)$('event-end-date').value=$('event-start-date').value;};
 async function exportEvent(e){
  const file=new File([C.ics(e)],'교대루틴-일정.ics',{type:'text/calendar;charset=utf-8'});
  try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:e.title});}
   else{const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
   $('event-status').textContent='캘린더 앱에서 가져온 뒤 알림 설정을 확인해 주세요. 여기서 수정·삭제해도 내보낸 일정은 바뀌지 않아요.';
  }catch(error){if(error.name!=='AbortError')$('event-status').textContent='내보내지 못했어요. 다른 브라우저에서 다시 시도해 주세요.';}
 }
 function decorate(cell,date,adjacent){
  if(adjacent)return;const events=C.onDate(data,date);if(!events.length)return;cell.classList.add('has-day-event');
  const tag=document.createElement('span');tag.className='day-event-tag';tag.textContent=events[0].title+(events.length>1?' +'+(events.length-1):'');tag.title=events.map(e=>e.title).join(', ');cell.append(tag);cell.setAttribute('aria-label',(cell.getAttribute('aria-label')||date)+', 일정 '+tag.title);
  tag.onclick=e=>{e.stopPropagation();const d=new Date(date+'T12:00');openOverrideModal(date,d,getActualShift(d,currentGroup));switchEditorTab('memo');};
 }
 function tick(){
  if(document.visibilityState==='hidden')return;begin();const now=Date.now();
  let seen={};try{const stored=JSON.parse(localStorage.getItem('shift_event_reminders_seen')||'{}');if(stored&&typeof stored==='object'&&!Array.isArray(stored))seen=stored;}catch{}
  const due=C.entries(data).filter(e=>{const at=C.alarmTime(e),token=C.token(e);return at!==null&&at<=now&&now-at<300000&&!seen[token]&&!announced.has(token);});
  if(!due.length)return;
  for(const e of due){const token=C.token(e);seen[token]=now;announced.add(token);}
  try{for(const [k,v]of Object.entries(seen))if(now-v>172800000)delete seen[k];localStorage.setItem('shift_event_reminders_seen',JSON.stringify(seen));}catch{}
  toast.querySelector('p').textContent=due.map(e=>e.title+' · '+(e.allDay?'종일':e.start.slice(11))).join('\n');toast.hidden=false;
 }
 const close=closeModalDirect;closeModalDirect=function(){if(!discard())return;form.hidden=true;if($('modal-override').contains(document.activeElement))document.activeElement.blur();close();};
 window.addEventListener('storage',e=>{if(e.key===C.key||e.key===null){renderCalendar();if(form.hidden)list();}});
 window.addEventListener('shift-account-changed',()=>{form.hidden=true;toast.hidden=true;announced.clear();if(loadedDate)open(selectedDateStr);});
 document.addEventListener('visibilitychange',tick);setInterval(tick,15000);
 window.DayScheduler={begin,open,decorate,tick,canLeave:discard};renderCalendar();tick();
})();
