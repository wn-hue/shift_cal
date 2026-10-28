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
 dialog.innerHTML='<header class="memo-compose-header"><button type="button" id="memo-compose-back" aria-label="취소"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><h2 id="memo-compose-title">메모</h2><button type="button" id="memo-compose-save" aria-label="메모 저장"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg></button></header><p id="memo-compose-date"></p><textarea id="memo-compose-input" maxlength="16000" placeholder="메모 입력" aria-labelledby="memo-compose-title" autofocus></textarea>';
 document.body.append(dialog);
 const input=dialog.querySelector('textarea'),viewport=window.visualViewport;
 let date='',initial='',opener=null;
 function refresh(){const value=source.value.trim();button.querySelector('span').textContent=value||tr('메모 입력');button.dataset.empty=String(!value);button.setAttribute('aria-label',tr(value?'메모':'메모 입력'));}
 function fit(){if(!dialog.open)return;if(viewport&&Math.abs(viewport.scale-1)>.01)return;const values={height:viewport?.height||innerHeight,width:viewport?.width||innerWidth,top:viewport?.offsetTop||0,left:viewport?.offsetLeft||0};for(const [key,value]of Object.entries(values))dialog.style.setProperty('--compose-'+key,value+'px');}
 function open(){if(dialog.open||!selectedDateStr)return;date=selectedDateStr;initial=source.value;input.value=initial;opener=document.activeElement;
  const css=getComputedStyle(overlay);for(const key of ['--ed-card','--ed-text','--ed-sub','--ed-blue','--ed-line'])dialog.style.setProperty(key,css.getPropertyValue(key));
  dialog.querySelector('#memo-compose-title').textContent=tr('메모');input.placeholder=tr('메모 입력');
  const locale={ko:'ko-KR',en:'en',zh:'zh-CN',ja:'ja'}[localStorage.getItem('shift_display_language')]||'ko-KR';
  dialog.querySelector('#memo-compose-date').textContent=new Intl.DateTimeFormat(locale,{month:'long',day:'numeric',weekday:'long'}).format(new Date(date+'T12:00:00'));
  overlay.dataset.memoComposing='true';dialog.showModal();fit();input.focus({preventScroll:true});
 }
 function close(){input.blur();dialog.close();delete overlay.dataset.memoComposing;refresh();if(opener?.isConnected)opener.focus({preventScroll:true});window.dispatchEvent(new Event('resize'));}
 function cancel(){if(input.value!==initial&&!confirm(tr('작성 중인 메모를 저장하지 않고 이동할까요?')))return;close();}
 function save(){const value=input.value.trim();if(value)dayMemos[date]=value;else delete dayMemos[date];localStorage.setItem('shift_day_memos',JSON.stringify(dayMemos));source.value=value;source.dispatchEvent(new Event('input',{bubbles:true}));window.AccountSync?.changed();window.GoogleSync?.changed(date);renderCalendar();close();}
 button.onclick=open;dialog.querySelector('#memo-compose-back').onclick=cancel;dialog.querySelector('#memo-compose-save').onclick=save;
 dialog.addEventListener('cancel',e=>{e.preventDefault();cancel();});
 dialog.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();save();}});
 viewport?.addEventListener('resize',fit);viewport?.addEventListener('scroll',fit);window.addEventListener('resize',fit);
 new MutationObserver(refresh).observe(overlay,{attributes:true,attributeFilter:['class','data-editor-tab','data-design-pane']});source.addEventListener('input',refresh);
 window.MemoComposer={open,refresh};refresh();
})();
