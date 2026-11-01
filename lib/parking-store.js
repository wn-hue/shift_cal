'use strict';
const{createStore,isConflict}=require('./blob-json-store');
const storage=createStore();
async function update(store,path,fn){for(let n=0;n<10;n++){const old=await store.read(path);const next=fn(old);if(next===null)return old;try{await store.write(path,next,old?._etag);return next;}catch(e){if(!isConflict(e))throw e;}}throw Error('PARKING_CONFLICT');}
module.exports={storage,update};
