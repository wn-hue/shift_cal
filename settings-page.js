/* Full-page settings with browser/native back navigation, not a modal dialog. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),page=$('app-preferences-dialog'),cards=[...page.querySelectorAll('.preferences-card')],calendars=page.querySelector('.external-calendars'),about=page.querySelector('.all-info-section');
 document.body.append(page);
 page.replaceChildren();
 page.innerHTML=`<header class="settings-topbar"><button type="button" id="settings-back" aria-label="뒤로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><h1 id="settings-title" tabindex="-1">설정</h1></header><div class="settings-body">
 <div data-settings-panel="root"><button type="button" id="settings-account" class="settings-profile"><span class="settings-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg></span><span><strong>내 계정</strong><small>로그인 · 계정 연결 · 동기화</small></span><span aria-hidden="true">›</span></button>
 <h2 class="settings-group-title">화면 설정</h2><section class="settings-list" id="settings-display-list"></section>
 <h2 class="settings-group-title">언어 및 국가</h2><section class="settings-list"><button id="choose-language" class="settings-choice" aria-haspopup="dialog" aria-controls="settings-options"><span>언어</span><span id="settings-language-name" class="settings-value">한국어</span></button><div class="settings-row"><span>지역</span><span>대한민국</span></div><button id="choose-currency" class="settings-choice" aria-haspopup="dialog" aria-controls="settings-options"><span>통화</span><span id="settings-currency-name" class="settings-value" data-no-i18n>원화 (KRW)</span></button><div id="settings-holiday-toggle"></div></section>
 <h2 class="settings-group-title">캘린더 연결</h2><section class="settings-list"><button data-settings-link="calendars"><span>내 캘린더</span><span aria-hidden="true">›</span></button></section>
 <h2 class="settings-group-title">정보</h2><section class="settings-list"><div class="settings-row"><span>버전</span><span>2.0.0 · Web</span></div><a href="./privacy.html"><span>개인정보처리방침</span><span aria-hidden="true">›</span></a><button data-settings-link="licenses"><span>오픈소스 라이선스</span><span aria-hidden="true">›</span></button><button data-settings-link="about"><span>앱 소개 · 문의</span><span aria-hidden="true">›</span></button></section><button id="settings-reset" class="settings-reset">앱 설정 초기화</button></div>

 <div data-settings-panel="display" hidden></div><div data-settings-panel="licenses" hidden><p class="settings-description">앱에서 사용하는 오픈소스 및 이미지 정보예요.</p><div id="settings-licenses" class="settings-list"></div></div><div data-settings-panel="calendars" hidden></div><div data-settings-panel="about" hidden></div></div>`;
 const panel=name=>page.querySelector('[data-settings-panel="'+name+'"]');cards.forEach(c=>panel('display').append(c));panel('calendars').append(calendars);panel('about').append(about);
 const names={root:'설정',display:'화면 테마 · 표시',calendars:'내 캘린더',about:'앱 안내',licenses:'오픈소스 라이선스'},scrolls={};let active=false,showing=false,route='root',returnScroll=0,locked=[];
 function render(name){
  const entering=!showing,back=name==='root';showing=true;
  if(!names[name]||['display','language'].includes(name))name='root';
  if(!active){returnScroll=scrollY;locked=[...document.querySelectorAll('body>.container,body>.bottom-nav')].map(el=>[el,el.inert]);locked.forEach(([el])=>el.inert=true);active=true;document.body.classList.add('settings-page-open');}
  else scrolls[route]=page.querySelector('.settings-body').scrollTop;
  route=name;page.hidden=false;for(const el of page.querySelectorAll('[data-settings-panel]'))el.hidden=el.dataset.settingsPanel!==name;
  $('settings-title').textContent=names[name];page.dataset.route=name;page.querySelector('.settings-body').scrollTop=scrolls[name]||0;
  if(entering)AppMotion.page(page,true);else AppMotion.reveal(panel(name),back?-1:1);
  $('settings-title').focus({preventScroll:true});window.AppI18n?.refresh();
 }
 function close(){if(!active||!showing)return;showing=false;AppMotion.page(page,false,()=>{page.hidden=true;active=false;document.body.classList.remove('settings-page-open');locked.forEach(([el,value])=>el.inert=value);window.scrollTo({top:returnScroll,behavior:'instant'});document.querySelector('.menu-preferences')?.focus({preventScroll:true});});}
 function open(name='root'){if(!names[name])return;if(active&&route===name)return;history.pushState({...history.state,shiftSettings:name},'', '#settings-'+name);render(name);}
 $('settings-back').onclick=()=>history.back();$('settings-account').onclick=()=>$('account-sheet-open').click();
 page.querySelectorAll('[data-settings-link]').forEach(b=>b.onclick=()=>open(b.dataset.settingsLink));
 window.addEventListener('popstate',()=>history.state?.shiftSettings?render(history.state.shiftSettings):close());
 window.addEventListener('load',()=>{const name=location.hash.replace('#settings-','');if(names[name]){history.replaceState({...history.state,shiftSettings:name},'');render(name);}});
 window.SettingsPage={open};
 // Keep the original inputs and their persistence handlers; replace only the selection UI.
 for(const name of ['theme','shape','adjacent','memos','holidays']){
  const input=$('pref-'+name),label=input.closest('label');
  (name==='holidays'?$('settings-holiday-toggle'):$('settings-display-list')).append(label);
  label.className='settings-row';
  if(input.tagName==='SELECT'){
   const title=label.firstChild.textContent.trim(),row=document.createElement('button');row.type='button';row.className='settings-choice';row.id='choose-'+name;row.setAttribute('aria-haspopup','dialog');row.setAttribute('aria-controls','settings-options');
   const text=document.createElement('span'),value=document.createElement('span');text.textContent=title;value.className='settings-value';row.append(text,value);label.before(row);label.hidden=true;
   const sourceText=el=>window.AppI18n?.sourceText(el)??el.textContent;
   const update=()=>{value.textContent=sourceText(input.selectedOptions[0]).replace(/^\d+\. /,'');};input.addEventListener('change',update);update();
   row.onclick=()=>window.SettingsOptions.open(title,[...input.options].map(o=>({value:o.value,label:sourceText(o).replace(/^\d+\. /,'')})),input.value,v=>{input.value=v;input.dispatchEvent(new Event('change',{bubbles:true}));});
  }
 }
 $('choose-language').onclick=()=>window.SettingsOptions.open('언어',[
  {value:'ko',label:'한국어',nativeLanguage:'ko'},{value:'en',label:'English',nativeLanguage:'en'},{value:'zh',label:'简体中文',nativeLanguage:'zh-Hans'},{value:'ja',label:'日本語',nativeLanguage:'ja'}
 ],window.AppI18n?.language||'ko',v=>window.AppI18n?.setLanguage(v));
 $('choose-currency').onclick=()=>window.AppCurrency.open();
 $('settings-reset').onclick=()=>{
  window.SettingsOptions.confirm('앱 설정 초기화','화면 테마·표시·언어·통화를 기본값으로 되돌려요. 근무표, 급여 설정, 메모와 일정은 유지돼요.',()=>{
   for(const name of ['theme','shape','adjacent','holidays','memos']){const el=$('pref-'+name);if(name==='theme')el.value='current';else if(name==='shape')el.value='square';else el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));}
   window.AppI18n?.setLanguage('ko');window.AppCurrency?.set('KRW');
  });
 };
 fetch('./open-source-notices.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{
  const list=$('settings-licenses');for(const item of data){const row=document.createElement('a'),title=document.createElement('span'),detail=document.createElement('small');row.href=item.url;row.target='_blank';row.rel='noopener noreferrer';title.textContent=item.name;detail.textContent=item.version+' · '+item.license;row.append(title,detail);list.append(row);}
 }).catch(()=>{$('settings-licenses').textContent='라이선스 정보를 불러오지 못했어요. 인터넷 연결 후 다시 열어 주세요.';});
})();
