/* Location selection and distance ranking share one controller; search UI lives in the unified screen. */
(()=>{'use strict';
 const C=window.BusLocationCore,states={in:{point:null,label:'',radius:500},out:{point:null,label:'',radius:500}};
 const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const meters=n=>n<1000?Math.round(n/10)*10+'m':(n/1000).toFixed(1)+'km';
 function create({direction,period,changed,onStatus=()=>{}}){
  const state=states[direction];let serial=0,pending=null,matches=new Map(),selection=state.selection||null,manualRadius=null,recommendation=null;
  function cancel(){++serial;pending?.(false);pending=null;onStatus('',false);}
  function setPlace(point,label){if(!C.valid(point))return;cancel();state.point={lat:point.lat,lon:point.lon};state.label=String(label||'선택한 장소').slice(0,150);selection=state.selection=point.source?{source:point.source}:null;manualRadius=null;changed('place');}
  function requestGPS(){
   cancel();if(!navigator.geolocation){onStatus('위치를 사용할 수 없어요. 검색창에서 장소나 주소를 선택해 주세요.',false);return Promise.resolve(false);}
   const current=++serial;onStatus('현재 위치를 확인하고 있어요.',true);
   return new Promise(resolve=>{pending=resolve;
    const fail=message=>{if(current!==serial)return;pending=null;onStatus(message,false);resolve(false);};
    navigator.geolocation.getCurrentPosition(p=>{
     if(current!==serial)return;const point={lat:p.coords.latitude,lon:p.coords.longitude};
     if(!C.valid(point)){fail('위치를 확인하지 못했어요. 장소나 주소로 검색해 주세요.');return;}
     if(p.coords.accuracy>1000){fail('위치 오차가 너무 커요. 장소나 주소로 검색해 주세요.');return;}
     pending=null;state.point=point;state.label='현재 위치';selection=state.selection=null;manualRadius=null;onStatus(p.coords.accuracy>300?'위치 오차가 커요. 장소나 주소를 직접 선택할 수도 있어요.':'',false);changed('place');resolve(true);
    },e=>fail(e.code===1?'위치 권한이 꺼져 있어요. 장소나 주소로 검색해 주세요.':'위치를 확인하지 못했어요. 다시 시도하거나 장소·주소로 검색해 주세요.'),{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
   });
  }
  return {
   cancel,requestGPS,setPlace,
   clear(){cancel();state.point=null;state.label='';selection=state.selection=null;manualRadius=null;changed('clear');},
   get active(){return !!state.point;},get label(){return state.label;},get radius(){return recommendation?.radius||state.radius;},get recommendation(){return recommendation;},get point(){return state.point?{...state.point}:null;},
   setRadius(radius){if([500,1000,2000].includes(radius)){manualRadius=radius;state.radius=radius;changed('radius');}},
   filter(routes){matches=new Map();recommendation=null;if(!state.point)return routes;recommendation=C.recommend(routes,period,state.point,window.BusStopLocations.points,{selectedPlace:selection,radius:manualRadius});if(recommendation.radius)state.radius=recommendation.radius;for(const item of recommendation.items)matches.set(item.route.id,item);return recommendation.items.map(item=>item.route);},
   nearest(route){const n=matches.get(route.id)?.nearest;return n?{name:n.stop.name,distance:n.distance}:null;},
   boardingTime(route){return matches.get(route.id)?.nearest.stop.time||null;},
   decorate(box,route){
    const item=matches.get(route.id);if(!item)return;const n=item.nearest,info=el('div','bus-nearby-result');
    info.append(el('strong','',(direction==='in'?'가까운 승차 지점 · ':'추천 하차 지점 · ')+n.stop.name));if(direction==='in'&&n.stop.time)info.append(el('span','bus-boarding-time',n.stop.time+' 승차'));
    info.append(el('span','',meters(n.distance)+' · '+(direction==='in'?'출발 위치에서':'목적지까지')+' 직선거리'),el('small','',(n.place.precision==='shared-pin'?'공유 정류장 핀: ':'주변 기준점: ')+n.place.name));
    const from=direction==='in'?state.point:n.place,to=direction==='in'?n.place:state.point,fromName=direction==='in'?state.label:n.stop.name,toName=direction==='in'?n.stop.name:state.label,walk=C.walkingLinks(from,to,fromName,toName,location.origin,/Android/i.test(navigator.userAgent));
    if(walk){const links=el('div','bus-walk-links');for(const[key,text]of[['naver','네이버 도보 길찾기'],['kakao','카카오 도보 길찾기']]){const a=el('a','bus-walk-link',text);a.href=walk[key];if(key==='kakao'){a.target='_blank';a.rel='noopener noreferrer';}links.append(a);}info.append(links);}
    if(n.place.precision==='shared-pin'||n.place.provider==='kakao'||n.place.mapSource){const link=el('a','bus-pin-link','정류장 위치 확인 ↗');link.href=n.place.mapSource||n.place.source;link.target='_blank';link.rel='noopener';info.append(link);}box.append(info);
   },
   highlight(row,route,stop){if(matches.get(route.id)?.nearest.stop===stop)row.classList.add('bus-stop-nearby');}
  };
 }
 window.BusDiscovery={create};
})();
