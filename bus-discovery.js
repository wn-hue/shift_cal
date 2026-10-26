/* GPS stays in memory. Registered places are searched locally before an explicit network search. */
(()=>{'use strict';
 const C=window.BusLocationCore,states={in:{point:null,label:'',radius:1000,query:'',method:'gps'},out:{point:null,label:'',radius:1000,query:'',method:'address'}};
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const meters=n=>n<1000?Math.round(n/10)*10+'m':(n/1000).toFixed(1)+'km';
 function mount(root,{direction,period,changed,onChoose,compact=false}){
  const state=states[direction],host=el('section','bus-discovery'),catalog=window.BusStopLocations.points;host.setAttribute('aria-label',direction==='in'?'출근 주변 노선 추천':'퇴근 목적지 노선 추천');root.append(host);
  host.append(el('h2','',compact?(direction==='in'?'출발지 검색':'도착지 검색'):(direction==='in'?'가까운 곳에서 출근해요':'목적지 근처에서 내려요')));
  let token=0,controller=null,gps=null,manual=null,matches=new Map();
  const status=el('p','bus-location-status'),results=el('div','bus-place-results'),selected=el('div','bus-location-selected');status.setAttribute('role','status');
  const form=el('form','bus-place-form'),label=el('label','bus-place-label',direction==='in'?'또는 출발할 장소·주소':'목적지 장소·주소'),input=el('input','bus-place-input'),submit=el('button','bus-place-submit','검색');
  input.type='search';input.maxLength=100;input.placeholder=direction==='in'?'장소 이름 또는 도로명주소':'목적지 이름 또는 도로명주소';input.value=state.query;input.autocomplete='off';submit.type='submit';label.append(input);form.append(label,submit);
  function cancelPending(){++token;controller?.abort();submit.disabled=false;submit.setAttribute('aria-busy','false');if(gps){gps.disabled=false;gps.setAttribute('aria-busy','false');}}
  function method(next){
   cancelPending();results.replaceChildren();status.textContent='';
   if(state.method!==next){state.point=null;state.label='';state.method=next;paint();changed('method');}
   paintMethod();
  }
  function paintMethod(){form.hidden=direction==='in'&&state.method!=='address';gps?.setAttribute('aria-pressed',String(state.method==='gps'));manual?.setAttribute('aria-pressed',String(state.method==='address'));manual?.setAttribute('aria-expanded',String(!form.hidden));}
  function choose(point,label){state.point=point;state.label=label;results.replaceChildren();status.textContent='';paint();changed('place');onChoose?.();}
  if(direction==='in'){
   gps=el('button','bus-gps-button','현재 위치로 찾기');gps.type='button';gps.onclick=()=>{
    method('gps');const serial=++token;
    if(!navigator.geolocation){status.textContent='위치를 사용할 수 없어요. 주소로 찾기를 선택해 주세요.';return;}
    gps.disabled=true;gps.setAttribute('aria-busy','true');status.textContent='현재 위치를 확인하고 있어요.';
    navigator.geolocation.getCurrentPosition(p=>{
     if(!host.isConnected||serial!==token)return;gps.disabled=false;gps.setAttribute('aria-busy','false');const point={lat:p.coords.latitude,lon:p.coords.longitude};
     if(!C.valid(point)){status.textContent='위치를 확인하지 못했어요. 주소로 찾기를 선택해 주세요.';return;}
     if(p.coords.accuracy>1000){status.textContent='위치 오차가 너무 커요. 주소로 찾기를 선택해 주세요.';return;}
     choose(point,'현재 위치');if(p.coords.accuracy>300)status.textContent='위치 오차가 커요. 주소로 찾기로 출발 위치를 선택할 수 있어요.';
    },e=>{if(!host.isConnected||serial!==token)return;gps.disabled=false;gps.setAttribute('aria-busy','false');status.textContent=e.code===1?'위치 권한이 꺼져 있어요. 주소로 찾기를 선택해 주세요.':'위치를 확인하지 못했어요. 다시 시도하거나 주소로 찾기를 선택해 주세요.';},{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
   };
   const methods=el('div','bus-start-methods');methods.setAttribute('role','group');methods.setAttribute('aria-label','출발 위치 찾는 방법');manual=el('button','bus-manual-button','주소로 찾기');manual.type='button';manual.onclick=()=>{method('address');input.focus({preventScroll:true});};methods.append(gps,manual);host.append(methods);
  }
  host.append(form,status,results,selected);paintMethod();
  function showPlaces(places){
   status.textContent=places.length?'아래에서 정확한 장소를 선택해 주세요.':'검색 결과가 없어요. 안산·시흥 지역의 구체적인 장소나 주소로 다시 검색해 주세요.';
   for(const p of places.slice(0,6)){const b=el('button','bus-place-choice');b.type='button';b.append(el('strong','',p.name),el('small','',p.address||'지도에 등록된 장소'));b.onclick=()=>choose({lat:p.lat,lon:p.lon},p.name);results.append(b);}
  }
  form.onsubmit=async e=>{
   e.preventDefault();const q=input.value.trim();state.query=q;if(q.length<2){status.textContent='장소나 주소를 두 글자 이상 입력해 주세요.';return;}
   cancelPending();results.replaceChildren();const local=C.search(catalog,q);if(local.length){showPlaces(local);return;}
   const serial=++token;controller=new AbortController();submit.disabled=true;submit.setAttribute('aria-busy','true');status.textContent='장소를 찾고 있어요.';
   try{const r=await fetch('/api/bus-places?q='+encodeURIComponent(q),{signal:controller.signal,cache:'no-store'}),data=await r.json();if(serial!==token||!host.isConnected)return;if(!r.ok)throw Error(data.message||'장소를 찾지 못했어요.');showPlaces(Array.isArray(data.places)?data.places.filter(C.valid):[]);}
   catch(error){if(serial===token&&host.isConnected&&error.name!=='AbortError')status.textContent=error.message==='Failed to fetch'?'인터넷 연결을 확인해 주세요.':error.message;}
   finally{if(serial===token&&host.isConnected){submit.disabled=false;submit.setAttribute('aria-busy','false');}}
  };
  const ranges=el('div','bus-distance-filters');ranges.setAttribute('role','group');ranges.setAttribute('aria-label','추천 거리 범위');for(const radius of[500,1000,2000]){const b=el('button','bus-distance-chip',meters(radius));b.type='button';b.dataset.radius=radius;b.onclick=()=>{state.radius=radius;paint();changed('radius');};ranges.append(b);}host.append(ranges);
  const periodStops=[...new Set(window.ShiftBusRoutes.routes.filter(r=>r.period===period).flatMap(r=>r.stops.map(s=>s.name)))].filter(name=>!/공장|본사/.test(name)),registered=periodStops.filter(name=>C.lookup(catalog,name)).length;
  host.append(el('p','bus-distance-note','정류장 위치 '+registered+'/'+periodStops.length+'곳 연결 · 거리는 직선거리예요.'));
  const audit=el('details','bus-location-guide');audit.append(el('summary','','추천 범위·위치 확인 안내'));const text=el('p','','공유 정류장 핀과 지도에 등록된 주변 장소를 기준으로 추천해요. 건물·단지의 기준점은 실제 승차 위치와 다를 수 있어요. 미확인 지점은 제외하며 정차 방향은 회사 안내를 확인해 주세요.');const link=el('a','','정류장 위치와 연결 장소 확인');link.href='./bus-stop-locations.html';link.target='_blank';link.rel='noopener';audit.append(text,link);host.append(audit);
  function paint(){
   selected.replaceChildren();ranges.hidden=compact||!state.point;for(const b of ranges.children)b.setAttribute('aria-pressed',String(Number(b.dataset.radius)===state.radius));
   if(state.point){selected.append(el('strong','',state.label));const clear=el('button','bus-location-clear',compact?'선택 해제':'전체 노선 보기');clear.type='button';clear.onclick=()=>{cancelPending();results.replaceChildren();state.point=null;state.label='';status.textContent='';paint();changed('clear');};selected.append(clear);}
  }
  if(compact){host.classList.add('bus-discovery-picker');ranges.hidden=true;host.querySelector('.bus-distance-note').hidden=true;host.querySelector('.bus-location-guide').hidden=true;}
  paint();if(compact)ranges.hidden=true;return {
   filter(routes){matches=new Map();if(!state.point)return routes;const ranked=C.rank(routes,period,state.point,state.radius,catalog);for(const item of ranked)matches.set(item.route.id,item);return ranked.map(item=>item.route);},
   get active(){return !!state.point;},boardingTime(route){return matches.get(route.id)?.nearest.stop.time||null;},
   get label(){return state.label;},get radius(){return state.radius;},get point(){return state.point?{...state.point}:null;},
   cancel:cancelPending,openAddress(){method('address');input.focus({preventScroll:true});},requestGPS(){gps?.click();},setRadius(radius){if([500,1000,2000].includes(radius)){state.radius=radius;paint();changed('radius');}},
   decorate(box,route){const item=matches.get(route.id);if(!item)return;const n=item.nearest,info=el('div','bus-nearby-result');info.append(el('strong','',(direction==='in'?'가까운 승차 지점 · ':'추천 하차 지점 · ')+n.stop.name),el('span','',meters(n.distance)+' · '+(direction==='in'?'출발 위치에서':'목적지까지')+' 직선거리'),el('small','',(n.place.precision==='shared-pin'?'공유 정류장 핀: ':'주변 기준점: ')+n.place.name));const from=direction==='in'?state.point:n.place,to=direction==='in'?n.place:state.point,fromName=direction==='in'?state.label:n.stop.name,toName=direction==='in'?n.stop.name:state.label,walk=C.walkingLinks(from,to,fromName,toName,location.origin,/Android/i.test(navigator.userAgent));
    if(walk){const links=el('div','bus-walk-links');for(const [key,text]of[['naver','네이버 도보 길찾기'],['kakao','카카오 도보 길찾기']]){const a=el('a','bus-walk-link',text);a.href=walk[key];if(key==='kakao'){a.target='_blank';a.rel='noopener noreferrer';}links.append(a);}info.append(links);}
    if(direction==='in'&&n.stop.time)info.insertBefore(el('span','bus-boarding-time',n.stop.time+' 승차'),info.children[1]);
    if(n.place.precision==='shared-pin'||n.place.provider==='kakao'||n.place.mapSource){const link=el('a','bus-pin-link','정류장 위치 확인 ↗');link.href=n.place.mapSource||n.place.source;link.target='_blank';link.rel='noopener';info.append(link);}box.append(info);},
   highlight(row,route,stop){if(matches.get(route.id)?.nearest.stop===stop)row.classList.add('bus-stop-nearby');}
  };
 }
 window.BusDiscovery={mount};
})();
