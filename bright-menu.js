/* Presentation only: keep every existing button and its action. */
(()=>{'use strict';
const entries=[
 ['#commute-open','통근버스','노선과 정류장 찾기','#3182f6','#eaf2ff','<rect x="4" y="3" width="16" height="16" rx="4"/><path d="M4 10h16M8 19v2m8-2v2M8 6h8"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>'],
 ['#parking-open','주차장','신호등 제보 · 만차 알림','#10a87b','#e8f8f2','<rect x="4" y="3" width="16" height="18" rx="5"/><path d="M10 17V7h3a3 3 0 0 1 0 6h-3"/>'],
 ['#lost-found-open','분실물 · 습득물','잃어버린 물건 찾기','#ed9b23','#fff5e4','<path d="M6 7h12l2 13H4L6 7Z"/><path d="M9 7V6a3 3 0 0 1 6 0v1"/><circle cx="12" cy="13" r="1"/><path d="M12 16v-1"/>'],
 ['#view-all .lab-entry','생활 기능 실험실','새로운 기능 미리 써보기','#8769d7','#f2ecff','<path d="M9 3h6m-5 0v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10"/><path d="M10 18h1m4-7h1"/>']
];
const icon=paths=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
for(const[selector,title,caption,color,bg,paths]of entries){const button=document.querySelector(selector);if(!button)continue;const badge=document.createElement('span');badge.className='menu-service-icon';badge.setAttribute('aria-hidden','true');badge.style.setProperty('--service-color',color);badge.style.setProperty('--service-bg',bg);badge.innerHTML=icon(paths);const copy=document.createElement('span');copy.className='menu-service-copy';const name=document.createElement('strong'),sub=document.createElement('small');name.textContent=title;sub.textContent=caption;copy.append(name,sub);const chevron=document.createElement('span');chevron.className='menu-service-chevron';chevron.setAttribute('aria-hidden','true');chevron.innerHTML=icon('<path d="m9 5 7 7-7 7"/>');button.replaceChildren(badge,copy,chevron);button.setAttribute('aria-label',title);}
})();
