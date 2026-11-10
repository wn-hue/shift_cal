/* Presentation only: keep every existing button and its action. */
(()=>{'use strict';
const entries=[
 ['#commute-open','통근버스','노선과 정류장 찾기','#3182f6','#eaf2ff','<rect x="4" y="3" width="16" height="16" rx="4"/><path d="M4 10h16M8 19v2m8-2v2M8 6h8"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>'],
 ['#parking-open','주차장','주차 현황 · 만차 알림','#10a87b','#e8f8f2','<rect x="4" y="3" width="16" height="18" rx="5"/><path d="M10 17V7h3a3 3 0 0 1 0 6h-3"/>'],
 ['#lost-found-open','분실물 · 습득물','물건 찾고 알리기','#ed9b23','#fff5e4','<path d="M6 7h12l2 13H4L6 7Z"/><path d="M9 7V6a3 3 0 0 1 6 0v1"/><circle cx="12" cy="13" r="1"/><path d="M12 16v-1"/>'],
 ['#view-all .lab-entry','새 기능 체험','준비 중인 기능 써보기','#8769d7','#f2ecff','<path d="M9 3h6m-5 0v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10"/><path d="M10 18h1m4-7h1"/>']
];
const icon=paths=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths+'</svg>';
for(const[selector,title,caption,color,bg,paths]of entries){const button=document.querySelector(selector);if(!button)continue;const badge=document.createElement('span');badge.className='menu-service-icon';badge.setAttribute('aria-hidden','true');badge.style.setProperty('--service-color',color);badge.style.setProperty('--service-bg',bg);badge.innerHTML=icon(paths);const copy=document.createElement('span');copy.className='menu-service-copy';const name=document.createElement('strong'),sub=document.createElement('small');name.textContent=title;sub.textContent=caption;copy.append(name,sub);button.replaceChildren(badge,copy);button.setAttribute('aria-label',title);}

const blocks=[...document.querySelectorAll('#view-all .life-section')];
if(blocks.length){const services=document.createElement('section');services.className='life-section menu-services';const heading=document.createElement('h2');heading.textContent='생활과 출퇴근';services.append(heading);blocks[0].before(services);for(const id of['lost-found-open','commute-open','parking-open','shift-life-guide-open','local-food-open']){const entry=document.getElementById(id);if(entry)services.append(entry);}for(const block of blocks)block.remove();}
const brand=document.querySelector('#view-all .all-page-title');const subtitle=document.createElement('p');subtitle.className='menu-brand-subtitle';subtitle.textContent='근무에 필요한 정보를 한곳에서';brand.after(subtitle);
})();
