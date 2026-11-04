const SOURCE='https://h-lyart-ten.vercel.app';
const APIS=new Set(['account','google-calendar','apple-account','native-account','live-schedule','parking','lost-found','meal-votes','today-menu','bus-places','currency-rates','origin-transfer']);
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/'&&!/(?:^|;\s*)__Host-work-routine-ready=1(?:;|$)/.test(request.headers.get('Cookie')||''))return new Response(null,{status:302,headers:{Location:'/origin-transfer.html','Cache-Control':'no-store'}});
 if(url.pathname==='/api/hosting-status')return Response.json({hosting:'cloudflare',dataService:'vercel',originalRetained:true},{headers:{'Cache-Control':'no-store'}});
 if(url.pathname.startsWith('/api/')){
  if(!APIS.has(url.pathname.slice(5)))return new Response('Not found',{status:404});
  const origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin&&origin!==SOURCE)return new Response('Forbidden',{status:403});
  if(!['GET','HEAD'].includes(request.method)&&!origin&&!request.headers.get('Authorization')?.startsWith('Bearer '))return new Response('Forbidden',{status:403});
  const headers=new Headers(request.headers);headers.delete('host');headers.delete('x-forwarded-host');headers.delete('x-forwarded-proto');
  if(origin)headers.set('Origin',SOURCE);
  headers.set('Accept-Encoding','identity');
  try{
   const upstream=await fetch(SOURCE+url.pathname+url.search,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual',signal:AbortSignal.timeout(65000)});
   const out=new Headers(upstream.headers);out.set('Cache-Control','no-store');out.delete('Access-Control-Allow-Origin');out.delete('Access-Control-Allow-Credentials');
   return new Response(upstream.body,{status:upstream.status,headers:out});
  }catch{return Response.json({message:'연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요.'},{status:503,headers:{'Cache-Control':'no-store'}});}
 }
 const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
 if(url.pathname==='/'||/\.(html|js|webmanifest)$/.test(url.pathname))headers.set('Cache-Control','no-store');
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','strict-origin-when-cross-origin');
 return new Response(response.body,{status:response.status,headers});
}};
