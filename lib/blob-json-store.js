'use strict';
const blob=require('@vercel/blob');
const etagValue=value=>String(value||'').replace(/^W\//,'').replace(/^"|"$/g,'');
// SDK subclasses inherit Error.name, so checking .name alone misses real conflicts.
function isConflict(error){return error instanceof blob.BlobPreconditionFailedError||error instanceof blob.BlobPathnameMismatchError||['BlobPreconditionFailedError','BlobPathnameMismatchError'].includes(error?.name);}
function createStore(sdk=blob){return{
 async read(path){
  for(let attempt=0;attempt<5;attempt++){
   let metadata;try{metadata=await sdk.head(path);}catch(error){if(error instanceof blob.BlobNotFoundError||error?.name==='BlobNotFoundError')return null;throw error;}
   const url=new URL(metadata.url);url.searchParams.set('version',metadata.etag);
   const result=await sdk.get(url.toString(),{access:'private',useCache:false});
   // A file can change between metadata and content reads. Never pair old data with a new write token.
   if(!result||etagValue(result.blob.etag)!==etagValue(metadata.etag))continue;
   const data=JSON.parse(await new Response(result.stream).text());
   data._etag=metadata.etag;return data;
  }
  throw new blob.BlobPreconditionFailedError();
 },
 async write(path,data,etag){const{_etag,...document}=data;await sdk.put(path,JSON.stringify(document),{access:'private',addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:60});}
};}
module.exports={createStore,isConflict};
