const SOURCE='https://h-lyart-ten.vercel.app';
const APIS=new Set(['account','google-calendar','apple-account','native-account','live-schedule','parking','lost-found','meal-votes','today-menu','bus-places','currency-rates','origin-transfer','meal-keywords']);
export default {
 async scheduled(event,env,ctx){
  // First-round meals: 11:30, 17:00, and 00:50 KST. Retry unpublished menus
  // every five minutes only until that meal starts. No credentials in URLs/logs.
  const date=new Date(event.scheduledTime+9*3600000),m=date.getUTCHours()*60+date.getUTCMinutes();
  if(!env.MEAL_KEYWORDS_CRON_SECRET||!((m>=690&&m<720)||(m>=1020&&m<1050)||(m>=50&&m<80)))return;
  ctx.waitUntil(fetch(SOURCE+'/api/today-menu?feature=keywords&action=dispatch',{method:'POST',headers:{Authorization:'Bearer '+env.MEAL_KEYWORDS_CRON_SECRET,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(60000)}).then(r=>{if(!r.ok)throw Error('Meal dispatch failed: '+r.status);}));
 },
 async fetch(request,env){
 const url=new URL(request.url);
 const firstVisit=url.pathname==='/'&&!/(?:^|;\s*)__Host-work-routine-ready=1(?:;|$)/.test(request.headers.get('Cookie')||'');
 if(firstVisit&&url.hostname!=='20261104.xyz')return new Response(null,{status:302,headers:{Location:'/origin-transfer.html','Cache-Control':'no-store'}});
 if(url.pathname==='/api/hosting-status')return Response.json({hosting:'cloudflare',dataService:'vercel',originalRetained:true},{headers:{'Cache-Control':'no-store'}});
 if(url.pathname.startsWith('/api/')){
  if(!APIS.has(url.pathname.slice(5)))return new Response('Not found',{status:404});
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin&&origin!==SOURCE)return new Response('Forbidden',{status:403});
  if(!['GET','HEAD'].includes(request.method)&&!origin&&!request.headers.get('Authorization')?.startsWith('Bearer '))return new Response('Forbidden',{status:403});
  const headers=new Headers(request.headers);headers.delete('host');headers.delete('x-forwarded-host');headers.delete('x-forwarded-proto');
  headers.set('X-Work-Routine-Origin',url.origin);
  if(origin)headers.set('Origin',SOURCE);
  headers.set('Accept-Encoding','identity');
  try{
   const upstreamURL=new URL(url.pathname+url.search,SOURCE);
   if(url.pathname==='/api/meal-keywords'){upstreamURL.pathname='/api/today-menu';upstreamURL.searchParams.set('feature','keywords');}
   const upstream=await fetch(upstreamURL,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual',signal:AbortSignal.timeout(65000)});
   const out=new Headers(upstream.headers);out.set('Cache-Control','no-store');out.delete('Access-Control-Allow-Origin');out.delete('Access-Control-Allow-Credentials');
   return new Response(upstream.body,{status:upstream.status,headers:out});
  }catch{return Response.json({message:'연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요.'},{status:503,headers:{'Cache-Control':'no-store'}});}
 }
 const response=await env.ASSETS.fetch(firstVisit?new Request(new URL('/welcome',url),request):request),headers=new Headers(response.headers);
 if(url.pathname==='/'||/\.(html|js|webmanifest)$/.test(url.pathname))headers.set('Cache-Control','no-store');
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');
 return new Response(response.body,{status:response.status,headers});
}};
