'use strict';
const crypto=require('node:crypto');
const {seal}=require('../api/google-calendar.js')._test;
function flow(url){const challenge=url.searchParams.get('native_challenge'),state=url.searchParams.get('native_state');if(!challenge&&!state)return {};if(!/^[a-f0-9]{64}$/.test(challenge||'')||!/^[a-f0-9]{64}$/.test(state||''))throw Object.assign(Error('앱 로그인 요청을 확인하세요.'),{status:400,code:'NATIVE_FLOW'});return {nativeChallenge:challenge,nativeState:state};}
function callback(flow,session,provider,secret){const ticket=seal({challenge:flow.nativeChallenge,state:flow.nativeState,session,provider,exp:Date.now()+300000},secret);return 'shiftcal://auth?'+new URLSearchParams({ticket,state:flow.nativeState});}
module.exports={flow,callback};
