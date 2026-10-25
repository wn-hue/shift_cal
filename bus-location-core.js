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
 return {valid,distance,lookup,rank};
});
