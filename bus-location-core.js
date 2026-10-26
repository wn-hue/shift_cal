/* Distances use published reference points, never guessed pickup coordinates. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BusLocationCore=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const valid=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
 function distance(a,b){if(!valid(a)||!valid(b))return Infinity;const r=Math.PI/180,x=(b.lat-a.lat)*r,y=(b.lon-a.lon)*r,h=Math.sin(x/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(y/2)**2;return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));}
 function lookup(catalog,name){return catalog.find(p=>p.aliases.includes(name)&&valid(p))||null;}
 function rank(routes,period,point,radius,catalog){
  if(!valid(point)||!Number.isFinite(radius)||radius<=0)return [];
  return routes.filter(r=>r.period===period).flatMap(route=>{
   const stops=route.stops.flatMap((stop,index)=>{const place=lookup(catalog,stop.name);return place?[{stop,index,place,distance:distance(point,place)}]:[];}).filter(s=>s.distance<=radius).sort((a,b)=>a.distance-b.distance||a.index-b.index);
   return stops.length?[{route,nearest:stops[0],stops}]:[];
  }).sort((a,b)=>a.nearest.distance-b.nearest.distance||a.route.id.localeCompare(b.route.id));
 }
 function search(catalog,query){
  const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s·().,\-]/g,''),raw=norm(query),q=norm(String(query).replace(/^(?:(?:경기도|경기|안산시?|시흥시?|배곧)\s*)+/u,''));
  if(q.length<2)return [];
  return catalog.filter(valid).map(p=>{const names=[p.name,...p.aliases,...(p.searchTerms||[])].map(norm),address=norm(p.address);const score=names.includes(raw)||names.includes(q)?0:names.some(n=>n.includes(raw)||n.includes(q))?1:address.includes(raw)||address.includes(q)?2:99;return {p,score};}).filter(v=>v.score<99).sort((a,b)=>a.score-b.score||a.p.name.localeCompare(b.p.name,'ko')).map(v=>v.p).filter((p,i,all)=>all.findIndex(x=>x.source===p.source)===i).slice(0,6);
 }
 function walkingLinks(from,to,fromName,toName,appname,android=false){
  if(!valid(from)||!valid(to))return null;
  const part=(name,p)=>encodeURIComponent(name)+','+p.lat+','+p.lon;
  const kakao='https://map.kakao.com/link/by/walk/'+part(fromName,from)+'/'+part(toName,to);
  const params=new URLSearchParams({slat:from.lat,slng:from.lon,sname:fromName,dlat:to.lat,dlng:to.lon,dname:toName,appname});
  const naver=android?'intent://route/walk?'+params+'#Intent;scheme=nmap;package=com.nhn.android.nmap;S.browser_fallback_url='+encodeURIComponent(kakao)+';end':'nmap://route/walk?'+params;
  return {naver,kakao};
 }
 return {valid,distance,lookup,rank,search,walkingLinks};
});
