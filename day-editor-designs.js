/* One work-change sheet for every calendar theme, with the same actions as the iPhone app. */
(() => {
 'use strict';
 const $ = id => document.getElementById(id);
 const overlay = $('modal-override');
 const sheet = overlay.querySelector('.override-sheet');
 const content = sheet.querySelector('.editor-content');
 const work = $('work-panel');
 const labels = {
  DAY: '주간', NIGHT: '야간', OFF: '휴무', SPECIAL_DAY: '주간 특근', SPECIAL_NIGHT: '야간 특근',
  SPECIAL_DAY_NO_OT: '주간 특근 · 잔업 없음', SPECIAL_NIGHT_NO_OT: '야간 특근 · 잔업 없음', NO_OT: '잔업 없음',
  LEAVE: '연차', HALF_PRE: '반차(전)', HALF_POST: '반차(후)', UNPAID_OFF: '무급 휴무',
  UNPAID_HALF_PRE: '무급반차(전)', UNPAID_HALF_POST: '무급반차(후)'
 };
 const paidTypes = ['LEAVE', 'HALF_PRE', 'HALF_POST'];
 const unpaidTypes = ['UNPAID_OFF', 'UNPAID_HALF_PRE', 'UNPAID_HALF_POST'];
 const bolt = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.6 2.5a.7.7 0 0 1 1.2.7L13 10h5.3a.8.8 0 0 1 .6 1.3l-8.5 10.2a.7.7 0 0 1-1.2-.7L11 14H5.7a.8.8 0 0 1-.6-1.3z"/></svg>';
 const tr = text => window.AppI18n?.t(text) || text;
 const locale = () => ({ko: 'ko-KR', en: 'en', zh: 'zh-CN', ja: 'ja'}[localStorage.getItem('shift_display_language')] || 'ko-KR');
 const dateObj = key => new Date(key + 'T12:00:00');
 const dateLabel = date => new Intl.DateTimeFormat(locale(), {month: 'long', day: 'numeric', weekday: 'long'}).format(date);
 function make(tag, cls, html = '') {
  const element = document.createElement(tag);
  element.className = cls;
  element.innerHTML = html;
  return element;
 }
 function text(id, value) {
  const element = $(id);
  if (element.textContent !== value) element.textContent = value;
 }
 const toolbar = make('div', 'design-toolbar', `
  <button type="button" id="design-back" aria-label="근무 변경 닫기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button>
  <strong id="design-title" role="heading" aria-level="2">근무 변경</strong>
  <div class="design-toolbar-actions"></div>`);
 const reset = sheet.querySelector('.override-reset');
 reset.classList.add('design-reset');
 reset.removeAttribute('aria-pressed');
 toolbar.querySelector('.design-toolbar-actions').append(reset);
 toolbar.prepend($('editor-dismiss'));
 sheet.prepend(toolbar);
 sheet.setAttribute('aria-labelledby', 'design-title');

 const hero = make('header', 'design-hero', `
  <div class="design-date-summary">
   <details class="design-date-navigation">
    <summary id="design-date"></summary>
    <div class="design-date-actions">
     <button type="button" data-offset="-1">이전 날짜</button>
     <button type="button" data-offset="1">다음 날짜</button>
    </div>
   </details>
   <p class="design-base"><span>기본 근무</span><strong id="design-base-name"></strong></p>
   <p class="design-base" id="design-current" hidden><span>현재 근무</span><span id="design-current-icon" aria-hidden="true"></span><strong id="design-current-name"></strong></p>
  </div>
  <div class="design-overtime" hidden>
   <span id="design-ot-label">O.T (잔업)</span>
   <button type="button" id="design-ot-toggle" role="switch" aria-checked="false" aria-labelledby="design-ot-label"><span></span></button>
  </div>`);
 content.prepend(hero);
 const saveError = make('p', 'design-save-error');
 saveError.id = 'design-save-error';
 saveError.hidden = true;
 saveError.setAttribute('role', 'alert');
 hero.after(saveError);

 const main = work.querySelector('.shift-scroll');
 const attendance = work.querySelector('.attendance-choices');
 const extra = make('section', 'design-extra', '<h3>특근 설정</h3><div class="shift-scroll design-extra-choices" role="group" aria-label="특근 선택"></div>');
 const noExtras = make('p', 'design-extra-empty', '연속 근무를 고려해 선택할 수 있는 특근이 없어요.');
 const attendanceButton = make('button', 'design-attendance', `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="4"/><path d="M8 3v4m8-4v4M4 11h16m-11 5 2 2 4-4"/></svg>
  <strong>근태 · 휴가</strong><small id="design-attendance-value">선택 안 함</small><span class="design-chevron" aria-hidden="true">›</span>`);
 attendanceButton.type = 'button';
 attendanceButton.setAttribute('aria-haspopup', 'dialog');
 attendanceButton.setAttribute('aria-controls', 'attendance-picker');
 const picker = make('dialog', 'attendance-picker', `
  <header><h2 id="attendance-picker-title">근태 · 휴가</h2><button type="button" aria-label="뒤로" autofocus>×</button></header>
  <div class="attendance-picker-content">
   <div class="attendance-picker-meta"><p id="attendance-picker-balance"></p><button type="button" id="attendance-picker-settings">연차 설정</button></div>
   <div class="attendance-unpaid shift-scroll" role="group" aria-label="무급 근태 선택"></div>
   <p id="attendance-picker-note" class="attendance-picker-note" hidden></p>
   <p id="attendance-picker-error" class="design-save-error" role="alert" hidden></p>
  </div>`);
 picker.id = 'attendance-picker';
 picker.setAttribute('aria-labelledby', 'attendance-picker-title');
 const unpaid = picker.querySelector('.attendance-unpaid');
 unpaid.before(attendance);
 const memoLink = make('button', 'design-memo-link');
 memoLink.type = 'button';
 main.after(extra, noExtras, attendanceButton, memoLink);
 overlay.append(picker);
 window.AppSheets?.attach(picker);
 for (const button of [...main.querySelectorAll('.opt-btn'), ...attendance.querySelectorAll('.opt-btn')]) {
  const type = button.dataset.override;
  const label = make('span', 'design-choice-label', labels[type]);
  const check = button.querySelector('.selection-check');
  const special = type === 'SPECIAL_DAY' || type === 'SPECIAL_NIGHT';
  button.replaceChildren(label, check);
  button.setAttribute('aria-label', labels[type]);
  if (special) {
   button.prepend(make('span', 'design-choice-icon', bolt));
   extra.querySelector('.shift-scroll').append(button);
  } else if (unpaidTypes.includes(type)) {
   unpaid.append(button);
  }
 }
 main.hidden = true;
 $('apply-preview').hidden = true;

 let pane = 'work';
 let saving = false;
 let opening = false;
 let saveFailed = false;
 const pickError = $('attendance-picker-error');
 const dateNavigation = hero.querySelector('.design-date-navigation');
 const overtime = hero.querySelector('.design-overtime');
 const shiftOption = $('design-ot-toggle');
 function failSave(message) {
  saveFailed = true;
  const target = picker.open ? pickError : saveError;
  target.textContent = tr(message);
  target.hidden = false;
  target.scrollIntoView({block: 'nearest'});
  return false;
 }
 function clearErrors() {
  saveError.hidden = true;
  pickError.hidden = true;
 }
 function flush() {
  if (window.MemoComposer && !MemoComposer.saveInline()) return false;
  return save(undefined, {keepOpen: true, stayPane: true});
 }
 function moveDate(direction) {
  if (!selectedDateStr || !flush()) return false;
  const next = dateObj(selectedDateStr);
  next.setDate(next.getDate() + direction);
  const key = toDateKey(next.getFullYear(), next.getMonth(), next.getDate());
  currentCalDate = new Date(next.getFullYear(), next.getMonth(), 1);
  renderCalendar();
  openOverrideModal(key, next, getActualShift(next, currentGroup));
  return true;
 }
 dateNavigation.addEventListener('click', event => {
  const button = event.target.closest('[data-offset]');
  if (button) moveDate(Number(button.dataset.offset));
 });
 function selectedShift() {
  const pending = ShiftTools.pending();
  return pending
   ? ShiftTools.shiftAt(selectedDateStr, {[selectedDateStr]: pending.type})
   : getActualShift(dateObj(selectedDateStr), currentGroup);
 }
 function regularType(type, base) {
  return type === 'NO_OT' ? base : type.replace('_NO_OT', '');
 }
 function canToggleOT(type, base) {
  return type.startsWith('SPECIAL_') || (['DAY', 'NIGHT'].includes(type) && type === base);
 }
 function update() {
  if (!selectedDateStr) return;
  const date = dateObj(selectedDateStr);
  const base = getBaseShift(date, currentGroup).type;
  const shift = selectedShift();
  const automatic = ShiftTools.shiftAt(selectedDateStr, {[selectedDateStr]: null});
  const type = regularType(shift.type, base);
  const label = labels[type] || shift.name;
  overlay.dataset.designPane = pane;
  text('design-title', pane === 'memo' ? tr('메모') : tr('근무 변경'));
  text('design-date', dateLabel(date));
  text('design-base-name', tr(labels[base]));
  $('design-current').hidden = type === base;
  text('design-current-name', tr(label));
  const currentIcon = $('design-current-icon');
  const showsBolt = type.startsWith('SPECIAL_');
  if (showsBolt && !currentIcon.firstChild) currentIcon.innerHTML = bolt;
  currentIcon.hidden = !showsBolt;
  currentIcon.dataset.shift = type;
  reset.hidden = shift.type === automatic.type && shift.origType === automatic.origType;
  const eligible = canToggleOT(type, base);
  overtime.hidden = !eligible && !type.includes('HALF');
  shiftOption.setAttribute('aria-checked', String(shift.hasOt === true));
  shiftOption.disabled = !eligible;
  attendanceButton.hidden = base === 'OFF' || type === 'OFF';
  text('design-attendance-value', paidTypes.includes(type) || unpaidTypes.includes(type) ? tr(label) : tr('선택 안 함'));
  WorkEditor.filterOptions(selectedDateStr, type);
  main.hidden = true;
  extra.hidden = extra.querySelector('.shift-scroll').hidden;
  noExtras.hidden = !extra.hidden || showsBolt;
  for (const button of picker.querySelectorAll('[data-override]')) {
   button.setAttribute('aria-pressed', String(button.dataset.override === type));
  }
  const balance = WorkEditor.attendanceBalance(selectedDateStr);
  const remaining = new Intl.NumberFormat(locale()).format(balance.remaining);
  text('attendance-picker-balance', tr('남은 연차 {days}일').replace('{days}', remaining));
  const note = $('attendance-picker-note');
  note.hidden = balance.unpaidAvailable;
  text('attendance-picker-note', tr(balance.remaining === 0
   ? '이날 쓴 연차를 취소하면 잔여 연차가 다시 생겨요.'
   : '연차를 모두 쓰면 무급 항목을 선택할 수 있어요.'));
 }
 function showPane(next) {
  if (next !== 'memo' && !$('event-form').hidden) {
   if (!DayScheduler.canLeave()) return;
   DayScheduler.open(selectedDateStr);
  }
  switchEditorTab(next === 'memo' ? 'memo' : 'work');
  content.scrollTop = 0;
  if (next === 'attendance') attendanceButton.click();
 }
 function canOpenAttendance() {
  return overlay.classList.contains('active') && overlay.dataset.sheetClosing !== 'true' && !attendanceButton.hidden;
 }
 function openAttendance() {
  if (!canOpenAttendance() || picker.open) return;
  clearErrors();
  update();
  picker.showModal();
  picker.querySelector('.attendance-picker-content').scrollTop = 0;
 }
 attendanceButton.onclick = openAttendance;
 picker.querySelector('header button').onclick = () => picker.close();
 picker.addEventListener('close', () => {
  if (!overlay.hasAttribute('data-attendance-settings') && canOpenAttendance()) attendanceButton.focus({preventScroll: true});
 });
 $('attendance-picker-settings').onclick = () => {
  if (!window.SettingsUI || overlay.hasAttribute('data-attendance-settings')) return;
  const settings = $('leave-settings-dialog');
  overlay.dataset.attendanceSettings = 'true';
  picker.addEventListener('close', () => {
   if (!canOpenAttendance()) {
    delete overlay.dataset.attendanceSettings;
    return;
   }
   settings.addEventListener('close', () => {
    delete overlay.dataset.attendanceSettings;
    openAttendance();
   }, {once: true});
   SettingsUI.openLeave();
  }, {once: true});
  picker.close();
 };

 const switchTab = switchEditorTab;
 switchEditorTab = function(tab) {
  if (!opening && tab === 'work' && !$('event-form').hidden) {
   if (!DayScheduler.canLeave()) return;
   DayScheduler.open(selectedDateStr);
  }
  switchTab(tab);
  if (tab === 'stickers') return;
  pane = tab === 'memo' ? 'memo' : 'work';
  update();
 };
 const open = openOverrideModal;
 openOverrideModal = function(...args) {
  pane = 'work';
  saveFailed = false;
  clearErrors();
  dateNavigation.open = false;
  overlay.dataset.editorDesign = 'native';
  opening = true;
  try { open(...args); } finally { opening = false; }
  window.MemoComposer?.resetInline();
  update();
 };
 const choose = setDayOverride;
 function applyShift(type) {
  const previous = overrides[selectedDateStr] || null;
  clearErrors();
  if (type === previous) return true;
  const reason = validateDayOverride(selectedDateStr, type);
  if (reason) {
   const target = picker.open ? pickError : saveError;
   target.textContent = tr(reason);
   target.hidden = false;
   return false;
  }
  choose(type);
  if (save(undefined, {keepOpen: true, stayPane: true})) return true;
  ShiftTools.discard();
  saveFailed = false;
  update();
  return false;
 }
 setDayOverride = function(type) {
  if (!selectedDateStr) return;
  if (!overlay.classList.contains('active')) return choose(type);
  const shift = selectedShift();
  const base = getBaseShift(dateObj(selectedDateStr), currentGroup).type;
  if (['SPECIAL_DAY', 'SPECIAL_NIGHT'].includes(type) && canToggleOT(regularType(shift.type, base), base) && !shift.hasOt) {
   type += '_NO_OT';
  }
  if (applyShift(type) && picker.open) picker.close();
 };
 shiftOption.onclick = () => {
  const shift = selectedShift();
  const base = getBaseShift(dateObj(selectedDateStr), currentGroup).type;
  const type = regularType(shift.type, base);
  if (!canToggleOT(type, base)) return;
  const automatic = ShiftTools.shiftAt(selectedDateStr, {[selectedDateStr]: null});
  const next = shift.hasOt ? (type.startsWith('SPECIAL_') ? type + '_NO_OT' : 'NO_OT') : automatic.type === type ? null : type;
  applyShift(next);
 };
 function save(memoValue,options={}){
  if(!DayScheduler.canLeave())return false;
  const pending=ShiftTools.pending();if(pending&&pending.date!==selectedDateStr)return false;if(pending){const reason=validateDayOverride(selectedDateStr,pending.type);if(reason)return failSave(reason);}
  const holidayConfig=window.HolidayWorkPay?.draftConfig(selectedDateStr);
  if(holidayConfig){try{AccountDataCore.normalize({shift_salary_config_master:holidayConfig})}catch(error){return failSave(error.message);}}
  const val=typeof memoValue==='string'?memoValue.trim():$('modal-memo-input').value.trim();
  if(options.bundle){try{AccountDataCore.normalize(options.bundle)}catch(error){return failSave(error.message);}}
  if(options.memoItems&&(!DayMemosCore.valid(options.memoItems)||DayMemosCore.text(options.memoItems)!==val))return false;
  if(val.length>16000)return failSave('하루 메모는 총 16,000자까지 저장할 수 있어요.');
  if(!saveFailed&&!holidayConfig&&!options.bundle&&!options.memoItems&&!pending&&val===(dayMemos[selectedDateStr]||'').trim()){if(!options.keepOpen)closeModalDirect();return true;}
  const keys=new Set(['shift_overrides_'+currentGroup,'shift_day_memos',...(options.memoItems?[DayMemosCore.key]:[]),...Object.keys(options.bundle||{}),...(holidayConfig?['shift_salary_config_master']:[])]);
  const previousStorage=Object.fromEntries([...keys].map(key=>[key,localStorage.getItem(key)])),previousMemos=dayMemos,previousOverrides={...overrides},previousConfig=config;
  function rollback(){config=previousConfig;dayMemos=previousMemos;overrides=previousOverrides;for(const [key,value] of Object.entries(previousStorage)){try{value===null?localStorage.removeItem(key):localStorage.setItem(key,value);}catch{}}if(pending&&!ShiftTools.pending())choose(pending.type);}
  saving=true;try{
   if(options.bundle){for(const [key,value]of Object.entries(options.bundle))localStorage.setItem(key,JSON.stringify(value));dayMemos=options.bundle.shift_day_memos;}
   if(!ShiftTools.commit()){rollback();return false;}
   if(holidayConfig){localStorage.setItem('shift_salary_config_master',JSON.stringify(holidayConfig));config=holidayConfig;}
   if(options.memoItems){let items;try{items=JSON.parse(localStorage.getItem(DayMemosCore.key)||'{}')}catch{items={}}
    if(Object.keys(options.memoItems).length)items[selectedDateStr]=options.memoItems;else delete items[selectedDateStr];
    localStorage.setItem(DayMemosCore.key,JSON.stringify(items));
   }
   const nextMemos={...dayMemos};if(val)nextMemos[selectedDateStr]=val;else delete nextMemos[selectedDateStr];
   localStorage.setItem('shift_day_memos',JSON.stringify(nextMemos));dayMemos=nextMemos;$('modal-memo-input').value=val;saveFailed=false;clearErrors();
   window.AccountSync?.changed();window.GoogleSync?.changed(selectedDateStr);renderCalendar();if(holidayConfig){syncFromCalendar();window.HolidayWorkPay?.didSave();}if(options.keepOpen){if(options.stayPane)update();else showPane('memo');}else closeModalDirect();return true;
  }catch(error){rollback();return failSave('저장하지 못했어요. 작성한 내용은 그대로 남아 있어요. 다시 시도해 주세요.');}finally{saving=false;}
 }
 $('apply-preview').onclick = () => closeModalDirect();
 saveMemoDirect = save;
 const close = closeModalDirect;
 closeModalDirect = function() {
  if ($('memo-compose-dialog')?.open) return window.MemoComposer?.saveAndClose('calendar');
  if (!saving && !flush()) return false;
  if (picker.open) picker.close();
  close();
  return true;
 };
 $('design-back').onclick = () => pane !== 'work' ? showPane('work') : closeModalDirect();
 document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.defaultPrevented || !overlay.classList.contains('active') || document.querySelector('dialog[open]')) return;
  event.preventDefault();
  if (dateNavigation.open) dateNavigation.open = false;
  else closeModalDirect();
 });
 $('modal-memo-input').addEventListener('input', update);
 new MutationObserver(() => {
  if (overlay.classList.contains('active')) update();
 }).observe(document.body, {attributes: true, attributeFilter: ['data-pref-theme', 'data-ui-language']});
 window.DayEditorDesigns = {save, flush, showPane, moveDate};
})();
