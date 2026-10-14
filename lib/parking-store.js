'use strict';
const{get,put}=require('@vercel/blob');
const storage={async read(path){const r=await get(path,{access:'private',useCache:false});if(!r)return null;const data=JSON.parse(await new Response(r.stream).text());data._etag=r.blob.etag;return data;},async write(path,data,etag){await put(path,JSON.stringify(data),{access:'private',addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:60});}};
async function update(store,path,fn){for(let n=0;n<10;n++){const old=await store.read(path);const next=fn(old);if(next===null)return old;try{await store.write(path,next,old?._etag);return next;}catch(e){if(!['BlobPreconditionFailedError','BlobPathnameMismatchError'].includes(e.name))throw e;}}throw Error('PARKING_CONFLICT');}
module.exports={storage,update};
