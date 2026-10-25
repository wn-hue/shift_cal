/* Full-page settings with browser/native back navigation, not a modal dialog. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),page=$('app-preferences-dialog'),cards=[...page.querySelectorAll('.preferences-card')],calendars=page.querySelector('.external-calendars'),about=page.querySelector('.all-info-section');
 document.body.append(page);
 page.replaceChildren();
 page.innerHTML=`<header class="settings-topbar"><button type="button" id="settings-back" aria-label="뒤로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><h1 id="settings-title" tabindex="-1">설정</h1></header><div class="settings-body">
 <div data-settings-panel="root"><button type="button" id="settings-account" class="settings-profile"><span class="settings-avatar" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg></span><span><strong>내 계정</strong><small>로그인 · 계정 연결 · 동기화</small></span><span aria-hidden="true">›</span></button>
 <section class="settings-list"><button data-settings-link="language"><span>언어</span><span id="settings-language-name" class="settings-value">한국어</span><span aria-hidden="true">›</span></button><button data-settings-link="display"><span>화면 테마 · 표시</span><span aria-hidden="true">›</span></button><button data-settings-link="calendars"><span>내 캘린더</span><span aria-hidden="true">›</span></button></section>
 <section class="settings-list"><h2>앱 안내</h2><a href="./iphone-alarms.html"><span>근무 알람 안내</span><span aria-hidden="true">›</span></a><button data-settings-link="about"><span>이용 안내 · 개인정보</span><span aria-hidden="true">›</span></button></section></div>
 <div data-settings-panel="language" hidden><p class="settings-description">앱에서 사용할 언어를 선택해 주세요.</p><div class="settings-list language-list" role="group" aria-label="언어 선택"><button data-language="ko" lang="ko">한국어<span aria-hidden="true">✓</span></button><button data-language="en" lang="en">English<span aria-hidden="true">✓</span></button><button data-language="zh" lang="zh-Hans">简体中文<span aria-hidden="true">✓</span></button><button data-language="ja" lang="ja">日本語<span aria-hidden="true">✓</span></button></div><p class="settings-description">메모·일정·식단 원문과 금액은 그대로 유지돼요.</p><p id="language-save-status" role="status"></p></div>
 <div data-settings-panel="display" hidden></div><div data-settings-panel="calendars" hidden></div><div data-settings-panel="about" hidden></div></div>`;
 const panel=name=>page.querySelector('[data-settings-panel="'+name+'"]');cards.forEach(c=>panel('display').append(c));panel('calendars').append(calendars);panel('about').append(about);
 const names={root:'설정',language:'언어',display:'화면 테마 · 표시',calendars:'내 캘린더',about:'앱 안내'},scrolls={};let active=false,route='root',returnScroll=0,locked=[];
 function render(name){
  const entering=!active;
  if(!names[name])name='root';
  if(!active){returnScroll=scrollY;locked=[...document.querySelectorAll('body>.container,body>.bottom-nav')].map(el=>[el,el.inert]);locked.forEach(([el])=>el.inert=true);active=true;document.body.classList.add('settings-page-open');}
  else scrolls[route]=page.querySelector('.settings-body').scrollTop;
  route=name;page.hidden=false;for(const el of page.querySelectorAll('[data-settings-panel]'))el.hidden=el.dataset.settingsPanel!==name;
  $('settings-title').textContent=names[name];page.dataset.route=name;page.querySelector('.settings-body').scrollTop=scrolls[name]||0;
  if(!matchMedia('(prefers-reduced-motion:reduce)').matches)(entering?page:panel(name)).animate([{transform:'translateX(100%)'},{transform:'translateX(0)'}],{duration:260,easing:'cubic-bezier(.2,.7,.2,1)'});
  $('settings-title').focus({preventScroll:true});window.AppI18n?.refresh();
 }
 function close(){if(!active)return;page.hidden=true;active=false;document.body.classList.remove('settings-page-open');locked.forEach(([el,value])=>el.inert=value);window.scrollTo({top:returnScroll,behavior:'instant'});document.querySelector('.menu-preferences')?.focus({preventScroll:true});}
 function open(name='root'){if(!names[name])return;if(active&&route===name)return;history.pushState({...history.state,shiftSettings:name},'', '#settings-'+name);render(name);}
 $('settings-back').onclick=()=>history.back();$('settings-account').onclick=()=>$('account-sheet-open').click();
 page.querySelectorAll('[data-settings-link]').forEach(b=>b.onclick=()=>open(b.dataset.settingsLink));
 page.querySelectorAll('[data-language]').forEach(b=>b.onclick=()=>window.AppI18n?.setLanguage(b.dataset.language));
 window.addEventListener('popstate',()=>history.state?.shiftSettings?render(history.state.shiftSettings):close());
 window.addEventListener('load',()=>{const name=location.hash.replace('#settings-','');if(names[name]){history.replaceState({...history.state,shiftSettings:name},'');render(name);}});
 window.SettingsPage={open};
})();
