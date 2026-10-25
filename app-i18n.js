/* Keep Korean source text separate from display text; never modify stored/user content. */
(()=>{'use strict';
 const dict=window.AppTranslations,languages={ko:['ko','한국어'],en:['en','English'],zh:['zh-Hans','简体中文'],ja:['ja','日本語']},sources=new WeakMap(),attrs=new WeakMap();
 let language='ko',frame=0;try{const saved=localStorage.getItem('shift_display_language');if(languages[saved])language=saved}catch{}
 const skip='script,style,textarea,input,code,pre,[data-no-i18n],[data-language],#settings-language-name,.memo-tag,.day-event-tag,.external-event,.meal-items,#external-calendar-list,#account-email,.lost-card h3,.lost-card-place,.lost-card-storage,.event-open strong,.event-open span,#schedule-reminder p';
 const days={en:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],zh:['日','一','二','三','四','五','六'],ja:['日','月','火','水','木','金','土']};
 function t(source,el){
  if(language==='ko')return source;
  const s=source.trim();let value=dict[s]?.[language],m;
  if(!value&&el?.closest('.cal-weekdays,.group-weekday')&&'일월화수목금토'.includes(s)&&s.length===1)value=days[language]['일월화수목금토'.indexOf(s)];
  if(!value&&el?.closest('.shift-badge,.opt-btn,.group-shift,.attendance-pill')&&['주','야','휴'].includes(s))value={en:{주:'D',야:'N',휴:'Off'},zh:{주:'白',야:'夜',휴:'休'},ja:{주:'日',야:'夜',휴:'休'}}[language][s];
  if(!value&&s==='원')value=el?.closest('#pref-shape')?{en:'Circle',zh:'圆形',ja:'円'}[language]:{en:'KRW',zh:'韩元',ja:'ウォン'}[language];
  if(!value&&(m=s.match(/^([ABC])조( 근무표)?$/)))value={en:'Team '+m[1]+(m[2]?' schedule':''),zh:m[1]+'组'+(m[2]?'班表':''),ja:m[1]+'組'+(m[2]?'の勤務表':'')}[language];
  if(!value&&(m=s.match(/^([ABC])조 · 3조 2교대$/)))value={en:'Team '+m[1]+' · 3 teams / 2 shifts',zh:m[1]+'组 · 三班两倒',ja:m[1]+'組・3組2交替'}[language];
  if(!value&&(m=s.match(/^(\d+)년 (\d+)월 급여$/)))value={en:`Pay · ${m[1]}.${m[2]}`,zh:`${m[1]}年${m[2]}月工资`,ja:`${m[1]}年${m[2]}月の給与`}[language];
  if(!value&&(m=s.match(/^(\d+)월 (\d+)일 ([일월화수목금토])요일$/))){const y=typeof currentCalDate==='undefined'?new Date().getFullYear():currentCalDate.getFullYear();value=new Intl.DateTimeFormat(languages[language][0],{month:'long',day:'numeric',weekday:'long'}).format(new Date(y,Number(m[1])-1,Number(m[2])));}
  if(!value&&(m=s.match(/^(\d+)년$/)))value={en:m[1],zh:m[1]+'年',ja:m[1]+'年'}[language];
  if(!value&&(m=s.match(/^([\d,]+(?:\.\d+)?)\s*원$/)))value={en:'KRW '+m[1],zh:m[1]+'韩元',ja:m[1]+'ウォン'}[language];
  if(!value&&(m=s.match(/^(\d+(?:\.\d+)?)일$/)))value={en:m[1]+(m[1]==='1'?' day':' days'),zh:m[1]+'天',ja:m[1]+'日'}[language];
  if(!value&&(m=s.match(/^(좋아요|싫어요) (\d+)$/)))value=t(m[1])+' '+m[2];
  if(!value&&(m=s.match(/^(.+) 스티커( 변경|를 저장했어요\.|가 붙어 있어요\.)$/))&&dict[m[1]])value=t(m[1])+{en:{' 변경':' · Change sticker','를 저장했어요.':' sticker saved.','가 붙어 있어요.':' sticker selected.'},zh:{' 변경':' · 更换贴纸','를 저장했어요.':'贴纸已保存。','가 붙어 있어요.':'贴纸已选中。'},ja:{' 변경':'・ステッカーを変更','를 저장했어요.':'のステッカーを保存しました。','가 붙어 있어요.':'のステッカーを選択中です。'}}[language][m[2]];
  if(!value&&(m=s.match(/^기본 (.+)$/)))value=t('기본')+' '+t(m[1]);
  if(!value&&(m=s.match(/^(.+) 스티커$/))&&dict[m[1]])value=t(m[1])+' '+t('스티커');
  return value?source.replace(s,value):source;
 }
 function observe(){observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','placeholder','title','alt']})}
 function refresh(){
  if(frame){cancelAnimationFrame(frame);frame=0;}observer.disconnect();
  document.documentElement.lang=languages[language][0];document.body.dataset.uiLanguage=language;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
  while(node=walker.nextNode()){
   const el=node.parentElement;if(!el||el.closest(skip)||el.tagName==='OPTION'&&!el.hasAttribute('value'))continue;
   let record=sources.get(node);if(!record||node.nodeValue!==record.rendered)record={source:node.nodeValue};
   record.rendered=t(record.source,el);if(node.nodeValue!==record.rendered)node.nodeValue=record.rendered;sources.set(node,record);
  }
  for(const el of document.querySelectorAll('[aria-label],[placeholder],[title],[alt]')){
   if(el.closest('[data-no-i18n],.memo-tag,.day-event-tag,.external-event,.meal-items,.lost-card h3,.lost-card-place,.lost-card-storage,#event-list,#account-email'))continue;
   const records=attrs.get(el)||{};
   for(const name of ['aria-label','placeholder','title','alt'])if(el.hasAttribute(name)){const value=el.getAttribute(name);let r=records[name];if(!r||value!==r.rendered)r={source:value};r.rendered=t(r.source,el);if(r.rendered!==value)el.setAttribute(name,r.rendered);records[name]=r;}
   attrs.set(el,records);
  }
  const label=document.getElementById('settings-language-name');if(label)label.textContent=languages[language][1];
  document.querySelectorAll('[data-language]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.language===language)));
  observe();
 }
 const observer=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(refresh)});
 function setLanguage(next){
  if(!languages[next])return;
  const status=document.getElementById('language-save-status');
  try{localStorage.setItem('shift_display_language',next);language=next;if(status)status.textContent='언어를 저장했어요.';}catch{if(status)status.textContent='언어를 저장하지 못했어요. 다시 시도해 주세요.';}
  refresh();
 }
 for(const method of ['alert','confirm']){const original=window[method].bind(window);window[method]=message=>original(t(String(message)))}
 window.addEventListener('storage',e=>{if(e.key==='shift_display_language'){language=languages[e.newValue]?e.newValue:'ko';refresh()}});
 window.AppI18n={setLanguage,refresh,t,get language(){return language}};refresh();
})();
