'use strict';
// Private backup files never belong in Git or build artifacts. Never prints object bodies.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const MAX_DOCUMENT_BYTES=1000000;
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const directory=path.resolve('.migration-private');
class MigrationError extends Error {}
class UnstableSnapshot extends MigrationError {}
function parseJSON(text,label){try{return JSON.parse(text);}catch{throw new MigrationError(label+' is not valid JSON. Document content was not logged.');}}
function save(name,data){fs.mkdirSync(directory,{recursive:true,mode:0o700});fs.chmodSync(directory,0o700);const dest=path.join(directory,name);fs.writeFileSync(dest,data,{mode:0o600,flag:'wx'});return dest;}
function validateManifest(m){
 if(m.version!==1||!Array.isArray(m.objects))throw new MigrationError('Invalid backup');
 const paths=new Set();for(const o of m.objects){
  if(typeof o.path!=='string'||!o.path||o.path.length>2048||paths.has(o.path)||typeof o.body!=='string'||digest(o.body)!==o.sha256||typeof o.etag!=='string'||!o.etag||typeof o.contentType!=='string'||typeof o.updatedAt!=='string'||!Number.isFinite(Date.parse(o.updatedAt)))throw new MigrationError('Backup integrity mismatch');
  if(Buffer.byteLength(o.body)>MAX_DOCUMENT_BYTES)throw new MigrationError('Document exceeds the target capacity; review storage sizing before import.');
  parseJSON(o.body,'Backup document');paths.add(o.path);
 }
 return m;
}
function manifest(file){return validateManifest(parseJSON(fs.readFileSync(file,'utf8'),'Backup'));}
function summary(m){return {documentCount:m.objects.length,totalBytes:m.objects.reduce((n,o)=>n+Buffer.byteLength(o.body),0),manifestSha256:digest(JSON.stringify(m.objects.map(o=>[o.path,o.sha256,o.etag,o.contentType,o.updatedAt])))};}
function notFound(sdk,error){return error?.name==='BlobNotFoundError'||typeof sdk.BlobNotFoundError==='function'&&error instanceof sdk.BlobNotFoundError;}
async function inventory(sdk){
 const objects=[],paths=new Set(),cursors=new Set();let cursor;
 do{
  const page=await sdk.list({cursor,limit:1000});
  if(!page||!Array.isArray(page.blobs))throw new MigrationError('Invalid source inventory response');
  for(const item of page.blobs){
   if(typeof item.pathname!=='string'||!item.pathname.endsWith('.json'))throw new MigrationError('Unexpected non-JSON object. Review the source store before migration.');
   if(paths.has(item.pathname))throw new UnstableSnapshot('Duplicate source path during pagination');paths.add(item.pathname);
   let head;try{head=await sdk.head(item.url);}catch(error){if(notFound(sdk,error))throw new UnstableSnapshot('Source changed during inventory');throw error;}
   const updatedAt=new Date(head.uploadedAt).toISOString();
   if(head.pathname!==item.pathname||head.etag!==item.etag)throw new UnstableSnapshot('Source changed during inventory');
   if(typeof head.etag!=='string'||!head.etag||typeof head.contentType!=='string'||!Number.isSafeInteger(head.size)||head.size<0)throw new MigrationError('Invalid source metadata');
   if(head.size>MAX_DOCUMENT_BYTES)throw new MigrationError('Document exceeds the target capacity; review storage sizing before export.');
   objects.push({path:item.pathname,url:item.url,etag:head.etag,contentType:head.contentType,size:head.size,updatedAt});
  }
  if(!page.hasMore)break;
  if(typeof page.cursor!=='string'||!page.cursor||cursors.has(page.cursor))throw new UnstableSnapshot('Source pagination changed');
  cursor=page.cursor;cursors.add(cursor);
 }while(true);
 return objects.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
function inventorySignature(items){return JSON.stringify(items.map(o=>[o.path,o.etag,o.contentType,o.size,o.updatedAt]));}
// Compression may weaken the HTTP GET validator; retain HEAD's exact validator for writes.
const normalizedEtag=value=>String(value||'').replace(/^W\//,'').replace(/^"|"$/g,'');
async function readDocument(stream){
 const reader=stream.getReader(),chunks=[];let size=0;
 try{for(;;){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>MAX_DOCUMENT_BYTES){await reader.cancel();throw new MigrationError('Document exceeds the target capacity; review storage sizing before export.');}chunks.push(Buffer.from(item.value));}}finally{reader.releaseLock();}
 let body;try{body=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks));}catch{throw new MigrationError('Source document is not valid UTF-8. No backup was created.');}
 parseJSON(body,'Source document');return {body,size};
}
async function createSnapshot(sdk,{maxAttempts=3,retryDelayMs=100}={}){
 if(!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>10)throw new MigrationError('Invalid snapshot attempt limit');
 for(let attempt=1;attempt<=maxAttempts;attempt++){
  try{
   const startedAt=new Date().toISOString(),before=await inventory(sdk),objects=[];
   for(const item of before){
    // Match the application's existing cache-busting read: head/list can be fresh while an unversioned body remains cached.
    const readUrl=new URL(item.url);readUrl.searchParams.set('version',item.etag);
    let result;try{result=await sdk.get(readUrl.toString(),{access:'private',useCache:false});}catch(error){if(notFound(sdk,error))throw new UnstableSnapshot('Source changed during export');throw error;}
    if(!result?.stream||result.statusCode!==200||normalizedEtag(result.blob?.etag)!==normalizedEtag(item.etag)||result.blob?.pathname!==item.path)throw new UnstableSnapshot('Source content did not match inventory');
    const {body,size}=await readDocument(result.stream);if(size!==item.size)throw new UnstableSnapshot('Source changed during export');
    objects.push({path:item.path,body,etag:item.etag,contentType:item.contentType,sha256:digest(body),updatedAt:item.updatedAt});
   }
   const after=await inventory(sdk);if(inventorySignature(before)!==inventorySignature(after))throw new UnstableSnapshot('Source changed after export');
   const m=validateManifest({version:1,createdAt:new Date().toISOString(),inventoryStartedAt:startedAt,attemptsUsed:attempt,objects});m.summary=summary(m);return m;
  }catch(error){if(!(error instanceof UnstableSnapshot))throw error;if(attempt===maxAttempts)throw new MigrationError('Source inventory/content did not stabilize within '+maxAttempts+' snapshot attempts. No backup was created; verify source consistency and retry.');if(retryDelayMs)await new Promise(resolve=>setTimeout(resolve,retryDelayMs));}
 }
}
async function exportObjects(){
 if(!process.env.BLOB_READ_WRITE_TOKEN)throw new MigrationError('Configure BLOB_READ_WRITE_TOKEN privately; do not paste it into chat.');
 const m=await createSnapshot(require('@vercel/blob')),file=save('objects-'+Date.now()+'.json',JSON.stringify(m));
 console.log('Private backup created: '+m.summary.documentCount+' JSON documents, '+m.summary.totalBytes+' UTF-8 bytes; stable full inventories verified.');console.log(path.relative(process.cwd(),file));
}
function sqlLiteral(value){return "'"+String(value).replace(/'/g,"''")+"'";}
function prepare(file){const m=manifest(file),lines=[];for(const o of m.objects){
 // Stay below D1's per-statement SQL size limit, including multibyte Korean text.
 const chunks=o.body.match(/[\s\S]{1,16000}/gu)||[''];
 lines.push('INSERT INTO objects(path,body,version,content_type,updated_at) VALUES('+[o.path,chunks[0],o.etag,o.contentType,o.updatedAt].map(sqlLiteral).join(',')+');');
 for(const chunk of chunks.slice(1))lines.push('UPDATE objects SET body=body||'+sqlLiteral(chunk)+' WHERE path='+sqlLiteral(o.path)+';');
 }const dest=save('import-'+Date.now()+'.sql',lines.join('\n'));console.log('Prepared non-overwriting import: '+m.objects.length+' documents. Import only into an empty target.');console.log(path.relative(process.cwd(),dest));}
function verify(file,exportFile){
 const m=manifest(file),raw=parseJSON(fs.readFileSync(exportFile,'utf8'),'Target query results'),rows=Array.isArray(raw)&&raw[0]?.results?raw.flatMap(r=>r.results):raw.results||raw;
 if(!Array.isArray(rows))throw new MigrationError('Expected D1 JSON query results');const existing=new Map(rows.map(r=>[r.path,r]));
 if(existing.size!==m.objects.length||rows.length!==existing.size)throw new MigrationError('Object count mismatch');
 for(const o of m.objects){const r=existing.get(o.path);if(!r||typeof r.body!=='string'||digest(r.body)!==o.sha256||r.version!==o.etag||r.content_type!==o.contentType||r.updated_at!==o.updatedAt)throw new MigrationError('Document/version/metadata mismatch');}
 const totals=summary(m);console.log('VERIFIED: '+totals.documentCount+' objects, '+totals.totalBytes+' UTF-8 bytes; exact hashes, write versions and metadata preserved.');return totals;
}
async function main(){const [action,file,target]=process.argv.slice(2);if(action==='export')await exportObjects();else if(action==='prepare')prepare(file);else if(action==='verify')verify(file,target);else throw new MigrationError('Usage: export | prepare PRIVATE_BACKUP | verify PRIVATE_BACKUP PRIVATE_D1_ROWS');}
module.exports={createSnapshot,validateManifest,summary,verify,MAX_DOCUMENT_BYTES};
if(require.main===module)main().catch(error=>{console.error(error instanceof MigrationError?error.message:'Migration command failed. Check private inputs and platform access; no document content was logged.');process.exitCode=1;});
