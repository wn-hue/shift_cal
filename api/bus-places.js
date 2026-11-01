'use strict';
// Explicit searches only. No GPS, route, account or salary data is sent upstream.
const BOUNDS=[126.5,37.15,127.1,37.6],cache=new Map(),pending=new Map();
function inside(lon,lat){return Number.isFinite(lon)&&Number.isFinite(lat)&&lon>=BOUNDS[0]&&lon<=BOUNDS[2]&&lat>=BOUNDS[1]&&lat<=BOUNDS[3];}
function normalize(data){
 if(!Array.isArray(data?.features))throw Error('Invalid places');
 const seen=new Set(),places=[];
 for(const f of data.features.slice(0,30)){
  const p=f?.properties,c=f?.geometry?.coordinates;if(!p||!Array.isArray(c)||!inside(c[0],c[1])||typeof p.name!=='string'||!p.name.trim())continue;
  const id=String(p.osm_type||'')+String(p.osm_id||c.join(','));if(seen.has(id))continue;seen.add(id);
  places.push({id,name:p.name.slice(0,150),address:[p.city,p.district,p.locality,p.street,p.housenumber].filter(x=>typeof x==='string').join(' ').slice(0,300),lat:c[1],lon:c[0]});
 }
 return {places:places.slice(0,6),source:'OpenStreetMap · Photon',coverage:'안산·시흥 및 인근 지역'};
}
async function search(q){
 const old=cache.get(q);if(old&&Date.now()-old.at<900000)return old.data;if(pending.has(q))return pending.get(q);if(pending.size>=4)throw Error('Busy');
 const request=(async()=>{const url=new URL('https://photon.komoot.io/api/');url.search=new URLSearchParams({q,lat:'37.32',lon:'126.79',limit:'6',bbox:BOUNDS.join(',')}).toString();const r=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'error',headers:{Accept:'application/json','User-Agent':'ShiftRoutine/2.0 (commute place search; h-lyart-ten.vercel.app)'}});if(!r.ok)throw Error('Search unavailable');const data=normalize(await r.json());if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(q,{at:Date.now(),data});return data;})().finally(()=>pending.delete(q));pending.set(q,request);return request;
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'METHOD_NOT_ALLOWED'});}
 const q=req.query?.q;if(typeof q!=='string'||q.trim().length<2||q.length>100||/[\u0000-\u001f]/.test(q))return res.status(400).json({error:'INVALID_QUERY',message:'장소나 주소를 두 글자 이상 입력해 주세요.'});
 try{return res.status(200).json(await search(q.trim().normalize('NFC')));}catch{return res.status(503).json({error:'SEARCH_UNAVAILABLE',message:'장소 검색에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'});}
};module.exports.normalize=normalize;
