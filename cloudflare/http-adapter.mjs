const MAX_BODY=300000;
export async function invoke(handler,request){
 const url=new URL(request.url),headers=Object.fromEntries(request.headers),query={};
 for(const key of new Set(url.searchParams.keys())){const values=url.searchParams.getAll(key);query[key]=values.length===1?values[0]:values;}
 let body;
 if(!['GET','HEAD'].includes(request.method)){
  if(Number(request.headers.get('content-length'))>MAX_BODY)return Response.json({message:'요청이 너무 큽니다.'},{status:413});
  const reader=request.body?.getReader();let size=0;const chunks=[];
  if(reader)for(;;){const item=await reader.read();if(item.done)break;size+=item.value.length;if(size>MAX_BODY){await reader.cancel();return Response.json({message:'요청이 너무 큽니다.'},{status:413});}chunks.push(item.value);}
  const all=new Uint8Array(size);let at=0;for(const chunk of chunks){all.set(chunk,at);at+=chunk.length;}const text=new TextDecoder().decode(all);
  if(headers['content-type']?.includes('application/json')){try{body=text?JSON.parse(text):{};}catch{return Response.json({message:'올바른 요청을 보내 주세요.'},{status:400});}}else body=text;
 }
 const output=new Map();let statusCode=200,result,ended=false;
 const res={get statusCode(){return statusCode;},set statusCode(n){statusCode=n;},get headersSent(){return ended;},setHeader(k,v){output.set(k.toLowerCase(),v);return this;},getHeader(k){return output.get(k.toLowerCase());},status(n){statusCode=n;return this;},json(value){this.setHeader('Content-Type','application/json; charset=utf-8');return this.end(JSON.stringify(value));},send(value){return this.end(value);},end(value=''){result=value;ended=true;return this;}};
 await handler({url:url.pathname+url.search,method:request.method,headers,query,body},res);
 if(!ended)throw Error('API_DID_NOT_RESPOND');
 const responseHeaders=new Headers();for(const[k,value]of output)for(const part of Array.isArray(value)?value:[value])responseHeaders.append(k,String(part));
 responseHeaders.set('Cache-Control','no-store');responseHeaders.set('X-Content-Type-Options','nosniff');
 return new Response(request.method==='HEAD'?null:result,{status:statusCode,headers:responseHeaders});
}
