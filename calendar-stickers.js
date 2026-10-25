/* One original food sticker per personal date; saved with the existing account data. */
(() => {
 'use strict';
 const key = 'shift_day_stickers';
 const catalog = [['soju','소주'],['beer','맥주'],['kimchi-stew','김치찌개'],['pork-belly','삼겹살'],['chicken','치킨'],['gukbap','국밥'],['baeksuk','백숙'],['doenjang-stew','된장찌개'],['tteokbokki','떡볶이'],['jajangmyeon','짜장면'],['kimchi-rice','김치볶음밥'],['gimbap','김밥'],['jjamppong','짬뽕']];
 const labels = Object.fromEntries(catalog);
 let saved = {};
 const status = () => document.getElementById('calendar-sticker-status');
 function begin() {
  try { saved = AccountDataCore.normalize({[key]:JSON.parse(localStorage.getItem(key)||'null')})[key] || {}; }
  catch { saved = {}; }
 }
 function refreshSummary() {
  begin();
  const button=document.getElementById('editor-sticker-preview');
  if (!button) return;
  const id=saved[selectedDateStr];
  button.replaceChildren();
  if (labels[id]) {
   const img=document.createElement('img');img.src='./assets/stickers/'+id+'.svg?v=2';img.alt='';img.width=img.height=48;button.append(img);
   button.setAttribute('aria-label',labels[id]+' 스티커 변경');
  } else {
   button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11v5l-5 5H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h6M15 21v-4a2 2 0 0 1 2-2h3M18 2v6m-3-3h6"/><path d="M8 13c1 2 4 2 5 0"/><path d="M8 9h.01M13 9h.01"/></svg><span>스티커</span>';
   button.setAttribute('aria-label','날짜 스티커 선택');
  }
 }
 function paint() {
  refreshSummary();
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
  image.src = './assets/stickers/'+id+'.svg?v=2';
  image.alt = labels[id]+' 스티커';
  image.width = image.height = 24;
  image.draggable = false;
  cell.classList.add('has-calendar-sticker');
  cell.insertBefore(image,cell.querySelector('.memo-tag'));
  const label = cell.getAttribute('aria-label');
  if (label) cell.setAttribute('aria-label',label+', '+labels[id]+' 스티커');
 }
 const options = document.getElementById('calendar-sticker-options');
 for (const [id,label] of catalog) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.sticker = id;
  button.setAttribute('aria-pressed','false');
  const img = document.createElement('img');img.src = './assets/stickers/'+id+'.svg?v=2';img.alt = '';img.width = img.height = 48;
  const text = document.createElement('span');text.textContent = label;
  button.append(img,text);button.onclick = () => save(id);options.append(button);
 }
 document.getElementById('calendar-sticker-clear').onclick = () => save(null);
 const dialog=document.getElementById('sticker-dialog');
 function fitPopup(){
  if(!dialog.open)return;const v=window.visualViewport;if(v&&Math.abs(v.scale-1)>.01)return;
  const w=v?.width||innerWidth,h=v?.height||innerHeight;
  for(const [name,value]of Object.entries({left:(v?.offsetLeft||0)+w/2,top:(v?.offsetTop||0)+h/2,width:Math.min(440,w-24),height:Math.max(120,Math.min(h-24,h*.85))}))dialog.style.setProperty('--sticker-'+name,value+'px');
 }
 window.visualViewport?.addEventListener('resize',fitPopup);window.visualViewport?.addEventListener('scroll',fitPopup);window.addEventListener('resize',fitPopup);
 function open(){
  if(!document.getElementById('modal-override').classList.contains('active'))return;
  if(document.activeElement?.matches('input,textarea,select'))document.activeElement.blur();
  paint();if(!dialog.open)dialog.showModal();fitPopup();dialog.scrollTop=0;options.scrollTop=0;document.getElementById('sticker-dialog-title').focus({preventScroll:true});
 }
 function close(){dialog.close();}
 dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
 dialog.addEventListener('close',()=>{if(document.getElementById('modal-override').classList.contains('active'))document.getElementById('editor-sticker-preview').focus({preventScroll:true});});
 new MutationObserver(()=>{if(!document.getElementById('modal-override').classList.contains('active')&&dialog.open)close();}).observe(document.getElementById('modal-override'),{attributes:true,attributeFilter:['class']});
 window.CalendarStickers = {begin,paint,decorate,refreshSummary,open,close};
})();
