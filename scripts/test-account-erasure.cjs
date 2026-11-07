'use strict';

const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const sdk=require('@vercel/blob');
const documents=new Map(),drive=new Map(),providerCalls=[];
const origin='https://erasure.example',secret='synthetic-account-erasure-key-'.repeat(2);
const appleKey=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'}).privateKey.export({type:'pkcs8',format:'pem'});
Object.assign(process.env,{
    APP_URL:origin,GOOGLE_CALENDAR_CLIENT_ID:'fixture',GOOGLE_CALENDAR_CLIENT_SECRET:'fixture',
    GOOGLE_CALENDAR_SESSION_SECRET:secret,APPLE_CLIENT_ID:'fixture',APPLE_TEAM_ID:'fixture',
    APPLE_KEY_ID:'fixture',APPLE_PRIVATE_KEY:appleKey,BLOB_READ_WRITE_TOKEN:'synthetic-no-network'
});
delete process.env.GOOGLE_OAUTH_REDIRECT_ORIGIN;
const key=value=>value.startsWith('https:')?new URL(value).pathname.slice(1):value;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const meta=(path,record)=>({pathname:path,url:'https://blobs.example/'+path,etag:record.etag});
let version=0,markerUnavailable=false,failPath='',beforePut,beforeDriveUpload,deniedDriveDeletion='',revocationOutcome='success';
function write(path,data){documents.set(path,{data,etag:'v'+(++version)});}
const read=path=>documents.get(path)?.data;
function fixtureError(name){return Object.assign(Error(name),{name});}
require.cache[require.resolve('@vercel/blob')].exports={
    ...sdk,
    async head(value){
        const path=key(value);
        if(markerUnavailable&&path.startsWith('account-erasure/'))throw Error('state unavailable');
        const record=documents.get(path);
        if(!record)throw fixtureError('BlobNotFoundError');
        return meta(path,record);
    },
    async get(value){
        const path=key(value),record=documents.get(path);
        return record?{blob:meta(path,record),stream:new Response(JSON.stringify(record.data)).body}:null;
    },
    async put(path,body,options){
        await beforePut?.(path,JSON.parse(body));
        const prior=documents.get(path);
        if(options.ifMatch&&prior?.etag!==options.ifMatch)throw fixtureError('BlobPreconditionFailedError');
        if(prior&&!options.allowOverwrite)throw fixtureError('BlobAlreadyExistsError');
        write(path,JSON.parse(body));
        return meta(path,documents.get(path));
    },
    async del(path,{ifMatch}={}){
        if(path===failPath)throw Error('storage unavailable');
        const prior=documents.get(path);
        if(!prior)throw fixtureError('BlobNotFoundError');
        if(ifMatch&&prior.etag!==ifMatch)throw fixtureError('BlobPreconditionFailedError');
        documents.delete(path);
    },
    async list({prefix,cursor}){
        const paths=[...documents.keys()].filter(path=>path.startsWith(prefix)).sort();
        const start=Number(cursor||0),next=start+1;
        return {blobs:paths.slice(start,next).map(path=>meta(path,documents.get(path))),hasMore:next<paths.length,cursor:String(next)};
    }
};
const google=require('../api/google-calendar');
const account=require('../api/account');
const lost=require('../api/lost-found');
const live=require('../api/live-schedule');
const native=require('../api/native-account');
const core=require('../lib/lost-found');
const C=require('../account-data-core');
const {seal}=google._test;
const makeUser=(provider,sub,extras={})=>({provider,sub,refresh:'fixture-'+sub,email:'fixture@example.test',csrf:'csrf-'+sub,exp:Date.now()+3600000,...extras});
const owner=user=>core.identity(user,secret);
const route=(name,action)=>'/api/'+name+(action?'?action='+action:'');
const sessionCookie=user=>'__Host-shiftcal-'+user.provider+'='+seal(user,secret);
const headers=user=>({origin,'content-type':'application/json',...(user?{cookie:sessionCookie(user),'x-shift-csrf':user.csrf}:{})});
const call=async(handler,url,{user,body={},method='POST',extra={}}={})=>{
    const out={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},end(raw){this.data=JSON.parse(raw);}};
    await handler({url,method,body,headers:{...headers(user),...extra}},out);
    return out;
};
const status=user=>call(account,route('account','status'),{user,method:'GET'});
const remove=(user,body={})=>call(account,route('account','cloud-delete'),{user,body});
const schedule={group:'C',month:'2026-11',days:Array.from({length:30},()=>({type:'DAY'}))};
const post=()=>({action:'create',id:crypto.randomUUID(),type:'습득',place:'휴게실',itemType:'열쇠',storage:'현장'});
const newPost=user=>call(lost,'/api/lost-found',{user,body:post()});
const newLink=user=>call(live,'/api/live-schedule',{user,body:schedule});
const publishPath=id=>'schedules/'+id+'.json';
const bearer=user=>'Bearer '+seal({session:seal(user,secret),provider:user.provider,exp:user.exp},secret);
const rawFetch=global.fetch;
global.fetch=async(value,options={})=>{
    const url=new URL(value);
    providerCalls.push(url.hostname+url.pathname);
    if(url.pathname.endsWith('/revoke')){
        if(revocationOutcome==='lost-response')throw Error('response lost');
        if(revocationOutcome==='already-revoked')return Response.json({error:'invalid_token'},{status:400});
        return new Response(null,{status:200});
    }
    if(url.hostname==='oauth2.googleapis.com'&&url.pathname==='/token'){
        const refresh=new URLSearchParams(options.body).get('refresh_token');
        return Response.json({access_token:refresh,scope:refresh.endsWith('-drive')?'openid email https://www.googleapis.com/auth/drive.appdata':'openid email'});
    }
    if(url.hostname==='appleid.apple.com'&&url.pathname==='/auth/token')return Response.json({access_token:'fixture'});
    if(url.hostname==='www.googleapis.com'&&url.pathname==='/drive/v3/files'){
        return Response.json({files:[...drive.values()].map(({doc,...file})=>file)});
    }
    if(url.hostname==='www.googleapis.com'&&url.pathname==='/upload/drive/v3/files'){
        await beforeDriveUpload?.();
        const [,metadata,content]=options.body.split('\r\n\r\n');
        const {appProperties}=JSON.parse(metadata.split('\r\n')[0]);
        const doc=JSON.parse(content.split('\r\n')[0]);
        const id='file-'+appProperties.revision;
        drive.set(id,{id,appProperties,doc});
        return Response.json({id});
    }
    if(url.hostname==='www.googleapis.com'&&url.pathname.startsWith('/drive/v3/files/')){
        const id=url.pathname.split('/').pop();
        if(options.method==='DELETE'){
            if(id===deniedDriveDeletion)return Response.json({error:{message:'Token revoked'}},{status:401});
            return new Response(null,{status:drive.delete(id)?204:404});
        }
        return drive.has(id)?Response.json(drive.get(id).doc):new Response(null,{status:404});
    }
    throw Error('Unexpected external request: '+url.hostname+url.pathname);
};

