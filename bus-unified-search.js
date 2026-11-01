/* One input for registered places, addresses and routes. Remote place lookup is explicit only. */
(()=>{'use strict';
 const C=window.BusLocationCore,page=document.getElementById('commute-dialog'),body=page.querySelector('.commute-page-body'),topbar=page.querySelector('.commute-topbar');
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const view=el('section','bus-unified-search-page');view.id='bus-unified-search';view.hidden=true;view.tabIndex=-1;view.setAttribute('aria-label','통근버스 통합 검색');
 const header=el('div','bus-unified-topbar'),back=el('button','bus-unified-back');back.type='button';back.setAttribute('aria-label','검색에서 돌아가기');back.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>';header.append(back,el('h2','','정류장 검색'));view.append(header);
 const form=el('form','bus-unified-form'),label=el('label','bus-unified-label','장소·주소·호차·방향 검색'),input=el('input','bus-unified-input'),submit=el('button','bus-unified-submit','검색');input.id='bus-unified-input';input.type='search';input.maxLength=100;input.autocomplete='off';input.placeholder='정류장, 주소, 5호차, 상록수 방면';input.enterKeyHint='search';label.append(input);submit.type='submit';form.append(label,submit);view.append(form);
 const actions=el('div','bus-unified-actions'),gps=el('button','bus-unified-gps','현재 위치로 찾기'),contextText=el('small','bus-unified-context');gps.type='button';actions.append(gps,contextText);view.append(actions);
 const regions=el('div','bus-search-regions');regions.setAttribute('role','group');regions.setAttribute('aria-label','검색 지역');view.append(regions);
 const status=el('p','bus-unified-status');status.setAttribute('role','status');view.append(status);const results=el('div','bus-unified-results');view.append(results);const surface=el('div','bus-unified-surface');while(view.firstChild)surface.append(view.firstChild);view.append(surface);page.append(view);
 let configuration=null,showing=false,active=false,closing=false,region='all',composing=false,token=0,controller=null,remote=[],savedInert=[],opener=null,fitFrame=0;
 function fit(){
  if(!showing||closing)return;const vp=visualViewport;if(vp&&Math.abs(vp.scale-1)>.01)return;const height=page.clientHeight;
  // WKWebView can report a transient pan around a focused input even with no keyboard.
  // Applying that pan to this fixed page creates the blank strip above the header.
  const keyboard=height-(vp?.height||innerHeight)>120;
  const offset=keyboard?Math.max(0,Math.min(height,(vp?.offsetTop||0)-page.getBoundingClientRect().top)):0;
  view.style.setProperty('--bus-search-top',offset+'px');view.style.setProperty('--bus-search-height',Math.max(0,Math.min(height-offset,(vp?.height||innerHeight)))+'px');
 }
 function scheduleFit(){if(!fitFrame)fitFrame=requestAnimationFrame(()=>{fitFrame=0;fit();});}
 visualViewport?.addEventListener('resize',scheduleFit);visualViewport?.addEventListener('scroll',scheduleFit);window.addEventListener('resize',scheduleFit);
 // Only the results own a vertical drag. Keep edge pulls from reaching the page behind
 // them, and release the input's native focus pan when the user starts browsing.
 let drag=null,enterFocus=false;
 view.addEventListener('touchstart',e=>{enterFocus=false;drag=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY,lastY:e.touches[0].clientY,list:results.contains(e.target)}:null;},{passive:true});
 view.addEventListener('touchmove',e=>{
  if(e.touches.length!==1){drag=null;return;}if(!drag)return;const dx=e.touches[0].clientX-drag.x,dy=e.touches[0].clientY-drag.y,step=e.touches[0].clientY-drag.lastY;drag.lastY=e.touches[0].clientY;if(Math.abs(dy)<8||Math.abs(dy)<=Math.abs(dx))return;
  if(document.activeElement===input){input.blur();scheduleFit();}
  const edge=!drag.list||(step>0?results.scrollTop<=0:step<0&&results.scrollTop+results.clientHeight>=results.scrollHeight-1);
  if(edge&&e.cancelable)e.preventDefault();
 },{passive:false});
 view.addEventListener('touchend',()=>{drag=null;},{passive:true});view.addEventListener('touchcancel',()=>{drag=null;},{passive:true});
 input.addEventListener('focus',scheduleFit);input.addEventListener('blur',scheduleFit);
 function abort(){++token;controller?.abort();controller=null;gps.disabled=false;submit.disabled=false;submit.setAttribute('aria-busy','false');}
 function context(){return configuration?.context()||{routes:[],periodLabel:'',factory:'1',direction:'in'};}
 function placeRegion(p){const address=p.address||'';if(address.includes('시흥'))return 'siheung';if(address.includes('안산'))return 'ansan';if(!p.aliases){if(/siheung/i.test(address))return 'siheung';if(/ansan/i.test(address))return 'ansan';return 'other';}return ['시화중학교','서해중학교','도일초등학교','시흥소방서'].includes(p.name)?'siheung':'ansan';}
 const routeOnly=q=>/^\d+(?:\s*[-–—]\s*\d+)?\s*(?:호(?:\s*차)?|번(?:\s*(?:차|버스))?)(?:\s|$)|^\d+(?:\s*[-–—]\s*\d+)?$|방면|방향|가는|쪽/.test(String(q).normalize('NFKC'));
 const acceptsPlace=p=>region==='all'||placeRegion(p)===region;
 const acceptsRoute=r=>region==='all'||(/시화|배곧/.test(r.name)?'siheung':'ansan')===region;
 function rowPlace(p){
  const row=el('div','bus-unified-place-row'),choice=el('button','bus-unified-place');choice.type='button';choice.append(el('strong','',p.name),el('small','',p.address||(p.officialMobileNo?'정류장 '+p.officialMobileNo:p.aliases?.[0]||'통근버스 주변 기준점')));choice.onclick=()=>{configuration?.onPlace(p);close();};
  const map=el('a','bus-unified-map');map.href=p.mapSource||(p.provider==='kakao'||p.precision==='shared-pin'?p.source:'https://map.kakao.com/link/map/'+p.lat+','+p.lon);map.target='_blank';map.rel='noopener noreferrer';map.setAttribute('aria-label',p.name+' 지도에서 보기');map.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z"/><path d="M9 3v16m6-14v16"/></svg>';row.append(choice,map);return row;
 }
 function render(){
  if(!configuration)return;const ctx=context(),q=input.value.trim();contextText.textContent=ctx.periodLabel+' · '+ctx.factory+'공장';gps.hidden=ctx.direction!=='in'||ctx.period==='shuttle';results.replaceChildren();
  for(const b of regions.children)b.setAttribute('aria-pressed',String(b.dataset.region===region));
  const catalog=window.BusStopLocations.points,local=q?C.search(catalog,q,{limit:100,minLength:1}):catalog,combined=[...local,...remote],exactPlaces=C.exactPlaces(combined,q);
  const places=(exactPlaces.length?exactPlaces:combined).filter(p=>ctx.period!=='shuttle'||p.aliases?.some(a=>a.startsWith('안산역'))).filter(acceptsPlace).filter((p,i,all)=>all.findIndex(v=>v.source===p.source&&v.lat===p.lat&&v.lon===p.lon)===i).sort((a,b)=>q?0:a.name.localeCompare(b.name,'ko'));
  const hasExactPlace=q&&C.exactPlaces(catalog,q).some(p=>acceptsPlace(p)&&(ctx.period!=='shuttle'||p.aliases?.some(a=>a.startsWith('안산역'))));
  const routes=q&&(!hasExactPlace||routeOnly(q))?C.searchRoutes(ctx.routes,q,catalog).filter(acceptsRoute):[];
  const routeFirst=routeOnly(q);
  function appendRoutes(){if(!routes.length)return;results.append(el('h3','bus-unified-section','노선'));const all=el('button','bus-unified-query-all','노선 검색 결과 '+routes.length+'개 보기');all.type='button';all.onclick=()=>{configuration.onQuery(q);close({results:true});};results.append(all);for(const r of routes){const b=el('button','bus-unified-route');b.type='button';b.append(el('strong','',r.name),el('small','',ctx.periodLabel+' · '+r.stops.length+'곳 경유'));b.onclick=()=>{configuration.onQuery(r.name);close({results:true});};results.append(b);}}
  function appendPlaces(){if(!places.length)return;results.append(el('h3','bus-unified-section',q?'정류장·장소':'정류장·장소 목록'));for(const p of places)results.append(rowPlace(p));}
  if(routeFirst){appendRoutes();appendPlaces();}else{appendPlaces();appendRoutes();}
  if(!places.length&&!routes.length){results.append(el('p','bus-unified-empty',q?(routeOnly(q)?'선택한 공장·탑승 시간에 맞는 노선이 없어요. 검색어나 조회 조건을 확인해 주세요.':'일치하는 장소나 노선이 없어요. 주소·장소를 더 찾아보려면 검색을 눌러 주세요.'):'이 지역에 등록된 장소가 없어요.'));}
 }
 for(const[value,text]of[['all','전체'],['ansan','안산'],['siheung','시흥·배곧']]){const b=el('button','',text);b.type='button';b.dataset.region=value;b.onclick=()=>{region=value;render();results.scrollTop=0;};regions.append(b);}
 function show({initial='',focus=true,reset=true}={}){
  if(!configuration)return;if(!active){opener=document.activeElement;savedInert=[...new Set([body,topbar,...[...document.body.children].filter(n=>n!==page&&!['SCRIPT','STYLE','LINK'].includes(n.tagName))])].map(n=>[n,n.inert]);savedInert.forEach(([n])=>n.inert=true);active=true;}
  showing=true;closing=false;enterFocus=focus;view.hidden=false;if(reset){abort();remote=[];region='all';input.value=initial;status.textContent='';}render();if(reset){results.scrollTop=0;page.scrollTop=0;view.scrollTop=0;surface.scrollTop=0;}fit();
  // Touch browsers show a stable list first; tapping the input opens the keyboard.
  window.AppMotion.page(view,true,()=>{if(enterFocus&&showing)(matchMedia('(hover:hover) and (pointer:fine)').matches?input:view).focus({preventScroll:true});});
 }
 function hide(){
  if(!active||!showing)return;showing=false;closing=true;abort();configuration?.cancel();input.blur();window.AppMotion.page(view,false,()=>{if(showing)return;active=false;closing=false;view.hidden=true;savedInert.forEach(([n,value])=>n.inert=value);view.style.removeProperty('--bus-search-height');view.style.removeProperty('--bus-search-top');if(opener?.isConnected)opener.focus({preventScroll:true});});
 }
 function open(initial=''){configuration?.cancel();if(history.state?.shiftBusSearch){show({initial});return;}history.pushState({...history.state,shiftCommute:true,shiftBusSearch:true},'',location.href);show({initial});}
 function close(options={}){hide();if(history.state?.shiftBusSearch){if(options.results&&!history.state.shiftBusResults){history.replaceState({...history.state,shiftBusSearch:false,shiftBusResults:true},'',location.href);window.ShiftBusBrowser.syncHistory();}else history.back();}}
 back.onclick=close;gps.onclick=async()=>{abort();status.textContent='현재 위치를 확인하고 있어요.';const current=++token;gps.disabled=true;const ok=await configuration?.onGPS();if(current!==token||!showing)return;gps.disabled=false;if(ok)close();};
 input.addEventListener('compositionstart',()=>{composing=true;abort();});input.addEventListener('compositionend',()=>{composing=false;update();});
 function update(){abort();remote=[];status.textContent='';if(!composing){render();results.scrollTop=0;}}
 input.addEventListener('input',update);view.addEventListener('keydown',e=>{if(e.key==='Escape'&&!composing){e.preventDefault();e.stopPropagation();close();}});
 form.onsubmit=async e=>{
  e.preventDefault();if(composing)return;const q=input.value.trim();if(!q){render();return;}abort();render();
  if(routeOnly(q)){input.blur();return;}
  if(C.search(window.BusStopLocations.points,q,{limit:100,minLength:1}).length||C.searchRoutes(context().routes,q,window.BusStopLocations.points).length){input.blur();return;}
  if(context().period==='shuttle'){status.textContent='안산역 셔틀의 출발지는 안산역으로 고정돼 있어요.';return;}
  if(q.length<2){status.textContent='추가 장소·주소 검색은 두 글자 이상 입력해 주세요.';return;}
  const current=++token;controller=new AbortController();submit.disabled=true;submit.setAttribute('aria-busy','true');status.textContent='주소·장소를 찾고 있어요.';
  try{const r=await fetch('/api/bus-places?q='+encodeURIComponent(q),{signal:controller.signal,cache:'no-store'}),data=await r.json();if(current!==token||!showing)return;if(!r.ok)throw Error(data.message||'장소를 찾지 못했어요.');remote=Array.isArray(data.places)?data.places.filter(C.valid):[];status.textContent=remote.length?'장소를 선택해 주세요.':'검색 결과가 없어요. 다른 주소나 장소 이름을 입력해 주세요.';render();}
  catch(error){if(current===token&&showing&&error.name!=='AbortError')status.textContent=error.message==='Failed to fetch'?'인터넷 연결을 확인해 주세요.':error.message;}
  finally{if(current===token&&showing){submit.disabled=false;submit.setAttribute('aria-busy','false');}}
 };
 window.BusUnifiedSearch={configure(next){configuration=next;if(showing)render();},open,close,hide,syncHistory(){if(history.state?.shiftCommute&&history.state?.shiftBusSearch)show({reset:false});else hide();},get isOpen(){return showing;},setStatus(message,busy=false){if(showing){status.textContent=message;gps.disabled=busy;}},cancel:abort};
})();
