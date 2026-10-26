/* Origin GPS stays in memory on this device. Destination search is explicit, never autocomplete. */
(()=>{'use strict';
 const C=window.BusLocationCore,states={in:{point:null,label:'',radius:1000,query:''},out:{point:null,label:'',radius:1000,query:''}};
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const meters=n=>n<1000?Math.round(n/10)*10+'m':(n/1000).toFixed(1)+'km';
 function mount(root,{direction,period,changed}){
  const state=states[direction],host=el('section','bus-discovery');host.setAttribute('aria-label',direction==='in'?'출근 주변 노선 추천':'퇴근 목적지 노선 추천');root.append(host);
  host.append(el('h2','',direction==='in'?'가까운 곳에서 출근해요':'목적지 근처에서 내려요'));
  let token=0,controller=null;
  const status=el('p','bus-location-status'),results=el('div','bus-place-results'),selected=el('div','bus-location-selected');status.setAttribute('role','status');
  const choose=(point,label)=>{state.point=point;state.label=label;results.replaceChildren();status.textContent='';paint();changed();};
  if(direction==='in'){
   const gps=el('button','bus-gps-button','현재 위치로 찾기');gps.type='button';gps.onclick=()=>{
    const serial=++token;controller?.abort();submit.disabled=false;submit.setAttribute('aria-busy','false');results.replaceChildren();if(!navigator.geolocation){status.textContent='위치를 사용할 수 없어요. 아래에서 주소를 검색해 주세요.';return;}
    gps.disabled=true;gps.setAttribute('aria-busy','true');status.textContent='현재 위치를 확인하고 있어요.';
    navigator.geolocation.getCurrentPosition(p=>{if(!host.isConnected||serial!==token)return;gps.disabled=false;gps.setAttribute('aria-busy','false');const point={lat:p.coords.latitude,lon:p.coords.longitude};if(!C.valid(point)){status.textContent='위치를 확인하지 못했어요. 주소로 검색해 주세요.';return;}if(p.coords.accuracy>1000){status.textContent='위치 오차가 너무 커요. 주소 검색으로 출발 위치를 선택해 주세요.';return;}choose(point,'현재 위치');if(p.coords.accuracy>300)status.textContent='위치 오차가 커요. 주소 검색으로 출발 위치를 선택할 수 있어요.';},e=>{if(!host.isConnected||serial!==token)return;gps.disabled=false;gps.setAttribute('aria-busy','false');status.textContent=e.code===1?'위치 권한이 꺼져 있어요. 아래에서 주소를 검색해 주세요.':'위치를 확인하지 못했어요. 다시 시도하거나 주소를 검색해 주세요.';},{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
   };const methods=el('div','bus-start-methods'),manual=el('button','bus-manual-button','주소로 찾기');manual.type='button';manual.onclick=()=>{form.hidden=!form.hidden;manual.setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)input.focus({preventScroll:true});};manual.setAttribute('aria-expanded',String(!!state.query));methods.append(gps,manual);host.append(methods);
  }
  const form=el('form','bus-place-form'),label=el('label','bus-place-label',direction==='in'?'또는 출발할 장소·주소':'목적지 장소·주소'),input=el('input','bus-place-input'),submit=el('button','bus-place-submit','검색');input.type='search';input.maxLength=100;input.placeholder=direction==='in'?'예: 와동체육공원':'예: 식당 이름, 아파트, 도로명주소';input.value=state.query;input.autocomplete='off';submit.type='submit';label.append(input);form.append(label,submit);form.hidden=direction==='in'&&!state.query;host.append(form,status,results,selected);
  form.onsubmit=async e=>{e.preventDefault();const q=input.value.trim();state.query=q;if(q.length<2){status.textContent='장소나 주소를 두 글자 이상 입력해 주세요.';return;}const serial=++token;controller?.abort();controller=new AbortController();submit.disabled=true;submit.setAttribute('aria-busy','true');const gps=host.querySelector('.bus-gps-button');if(gps){gps.disabled=false;gps.setAttribute('aria-busy','false');}results.replaceChildren();status.textContent='장소를 찾고 있어요.';
   try{const r=await fetch('/api/bus-places?q='+encodeURIComponent(q),{signal:controller.signal,cache:'no-store'}),data=await r.json();if(serial!==token||!host.isConnected)return;if(!r.ok)throw Error(data.message||'장소를 찾지 못했어요.');const places=Array.isArray(data.places)?data.places.filter(C.valid):[];status.textContent=places.length?'아래에서 정확한 장소를 선택해 주세요.':'검색 결과가 없어요. 안산·시흥 지역의 구체적인 장소나 주소로 다시 검색해 주세요.';
    for(const p of places.slice(0,6)){const b=el('button','bus-place-choice');b.type='button';b.append(el('strong','',p.name),el('small','',p.address||'지도에 등록된 장소'));b.onclick=()=>choose({lat:p.lat,lon:p.lon},p.name);results.append(b);}
   }catch(error){if(serial===token&&host.isConnected&&error.name!=='AbortError')status.textContent=error.message==='Failed to fetch'?'인터넷 연결을 확인해 주세요.':error.message;}finally{if(serial===token&&host.isConnected){submit.disabled=false;submit.setAttribute('aria-busy','false');}}
  };
  const ranges=el('div','bus-distance-filters');ranges.setAttribute('role','group');ranges.setAttribute('aria-label','추천 거리 범위');for(const radius of[500,1000,2000]){const b=el('button','bus-distance-chip',meters(radius));b.type='button';b.dataset.radius=radius;b.onclick=()=>{state.radius=radius;paint();changed();};ranges.append(b);}host.append(ranges);
  host.append(el('p','bus-distance-note','직선거리 · 공유 정류장 핀을 우선 사용하고, 일부 지점은 주변 기준점으로 계산해요. 출·퇴근 정차 방향은 회사 안내를 확인해 주세요.'));
  const audit=el('details','bus-location-guide');audit.append(el('summary','','추천 범위·위치 확인 안내'));const text=el('p','','일부 정류장만 위치가 등록돼 있어요. 등록되지 않은 정류장은 거리 추천에서 제외하며, 실제 도보 거리·도착 시간과는 달라요.');const link=el('a','','위치 확인이 필요한 정류장 보기');link.href='./bus-stop-locations.html';link.target='_blank';link.rel='noopener';const source=el('a','','지도 검색: OpenStreetMap · Photon');source.href='https://www.openstreetmap.org/copyright';source.target='_blank';source.rel='noopener';audit.append(text,link,source);host.append(audit);
  function paint(){selected.replaceChildren();ranges.hidden=!state.point;for(const b of ranges.children)b.setAttribute('aria-pressed',String(Number(b.dataset.radius)===state.radius));if(state.point){selected.append(el('strong','',state.label));const clear=el('button','bus-location-clear','전체 노선 보기');clear.type='button';clear.onclick=()=>{++token;controller?.abort();submit.disabled=false;submit.setAttribute('aria-busy','false');const gps=host.querySelector('.bus-gps-button');if(gps){gps.disabled=false;gps.setAttribute('aria-busy','false');}results.replaceChildren();state.point=null;state.label='';status.textContent='';paint();changed();};selected.append(clear);}}
  paint();let matches=new Map();
  return {
   filter(routes){matches=new Map();if(!state.point)return routes;const ranked=C.rank(routes,period,state.point,state.radius,window.BusStopLocations.points);for(const item of ranked)matches.set(item.route.id,item);return ranked.map(item=>item.route);},
   get active(){return !!state.point;},
   decorate(box,route){const item=matches.get(route.id);if(!item)return;const n=item.nearest,info=el('div','bus-nearby-result');info.append(el('strong','',(direction==='in'?'가까운 승차 지점 · ':'추천 하차 지점 · ')+n.stop.name),el('span','',meters(n.distance)+' · '+(direction==='in'?'출발 위치에서':'목적지까지')+' 직선거리'),el('small','',(n.place.precision==='shared-pin'?'공유 정류장 핀: ':'주변 기준점: ')+n.place.name));if(n.place.precision==='shared-pin'){const link=el('a','bus-pin-link','정류장 위치 확인 ↗');link.href=n.place.source;link.target='_blank';link.rel='noopener';info.append(link);}box.append(info);},
   highlight(row,route,stop){if(matches.get(route.id)?.nearest.stop===stop)row.classList.add('bus-stop-nearby');}
  };
 }
 window.BusDiscovery={mount};
})();
