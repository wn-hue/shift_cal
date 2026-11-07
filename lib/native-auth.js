'use strict';
const crypto=require('node:crypto');
const {seal}=require('../api/google-calendar.js')._test;
function flow(url){const challenge=url.searchParams.get('native_challenge'),state=url.searchParams.get('native_state'),web=url.searchParams.get('web_return');if(!challenge&&!state&&!web)return {};if(!/^[a-f0-9]{64}$/.test(challenge||'')||!/^[a-f0-9]{64}$/.test(state||'')||(web&&!require('./app-origins').trusted(web)))throw Object.assign(Error('앱 로그인 요청을 확인하세요.'),{status:400,code:'NATIVE_FLOW'});return {nativeChallenge:challenge,nativeState:state,...(web?{webReturn:web}:{})};}
function callback(flow,session,provider,secret){const ticket=seal({challenge:flow.nativeChallenge,state:flow.nativeState,session,provider,exp:Date.now()+300000},secret);const params=new URLSearchParams({ticket,state:flow.nativeState});return require('./app-origins').trusted(flow.webReturn)?flow.webReturn+'/origin-auth.html#'+params:'shiftcal://auth?'+params;}
function failure(origin,flow,provider,reason){
 if(flow?.nativeChallenge&&!flow.webReturn)return 'shiftcal://auth?'+new URLSearchParams({state:flow.nativeState,error:reason});
 const destination=require('./app-origins').trusted(flow?.webReturn)?flow.webReturn:origin;
 return destination+'/?'+new URLSearchParams(reason==='denied'?{[provider]:'denied'}:{[provider]:'error',reason});
}
module.exports={flow,callback,failure};
