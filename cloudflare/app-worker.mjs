import { localFood, localFoodWeek } from './local-food.mjs';

const SOURCE='https://h-lyart-ten.vercel.app';
const APIS=new Set(['account','google-calendar','apple-account','native-account','live-schedule','parking','lost-found','meal-votes','today-menu','bus-places','currency-rates','origin-transfer','meal-keywords']);
const MENU_CACHE_CONTROL='public, max-age=600';

function apiResponse(response,cacheControl='no-store'){
 const headers=new Headers(response.headers);
 headers.set('Cache-Control',cacheControl);
 headers.delete('Access-Control-Allow-Origin');
 headers.delete('Access-Control-Allow-Credentials');
 return new Response(response.body,{status:response.status,headers});
}

export default {
 async scheduled(event,env,ctx){
  // First-round meals: 11:30, 17:00, and 00:50 KST. Retry unpublished menus
  // every five minutes only until that meal starts. No credentials in URLs/logs.
  const date=new Date(event.scheduledTime+9*3600000),m=date.getUTCHours()*60+date.getUTCMinutes();
  if(env.LOCAL_FOOD&&date.getUTCDay()===1&&m===690){
   ctx.waitUntil(env.LOCAL_FOOD.prepare('DELETE FROM local_food_votes WHERE week < ?').bind(localFoodWeek(event.scheduledTime,-7).start).run());
  }
  if(!env.MEAL_KEYWORDS_CRON_SECRET||!((m>=690&&m<720)||(m>=1020&&m<1050)||(m>=50&&m<80)))return;
  ctx.waitUntil(fetch(SOURCE+'/api/today-menu?feature=keywords&action=dispatch',{method:'POST',headers:{Authorization:'Bearer '+env.MEAL_KEYWORDS_CRON_SECRET,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(60000)}).then(r=>{if(!r.ok)throw Error('Meal dispatch failed: '+r.status);}));
 },
 async fetch(request,env,ctx){
 const url=new URL(request.url);
 const opensBusSearch=url.searchParams.get('open')==='bus-search';
 const firstVisit=url.pathname==='/'&&!opensBusSearch&&!/(?:^|;\s*)__Host-work-routine-ready=1(?:;|$)/.test(request.headers.get('Cookie')||'');
 if(firstVisit&&url.hostname!=='20261104.xyz')return new Response(null,{status:302,headers:{Location:'/origin-transfer.html','Cache-Control':'no-store'}});
 if(url.pathname==='/api/hosting-status')return Response.json({hosting:'cloudflare',dataService:'vercel',originalRetained:true},{headers:{'Cache-Control':'no-store'}});
 if(url.pathname==='/api/local-food')return localFood(request,env);
 if(url.pathname.startsWith('/api/')){
  if(!APIS.has(url.pathname.slice(5)))return new Response('Not found',{status:404});
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin&&origin!==SOURCE)return new Response('Forbidden',{status:403});
  if(!['GET','HEAD'].includes(request.method)&&!origin&&!request.headers.get('Authorization')?.startsWith('Bearer '))return new Response('Forbidden',{status:403});
  const headers=new Headers(request.headers);headers.delete('host');headers.delete('x-forwarded-host');headers.delete('x-forwarded-proto');
  headers.set('X-Work-Routine-Origin',url.origin);
  if(origin)headers.set('Origin',SOURCE);
  headers.set('Accept-Encoding','identity');
  // Only the public date-based menu can be shared across devices. Votes,
  // account data, and keyword subscription routes remain per request.
  const publicMenu=request.method==='GET'&&url.pathname==='/api/today-menu'&&/^\?date=\d{4}-\d{2}-\d{2}$/.test(url.search)&&!headers.has('Authorization');
  const cache=publicMenu?globalThis.caches?.default:null;
  const cacheKey=cache?new Request(url):null;
  if(publicMenu)headers.delete('Cookie');
  if(cache){
   const cached=await cache.match(cacheKey).catch(()=>null);
   if(cached)return apiResponse(cached);
  }
  try{
   const upstreamURL=new URL(url.pathname+url.search,SOURCE);
   if(url.pathname==='/api/meal-keywords'){upstreamURL.pathname='/api/today-menu';upstreamURL.searchParams.set('feature','keywords');}
   const upstream=await fetch(upstreamURL,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual',signal:AbortSignal.timeout(65000)});
   if(cache&&ctx&&upstream.status===200&&!upstream.headers.has('Set-Cookie')&&upstream.headers.get('Content-Type')?.startsWith('application/json')){
    ctx.waitUntil(cache.put(cacheKey,apiResponse(upstream.clone(),MENU_CACHE_CONTROL)).catch(()=>{}));
   }
   return apiResponse(upstream);
  }catch{return Response.json({message:'연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요.'},{status:503,headers:{'Cache-Control':'no-store'}});}
 }
 const response=await env.ASSETS.fetch(firstVisit?new Request(new URL('/welcome',url),request):request),headers=new Headers(response.headers);
 if(url.pathname==='/'||/\.(html|js|webmanifest)$/.test(url.pathname))headers.set('Cache-Control','no-store');
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');
 return new Response(response.body,{status:response.status,headers});
}};
