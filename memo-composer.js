/* A separate writing surface: the shift sheet never contains a focused memo field. */
(()=>{'use strict';
 const source=document.getElementById('modal-memo-input'),overlay=document.getElementById('modal-override');
 if(!source||!overlay)return;
 const tr=text=>window.AppI18n?.t(text)||text;
 const button=document.createElement('button');button.type='button';button.id='memo-compose-open';
 button.innerHTML='<span id="memo-compose-preview" data-no-i18n></span><span aria-hidden="true">›</span>';
 source.hidden=true;source.after(button);
 source.previousElementSibling?.setAttribute('for','memo-compose-open');
 const dialog=document.createElement('dialog');dialog.id='memo-compose-dialog';dialog.setAttribute('aria-labelledby','memo-compose-title');
 dialog.innerHTML='<button type="button" id="memo-compose-dismiss" aria-label="창 내리기"><span aria-hidden="true"></span></button><header class="memo-compose-header"><button type="button" id="memo-compose-back" aria-label="취소"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><h2 id="memo-compose-title">메모</h2><button type="button" id="memo-compose-save" aria-label="변경사항 저장"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button></header><p id="memo-compose-date"></p><textarea id="memo-compose-input" maxlength="16000" placeholder="메모 입력" aria-labelledby="memo-compose-title" autofocus></textarea>';
 document.body.append(dialog);
 const input=dialog.querySelector('textarea'),viewport=window.visualViewport;
 let date='',initial='',opener=null,closing=false,drag=null,offset=0,returnAnimation=null,suppressClickUntil=0,frame=0,restingHeight=0,restingWidth=0,finishClose=null,closeTimer=0;
 const reduced=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
 function clearDrag(){returnAnimation?.cancel();returnAnimation=null;drag=null;offset=0;dialog.style.removeProperty('--compose-drag');}
 function settle(){const from=offset;clearDrag();if(from&&!reduced())returnAnimation=dialog.animate([{transform:`translateY(${from}px)`},{transform:'translateY(0)'}],{duration:160,easing:'ease-out'});}
 function refresh(){const value=source.value.trim();button.querySelector('span').textContent=value||tr('메모 입력');button.dataset.empty=String(!value);button.setAttribute('aria-label',tr(value?'메모':'메모 입력'));}
 function fit(){
  frame=0;if(!dialog.open)return;if(viewport&&Math.abs(viewport.scale-1)>.01)return;
  const values={height:viewport?.height||innerHeight,width:viewport?.width||innerWidth,top:viewport?.offsetTop||0,left:viewport?.offsetLeft||0};
  for(const [key,value]of Object.entries(values))dialog.style.setProperty('--compose-'+key,value+'px');
  dialog.dataset.compact=String(values.height<300);
  dialog.dataset.keyboard=String(restingHeight-values.height>120);
  if(finishClose&&(values.height>=restingHeight-80||Math.abs(values.width-restingWidth)>80))finishClose();
 }
 function scheduleFit(){if(!frame)frame=requestAnimationFrame(fit);}
 // Keep the underlying day sheet and body locked until the keyboard finishes retracting.
 function afterKeyboard(callback){
  if(restingHeight-(viewport?.height||innerHeight)<=120){callback();return;}
  finishClose=()=>{const finish=finishClose;if(!finish)return;finishClose=null;clearTimeout(closeTimer);callback();};
  closeTimer=setTimeout(()=>finishClose?.(),600);
 }

 function open(){if(dialog.open||!selectedDateStr)return;clearDrag();closing=false;date=selectedDateStr;initial=source.value;input.value=initial;input.scrollTop=0;opener=document.activeElement;restingHeight=viewport?.height||innerHeight;restingWidth=viewport?.width||innerWidth;
  const css=getComputedStyle(overlay);for(const key of ['--ed-card','--ed-text','--ed-sub','--ed-blue','--ed-line'])dialog.style.setProperty(key,css.getPropertyValue(key));
  dialog.querySelector('#memo-compose-title').textContent=tr('메모');input.placeholder=tr('메모 입력');
  const locale={ko:'ko-KR',en:'en',zh:'zh-CN',ja:'ja'}[localStorage.getItem('shift_display_language')]||'ko-KR';
  dialog.querySelector('#memo-compose-date').textContent=new Intl.DateTimeFormat(locale,{month:'long',day:'numeric',weekday:'long'}).format(new Date(date+'T12:00:00'));
  overlay.dataset.memoComposing='true';document.body.classList.add('memo-composer-open');dialog.showModal();dialog.scrollTop=0;fit();input.focus({preventScroll:true});scheduleFit();
 }
 function close(animated=false,restoreFocus=true){if(closing)return;closing=true;input.blur();
  const finish=()=>{if(animated)suppressClickUntil=performance.now()+400;dialog.close();clearDrag();closing=false;delete overlay.dataset.memoComposing;document.body.classList.remove('memo-composer-open');refresh();if(restoreFocus&&overlay.classList.contains('active')&&opener?.isConnected)opener.focus({preventScroll:true});window.dispatchEvent(new Event('resize'));};
  afterKeyboard(()=>{
   if(animated&&!reduced()){returnAnimation?.cancel();const animation=dialog.animate([{transform:`translateY(${offset}px)`},{transform:`translateY(${viewport?.height||innerHeight}px)`}],{duration:180,easing:'cubic-bezier(.4,0,1,1)',fill:'forwards'});animation.finished.then(()=>{finish();animation.cancel();},finish);}else finish();
  });
 }
 function cancel(animated=false){if(closing)return;if(input.value!==initial&&!confirm(tr('작성 중인 메모를 저장하지 않고 이동할까요?'))){if(animated)suppressClickUntil=performance.now()+400;settle();return;}close(animated);}
 function save(){if(closing||date!==selectedDateStr)return;if(window.DayEditorDesigns.save(input.value))close(false,false);}
 button.onclick=open;dialog.querySelector('#memo-compose-back').onclick=()=>cancel();dialog.querySelector('#memo-compose-dismiss').onclick=()=>cancel(true);dialog.querySelector('#memo-compose-save').onclick=save;
 dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});
 dialog.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();save();}});
 // Only the header/handle starts dismissal. Text selection and textarea scrolling stay native.
 dialog.addEventListener('pointerdown',e=>{
  if(!e.isPrimary){if(drag)settle();return;}
  if(closing||e.button!==0||!e.target.closest('#memo-compose-dismiss,.memo-compose-header,#memo-compose-date')||e.target.closest('button:not(#memo-compose-dismiss)'))return;
  clearDrag();drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};try{e.target.setPointerCapture(e.pointerId);}catch{}
 });
 dialog.addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(Math.abs(dx)>8||Math.abs(dy)>8)drag.moved=true;
  if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.3||dy< -12){suppressClickUntil=performance.now()+400;settle();return;}
  if(dy>8&&dy>Math.abs(dx)*1.3){e.preventDefault();offset=Math.min(dy,240);if(!reduced())dialog.style.setProperty('--compose-drag',offset+'px');}
 });
 dialog.addEventListener('pointerup',e=>{
  if(!drag||e.pointerId!==drag.id)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y,moved=drag.moved;drag=null;
  if(moved)suppressClickUntil=performance.now()+400;
  if(dy>=72&&dy>Math.abs(dx)*1.3){suppressClickUntil=performance.now()+600;cancel(true);}else settle();
 });
 dialog.addEventListener('pointercancel',()=>{if(drag){suppressClickUntil=performance.now()+400;settle();}});
 dialog.addEventListener('lostpointercapture',()=>{if(drag)settle();});
 dialog.addEventListener('click',e=>{if(closing||performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
 // Consume the delayed touch click even if the dialog has already gone away.
 window.addEventListener('click',e=>{if(e.isTrusted&&performance.now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
 viewport?.addEventListener('resize',scheduleFit);viewport?.addEventListener('scroll',scheduleFit);window.addEventListener('resize',scheduleFit);window.addEventListener('orientationchange',scheduleFit);window.addEventListener('pageshow',scheduleFit);input.addEventListener('focus',scheduleFit);
 new MutationObserver(refresh).observe(overlay,{attributes:true,attributeFilter:['class','data-editor-tab','data-design-pane']});source.addEventListener('input',refresh);
 window.MemoComposer={open,refresh};refresh();
})();
