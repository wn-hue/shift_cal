'use strict';
const crypto=require('node:crypto');
const {seal}=require('../api/google-calendar.js')._test;
function flow(url){const challenge=url.searchParams.get('native_challenge'),state=url.searchParams.get('native_state'),web=url.searchParams.get('web_return');if(!challenge&&!state&&!web)return {};if(!/^[a-f0-9]{64}$/.test(challenge||'')||!/^[a-f0-9]{64}$/.test(state||'')||(web&&!require('./app-origins').trusted(web)))throw Object.assign(Error('앱 로그인 요청을 확인하세요.'),{status:400,code:'NATIVE_FLOW'});return {nativeChallenge:challenge,nativeState:state,...(web?{webReturn:web}:{})};}
function callback(flow,session,provider,secret){const ticket=seal({challenge:flow.nativeChallenge,state:flow.nativeState,session,provider,exp:Date.now()+300000},secret);const params=new URLSearchParams({ticket,state:flow.nativeState});return require('./app-origins').trusted(flow.webReturn)?flow.webReturn+'/origin-auth.html#'+params:'shiftcal://auth?'+params;}
module.exports={flow,callback};
