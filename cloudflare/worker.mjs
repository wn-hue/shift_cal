import {invoke} from './http-adapter.mjs';
import account from '../api/account.js';
import google from '../api/google-calendar.js';
import apple from '../api/apple-account.js';
import native from '../api/native-account.js';
import live from '../api/live-schedule.js';
import parking from '../api/parking.js';
import lost from '../api/lost-found.js';
import votes from '../api/meal-votes.js';
import menu from '../api/today-menu.js';
import places from '../api/bus-places.js';
import currency from '../api/currency-rates.js';
const handlers={'account':account,'google-calendar':google,'apple-account':apple,'native-account':native,'live-schedule':live,'parking':parking,'lost-found':lost,'meal-votes':votes,'today-menu':menu,'bus-places':places,'currency-rates':currency};
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname==='/api/migration-health')return Response.json({runtime:'cloudflare',readOnly:env.MIGRATION_READ_ONLY!=='false',storage:!!env.STATE},{headers:{'Cache-Control':'no-store'}});
 if(url.pathname.startsWith('/api/')){
  const name=url.pathname.slice(5),handler=handlers[name];if(!handler)return Response.json({message:'API를 찾을 수 없습니다.'},{status:404});
  if(env.MIGRATION_READ_ONLY!=='false'&&(!['GET','HEAD'].includes(request.method)||['google-calendar','apple-account'].includes(name)&&url.searchParams.get('action')!=='status'))return Response.json({message:'이전 검증 중입니다. 기존 앱을 이용해 주세요.'},{status:503,headers:{'Cache-Control':'no-store'}});
  try{return await invoke(handler,request);}catch{return Response.json({message:'요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'},{status:503,headers:{'Cache-Control':'no-store'}});}
 }
 const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
 if(url.pathname==='/'||url.pathname.endsWith('.html')||url.pathname.endsWith('/sw.js')||url.pathname.endsWith('/service-worker.js'))headers.set('Cache-Control','no-store');
 headers.set('X-Content-Type-Options','nosniff');
 return new Response(response.body,{status:response.status,headers});
}};
