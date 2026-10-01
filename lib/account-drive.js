'use strict';
const crypto = require('node:crypto');
const C = require('../account-data-core.js');
const DRIVE = 'https://www.googleapis.com/drive/v3';
const KIND = 'shiftcal_account_v1';
class CloudError extends Error { constructor(status,code,message) { super(message); this.status=status; this.code=code; } }
async function request(token,url,options={}) {
    let response;
    try { response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers},signal:AbortSignal.timeout(15000)}); }
    catch { throw new CloudError(502,'CLOUD_NETWORK','계정 저장소에 연결하지 못했습니다. 기기 데이터는 유지됩니다.'); }
    const text=await response.text();
    if (text.length>250000) throw new CloudError(413,'CLOUD_SIZE','계정 데이터가 너무 큽니다.');
    let data={};try{data=text?JSON.parse(text):{};}catch{throw new CloudError(502,'CLOUD_FORMAT','계정 데이터 형식을 확인하지 못했습니다.');}
    if(!response.ok) {
        const reason=data.error?.errors?.[0]?.reason || data.error?.status || 'CLOUD_ERROR';
        if(response.status===403)throw new CloudError(403,reason==='accessNotConfigured'||reason==='SERVICE_DISABLED'?'DRIVE_SETUP':'DRIVE_PERMISSION',reason==='accessNotConfigured'||reason==='SERVICE_DISABLED'?'Google Cloud에서 Google Drive API를 사용 설정해주세요.':'구글 계정 저장 권한을 허용하고 다시 로그인해주세요.');
        throw new CloudError(response.status,reason,'계정 저장 요청을 완료하지 못했습니다. 다시 시도하세요.');
    }
    return data;
}
function headFiles(files) {
    const unique=new Map();
    for(const f of files) {
        const p=f.appProperties||{};
        if(p.kind!==KIND || !/^[a-f0-9]{32}$/.test(p.revision||''))continue;
        if(!unique.has(p.revision))unique.set(p.revision,f);
    }
    const parents=new Set([...unique.values()].flatMap(f=>Object.entries(f.appProperties).filter(([k])=>/^parent\d+$/.test(k)).map(([,v])=>v)));
    return [...unique.values()].filter(f=>!parents.has(f.appProperties.revision));
}
async function list(token) {
    // Writes retain immutable revisions. A concurrent save produces two heads,
    // never an overwritten document. Subsequent saves require all current heads.
    const params=new URLSearchParams({spaces:'appDataFolder',q:`trashed = false and appProperties has { key='kind' and value='${KIND}' }`,pageSize:'100',orderBy:'createdTime desc',fields:'nextPageToken,files(id,size,createdTime,appProperties)'});
    const files=[]; const seen=new Set();
    do {
        const page=await request(token,DRIVE+'/files?'+params);
        files.push(...(page.files||[]));
        if(!page.nextPageToken)return files;
        if(files.length>=10000 || seen.has(page.nextPageToken))throw new CloudError(409,'CLOUD_HISTORY_LIMIT','저장 기록이 너무 많습니다. 기기 데이터는 유지됩니다.');
        seen.add(page.nextPageToken);params.set('pageToken',page.nextPageToken);
    } while(true);
}
async function readFile(token,file) {
    if(!/^[A-Za-z0-9_-]{5,200}$/.test(file.id||'') || Number(file.size)>750000)throw new CloudError(413,'CLOUD_SIZE','계정 데이터 파일을 확인하세요.');
    const doc=await request(token,DRIVE+'/files/'+encodeURIComponent(file.id)+'?alt=media');
    if(doc.schema!==1 || doc.revision!==file.appProperties.revision || !Array.isArray(doc.parents))throw new CloudError(409,'CLOUD_CORRUPT','계정 저장 기록을 확인하지 못했습니다. 기기 데이터는 유지됩니다.');
    let data;try{data=C.normalize(doc.data);}catch{throw new CloudError(409,'CLOUD_CORRUPT','계정 데이터 형식이 올바르지 않습니다.');}
    return {revision:doc.revision,updatedAt:doc.updatedAt,data};
}
async function read(token) {
    const heads=headFiles(await list(token));
    if(heads.length>16)throw new CloudError(409,'CLOUD_FORK_LIMIT','동시에 변경된 저장 기록이 너무 많습니다.');
    return {versions:await Promise.all(heads.map(f=>readFile(token,f)))};
}
async function write(token,input) {
    if(!input || !/^[a-f0-9]{32}$/.test(input.revision||'') || !Array.isArray(input.parents) || input.parents.length>16 || new Set(input.parents).size!==input.parents.length || input.parents.some(p=>!/^[a-f0-9]{32}$/.test(p)))throw new CloudError(400,'CLOUD_REQUEST','저장 버전을 확인하세요.');
    let data;try{data=C.normalize(input.data);}catch(e){throw new CloudError(400,'CLOUD_DATA',e.message);}
    const files=await list(token), duplicate=files.find(f=>f.appProperties?.revision===input.revision);
    if(duplicate) {
        const previous=await readFile(token,duplicate);
        if(!C.equal(previous.data,data))throw new CloudError(409,'CLOUD_REVISION','저장 요청이 중복되었습니다. 다시 시도하세요.');
        return previous;
    }
    const heads=headFiles(files).map(f=>f.appProperties.revision).sort();
    if(!C.equal(heads,[...input.parents].sort()))throw new CloudError(412,'CLOUD_CONFLICT','다른 기기에서 변경되었습니다. 최신 데이터를 불러오세요.');
    const doc={schema:1,revision:input.revision,parents:input.parents,updatedAt:new Date().toISOString(),data};
    const appProperties={kind:KIND,revision:input.revision,...Object.fromEntries(input.parents.map((p,i)=>['parent'+i,p]))};
    const metadata={name:'shift-cal-account.json',mimeType:'application/json',parents:['appDataFolder'],appProperties};
    const boundary='shiftcal_'+crypto.randomBytes(16).toString('hex');
    const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(doc)}\r\n--${boundary}--`;
    await request(token,'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
    return {revision:doc.revision,updatedAt:doc.updatedAt,data};
}
module.exports={read,write,headFiles,CloudError};