async function run(){
    const googleOnly=makeUser('google','google-only',{drive:false});
    const other=makeUser('google','other-account',{drive:false});
    const gPost=await newPost(googleOnly),otherPost=await newPost(other);
    assert.equal(gPost.statusCode,200);assert.equal(otherPost.statusCode,200);
    const gLink=await newLink(googleOnly),otherLink=await newLink(other);
    assert.equal(gLink.statusCode,200);assert.equal(otherLink.statusCode,200);
    const board=read(core.PATH);
    board.posts.find(p=>p.owner===owner(other)).reports[owner(googleOnly)]={reason:'허위·스팸',at:Date.now()};
    board.blocks[owner(googleOnly)]={authors:[owner(other)],updatedAt:Date.now()};
    board.blocks[owner(other)]={authors:[owner(googleOnly)],updatedAt:Date.now()};
    assert.equal((await call(account,route('account','cloud-delete'),{user:googleOnly,extra:{'x-shift-csrf':'wrong'}})).statusCode,403);
    const deleted=await remove(googleOnly,{userId:other.sub});
    assert.equal(deleted.statusCode,200);
    assert(Number.isSafeInteger(deleted.data.deletionEpoch));
    assert.match(deleted.headers['Set-Cookie'][0],/Max-Age=0/);
    assert(!providerCalls.some(call=>call.includes('/drive/')),'Login-only deletion does not require Drive');
    assert(providerCalls.includes('oauth2.googleapis.com/revoke'));
    const surviving=read(core.PATH);
    assert.deepEqual(surviving.posts.map(p=>p.id),[otherPost.data.item.id]);
    assert(!JSON.stringify(surviving).includes(owner(googleOnly)),'Board does not retain deleted account identifiers');
    assert(surviving.deleted[gPost.data.item.id],'Post replay is blocked by an anonymous tombstone');
    assert(!documents.has(publishPath(gLink.data.id)));
    assert(documents.has(publishPath(otherLink.data.id)));
    assert.equal((await call(live,'/api/live-schedule?id='+gLink.data.id,{method:'GET'})).statusCode,404);
    assert.equal((await status(googleOnly)).data.connected,false);
    assert.equal((await newPost(googleOnly)).statusCode,401);
    assert.equal((await newLink(googleOnly)).statusCode,401);
    assert.equal((await call(account,route('account','cloud-write'),{user:googleOnly})).statusCode,401);
    assert.equal((await call(native,route('native-account','web-session'),{extra:{authorization:bearer(googleOnly)}})).statusCode,401);
    const fresh={...googleOnly,issuedAt:deleted.data.deletionEpoch+1};
    assert.equal((await status(fresh)).data.deletionEpoch,deleted.data.deletionEpoch);
    const freshPost=await newPost(fresh);assert.equal(freshPost.statusCode,200);
    assert.equal((await remove(googleOnly)).data.deletionEpoch,deleted.data.deletionEpoch);
    assert(read(core.PATH).posts.some(p=>p.id===freshPost.data.item.id),'Old delete retry cannot delete a new account session’s posts');
    revocationOutcome='lost-response';
    assert.equal((await remove(fresh)).statusCode,502);
    revocationOutcome='success';providerCalls.length=0;
    assert.equal((await remove(googleOnly)).data.deletionEpoch,deleted.data.deletionEpoch);
    assert.deepEqual(providerCalls,[],'An old session cannot revoke the grant for a newer pending deletion');
    assert.equal((await status(fresh)).data.deletionPending,true);
    assert.equal((await remove(fresh)).statusCode,200);

    markerUnavailable=true;
    const unavailable=await status(other);
    assert.equal(unavailable.data.connected,true);
    assert.equal(unavailable.data.deletionCheckUnavailable,true);
    assert.equal((await newPost(other)).statusCode,503);
    assert.equal((await newLink(other)).statusCode,503);
    assert.equal((await call(lost,'/api/lost-found',{method:'GET'})).statusCode,200);
    markerUnavailable=false;
    assert.equal((await newLink(other)).statusCode,200);

    const driveUser=makeUser('google','account-drive',{drive:false});
    drive.set('revision-1',{id:'revision-1'});drive.set('revision-2',{id:'revision-2'});
    revocationOutcome='lost-response';providerCalls.length=0;
    assert.equal((await remove(driveUser)).statusCode,502);
    assert.equal(drive.size,0,'A prior app-data grant is honored even for a login-only UI session');
    assert.equal((await status(driveUser)).data.deletionPending,true);
    assert.equal((await newLink(driveUser)).statusCode,409);
    revocationOutcome='already-revoked';providerCalls.length=0;
    assert.equal((await remove(driveUser)).statusCode,200);
    assert.deepEqual(providerCalls,['oauth2.googleapis.com/revoke'],'Retry resumes at revocation without refreshing an already revoked token');
    revocationOutcome='success';

    const apple=makeUser('apple','apple:fixture');
    const appleBackup='accounts/apple/'+hash(apple.sub)+'.json';
    write(appleBackup,{revision:'old',data:C.normalize({shift_day_memos:{'2026-11-01':'Apple account data'}})});
    const applePost=await newPost(apple),appleLink=await newLink(apple);
    failPath=publishPath(appleLink.data.id);providerCalls.length=0;
    assert.equal((await remove(apple)).statusCode,500);
    assert.equal((await status(apple)).data.deletionPending,true);
    assert(!providerCalls.includes('appleid.apple.com/auth/revoke'),'A partial cleanup retains provider access for retries');
    failPath='';
    const erasedApple=await remove(apple);
    assert.equal(erasedApple.statusCode,200);
    assert(!documents.has(appleBackup));
    assert(!documents.has(publishPath(appleLink.data.id)));
    assert(!read(core.PATH).posts.some(p=>p.id===applePost.data.item.id));
    assert(providerCalls.includes('appleid.apple.com/auth/revoke'));
    assert.equal((await newPost(apple)).statusCode,401);
    assert.equal((await call(account,route('account','cloud-write'),{user:apple})).statusCode,401);
    const freshApple={...apple,issuedAt:erasedApple.data.deletionEpoch+1};
    assert.equal((await status(freshApple)).data.deletionEpoch,erasedApple.data.deletionEpoch);
    write(appleBackup,{revision:'residual',data:C.normalize({shift_day_memos:{'2026-11-01':'Old backup'}})});
    assert.deepEqual((await call(account,route('account','cloud-read'),{user:freshApple})).data.versions,[]);
    const freshData=C.normalize({shift_day_memos:{'2026-11-01':'New backup'}});
    const appleWrite=await call(account,route('account','cloud-write'),{user:freshApple,body:{revision:'b'.repeat(32),parents:[],data:freshData}});
    assert.equal(appleWrite.statusCode,200);
    assert.deepEqual((await call(account,route('account','cloud-read'),{user:freshApple})).data.versions[0].data,freshData);

    // The provider can deny exact-file rollback after revocation. A fresh
    // session must still ignore that late pre-deletion upload on read and save.
    const racingDrive=makeUser('google','racing-drive',{drive:true});
    let releaseUpload,uploadArrived;
    const pausedUpload=new Promise(resolve=>releaseUpload=resolve),uploadReady=new Promise(resolve=>uploadArrived=resolve);
    beforeDriveUpload=async()=>{beforeDriveUpload=null;uploadArrived();await pausedUpload;};
    const oldRevision='a'.repeat(32);
    const oldData=C.normalize({shift_day_memos:{'2026-11-01':'Before deletion'}});
    const upload=call(account,route('account','cloud-write'),{user:racingDrive,body:{revision:oldRevision,parents:[],data:oldData}});
    await uploadReady;
    const driveDeletion=await remove(racingDrive);
    assert.equal(driveDeletion.statusCode,200);
    deniedDriveDeletion='file-'+oldRevision;
    releaseUpload();
    assert.equal((await upload).statusCode,401);
    assert(drive.has(deniedDriveDeletion),'Fixture simulates a revoked token that cannot remove a late upload');
    const freshDrive={...racingDrive,issuedAt:driveDeletion.data.deletionEpoch+1};
    assert.deepEqual((await call(account,route('account','cloud-read'),{user:freshDrive})).data.versions,[]);
    assert(drive.has(deniedDriveDeletion),'A denied purge never exposes the old backup');
    const newerFile='file-newer-generation';
    drive.set(newerFile,{id:newerFile,appProperties:{accountEpoch:String(driveDeletion.data.deletionEpoch+1)}});
    deniedDriveDeletion='';
    const driveWrite=await call(account,route('account','cloud-write'),{user:freshDrive,body:{revision:'c'.repeat(32),parents:[],data:freshData}});
    assert.equal(driveWrite.statusCode,200);
    assert(!drive.has('file-'+oldRevision),'The next authorized save purges the stale file by its ID');
    assert(drive.has(newerFile),'An old generation cannot purge a newer generation file');
    assert.deepEqual((await call(account,route('account','cloud-read'),{user:freshDrive})).data.versions.map(v=>v.data),[freshData]);

    // Pause writes immediately before committing, after they passed the initial cutoff check.
    for(const [name,makeWrite,match]of[
        ['share',newLink,path=>path.startsWith('schedules/')],
        ['board',newPost,path=>path===core.PATH]
    ]){
        const racing=makeUser('google','racing-'+name,{drive:false});
        let release,arrived;
        const paused=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>arrived=resolve);
        beforePut=async path=>{if(match(path)){beforePut=null;arrived();await paused;}};
        const priorPaths=new Set(documents.keys());
        const pending=makeWrite(racing);
        await ready;
        assert.equal((await remove(racing)).statusCode,200);
        release();
        assert.equal((await pending).statusCode,401);
        assert(![...documents.keys()].some(path=>path.startsWith('schedules/')&&!priorPaths.has(path)));
        assert(!read(core.PATH).posts.some(p=>p.owner===owner(racing)));
    }
    assert(documents.has(publishPath(otherLink.data.id)));
    console.log('PASS account erasure: Google and Apple, login-only, scoped UGC cleanup, retries, revoked cookies/bearers, cutoff storage outage, and racing writes.');
}

run().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=rawFetch;});
