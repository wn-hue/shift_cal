/* A reference conversion alongside KRW payroll; never rewrite calculation inputs or stored pay. */
(()=>{'use strict';
 const key='shift_display_currency',names={ko:{KRW:'원화',USD:'달러',CNY:'위안',JPY:'엔화'},en:{KRW:'Korean won',USD:'US dollar',CNY:'Chinese yuan',JPY:'Japanese yen'},zh:{KRW:'韩元',USD:'美元',CNY:'人民币',JPY:'日元'},ja:{KRW:'ウォン',USD:'米ドル',CNY:'人民元',JPY:'円'}};
 let currency='KRW',data=null,loadedAt=0,pending=null,failed=false,lastLanguage='',frame=0;try{const saved=localStorage.getItem(key);if(names.ko[saved])currency=saved;}catch{}
 const label=document.getElementById('settings-currency-name'),gross=document.getElementById('hero-gross-pay'),net=document.getElementById('estimate-net');
 const grossFX=document.createElement('div'),netFX=document.createElement('div'),basis=document.createElement('p');grossFX.id='hero-currency-pay';netFX.id='estimate-currency-net';basis.id='currency-rate-note';
 for(const el of [grossFX,netFX,basis]){el.className='currency-reference';el.setAttribute('data-no-i18n','');el.hidden=true;}
 gross.after(grossFX);net.parentElement.after(netFX);document.querySelector('#salary-hero-card .hero-subgrid').after(basis);
 const lang=()=>document.documentElement.lang.startsWith('zh')?'zh':document.documentElement.lang.startsWith('ja')?'ja':document.documentElement.lang.startsWith('en')?'en':'ko';
 const copy=(ko,en,zh,ja)=>({ko,en,zh,ja}[lang()]);
 function amount(el){return Number(el.textContent.replace(/−/g,'-').replace(/[^\d.-]/g,''));}
 function render(){frame=0;label.textContent=names[lang()][currency]+' ('+currency+')';const active=currency!=='KRW';for(const el of [grossFX,netFX,basis])el.hidden=!active;if(!active)return;
  const rate=data?.rates?.[currency];if(!rate){grossFX.textContent=failed?copy('환율을 불러오지 못했어요.','Exchange rate unavailable.','无法加载汇率。','為替レートを取得できませんでした。'):copy('환산액 계산 중…','Converting…','正在换算…','換算中…');netFX.hidden=true;basis.replaceChildren();if(failed){const retry=document.createElement('button');retry.type='button';retry.textContent=copy('다시 시도','Retry','重试','再試行');retry.onclick=()=>{failed=false;fetchRates();};basis.append(retry);}return;}
  const fmt=new Intl.NumberFormat({ko:'ko-KR',en:'en-US',zh:'zh-CN',ja:'ja-JP'}[lang()],{style:'currency',currency,currencyDisplay:'code'});
  grossFX.textContent='≈ '+fmt.format(amount(gross)*rate.rate);netFX.textContent='≈ '+fmt.format(amount(net)*rate.rate);
  const source=document.createElement('a');source.href='https://frankfurter.dev/';source.target='_blank';source.rel='noopener noreferrer';source.textContent='Frankfurter';basis.replaceChildren(document.createTextNode(rate.date+' · '+copy('참고 환산 · ','Reference conversion · ','参考换算 · ','参考換算 · ')),source);
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(render);}
 async function fetchRates(){if(currency==='KRW'||pending)return;if(data&&Date.now()-loadedAt<600000){render();return;}failed=false;render();pending=(async()=>{try{const r=await fetch('/api/currency-rates');if(!r.ok)throw Error();const d=await r.json();if(d.base!=='KRW'||['USD','CNY','JPY'].some(c=>!Number.isFinite(d.rates?.[c]?.rate)||d.rates[c].rate<=0||!/^\d{4}-\d{2}-\d{2}$/.test(d.rates[c].date)))throw Error();data=d;loadedAt=Date.now();}catch{data=null;failed=true;}finally{pending=null;render();}})();await pending;}
 function set(next){if(!names.ko[next])return;try{localStorage.setItem(key,next);}catch{return;}currency=next;render();fetchRates();}
 function open(){window.SettingsOptions.open('통화',['KRW','USD','CNY','JPY'].map(value=>({value,label:names[lang()][value]+' ('+value+')'})),currency,set);}
 new MutationObserver(schedule).observe(gross,{subtree:true,childList:true,characterData:true});new MutationObserver(schedule).observe(net,{subtree:true,childList:true,characterData:true});
 new MutationObserver(()=>{if(lastLanguage!==lang()){lastLanguage=lang();schedule();}}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 window.addEventListener('storage',e=>{if(e.key===key){currency=names.ko[e.newValue]?e.newValue:'KRW';render();fetchRates();}});
 window.addEventListener('focus',()=>fetchRates());
 window.AppCurrency={open,set,get currency(){return currency;}};render();fetchRates();
})();
