'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),{DatabaseSync}=require('node:sqlite');
const {createSnapshot,MAX_DOCUMENT_BYTES}=require('./cloudflare-object-migration.cjs');
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'shift-migration-test-'));
const run=(...args)=>spawnSync(process.execPath,[path.join(root,'scripts/cloudflare-object-migration.cjs'),...args],{cwd:temp,encoding:'utf8'});
const digest=body=>crypto.createHash('sha256').update(body).digest('hex');
function source(initial,{afterGet,beforeList,pageSize=1000}={}){
 const state=new Map(),stats={list:0,head:0,get:0};let sequence=0;
 const control={state,stats,put(key,value){state.set(key,{body:typeof value==='string'?value:JSON.stringify(value),etag:'version-'+(++sequence),uploadedAt:new Date(Date.UTC(2026,10,3,0,0,sequence))});},remove(key){state.delete(key);}};
 for(const [key,value]of Object.entries(initial))control.put(key,value);
 const metadata=(key,row)=>({pathname:key,url:'https://source.test/'+key,etag:row.etag,uploadedAt:row.uploadedAt,size:Buffer.byteLength(row.body),contentType:'application/json'});
 class BlobNotFoundError extends Error{}
 const sdk={BlobNotFoundError,
  async list({cursor}){stats.list++;const override=beforeList?.(control);if(override)return override;const items=Array.from(state,([key,row])=>metadata(key,row)).sort((a,b)=>a.pathname.localeCompare(b.pathname)),start=Number(cursor||0),end=start+pageSize;return {blobs:items.slice(start,end),hasMore:end<items.length,...(end<items.length?{cursor:String(end)}:{})};},
  async head(url){stats.head++;const key=new URL(url).pathname.slice(1),row=state.get(key);if(!row)throw new BlobNotFoundError();return metadata(key,row);},
  async get(url,options){stats.get++;assert.deepEqual(options,{access:'private',useCache:false});const key=new URL(url).pathname.slice(1),row=state.get(key);if(!row)return null;const result={statusCode:200,stream:new Response(row.body).body,blob:metadata(key,row)};afterGet?.({...control,key});return result;}
 };
 return {sdk,control};
}
async function snapshotTests(){
 let input=source({'a.json':{owner:'a'},'b.json':{owner:'b'}},{pageSize:1});
 let result=await createSnapshot(input.sdk,{retryDelayMs:0});assert.equal(result.objects.length,2);assert.equal(result.attemptsUsed,1);assert.equal(input.control.stats.list,4);assert.equal(result.summary.totalBytes,result.objects.reduce((n,o)=>n+Buffer.byteLength(o.body),0));
 // A stale body cache can ignore useCache:false while list/head already report the current ETag.
 input=source({'a.json':{memo:'current value'}});let staleReads=0;const freshGet=input.sdk.get.bind(input.sdk);
 input.sdk.get=async(url,options)=>{if(new URL(url).searchParams.get('version')!==input.control.state.get('a.json').etag){staleReads++;return {statusCode:200,stream:new Response('{}').body,blob:{pathname:'a.json',etag:'stale-version',size:2}};}return freshGet(url,options);};
 assert.equal((await input.sdk.get('https://source.test/a.json',{access:'private',useCache:false})).blob.etag,'stale-version');
 result=await createSnapshot(input.sdk,{retryDelayMs:0});assert.equal(result.attemptsUsed,1);assert.deepEqual(JSON.parse(result.objects[0].body),{memo:'current value'});assert.equal(staleReads,1,'snapshot reads must include the exact inventory ETag in the URL');
 // A compressed GET may have a weak validator and no Content-Length (SDK size: 0).
 input=source({'a.json':{memo:'compressed body'}});input.control.state.get('a.json').etag='"exact-head-validator"';const compressedGet=input.sdk.get.bind(input.sdk);
 input.sdk.get=async(url,options)=>{const reply=await compressedGet(url,options);reply.blob.etag='W/'+reply.blob.etag;reply.blob.size=0;return reply;};
 result=await createSnapshot(input.sdk,{retryDelayMs:0});assert.equal(result.attemptsUsed,1);assert.equal(result.objects[0].etag,'"exact-head-validator"','write version must preserve exact HEAD validator');assert.deepEqual(JSON.parse(result.objects[0].body),{memo:'compressed body'});assert.equal(result.summary.totalBytes,Buffer.byteLength(result.objects[0].body));
 // This update happens after a.json has been downloaded, precisely the gap missed by an immediate per-object head check.
 input=source({'a.json':{memo:'old'},'b.json':{}},{afterGet(c){if(c.stats.get===2)c.put('a.json',{memo:'new'});}});
 result=await createSnapshot(input.sdk,{retryDelayMs:0});assert.equal(result.attemptsUsed,2);assert.deepEqual(JSON.parse(result.objects[0].body),{memo:'new'});
 input=source({'a.json':{}},{afterGet(c){if(c.stats.get===1)c.put('b.json',{added:true});}});
 result=await createSnapshot(input.sdk,{retryDelayMs:0});assert.equal(result.attemptsUsed,2);assert.deepEqual(result.objects.map(o=>o.path),['a.json','b.json']);
 input=source({'a.json':{},'b.json':{}},{afterGet(c){if(c.stats.get===1)c.remove('b.json');}});
 result=await createSnapshot(input.sdk,{retryDelayMs:0});assert.equal(result.attemptsUsed,2);assert.deepEqual(result.objects.map(o=>o.path),['a.json']);
 input=source({'a.json':{}},{beforeList(c){if(c.stats.list===1){const row=c.state.get('a.json'),item={pathname:'a.json',url:'https://source.test/a.json',etag:row.etag};return {blobs:[item,item],hasMore:false};}}});
 result=await createSnapshot(input.sdk,{retryDelayMs:0});assert.equal(result.attemptsUsed,2);assert.equal(result.objects.length,1);
 input=source({'a.json':{}},{afterGet(c){c.put('a.json',{edit:c.stats.get});}});
 await assert.rejects(createSnapshot(input.sdk,{maxAttempts:3,retryDelayMs:0}),/3 snapshot attempts/);assert.equal(input.control.stats.get,3,'busy source must stop at the retry limit');
 input=source({'large.json':'a'.repeat(MAX_DOCUMENT_BYTES+1)});await assert.rejects(createSnapshot(input.sdk,{retryDelayMs:0}),/target capacity/);assert.equal(input.control.stats.get,0,'capacity must be checked before body download');
 input=source({});result=await createSnapshot(input.sdk,{retryDelayMs:0});assert.deepEqual(result.objects,[]);assert.equal(result.summary.totalBytes,0);
 console.log('PASS stable read-only snapshot: paginated inventories, late updates, additions, deletions, duplicates, bounded retries, capacity preflight and empty source');
}
function importTests(){
 const body=JSON.stringify({memo:"한글 ' 메모 😀 ".repeat(16000),owner:'synthetic-owner',seniorityPay:70000,dutyPay:70000});
 const object={path:'accounts/apple/synthetic.json',body,etag:'original-version',contentType:'application/json',updatedAt:'2026-11-03T00:00:00.000Z',sha256:digest(body)};
 const backup=path.join(temp,'backup.json');fs.writeFileSync(backup,JSON.stringify({version:1,objects:[object]}));
 const prepared=run('prepare',backup);assert.equal(prepared.status,0,prepared.stderr);
 const sqlFile=path.join(temp,prepared.stdout.trim().split('\n').at(-1)),sql=fs.readFileSync(sqlFile,'utf8');
 assert.equal(fs.statSync(sqlFile).mode&0o777,0o600);
 for(const statement of sql.split('\n'))assert(Buffer.byteLength(statement)<100000,'D1 SQL statement limit');
 const db=new DatabaseSync(':memory:');try{
  db.exec(fs.readFileSync(path.join(root,'cloudflare/migrations/0001_objects.sql'),'utf8'));db.exec(sql);
  const rows=db.prepare('SELECT path,body,version,content_type,updated_at FROM objects').all();assert.equal(rows[0].body,body);assert.equal(rows[0].version,object.etag);
  assert.throws(()=>db.exec(sql),/UNIQUE/,'reimport must not overwrite documents');
  const target=path.join(temp,'rows.json');fs.writeFileSync(target,JSON.stringify([{results:rows}]));const verified=run('verify',backup,target);assert.equal(verified.status,0);assert.match(verified.stdout,new RegExp(Buffer.byteLength(body)+' UTF-8 bytes'));
  const broken=[{...rows[0],content_type:'text/plain'}];fs.writeFileSync(target,JSON.stringify(broken));assert.notEqual(run('verify',backup,target).status,0,'changed metadata must fail verification');
  fs.writeFileSync(target,JSON.stringify([rows[0],rows[0]]));assert.notEqual(run('verify',backup,target).status,0,'duplicate target rows must fail verification');
  rows[0].body='{}';fs.writeFileSync(target,JSON.stringify(rows));assert.notEqual(run('verify',backup,target).status,0,'changed documents must fail verification');
  fs.writeFileSync(backup,JSON.stringify({version:1,objects:[{...object,body:'{}'}]}));assert.notEqual(run('prepare',backup).status,0,'tampered backup must fail before import');
  fs.writeFileSync(backup,'SENSITIVE_DOCUMENT_CONTENT is not JSON');const invalid=run('prepare',backup);assert.notEqual(invalid.status,0);assert(!invalid.stderr.includes('SENSITIVE_DOCUMENT_CONTENT'),'parse errors must not expose document text');
 }finally{db.close();}
 console.log('PASS private migration: large Korean/emoji JSON, SQL limits, exact hashes/versions/metadata, byte counts, restrictive permissions and non-overwriting import');
}
(async()=>{try{await snapshotTests();importTests();}finally{fs.rmSync(temp,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
