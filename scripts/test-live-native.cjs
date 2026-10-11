'use strict';
const assert=require('node:assert/strict');
process.env.APP_URL='https://test.invalid';process.env.GOOGLE_CALENDAR_SESSION_SECRET='s'.repeat(64);
const google=require('../api/google-calendar.js'),live=require('../api/live-schedule.js'),native=require('../api/native-account.js');
const storage=new Map(),handler=live._test.handlerFor({read:async p=>storage.get(p),write:async(p,v)=>storage.set(p,v),remove:async p=>storage.delete(p)});
require.cache[require.resolve('../api/live-schedule.js')].exports=handler;
const schedule={group:'C',month:'2026-10',days:Array.from({length:31},()=>({type:'OFF'}))};
const seal=google._test.seal,secret=process.env.GOOGLE_CALENDAR_SESSION_SECRET;
function bearer(provider,sub){return seal({provider,session:seal({provider,sub,csrf:'csrf',exp:Date.now()+10000},secret),exp:Date.now()+10000},secret);}
async function call(token,action,body){const res={setHeader(){},end(x){this.data=JSON.parse(x)}};await native({method:'POST',url:'/?action='+action,headers:{authorization:'Bearer '+token},body},res);return res;}
(async()=>{for(const provider of ['google','apple']){const token=bearer(provider,provider+':owner');const created=await call(token,'live-write',{schedule});assert.equal(created.statusCode,200);const id=created.data.id;assert.equal((await call(bearer(provider,'other'),'live-write',{id,schedule})).statusCode,403);const changed={...schedule,days:schedule.days.map((d,i)=>i===0?{type:'LEAVE'}:d)};const updated=await call(token,'live-write',{id,schedule:changed});assert.equal(updated.data.id,id);assert.equal(storage.get('schedules/'+id+'.json').schedule.days[0].type,'LEAVE');assert.equal((await call(token,'live-delete',{id})).statusCode,200);assert.equal((await call(token,'live-write',{id,schedule})).statusCode,404);}assert.equal((await call('invalid','live-write',{schedule})).statusCode,401);assert.equal((await call(bearer('google','owner'),'live-write',{id:'invalid',schedule})).statusCode,400);console.log('PASS native Google/Apple live links: bearer, account isolation, same URL update, withdrawal, invalid token');})().catch(e=>{console.error(e);process.exitCode=1});
