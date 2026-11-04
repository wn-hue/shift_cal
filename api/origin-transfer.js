'use strict';
const crypto=require('node:crypto'),{seal,unseal}=require('./google-calendar.js')._test,config=require('../origin-migration-config.json');
const names=['__Host-shiftcal-google','__Host-shiftcal-apple','__Host-shift-parking','__Host-shift-meal'];
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 const reply=(s,x)=>{res.statusCode=s;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(x));};
 try{
  if(req.method!=='POST'||req.headers.origin!==config.source||!req.headers['content-type']?.startsWith('application/json'))return reply(403,{message:'기존 앱에서 다시 시작해 주세요.'});
  const secret=process.env.GOOGLE_CALENDAR_SESSION_SECRET;if(!secret)return reply(503,{message:'계정 연결을 준비 중입니다.'});
  let body=req.body;if(typeof body==='string'){if(body.length>50000)return reply(413,{});body=JSON.parse(body);}
  const action=new URL(req.url,'https://local.invalid').searchParams.get('action'),hex=v=>/^[a-f0-9]{64}$/.test(v||'');
  if(action==='issue'){
   if(!hex(body?.challenge)||!hex(body?.state))return reply(400,{});
   const cookies={};for(const part of (req.headers.cookie||'').split(';')){const i=part.indexOf('='),name=part.slice(0,i).trim(),value=part.slice(i+1).trim();if(names.includes(name)&&value.length<16000&&/^[A-Za-z0-9._-]+$/.test(value))cookies[name]=value;}
   return reply(200,{ticket:seal({kind:'origin-transfer',target:config.target,challenge:body.challenge,state:body.state,cookies,exp:Date.now()+300000},secret)});
  }
  if(action==='exchange'){
   const t=unseal(body?.ticket,secret);
   if(t?.kind!=='origin-transfer'||t.target!==config.target||!hex(body?.verifier)||!hex(body?.state)||t.state!==body.state||crypto.createHash('sha256').update(body.verifier).digest('hex')!==t.challenge)return reply(401,{message:'연결이 만료됐어요. 기존 데이터 가져오기를 다시 눌러 주세요.'});
   const cookies=[];for(const name of names){const value=t.cookies?.[name],sameSite=name.includes('shiftcal-')?'Lax':'Strict';if(typeof value==='string'&&/^[A-Za-z0-9._-]+$/.test(value))cookies.push(name+'='+value+'; Path=/; Secure; HttpOnly; SameSite='+sameSite+'; Max-Age=604800');else cookies.push(name+'=; Path=/; Secure; HttpOnly; SameSite='+sameSite+'; Max-Age=0');}
   if(cookies.length)res.setHeader('Set-Cookie',cookies);return reply(200,{ok:true});
  }
  return reply(400,{});
 }catch{return reply(400,{message:'기존 앱에서 다시 시작해 주세요.'});}
};
