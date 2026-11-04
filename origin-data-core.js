(function(root){'use strict';
 const allowed=k=>typeof k==='string'&&/^shift_[a-zA-Z0-9_.:@-]{1,180}$/.test(k)&&!/(token|credential|session|subscription)/i.test(k);
 function validate(data){if(data?.version!==1||!data.values||typeof data.values!=='object'||Array.isArray(data.values)||Object.keys(data.values).length>2000)throw Error('가져올 파일을 확인해 주세요.');let size=0;for(const[k,v]of Object.entries(data.values)){if(!allowed(k)||typeof v!=='string')throw Error('데이터 형식을 확인해 주세요.');size+=k.length+v.length;}if(size>6000000)throw Error('데이터가 너무 큽니다.');return data;}
 function snapshot(storage){const values=Object.create(null);for(let i=0;i<storage.length;i++){const k=storage.key(i);if(allowed(k))values[k]=storage.getItem(k);}return validate({version:1,exportedAt:new Date().toISOString(),values});}
 function restore(storage,data,overwrite=false){validate(data);const before=new Map(),entries=Object.entries(data.values);let copied=0;try{for(const[k,v]of entries){const old=storage.getItem(k);if(old!==null&&!overwrite)continue;before.set(k,old);storage.setItem(k,v);copied++;}}catch(e){for(const[k,v]of before){if(v===null)storage.removeItem(k);else storage.setItem(k,v);}throw e;}return copied;}
 const api={allowed,validate,snapshot,restore};if(typeof module==='object')module.exports=api;else root.OriginDataCore=api;
})(typeof window==='object'?window:globalThis);
