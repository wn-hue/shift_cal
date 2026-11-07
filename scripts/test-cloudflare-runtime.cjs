'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const {invoke}=await import(pathToFileURL(path.resolve('cloudflare/http-adapter.mjs')));
 let response=await invoke((req,res)=>{assert.deepEqual(req.query,{a:['1','2']});assert.deepEqual(req.body,{amount:70000});res.setHeader('Set-Cookie',['one=1; HttpOnly','two=2; HttpOnly']);res.status(201).json({ok:true});},new Request('https://example.test/api/test?a=1&a=2',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"amount":70000}'}));assert.equal(response.status,201);assert.equal(response.headers.getSetCookie().length,2);assert.deepEqual(await response.json(),{ok:true});
 response=await invoke(()=>assert.fail('invalid JSON must not enter API'),new Request('https://example.test/api/test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'}));assert.equal(response.status,400);
 response=await invoke(()=>assert.fail('oversized input must not enter API'),new Request('https://example.test/api/test',{method:'POST',body:'a'.repeat(300001)}));assert.equal(response.status,413);
 console.log('PASS Fetch adapter: JSON, repeated query values, cookies, status, malformed and oversized bodies');
 const {Miniflare,convertV4MiniflareOptions}=require(process.env.MINIFLARE_MODULE||'miniflare');
 const mf=new Miniflare(convertV4MiniflareOptions({name:'tests',modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-11-03',d1Databases:{STATE:'object-tests'}}));
 try{
  const db=await mf.getD1Database('STATE');await db.exec(fs.readFileSync('cloudflare/migrations/0001_objects.sql','utf8').split('\n').filter(s=>!s.startsWith('--')).join(' '));
  const {createObjectStore,BlobPreconditionFailedError,BlobAlreadyExistsError}=await import(pathToFileURL(path.resolve('cloudflare/d1-store.mjs'))),store=createObjectStore(db);
  assert.equal(await store.get('missing.json'),null);
  for(const key of ['schedules/one.json','schedules/two.json','schedule-archive.json'])await store.put(key,'{}');
  const first=await store.list({prefix:'schedules/',limit:1});
  assert.deepEqual(first.blobs.map(blob=>blob.pathname),['schedules/one.json']);
  assert.equal(first.hasMore,true);
  await store.del(first.blobs[0].pathname,{ifMatch:first.blobs[0].etag});
  const next=await store.list({prefix:'schedules/',limit:1,cursor:first.cursor});
  assert.deepEqual(next.blobs.map(blob=>blob.pathname),['schedules/two.json']);
  assert.equal(next.hasMore,false);
  const doc={data:{baseHourly:11050,ordinaryHourly:14482,seniorityPayOverride:70000,dutyPay:70000,memo:'개인 메모',rate:.17012},revision:'existing-version'},raw=JSON.stringify(doc),key='accounts/apple/existing-owner.json';
  const initial=await store.put(key,raw),meta=await store.head(key),read=await store.get(meta.url+'?version='+meta.etag);assert.equal(await new Response(read.stream).text(),raw);assert.equal(initial.etag,meta.etag);
  await assert.rejects(store.put(key,'{}'),BlobAlreadyExistsError);
  const results=await Promise.allSettled([store.put(key,raw,{ifMatch:meta.etag}),store.put(key,'{}',{ifMatch:meta.etag})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert(results.some(r=>r.status==='rejected'&&r.reason instanceof BlobPreconditionFailedError));
  await assert.rejects(store.del(key,{ifMatch:meta.etag}),BlobPreconditionFailedError);assert(await store.get(key));
  await assert.rejects(createObjectStore(db,{readOnly:true}).put('test','{}'),/READ_ONLY/);assert(await store.get(key));await store.del(key,{ifMatch:(await store.head(key)).etag});assert.equal(await store.get(key),null);
  console.log('PASS real D1: exact document/owner preservation, atomic conflicting updates, conditional delete and read-only staging');
 }finally{await mf.dispose();}
 const base=process.env.CF_TEST_URL||'http://127.0.0.1:8787';
 response=await fetch(base+'/api/migration-health');assert.deepEqual(await response.json(),{runtime:'cloudflare',readOnly:true,storage:true});
 for(const resource of['/','/index.html','/manifest.webmanifest','/calendar-ui.js','/assets/icons/meal-breakfast.png']){response=await fetch(base+resource);assert.equal(response.status,200,resource);}
 for(const resource of['/.env','/wrangler.jsonc','/cloudflare/worker.mjs','/ios-app/Sources/Bridge.js','/api/nonexistent']){response=await fetch(base+resource);assert.equal(response.status,404,resource);}
 response=await fetch(base+'/api/account?action=status');assert.equal(response.status,200);assert.equal((await response.json()).connected,false);
 response=await fetch(base+'/api/apple-account?action=status');assert.equal(response.status,200);
 response=await fetch(base+'/api/parking',{method:'POST',body:'{}'});assert.equal(response.status,503);assert.match((await response.json()).message,/이전 검증/);
 response=await fetch(base+'/api/google-calendar?action=login',{redirect:'manual'});assert.equal(response.status,503);
 console.log('PASS Worker: assets, private-file exclusions, API dispatch, account status and guarded staging writes/login');
})().catch(e=>{console.error(e);process.exit(1)});
