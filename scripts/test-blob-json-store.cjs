'use strict';
const assert=require('node:assert/strict'),blob=require('@vercel/blob');
const{createStore,isConflict}=require('../lib/blob-json-store');
const{handlerFor}=require('../api/meal-votes')._test;
(async()=>{
 const conflict=new blob.BlobPreconditionFailedError();assert.equal(conflict.name,'Error');assert.equal(isConflict(conflict),true);assert.equal(isConflict(new Error('network failure')),false);
 let reads=0,written;
 const store=createStore({async head(){return{url:'https://test.private.blob.vercel-storage.com/current.json',etag:'v2'};},async get(url,options){assert.equal(new URL(url).searchParams.get('version'),'v2');assert.equal(options.useCache,false);return{blob:{etag:++reads===1?'"v1"':'"v2"'},stream:new Response(JSON.stringify({votes:{test:{meal:'up'}}})).body};},async put(path,data,options){written={path,data:JSON.parse(data),options};}});
 const record=await store.read('current.json');assert.equal(reads,2);assert.equal(record._etag,'v2');await store.write('current.json',record,record._etag);assert.equal(written.options.ifMatch,'v2');assert.equal(written.options.allowOverwrite,true);assert.equal(written.data._etag,undefined);
 assert.equal(await createStore({async head(){throw new blob.BlobNotFoundError();}}).read('missing'),null);
 await assert.rejects(()=>createStore({async head(){throw new blob.BlobAccessError();}}).read('denied'),blob.BlobAccessError);
 let attempts=0,saved=null;const now=Date.parse('2026-10-15T12:00:00+09:00');
 const handler=handlerFor({async read(){return{date:'2026-10-15',votes:{other:{'중식':'down'}},_etag:'canonical'};},async write(path,data,etag){assert.equal(etag,'canonical');if(++attempts===1)throw conflict;saved=data;}},{secret:'test',origin:'https://app.test',now:()=>now});
 async function request(method,cookie,body){let data,status;const headers={};await handler({method,headers:{cookie,origin:'https://app.test','content-type':'application/json'},body},{setHeader(k,v){headers[k]=v;},set statusCode(v){status=v;},end(s){data=JSON.parse(s);}});return{data,status,cookie:headers['Set-Cookie']?.split(';')[0]};}
 const a=await request('GET');const result=await request('POST',a.cookie,{date:'2026-10-15',meal:'중식',vote:'up'});assert.equal(result.status,200);assert.equal(attempts,2);assert.deepEqual(result.data.totals['중식'],{up:1,down:1});assert.equal(saved.votes.other['중식'],'down');
 console.log('PASS canonical metadata / stale content retry / quoted response ETags / actual SDK conflict class / preserve other votes / no metadata in saved JSON');
})().catch(e=>{console.error(e);process.exit(1);});
