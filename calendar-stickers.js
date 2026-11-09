/* One food sticker per personal date. The cake stays on this device for older app versions. */
(() => {
 'use strict';
 const key = 'shift_day_stickers';
 const cake = 'cake';
 const cakeKey = owner => 'shift_day_cake_stickers_v1_' + owner;
 const activeOwner = () => localStorage.getItem('shift_account_owner_v1') || 'guest';
 const catalog = [[cake,'케이크'],['soju','소주'],['beer','맥주'],['kimchi-stew','김치찌개'],['pork-belly','삼겹살'],['chicken','치킨'],['gukbap','국밥'],['baeksuk','백숙'],['doenjang-stew','된장찌개'],['tteokbokki','떡볶이'],['jajangmyeon','짜장면'],['kimchi-rice','김치볶음밥'],['gimbap','김밥'],['jjamppong','짬뽕']];
 const labels = Object.fromEntries(catalog);
 let saved = {};
 let cakes = {};
 const status = () => document.getElementById('calendar-sticker-status');
 function begin() {
  try { saved = AccountDataCore.normalize({[key]:JSON.parse(localStorage.getItem(key)||'null')})[key] || {}; }
  catch { saved = {}; }
  // Earlier app versions reject unfamiliar sticker IDs in shared account data.
  try {
   const value = JSON.parse(localStorage.getItem(cakeKey(activeOwner())) || 'null');
   cakes = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { cakes = {}; }
 }
 function selected(date) {
  return cakes[date] === true ? cake : saved[date];
 }
 function graphic(id, size, description = '') {
  if (id === cake) {
   const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
   svg.setAttribute('viewBox','0 0 24 24');
   svg.setAttribute('width',String(size));
   svg.setAttribute('height',String(size));
   if (description) {
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label',description);
   } else svg.setAttribute('aria-hidden','true');
   const glyph = document.createElementNS(svg.namespaceURI,'text');
   glyph.setAttribute('x','12');
   glyph.setAttribute('y','20');
   glyph.setAttribute('text-anchor','middle');
   glyph.setAttribute('font-size','21');
   glyph.setAttribute('font-family','Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif');
   glyph.textContent = '🎂';
   svg.append(glyph);
   return svg;
  }
  const img = document.createElement('img');
  img.src = './assets/stickers/'+id+'.svg?v=2';
  img.alt = description;
  img.width = img.height = size;
  img.draggable = false;
  return img;
 }
 function refreshSummary() {
  begin();
  const button=document.getElementById('editor-sticker-preview');
  if (!button) return;
  const id = selected(selectedDateStr);
  if (id) button.replaceChildren(graphic(id,24));
  else button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 14a4.4 4.4 0 0 0 8 0M9 10h.01M15 10h.01"/></svg>';
  button.setAttribute('aria-label','날짜 스티커 선택');
  button.setAttribute('aria-haspopup','dialog');
  if (id) button.setAttribute('aria-description', labels[id]);
  else button.removeAttribute('aria-description');
 }
 function paint() {
  refreshSummary();
  const id = selected(selectedDateStr);
  for (const button of document.querySelectorAll('#calendar-sticker-options button')) button.setAttribute('aria-pressed', String(id === button.dataset.sticker));
  document.getElementById('calendar-sticker-clear').disabled = !id;
  status().textContent = id ? labels[id]+' 스티커가 붙어 있어요.' : '스티커를 고르면 바로 저장돼요.';
 }
 function save(id) {
  if (!selectedDateStr || id !== null && !labels[id]) return;
  begin();
  if (id === selected(selectedDateStr)) { close(); return; }
  const next = {...saved};
  const nextCakes = {...cakes};
  if (id === null || id === cake) delete next[selectedDateStr]; else next[selectedDateStr] = id;
  if (id === cake) nextCakes[selectedDateStr] = true; else delete nextCakes[selectedDateStr];
  const localKey = cakeKey(activeOwner());
  const previous = localStorage.getItem(key);
  const previousCakes = localStorage.getItem(localKey);
  const changed = next[selectedDateStr] !== saved[selectedDateStr];
  try {
   if (Object.keys(nextCakes).length) localStorage.setItem(localKey,JSON.stringify(nextCakes));
   else if (previousCakes !== null) localStorage.removeItem(localKey);
   if (changed) localStorage.setItem(key, JSON.stringify(AccountDataCore.normalize({[key]:next})[key]));
  } catch {
   try {
    if (previousCakes === null) localStorage.removeItem(localKey);
    else localStorage.setItem(localKey,previousCakes);
    if (changed && localStorage.getItem(key)!==previous) {
     if (previous === null) localStorage.removeItem(key); else localStorage.setItem(key,previous);
    }
   } catch {}
   status().textContent = '저장하지 못했어요. 저장 공간을 확인한 뒤 다시 시도해 주세요.';
   return;
  }
  if (changed) window.AccountSync?.changed();
  renderCalendar();
  paint();
  status().textContent = id ? labels[id]+' 스티커를 저장했어요.' : '스티커를 지웠어요.';
  close();
 }
 function decorate(cell, date, adjacent) {
  const id = selected(date);
  if (adjacent || !labels[id]) return;
  const image = graphic(id,24,labels[id]+' 스티커');
  image.classList.add('calendar-sticker');
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
  const text = document.createElement('span');text.textContent = label;
  button.append(graphic(id,48),text);button.onclick = () => save(id);options.append(button);
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
 function clearLocal(owner = activeOwner()) {
  localStorage.removeItem(cakeKey(owner));
 }
 function ownerChanged() {
  const hadCake = Object.keys(cakes).length > 0;
  begin();
  if(!hadCake && Object.keys(cakes).length === 0) return;
  renderCalendar();
  if(dialog.open)paint();
  else if(document.getElementById('modal-override').classList.contains('active'))refreshSummary();
 }
 window.CalendarStickers = {begin,paint,decorate,refreshSummary,open,close,clearLocal,ownerChanged};
})();
