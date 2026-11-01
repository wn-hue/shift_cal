/* One accessible bottom sheet for settings choices and reversible preference reset. */
(()=>{'use strict';
 const dialog=document.createElement('dialog');dialog.id='settings-options';dialog.setAttribute('aria-labelledby','settings-options-title');
 dialog.innerHTML='<h2 id="settings-options-title" tabindex="-1"></h2><div id="settings-options-body"></div>';
 document.body.append(dialog);window.AppSheets.attach(dialog);
 const title=dialog.querySelector('h2'),body=dialog.querySelector('#settings-options-body');let trigger;
 function show(heading){trigger=document.activeElement;title.textContent=heading;body.replaceChildren();if(!dialog.open)dialog.showModal();window.AppSheets.fit();}
 function open(heading,options,selected,apply){show(heading);const group=document.createElement('div');group.setAttribute('role','radiogroup');group.setAttribute('aria-labelledby',title.id);
  for(const option of options){const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');label.className='settings-radio-row';input.type='radio';input.name='settings-choice';input.value=option.value;input.checked=option.value===selected;text.textContent=option.label;if(option.nativeLanguage){text.lang=option.nativeLanguage;text.setAttribute('data-no-i18n','');}input.onchange=()=>{apply(option.value);dialog.close();};label.append(input,text);group.append(label);}body.append(group);group.querySelector('input:checked')?.focus({preventScroll:true});window.AppI18n?.refresh();
 }
 function confirm(heading,message,apply){show(heading);const p=document.createElement('p'),button=document.createElement('button');p.textContent=message;p.className='settings-confirm-copy';button.textContent='초기화';button.className='settings-confirm-action';button.onclick=()=>{apply();dialog.close();};body.append(p,button);title.focus({preventScroll:true});window.AppI18n?.refresh();}
 dialog.addEventListener('close',()=>trigger?.focus({preventScroll:true}));window.SettingsOptions={open,confirm};
})();
