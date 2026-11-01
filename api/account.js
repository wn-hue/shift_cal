'use strict';
const apple=require('./apple-account.js'),google=require('./google-calendar.js');
module.exports=async(req,res)=>{const action=new URL(req.url,'https://local.invalid').searchParams.get('action')||'status';if(!['status','cloud-read','cloud-write','cloud-delete','logout'].includes(action)){res.statusCode=400;res.end(JSON.stringify({message:'지원하지 않는 계정 요청입니다.'}));return;}return apple.session(req)?apple(req,res):google(req,res);};
