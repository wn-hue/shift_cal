/* Presentation only. Replace artwork without replacing any interactive control. */
(()=>{'use strict';
const svg=body=>'<svg class="app-service-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">'+body+'</svg>';
const fill=body=>'<g fill="currentColor">'+body+'</g>';
const soft=body=>'<g fill="currentColor" opacity=".28">'+body+'</g>';
const white=body=>'<g fill="white">'+body+'</g>';
const icons={
 calendar:soft('<rect x="3" y="5" width="18" height="17" rx="4"/>')+fill('<path d="M3 9V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v1H3Z"/><rect x="7" y="2" width="2" height="5" rx="1"/><rect x="15" y="2" width="2" height="5" rx="1"/>')+white('<path d="m8 14 2.3 2.3 5.1-5.1 1.4 1.4-6.5 6.5-3.7-3.7L8 14Z"/>'),
 wage:soft('<rect x="3" y="3" width="17" height="14" rx="3" transform="rotate(-9 3 3)"/>')+fill('<rect x="3" y="7" width="19" height="14" rx="4"/>')+white('<path d="M8 11h1.6l.9 4.3L11.5 12h1l1 3.3.9-4.3H16l-1.6 7h-1.5L12 15l-.9 3H9.6L8 11Z"/><circle cx="6.5" cy="14" r="1"/><circle cx="18.5" cy="14" r="1"/>'),
 group:soft('<circle cx="17.5" cy="7.5" r="3"/><path d="M14 20v-3a6 6 0 0 0-1-3.3 5.5 5.5 0 0 1 10 3.3v3H14Z"/>')+fill('<circle cx="8.5" cy="7" r="4"/><path d="M1 21v-3a7.5 7.5 0 0 1 15 0v3H1Z"/>'),
 bus:soft('<rect x="2" y="7" width="2" height="6" rx="1"/><rect x="20" y="7" width="2" height="6" rx="1"/>')+fill('<rect x="4" y="2" width="16" height="18" rx="5"/><rect x="6" y="18" width="3" height="4" rx="1.5"/><rect x="15" y="18" width="3" height="4" rx="1.5"/>')+white('<rect x="7" y="6" width="10" height="6" rx="2"/><circle cx="8" cy="16" r="1.2"/><circle cx="16" cy="16" r="1.2"/>'),
 parking:soft('<rect x="2" y="4" width="18" height="18" rx="6"/>')+fill('<rect x="5" y="1" width="18" height="18" rx="6"/>')+white('<path fill-rule="evenodd" d="M11 5h3a4 4 0 0 1 0 8h-1v3h-2V5Zm2 2v4h1a2 2 0 0 0 0-4h-1Z"/>'),
 lost:soft('<path d="M4 7h16l2 14H2L4 7Z"/>')+fill('<path d="M7 7V6a5 5 0 0 1 10 0v1h-2V6a3 3 0 0 0-6 0v1H7Z"/><path d="M4 11h16l1.4 10H2.6L4 11Z"/>')+white('<path fill-rule="evenodd" d="M10.5 12a3.5 3.5 0 1 0 1.5 6.7l2.6 2.6 1.4-1.4-2.6-2.6a3.5 3.5 0 0 0-2.9-5.3Zm0 2a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z"/>'),
 lab:soft('<path d="M8 2h8v7l6 11a2 2 0 0 1-1.8 3H3.8A2 2 0 0 1 2 20L8 9V2Z"/>')+fill('<rect x="7" y="1" width="10" height="3" rx="1.5"/><path d="m6 15-3 6h18l-3-6H6Z"/>')+white('<circle cx="10" cy="18" r="1.2"/><circle cx="15" cy="19" r="1"/>'),
 alarm:soft('<path d="M3 7 1 5a5 5 0 0 1 7-4L3 7Zm18 0 2-2a5 5 0 0 0-7-4l5 6Z"/>')+fill('<circle cx="12" cy="13" r="9"/><rect x="5" y="19" width="2" height="5" rx="1" transform="rotate(25 5 19)"/><rect x="17" y="19" width="2" height="5" rx="1" transform="rotate(-25 17 19)"/>')+white('<path d="M11 7h2v5.5l3.5 2-1 1.7-4.5-2.7V7Z"/>')
};
const nav={
 'bnav-cal':['<rect x="4" y="5" width="16" height="16" rx="4"/><path d="M8 3v4m8-4v4M4 10h16"/><path d="M8 14h2m4 0h2m-8 3h2"/>','<rect x="3" y="5" width="18" height="17" rx="4"/><rect x="7" y="2" width="2" height="5" rx="1"/><rect x="15" y="2" width="2" height="5" rx="1"/><path class="nav-cutout" d="M6 9h12v2H6zm1 5h3v2H7zm7 0h3v2h-3zm-7 4h3v2H7z"/>'],
 'bnav-pay':['<path d="M5 7V5a2 2 0 0 1 2-2h11v4"/><rect x="3" y="7" width="18" height="14" rx="4"/><path d="M21 12h-5a2 2 0 0 0 0 4h5"/>','<path d="M5 6V5a3 3 0 0 1 3-3h10v3H8a1 1 0 0 0-1 1h11a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-8a4 4 0 0 1 3-4Z"/><path class="nav-cutout" d="M16 11h6v6h-6a3 3 0 0 1 0-6Z"/><circle cx="17" cy="14" r="1"/>'],
 'bnav-menu':['<path d="M3.5 2.5v5a3.5 3.5 0 0 0 7 0v-5M7 2.5v19M19.5 2.5c-3 1.5-4.5 5-4.5 10h4.5V22M19.5 2.5V22"/>','<path d="M3 2h2v5h1V2h2v5h1V2h2v5.5A4 4 0 0 1 8 11.4V22H6V11.4A4 4 0 0 1 3 7.5V2Zm17 0v20h-2v-9h-4c0-5.8 2.2-9.8 6-11Z"/>'],
 'account-menu-button':['<path d="M4 6h16M4 12h16M4 18h16"/>','<rect x="3" y="4.5" width="18" height="3" rx="1.5"/><rect x="3" y="10.5" width="18" height="3" rx="1.5"/><rect x="3" y="16.5" width="18" height="3" rx="1.5"/>']
};
for(const[id,[outline,filled]]of Object.entries(nav)){const target=document.querySelector('#'+id+' .nav-visual>svg');if(target){target.setAttribute('class','app-tab-icon');target.setAttribute('focusable','false');target.innerHTML='<g class="nav-outline" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">'+outline+'</g><g class="nav-filled" fill="currentColor" stroke="none">'+filled+'</g>';}}
const entries=[['#menu-group-open .group-summary-icon','group'],['#menu-leave-settings .all-shortcut-icon','calendar'],['#menu-salary-settings .all-shortcut-icon','wage'],['#commute-open .menu-service-icon','bus'],['#parking-open .menu-service-icon','parking'],['#lost-found-open .menu-service-icon','lost'],['#view-all .lab-entry .menu-service-icon','lab'],['#native-alarm-open .menu-service-icon','alarm']];
function apply(){for(const[selector,name]of entries){const target=document.querySelector(selector);if(!target||target.dataset.appIcon===name)continue;target.dataset.appIcon=name;target.innerHTML=svg(icons[name]);}}
function applyOnboarding(){for(const target of document.querySelectorAll('[data-onboarding-icon]')){const name=target.dataset.onboardingIcon;if(icons[name])target.innerHTML=svg(icons[name]);}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyOnboarding,{once:true});else applyOnboarding();
apply();const menu=document.getElementById('view-all');if(menu)new MutationObserver(apply).observe(menu,{childList:true,subtree:true});
})();
