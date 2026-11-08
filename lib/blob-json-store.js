'use strict';
const blob=require('@vercel/blob');
const storage=require('./object-storage');
// SDK subclasses inherit Error.name, so checking .name alone misses real conflicts.
function isConflict(error){return error instanceof blob.BlobPreconditionFailedError||error instanceof blob.BlobPathnameMismatchError||['BlobPreconditionFailedError','BlobPathnameMismatchError','BlobAlreadyExistsError'].includes(error?.name);}
function createStore(sdk=storage){return{
 async read(path){
  const result=sdk.directReads?await sdk.get(path,{access:'private',useCache:false}):await storage.readVersionedBlob(sdk,path);
  if(!result)return null;
  const data=JSON.parse(await new Response(result.stream).text());
  data._etag=result.blob.etag;return data;
 },
 async write(path,data,etag){const{_etag,...document}=data;await sdk.put(path,JSON.stringify(document),{access:'private',addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:60});}
};}
module.exports={createStore,isConflict};
