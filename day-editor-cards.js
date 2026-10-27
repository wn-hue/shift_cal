/* One staged work form, with the detailed memo and agenda still available in the next tab. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),overlay=$('modal-override'),work=$('work-panel');
 const icons={
  day:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  night:'<path d="M20.5 14A8.5 8.5 0 0 1 10 3.5 8.5 8.5 0 1 0 20.5 14Z"/>',
  off:'<path d="M3 19V8m18 11v-8a2 2 0 0 0-2-2H3m0 7h18M6 9V5h12v4"/><path d="M7 12h3m4 0h3"/>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z"/>',
  moonStar:'<path d="M20 15A8 8 0 0 1 9 4a8 8 0 1 0 11 11Z"/><path d="m18 2 1 3 3 1-3 1-1 3-1-3-3-1 3-1Z"/>',
  noOt:'<path d="M9 2h6m-3 0v3m6 0 2 2M12 9v4l2 1"/><path d="M19 12a7 7 0 1 0-7 8"/><circle cx="18" cy="18" r="4"/><path d="m16.5 16.5 3 3m0-3-3 3"/>',
  leave:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-12 6 2 2 4-4"/>',
  before:'<path d="M3 18h18M5 14a7 7 0 0 1 14 0M12 2v3M3 6l2 2m16-2-2 2M9 21h6"/>',
  after:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  unpaid:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18m-13 5h4m5-1v3m0 2h.01"/>'
 };
 const svg=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
 const choices={DAY:['주간','day'],NIGHT:['야간','night'],OFF:['휴무','off'],SPECIAL_DAY:['주간 특근','star'],SPECIAL_NIGHT:['야간 특근','moonStar'],SPECIAL_DAY_NO_OT:['주간 특근','star','잔업X'],SPECIAL_NIGHT_NO_OT:['야간 특근','moonStar','잔업X'],NO_OT:['O.T 해제','noOt'],LEAVE:['연차','leave'],HALF_PRE:['반차 전','before'],HALF_POST:['반차 후','after'],UNPAID_OFF:['무급 휴무','unpaid'],UNPAID_HALF_PRE:['무반 전','before'],UNPAID_HALF_POST:['무반 후','after']};
 for(const button of work.querySelectorAll('.opt-btn')){
  const entry=choices[button.dataset.override];if(!entry)continue;
  const label=button.querySelector('span:not(.selection-check)');label.textContent=entry[0];label.className='day-choice-label';
  button.insertAdjacentHTML('afterbegin',svg(entry[1]));
  if(entry[2]){const detail=document.createElement('small');detail.textContent=entry[2];label.append(detail);}
 }
 work.querySelector(':scope>.override-section-title').textContent='근태 · 휴가';
 const note=document.createElement('section');note.id='work-inline-note';
 note.innerHTML='<label for="work-memo-input">메모</label><textarea id="work-memo-input" rows="1" maxlength="16000" placeholder="오늘의 메모 남기기"></textarea>';
 work.append(note);
 const input=$('work-memo-input'),memo=$('modal-memo-input');
 // Both views edit the same unsaved draft; nothing is persisted by typing or tab changes.
 input.addEventListener('input',()=>{memo.value=input.value;});
 memo.addEventListener('input',()=>{input.value=memo.value;});
 const footer=document.createElement('footer');footer.className='day-editor-footer';
 const save=$('apply-preview');save.textContent='변경사항 저장하기';footer.append(save);overlay.querySelector('.override-sheet').append(footer);
 $('day-note').querySelector('.btn-save').onclick=()=>ShiftTools.saveDay();
 const open=openOverrideModal;openOverrideModal=function(...args){open(...args);input.value=memo.value;};
 // Sync draft changes made elsewhere without copying translated or rendered text back to storage.
 const tab=switchEditorTab;switchEditorTab=function(...args){input.value=memo.value;return tab(...args);};
 overlay.classList.add('day-card-editor');
})();
