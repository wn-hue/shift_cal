/* Small, self-contained explanation scenes. They never write setup values. */
(()=>{'use strict';
 const dialog=document.getElementById('onboarding-dialog');if(!dialog)return;
 const arts=[...dialog.querySelectorAll('.onboarding-art')],motion=matchMedia('(prefers-reduced-motion:reduce)');
 const check='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>';
 const scenes=[
  `<div class="story-ground"></div><div class="story-calendar story-motion"><div class="story-calendar-edge"></div><div class="story-calendar-cover"><span></span><span></span></div><div class="story-calendar-face"><div class="story-calendar-caption">나의 첫 출근</div><div class="story-date-grid">${Array.from({length:14},(_,i)=>`<span class="${i===9?'story-date-selected story-motion':''}">${i===9?'<b class="story-date-number">✓</b>':''}</span>`).join('')}</div><div class="story-calendar-flip story-motion"><span></span><div></div><div></div><div></div></div></div></div><div class="story-date-tap story-motion"></div><div class="story-result story-hire-result story-motion"><i>${check}</i><span>연차 · 근속 계산</span></div>`,
  `<div class="story-ground"></div><div class="story-team-cards">${['A','B','C'].map((group,i)=>`<div class="story-team-card story-motion" data-story-group="${group}" style="--order:${i}"><div class="story-person"><i></i><span></span></div><b>${group}</b><span class="story-team-tick">${check}</span></div>`).join('')}</div><div class="story-roster story-motion"><div class="story-roster-title">내 근무표</div><div class="story-roster-days">${['주','주','휴','야','야','휴'].map((shift,i)=>`<span class="story-work-${shift==='주'?'day':shift==='야'?'night':'off'} story-motion" style="--order:${i}">${shift}</span>`).join('')}</div></div>`,
  `<div class="story-ground"></div><div class="story-payslip story-motion"><span class="story-paper-fold"></span><strong>예상 급여</strong><div class="story-pay-line"><span>시급</span><i class="story-motion"></i></div><div class="story-pay-line"><span>근무</span><i class="story-motion"></i></div><div class="story-pay-total story-motion"><span>자동 계산</span><b>${check}</b></div></div><div class="story-coin story-motion"><div class="story-coin-face">₩</div></div><div class="story-pay-spark story-motion">✦</div>`
 ];
 const types=['hire','team','wage'],visible=new WeakMap();let active=null;
 for(const [index,art]of arts.entries()){
  const scene=document.createElement('div');scene.className='onboarding-story';scene.dataset.story=types[index];scene.innerHTML='<div class="story-scene">'+scenes[index]+'</div>';art.replaceChildren(scene);art.dataset.storyReady='true';
 }
 const stories=arts.map(art=>art.firstElementChild);
 function size(entry){entry.target.style.setProperty('--story-scale',String(entry.contentRect.width/320));}
 const sizes=new ResizeObserver(entries=>entries.forEach(size));stories.forEach(scene=>sizes.observe(scene));
 function syncValues(){
  const value=document.getElementById('onboarding-date').value;
  stories[0].querySelector('.story-date-number').textContent=/^\d{4}-\d{2}-\d{2}$/.test(value)?String(Number(value.slice(-2))):'✓';
  const selected=dialog.querySelector('[data-onboarding-group][aria-pressed=true]')?.dataset.onboardingGroup;
  for(const card of stories[1].querySelectorAll('[data-story-group]'))card.classList.toggle('is-selected',card.dataset.storyGroup===selected);
 }
 function update(){
  const scene=dialog.open?stories[Number(dialog.dataset.step)||0]:null;
  if(scene!==active){
   for(const item of stories){delete item.dataset.playing;delete item.dataset.animated;}
   active=scene;
   if(scene&&!motion.matches){void scene.offsetWidth;scene.dataset.animated='true';}
  }
  syncValues();
  const covered=Boolean(document.querySelector('dialog[open]:not(#onboarding-dialog)'));
  for(const item of stories)item.dataset.playing=String(item===scene&&!document.hidden&&!covered&&!dialog.hasAttribute('data-transitioning')&&visible.get(item)!==false&&!motion.matches);
 }
 const observer=new IntersectionObserver(entries=>{for(const entry of entries)visible.set(entry.target,entry.intersectionRatio>=.2);update();},{threshold:.2});stories.forEach(scene=>observer.observe(scene));
 new MutationObserver(update).observe(dialog,{attributes:true,attributeFilter:['open','data-step','data-transitioning']});
 for(const sheet of document.querySelectorAll('dialog'))if(sheet!==dialog)new MutationObserver(update).observe(sheet,{attributes:true,attributeFilter:['open']});
 dialog.addEventListener('click',event=>{if(event.target.closest('[data-onboarding-group]'))queueMicrotask(syncValues);});
 document.getElementById('onboarding-date-confirm').addEventListener('click',()=>queueMicrotask(syncValues));
 document.addEventListener('visibilitychange',update);
 motion.addEventListener('change',()=>{active=null;update();});
 // The outgoing scene must retain its current frame during the step crossfade.
 function freeze(source,copy){const originals=source.querySelectorAll('.story-motion'),clones=copy.querySelectorAll('.story-motion');originals.forEach((item,i)=>{const css=getComputedStyle(item);Object.assign(clones[i].style,{animation:'none',transform:css.transform,translate:css.translate,scale:css.scale,opacity:css.opacity});});}
 window.OnboardingStory={freeze};update();
})();
