'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../bus-location-core.js');
const context={window:{}};for(const file of['bus-routes.js','bus-stop-locations.js'])vm.runInNewContext(fs.readFileSync(require.resolve('../'+file),'utf8'),context);
const {points}=context.window.BusStopLocations,{routes}=context.window.ShiftBusRoutes;
const exact=q=>Array.from(C.search(points,q,{limit:100}),p=>p.name);
assert.deepEqual(exact('시화병원'),['시화병원'],'the former hospital is a different stop');
assert.deepEqual(exact('노현숙한의원'),['노현숙한의원']);
assert.deepEqual(exact('두산위브'),['초지두산위브아파트']);
assert.deepEqual(exact('안산 원일중학교'),['원일중학교']);
assert(C.search(points,'시화병',{limit:100}).length>1,'partial names still offer choices');
assert(C.search(points,'안산',{limit:100}).length>10,'city names remain broad searches');
assert.deepEqual(Array.from(C.searchRoutes(routes.filter(r=>r.period==='day'),'선부 방면',points),r=>r.id),['day-4']);
const selected=C.lookup(points,'두산위브 정류장');
for(const [period,id]of[['day','day-5'],['night','night-1']]){const r=C.recommend(routes,period,selected,points,{selectedPlace:selected});assert.equal(r.mode,'exact');assert.deepEqual(Array.from(r.items,x=>x.route.id),[id]);assert.equal(r.items[0].nearest.stop.name,'두산위브 정류장');}
const none=C.recommend(routes.filter(r=>r.id!=='day-5'),'day',selected,points,{selectedPlace:selected});assert.equal(none.mode,'exact');assert.equal(none.items.length,0,'exact place without eligible service must not fall back to unrelated stops');
// Distances are spaced across tier boundaries, independent of the live route data.
const origin={lat:37.34,lon:126.82};
const catalog=[200,400,800,1400,2500].map(m=>({name:'stop-'+m,aliases:['stop-'+m],source:'fixture-'+m,lat:origin.lat+m/6371000*180/Math.PI,lon:origin.lon}));
const fixture=catalog.map((p,i)=>({id:'route-'+i,period:'day',stops:[{name:p.name,time:'07:00'}]}));
for(const [ids,radius,expected]of[[[4,3,2,1,0],500,[0,1]],[[4,3,2],1000,[2]],[[4,3],2000,[3]],[[4],2000,[]]]){
 const r=C.recommend(ids.map(i=>fixture[i]),'day',origin,catalog);assert.equal(r.radius,radius);assert.equal(r.automatic,true);assert.equal(r.exhausted,!expected.length);assert.deepEqual(r.items.map(x=>x.route.id),expected.map(i=>'route-'+i));assert(r.items.every((x,i,a)=>!i||x.nearest.distance>=a[i-1].nearest.distance));
}
const manual=C.recommend(fixture,'day',origin,catalog,{radius:1000});assert.equal(manual.automatic,false);assert.equal(manual.items.length,3);
const precise=C.recommend(fixture,'day',origin,catalog,{selectedPlace:catalog[4],radius:500});assert.equal(precise.mode,'exact');assert.deepEqual(precise.items.map(x=>x.route.id),['route-4'],'exact keyword wins over unrelated nearby results and manual radius');
assert.equal(C.recommend(fixture,'night',origin,catalog).items.length,0);
assert.equal(C.recommend(fixture,'day',null,catalog).items.length,0);
console.log('PASS exact names/aliases, distinct former/current places, direction match, exact-service exclusion, ascending 500m → 1km → 2km first-result tiers and explicit range override');
