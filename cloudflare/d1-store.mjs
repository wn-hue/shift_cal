import {randomUUID} from 'node:crypto';
export class BlobNotFoundError extends Error {constructor(){super('Object not found');this.name='BlobNotFoundError';}}
export class BlobPreconditionFailedError extends Error {constructor(){super('Object version changed');this.name='BlobPreconditionFailedError';}}
export class BlobAlreadyExistsError extends Error {constructor(){super('Object already exists');this.name='BlobAlreadyExistsError';}}
export class BlobPathnameMismatchError extends BlobPreconditionFailedError {}
export function createObjectStore(db,{readOnly=false}={}) {
 const pathname=value=>{
  if(typeof value!=='string'||!value||value.length>2048)throw Error('Invalid object path');
  const path=value.startsWith('https://objects.internal/')?decodeURIComponent(new URL(value).pathname.slice(1)):value;
  if(path.startsWith('/')||path.split('/').some(p=>p==='..'||p==='.')||/[\x00-\x1f]/.test(path))throw Error('Invalid object path');
  return path;
 };
 const metadata=row=>({url:'https://objects.internal/'+row.path.split('/').map(encodeURIComponent).join('/'),pathname:row.path,etag:row.version,contentType:row.content_type,size:row.size??new TextEncoder().encode(row.body).length});
 const writable=()=>{if(readOnly)throw Error('MIGRATION_READ_ONLY');};
 return {
  async head(value){const path=pathname(value),row=await db.prepare('SELECT path,version,content_type,length(CAST(body AS BLOB)) AS size FROM objects WHERE path=?').bind(path).first();if(!row)throw new BlobNotFoundError();return metadata(row);},
  async get(value){const path=pathname(value),row=await db.prepare('SELECT * FROM objects WHERE path=?').bind(path).first();return row?{stream:new Response(row.body).body,blob:metadata(row)}:null;},
  async put(value,body,options={}){
   writable();const path=pathname(value);if(typeof body!=='string'||new TextEncoder().encode(body).length>1000000)throw Error('Invalid document');
   const version=randomUUID(),now=new Date().toISOString(),type=options.contentType||'application/json';let result;
   if(options.ifMatch){result=await db.prepare('UPDATE objects SET body=?,version=?,content_type=?,updated_at=? WHERE path=? AND version=?').bind(body,version,type,now,path,options.ifMatch).run();if(!result.meta.changes)throw new BlobPreconditionFailedError();}
   else if(options.allowOverwrite){result=await db.prepare('INSERT INTO objects(path,body,version,content_type,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(path) DO UPDATE SET body=excluded.body,version=excluded.version,content_type=excluded.content_type,updated_at=excluded.updated_at').bind(path,body,version,type,now).run();}
   else {result=await db.prepare('INSERT INTO objects(path,body,version,content_type,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(path) DO NOTHING').bind(path,body,version,type,now).run();if(!result.meta.changes)throw new BlobAlreadyExistsError();}
   return metadata({path,body,version,content_type:type});
  },
  async del(value,options={}){writable();for(const v of Array.isArray(value)?value:[value]){const path=pathname(v);const result=options.ifMatch?await db.prepare('DELETE FROM objects WHERE path=? AND version=?').bind(path,options.ifMatch).run():await db.prepare('DELETE FROM objects WHERE path=?').bind(path).run();if(options.ifMatch&&!result.meta.changes)throw new BlobPreconditionFailedError();}}
 };
}
