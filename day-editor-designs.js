/* One editing transaction, three deliberately different presentations. Theme IDs are stable. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),overlay=$('modal-override'),sheet=overlay.querySelector('.override-sheet'),content=sheet.querySelector('.editor-content'),work=$('work-panel');
 const labels={DAY:'주간',NIGHT:'야간',OFF:'휴무',SPECIAL_DAY:'주간특근',SPECIAL_NIGHT:'야간특근',SPECIAL_DAY_NO_OT:'주간특근 · 잔업 없음',SPECIAL_NIGHT_NO_OT:'야간특근 · 잔업 없음',NO_OT:'O.T 해제',LEAVE:'연차',HALF_PRE:'반차(전)',HALF_POST:'반차(후)',UNPAID_OFF:'무급휴무',UNPAID_HALF_PRE:'무급반차(전)',UNPAID_HALF_POST:'무급반차(후)'};
 const shorts={DAY:'주',NIGHT:'야',OFF:'휴',SPECIAL_DAY:'주특',SPECIAL_NIGHT:'야특',SPECIAL_DAY_NO_OT:'주특',SPECIAL_NIGHT_NO_OT:'야특',NO_OT:'OT'};
 const svg=path=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
 const icons={DAY:svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>'),NIGHT:svg('<path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/>'),OFF:svg('<rect x="4" y="5" width="16" height="16" rx="4"/><path d="M8 3v4m8-4v4M4 11h16m-11 5 2 2 4-4"/>'),NO_OT:svg('<circle cx="12" cy="13" r="8"/><path d="M9 2h6m-3 7v4l3 2M6 19 18 7"/>')};
 Object.assign(icons,{
  LEAVE:svg('<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16"/>'),
  HALF_PRE:svg('<circle cx="12" cy="12" r="8"/><path d="M12 4v16M12 4a8 8 0 0 0 0 16Z" fill="currentColor" stroke="none"/>'),
  HALF_POST:svg('<circle cx="12" cy="12" r="8"/><path d="M12 4v16M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none"/>'),
  UNPAID_OFF:svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18m-6 5h3"/>'),
  UNPAID_HALF_PRE:svg('<circle cx="12" cy="12" r="8"/><path d="M12 7v5H8m7 3h3"/>'),
  UNPAID_HALF_POST:svg('<circle cx="12" cy="12" r="8"/><path d="M12 7v5h4m-8 3h3"/>')
 });
 function make(tag,cls,html){const e=document.createElement(tag);e.className=cls;e.innerHTML=html;return e;}
 const bar=make('div','design-toolbar',`<button type="button" id="design-back" aria-label="근무 변경 닫기">${svg('<path d="m15 5-7 7 7 7"/>')}<span>취소</span></button><strong id="design-title">근무 변경</strong><div class="design-toolbar-actions"><button type="button" id="design-done" aria-label="변경사항 저장">${svg('<path d="m5 12 4 4L19 6"/>')}</button></div>`);
 sheet.prepend(bar);bar.querySelector('.design-toolbar-actions').prepend($('editor-sticker-preview'));
 bar.prepend($('editor-dismiss'));
 const hero=make('header','design-hero','<p id="design-date"></p><h2 id="design-question">어떤 근무로<br>바꿀까요?</h2><p class="design-base"><span>기본 근무</span> <strong id="design-base-name"></strong></p><div class="design-week" role="group" aria-label="날짜 선택"></div><p class="design-bubble" aria-live="polite"><span id="design-bubble-date"></span><strong id="design-bubble-shift"></strong></p>');
 content.prepend(hero);
 const dateNav=make('div','kakao-date-nav',`<button type="button" id="kakao-prev-day" aria-label="이전 날짜">${svg('<path d="m14 5-7 7 7 7"/>')}</button><strong id="kakao-date"></strong><button type="button" id="kakao-next-day" aria-label="다음 날짜">${svg('<path d="m10 5 7 7-7 7"/>')}</button>`);hero.append(dateNav);
 const nav=make('div','design-tabs','<button type="button" data-pane="work" aria-pressed="true">근무</button><button type="button" data-pane="attendance" aria-pressed="false">근태 · 휴가</button><button type="button" data-pane="memo" aria-pressed="false">메모</button>');hero.after(nav);
 const main=work.querySelector('.shift-scroll'),attendance=work.querySelector('.attendance-choices');
 main.classList.add('design-main-choices');
 const daySummary=make('section','kakao-summary','<div class="kakao-base-bubble"><small>기본 근무</small><div class="kakao-summary-shift"><span id="kakao-base-badge" class="kakao-summary-badge" aria-hidden="true"></span><strong id="kakao-base-label"></strong></div></div><div class="kakao-selection-bubble"><small id="kakao-selection-caption"></small><div class="kakao-summary-shift"><span id="kakao-selection-badge" class="kakao-summary-badge" aria-hidden="true"></span><strong id="kakao-selection-label"></strong></div><p id="kakao-change-copy"></p></div><p id="kakao-save-state" aria-live="polite"></p></section>');
 main.before(daySummary,make('h3','kakao-choice-heading','근무 고르기'));
 const extra=make('details','design-extra','<summary><span class="design-row-icon">'+icons.NO_OT+'</span><span><strong>특근 · O.T 설정</strong><small>추가 근무와 잔업 설정</small></span><span class="design-chevron" aria-hidden="true">›</span></summary><div class="shift-scroll design-extra-choices" role="group" aria-label="특근과 잔업 선택"></div>');
 const attend=make('details','design-attendance','<summary><span class="design-row-icon">'+icons.OFF+'</span><span><strong>근태 · 휴가</strong><small id="design-attendance-value">선택 안 함</small></span><span class="design-chevron" aria-hidden="true">›</span></summary>');
 main.after(extra,attend);attend.append(attendance);
 const memoLink=make('button','design-memo-link',`<span class="design-row-icon">${svg('<path d="M5 3h14v18H5zM9 8h6m-6 4h6m-6 4h3"/>')}</span><span><strong>메모 · 일정</strong><small id="design-note-value">추가할 내용이 있나요?</small></span><span class="design-chevron" aria-hidden="true">›</span>`);memoLink.type='button';memoLink.onclick=()=>window.MemoComposer?MemoComposer.enter(null):switchEditorTab('memo');attend.after(memoLink);
 const reset=$('modal-override').querySelector('.override-reset');reset.classList.add('design-reset');memoLink.after(reset);reset.querySelector('span').textContent='기본근무로 복구';
 const footer=make('footer','design-footer','<div class="design-change" aria-live="polite"><strong id="design-change-label"></strong><small id="design-change-status"></small></div><button type="button" id="design-cancel">취소</button>');
 sheet.append(footer);footer.append($('apply-preview'));
 const preview=$('change-preview');const pay=make('details','design-pay','<summary>예상 급여 변화</summary>');preview.before(pay);pay.append(preview);const payEmpty=make('p','kakao-pay-empty','근무를 선택하면 예상 급여 변화를 확인할 수 있어요.');pay.append(payEmpty);
 // Keep the original buttons, validators and palette hooks; only their visual children change.
 const options=[...work.querySelectorAll('.shift-scroll .opt-btn')];
 for(const b of options){const type=b.dataset.override,label=labels[type];const badge=document.createElement('span');badge.className='design-choice-badge';badge.textContent=shorts[type]||'−';const icon=make('span','design-choice-icon',icons[type]||icons[type.includes('NIGHT')?'NIGHT':'DAY']);const text=document.createElement('span');text.className='design-choice-label';text.textContent=label;const check=b.querySelector('.selection-check');b.replaceChildren(badge,icon,text,check);b.setAttribute('aria-label',label);if(!['DAY','NIGHT','OFF'].includes(type)&&main.contains(b))extra.querySelector('.shift-scroll').append(b);}
 let pane='work',saving=false,opening=false;
 const design=()=>document.body.dataset.prefTheme==='test3'?'apple':document.body.dataset.prefTheme==='test4'?'kakao':'toss';
 const dateObj=key=>new Date(key+'T12:00:00');
 const tr=s=>window.AppI18n?.t(s)||s;
 const locale=()=>({ko:'ko-KR',en:'en',zh:'zh-CN',ja:'ja'}[localStorage.getItem('shift_display_language')]||'ko-KR');
 const dateLabel=date=>new Intl.DateTimeFormat(locale(),{month:'long',day:'numeric',weekday:'long'}).format(date);
 function text(id,value){const e=$(id);if(e.textContent!==value)e.textContent=value;}
 function memoDirty(){return $('modal-memo-input').value.trim()!==(dayMemos[selectedDateStr]||'').trim();}
 function dirty(){return !!ShiftTools.pending()||memoDirty();}
 function goDate(key){if(key===selectedDateStr)return;if(!ShiftTools.canLeave()||!DayScheduler.canLeave())return;if(memoDirty()&&!confirm('작성 중인 메모를 저장하지 않고 이동할까요?'))return;const d=dateObj(key);currentCalDate=new Date(d.getFullYear(),d.getMonth(),1);renderCalendar();openOverrideModal(key,d,getActualShift(d,currentGroup));}
 function week(){const host=hero.querySelector('.design-week');host.replaceChildren();const d=dateObj(selectedDateStr),start=new Date(d);start.setDate(d.getDate()-(design()==='kakao'?(d.getDay()+6)%7:d.getDay()));for(let i=0;i<7;i++){const day=new Date(start);day.setDate(start.getDate()+i);const key=toDateKey(day.getFullYear(),day.getMonth(),day.getDate()),shift=getActualShift(day,currentGroup);const b=make('button','design-week-day','<small></small><strong></strong><span class="design-week-shift"></span>');b.type='button';b.querySelector('small').textContent=new Intl.DateTimeFormat(locale(),{weekday:'short'}).format(day);b.querySelector('strong').textContent=day.getDate();b.querySelector('span').textContent=shorts[shift.type]||shift.name;b.querySelector('span').dataset.shift=shift.type;b.setAttribute('aria-label',dateLabel(day));b.setAttribute('aria-pressed',String(key===selectedDateStr));b.dataset.date=key;b.onclick=()=>goDate(key);host.append(b);}}
 function update(){if(!selectedDateStr)return;const variant=design();
  if(nav.dataset.variant!==variant){nav.dataset.variant=variant;nav.innerHTML=(variant==='kakao'?[['work','근무'],['memo','메모'],['pay','급여']]:[['work','근무'],['attendance','근태 · 휴가'],['memo','메모']]).map(([key,label])=>`<button type="button" data-pane="${key}" aria-pressed="false">${label}</button>`).join('');}overlay.dataset.editorDesign=variant;overlay.dataset.designPane=pane;const d=dateObj(selectedDateStr),base=getBaseShift(d,currentGroup),pending=ShiftTools.pending(),type=pending?(pending.type||base.type):(overrides[selectedDateStr]||base.type),label=labels[type]||getActualShift(d,currentGroup).name;
  text('design-date',dateLabel(d));text('design-base-name',labels[base.type]);text('design-title',variant==='kakao'?'나의 하루':pane==='memo'?'메모':pane==='attendance'?'근태 · 휴가':'근무 변경');text('design-change-label',pending?(tr(labels[getActualShift(d,currentGroup).type]||getActualShift(d,currentGroup).name)+' → '+tr(label)):label);text('design-change-status',dirty()?'아직 저장하지 않았어요.':'저장된 근무');text('design-bubble-date',dateLabel(d));text('design-bubble-shift',pending?' → '+tr(label):label);text('design-attendance-value',labels[type]&&!shorts[type]?label:'선택 안 함');text('design-note-value',$('modal-memo-input').value.trim()?'메모가 있어요':'추가할 내용이 있나요?');
  text('apply-preview',dirty()?'변경사항 저장':'닫기');$('design-done').disabled=false;pay.hidden=variant==='kakao'?pane!=='pay':!pending;preview.hidden=!pending;payEmpty.hidden=!!pending||variant!=='kakao';if(variant==='kakao'&&pane==='pay')pay.open=true;
  text('kakao-date',dateLabel(d));text('kakao-base-label',labels[base.type]);text('kakao-base-badge',shorts[base.type]);$('kakao-base-badge').dataset.shift=base.type;
  daySummary.querySelector('.kakao-selection-bubble').hidden=!pending&&!overrides[selectedDateStr];text('kakao-selection-caption',pending?'변경할 근무':'현재 근무');text('kakao-selection-label',label);text('kakao-selection-badge',shorts[type]||'✓');$('kakao-selection-badge').dataset.shift=type;
  text('kakao-change-copy',pending?tr(labels[base.type])+' → '+tr(label):'');$('kakao-change-copy').hidden=!pending;text('kakao-save-state',dirty()?'아직 저장하지 않았어요.':'저장된 근무');
  if(variant==='kakao'){attend.hidden=attendance.hidden;memoLink.querySelector('strong').textContent='오늘의 메모 남기기';}else{attend.hidden=false;memoLink.querySelector('strong').textContent='메모';}
  for(const b of nav.children)b.setAttribute('aria-pressed',String(b.dataset.pane===pane));
 }
 function showPane(next){if(next!=='memo'&&!$('event-form').hidden){if(!DayScheduler.canLeave())return;DayScheduler.open(selectedDateStr);}pane=next;switchEditorTab(next==='memo'?'memo':'work');if(next==='attendance')attend.open=true;content.scrollTop=0;update();}
 for(const [id,delta]of [['kakao-prev-day',-1],['kakao-next-day',1]])$(id).onclick=()=>{const d=dateObj(selectedDateStr);d.setDate(d.getDate()+delta);goDate(toDateKey(d.getFullYear(),d.getMonth(),d.getDate()));};
 nav.addEventListener('click',e=>{const b=e.target.closest('button');if(b){if(b.dataset.pane==='memo'&&window.MemoComposer)MemoComposer.enter(null);else showPane(b.dataset.pane);}});
 const switchTab=switchEditorTab;switchEditorTab=function(tab){if(!opening&&tab==='work'&&!$('event-form').hidden){if(!DayScheduler.canLeave())return;DayScheduler.open(selectedDateStr);}switchTab(tab);if(tab==='stickers')return;if(tab==='memo')pane='memo';else if(pane==='memo')pane='work';update();};
 const open=openOverrideModal;openOverrideModal=function(...args){pane='work';overlay.dataset.editorDesign=design();extra.open=design()==='apple'||design()==='kakao';attend.open=design()==='kakao';pay.open=false;opening=true;try{open(...args);}finally{opening=false;}week();update();};
 const choose=setDayOverride;setDayOverride=function(type){choose(type);update();};
 // All presentations save the same pending shift and memo; event forms keep their own save action.
 // Memo completion commits once, then returns to the saved day detail.
 function save(memoValue,options={}){
  if(!$('event-form').hidden){$('event-form').requestSubmit();return false;}
  const pending=ShiftTools.pending();if(pending&&pending.date!==selectedDateStr)return false;if(pending){const reason=validateDayOverride(selectedDateStr,pending.type);if(reason){alert(reason);return false;}}
  const val=typeof memoValue==='string'?memoValue.trim():$('modal-memo-input').value.trim();
  if(options.bundle){try{AccountDataCore.normalize(options.bundle)}catch(error){alert(error.message);return false;}}
  if(options.memoItems&&(!DayMemosCore.valid(options.memoItems)||DayMemosCore.text(options.memoItems)!==val))return false;
  if(val.length>16000){alert('하루 메모는 총 16,000자까지 저장할 수 있어요.');return false;}
  if(!options.bundle&&!options.memoItems&&!pending&&val===(dayMemos[selectedDateStr]||'').trim()){if(!options.keepOpen)closeModalDirect();return true;}
  saving=true;try{
   if(options.bundle){const previous=Object.fromEntries(Object.keys(options.bundle).map(k=>[k,localStorage.getItem(k)]));try{for(const [key,value]of Object.entries(options.bundle))localStorage.setItem(key,JSON.stringify(value));}catch(error){for(const [key,value]of Object.entries(previous)){try{value===null?localStorage.removeItem(key):localStorage.setItem(key,value)}catch{}}alert('저장 공간을 확인해 주세요. 작성한 내용은 그대로 남아 있어요.');return false;}
    dayMemos=options.bundle.shift_day_memos;
   }
   if(!ShiftTools.commit())return false;
   if(options.memoItems){let items;try{items=JSON.parse(localStorage.getItem(DayMemosCore.key)||'{}')}catch{items={}}
    if(Object.keys(options.memoItems).length)items[selectedDateStr]=options.memoItems;else delete items[selectedDateStr];
    localStorage.setItem(DayMemosCore.key,JSON.stringify(items));
   }
   if(val)dayMemos[selectedDateStr]=val;else delete dayMemos[selectedDateStr];
   localStorage.setItem('shift_day_memos',JSON.stringify(dayMemos));$('modal-memo-input').value=val;
   window.AccountSync?.changed();window.GoogleSync?.changed(selectedDateStr);renderCalendar();if(options.keepOpen){week();showPane('memo');}else closeModalDirect();return true;
  }finally{saving=false;}
 }
 $('apply-preview').onclick=save;$('design-done').onclick=save;saveMemoDirect=save;
 const close=closeModalDirect;closeModalDirect=function(){if(!saving&&dirty()&&!confirm('변경사항을 저장하지 않고 닫을까요?'))return;close();};
 $('design-back').onclick=()=>pane!=='work'?showPane('work'):closeModalDirect();$('design-cancel').onclick=()=>closeModalDirect();
 $('modal-memo-input').addEventListener('input',update);
 let lastTheme=document.body.dataset.prefTheme,lastLanguage=document.body.dataset.uiLanguage;
 new MutationObserver(()=>{const theme=document.body.dataset.prefTheme,language=document.body.dataset.uiLanguage;if(theme===lastTheme&&language===lastLanguage)return;const themeChanged=theme!==lastTheme;lastTheme=theme;lastLanguage=language;if(overlay.classList.contains('active')){if(themeChanged){extra.open=design()!=='toss';attend.open=design()==='kakao';overlay.dataset.editorDesign=design();WorkEditor.filterOptions(selectedDateStr);}update();week();}}).observe(document.body,{attributes:true,attributeFilter:['data-pref-theme','data-ui-language']});
 new MutationObserver(()=>{overlay.dataset.designEvent=String(!$('event-form').hidden)}).observe($('event-form'),{attributes:true,attributeFilter:['hidden']});
 window.DayEditorDesigns={save,showPane};
})();
