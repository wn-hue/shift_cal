/* One original food sticker per personal date; saved with the existing account data. */
(() => {
 'use strict';
 const key = 'shift_day_stickers';
 const catalog = [['soju','소주'],['beer','맥주'],['kimchi-stew','김치찌개'],['pork-belly','삼겹살'],['chicken','치킨'],['gukbap','국밥']];
 const labels = Object.fromEntries(catalog);
 let saved = {};
 const status = () => document.getElementById('calendar-sticker-status');
 function begin() {
  try { saved = AccountDataCore.normalize({[key]:JSON.parse(localStorage.getItem(key)||'null')})[key] || {}; }
  catch { saved = {}; }
 }
 function paint() {
  begin();
  for (const button of document.querySelectorAll('#calendar-sticker-options button')) button.setAttribute('aria-pressed', String(saved[selectedDateStr] === button.dataset.sticker));
  document.getElementById('calendar-sticker-clear').disabled = !saved[selectedDateStr];
  status().textContent = saved[selectedDateStr] ? labels[saved[selectedDateStr]]+' 스티커가 붙어 있어요.' : '스티커를 고르면 바로 저장돼요.';
 }
 function save(id) {
  if (!selectedDateStr || id !== null && !labels[id]) return;
  begin();
  const next = {...saved};
  if (id === null) delete next[selectedDateStr]; else next[selectedDateStr] = id;
  try { localStorage.setItem(key, JSON.stringify(AccountDataCore.normalize({[key]:next})[key])); }
  catch { status().textContent = '저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.'; return; }
  window.AccountSync?.changed();
  renderCalendar();
  paint();
  status().textContent = id ? labels[id]+' 스티커를 저장했어요.' : '스티커를 지웠어요.';
 }
 function decorate(cell, date, adjacent) {
  const id = saved[date];
  if (adjacent || !labels[id]) return;
  const image = document.createElement('img');
  image.className = 'calendar-sticker';
  image.src = './assets/stickers/'+id+'.svg';
  image.alt = labels[id]+' 스티커';
  image.width = image.height = 24;
  image.draggable = false;
  cell.classList.add('has-calendar-sticker');
  cell.append(image);
  const label = cell.getAttribute('aria-label');
  if (label) cell.setAttribute('aria-label',label+', '+labels[id]+' 스티커');
 }
 const options = document.getElementById('calendar-sticker-options');
 for (const [id,label] of catalog) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.sticker = id;
  button.setAttribute('aria-pressed','false');
  const img = document.createElement('img');img.src = './assets/stickers/'+id+'.svg';img.alt = '';img.width = img.height = 48;
  const text = document.createElement('span');text.textContent = label;
  button.append(img,text);button.onclick = () => save(id);options.append(button);
 }
 document.getElementById('calendar-sticker-clear').onclick = () => save(null);
 window.CalendarStickers = {begin,paint,decorate};
})();
