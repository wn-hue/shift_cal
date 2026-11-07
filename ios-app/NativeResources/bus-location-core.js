/* Distances use published reference points, never guessed pickup coordinates. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BusLocationCore=api;})(typeof window==='object'?window:globalThis,()=>{
 'use strict';
 const valid=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
 function distance(a,b){if(!valid(a)||!valid(b))return Infinity;const r=Math.PI/180,x=(b.lat-a.lat)*r,y=(b.lon-a.lon)*r,h=Math.sin(x/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(y/2)**2;return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));}
 function lookup(catalog,name){return catalog.find(p=>p.aliases.includes(name)&&valid(p))||null;}
 function factoryPlaces(catalog,label){const ids=[...String(label||'').matchAll(/(?:^|[^\d])([124])\s*공장|본사/g)].map(m=>m[1]||'1');return [...new Set(ids)].map(id=>catalog.find(p=>p.id===id)).filter(valid);}
 function rank(routes,period,point,radius,catalog){
  if(!valid(point)||!Number.isFinite(radius)||radius<=0)return [];
  return routes.filter(r=>r.period===period).flatMap(route=>{
   const stops=route.stops.flatMap((stop,index)=>{const place=lookup(catalog,stop.name);return place?[{stop,index,place,distance:distance(point,place)}]:[];}).filter(s=>s.distance<=radius).sort((a,b)=>a.distance-b.distance||a.index-b.index);
   return stops.length?[{route,nearest:stops[0],stops}]:[];
  }).sort((a,b)=>a.nearest.distance-b.nearest.distance||a.route.id.localeCompare(b.route.id));
 }
 const normalize=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s·().,\-]/g,'');
 const areaQuery=q=>/^(경기|경기도|안산|안산시|시흥|시흥시|배곧)$/.test(normalize(q));
 function placeScore(place,query){
  const raw=normalize(query),q=normalize(String(query).replace(/^(?:(?:경기도|경기|안산시?|시흥시?|배곧)\s*)+/u,''))||raw;
  const names=[place.name,...(place.aliases||[]),...(place.searchTerms||[])].map(normalize),keys=names.flatMap(n=>[n,n.replace(/(?:아파트|(?:버스)?정류장|apt)$/,'')]);
  if(keys.includes(raw)||keys.includes(q))return 0;
  if(names.some(n=>n.includes(raw)||n.includes(q)))return 1;
  const address=normalize(place.address);return address.includes(raw)||address.includes(q)?2:99;
 }
 function exactPlaces(catalog,query){return query&&!areaQuery(query)?catalog.filter(p=>valid(p)&&placeScore(p,query)===0):[];}
 function search(catalog,query,{limit=6,minLength=2,exactFirst=true}={}){
  if(normalize(query).length<minLength)return [];
  let found=catalog.filter(valid).map(p=>({p,score:placeScore(p,query)})).filter(v=>v.score<99);
  if(exactFirst&&!areaQuery(query)&&found.some(v=>v.score===0))found=found.filter(v=>v.score===0);
  return found.sort((a,b)=>a.score-b.score||a.p.name.localeCompare(b.p.name,'ko')).map(v=>v.p).filter((p,i,all)=>all.findIndex(x=>x.source===p.source)===i).slice(0,limit);
 }
 function recommend(routes,period,point,catalog,{selectedPlace=null,radius=null}={}){
  const exact=selectedPlace?.source?catalog.filter(p=>p.source===selectedPlace.source&&valid(p)):[];
  if(exact.length)return {items:rank(routes,period,point,Number.MAX_VALUE,exact),mode:'exact',radius:0,automatic:true,exhausted:false};
  const tiers=Number.isFinite(radius)&&radius>0?[radius]:[500,1000,2000];
  for(const meters of tiers){const items=rank(routes,period,point,meters,catalog);if(items.length)return {items,mode:'nearby',radius:meters,automatic:tiers.length>1,exhausted:false};}
  return {items:[],mode:'nearby',radius:tiers[tiers.length-1],automatic:tiers.length>1,exhausted:true};
 }
 function searchRoutes(routes,query,catalog=[]){
  const raw=String(query||'').normalize('NFKC').toLowerCase().replace(/본사/g,'1공장').trim();if(!raw)return routes;
  const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/본사/g,'1공장').replace(/[\s·().,\-]/g,'');
  const numbers=[];let words=raw.replace(/(\d+(?:\s*[-–—]\s*\d+)?)\s*(?:호(?:\s*차)?|번(?:\s*(?:차|버스))?)/g,(_,n)=>{numbers.push(n.replace(/\s/g,'').replace(/[–—]/g,'-'));return ' ';});
  if(/^\d+(?:\s*[-–—]\s*\d+)?$/.test(raw)){numbers.push(raw.replace(/\s/g,'').replace(/[–—]/g,'-'));words='';}
  words=words.replace(/(?:방면|방향)(?:으로|로)?|쪽(?:으로|로)?|(?:으로|로)?\s*가는(?:\s*(?:버스|차|노선))?/g,' ');
  const tokens=words.split(/\s+/).map(norm).filter(token=>token&&!['버스','차','노선','차량','검색','찾기','알려줘'].includes(token));if(!numbers.length&&!tokens.length)return [];
  const found=routes.map((route,index)=>{
   const number=route.name.match(/^(\d+(?:-\d+)?)호/);if(numbers.length&&(!number||!numbers.includes(number[1])))return null;
   const names=[route.name,route.destination,...route.stops.map(s=>s.name)];
   for(const stop of route.stops){const p=lookup(catalog,stop.name);if(p)names.push(p.name,...(p.searchTerms||[]),...p.aliases);}
   const normalized=names.map(norm),corpus=normalized.join(' '),routeName=norm(route.name);
   const matches=tokens.every(token=>corpus.includes(token)||(token.endsWith('행')&&normalized.some(name=>name===token.slice(0,-1)||name.replace(/^\d+호/,'')===token.slice(0,-1))));
   if(!matches)return null;
   return {route,index,score:tokens.filter(token=>!routeName.includes(token)).length};
  }).filter(Boolean);const best=found.some(v=>v.score===0)?found.filter(v=>v.score===0):found;return best.sort((a,b)=>a.score-b.score||a.index-b.index).map(v=>v.route);
 }
 function walkingLinks(from,to,fromName,toName,appname,android=false){
  if(!valid(from)||!valid(to))return null;
  const part=(name,p)=>encodeURIComponent(name)+','+p.lat+','+p.lon;
  const kakao='https://map.kakao.com/link/by/walk/'+part(fromName,from)+'/'+part(toName,to);
  const params=new URLSearchParams({slat:from.lat,slng:from.lon,sname:fromName,dlat:to.lat,dlng:to.lon,dname:toName,appname});
  const naver=android?'intent://route/walk?'+params+'#Intent;scheme=nmap;package=com.nhn.android.nmap;S.browser_fallback_url='+encodeURIComponent(kakao)+';end':'nmap://route/walk?'+params;
  return {naver,kakao};
 }
 return {valid,distance,lookup,factoryPlaces,rank,recommend,search,exactPlaces,searchRoutes,walkingLinks};
});
