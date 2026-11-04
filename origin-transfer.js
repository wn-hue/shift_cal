(async function(){'use strict';
 const cfg=await(await fetch('/origin-migration-config.json',{cache:'no-store'})).json(),trusted=[cfg.source,cfg.target,...(cfg.previous||[])],params=new URLSearchParams(location.hash.slice(1)),source=location.origin===cfg.source||(trusted.includes(location.origin)&&params.has('challenge')),$=id=>document.getElementById(id),status=t=>{$('status').textContent=t;},hex=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const unlock=()=>{document.querySelectorAll('button,input,select').forEach(el=>el.disabled=false);};
 const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
 async function call(action,body){const r=await fetch('/api/origin-transfer?action='+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'same-origin'}),d=await r.json();if(!r.ok)throw Error(d.message||'연결을 확인해 주세요.');return d;}
 function ready(){localStorage.setItem('shift_origin_ready_v1','1');document.cookie='__Host-work-routine-ready=1; Path=/; Secure; SameSite=Lax; Max-Age=31536000';}
 function finish(data){const n=OriginDataCore.restore(localStorage,data,$('overwrite').checked);ready();status(n+'개 항목을 복사했어요. 앱을 열고 있어요.');location.replace('/');}
 if(source){
  const challenge=params.get('challenge'),state=params.get('state'),target=params.get('target')||cfg.target;history.replaceState(null,'',location.pathname);
  if(!trusted.includes(target)){status('공식 앱 주소에서 다시 열어 주세요.');return;}
  $('title').textContent='기존 데이터를 새 주소로 복사해요';$('description').textContent='이 기기의 근무표·메모·설정을 복사합니다. 기존 데이터는 삭제하지 않아요.';$('transfer').textContent='이 기기의 데이터 복사하기';$('start').hidden=true;$('file-area').hidden=true;$('source-select-area').hidden=true;$('source-file').hidden=false;$('new-address').href=cfg.target+'/origin-transfer.html';
  $('download').onclick=()=>{try{const data=OriginDataCore.snapshot(localStorage),blob=new Blob([JSON.stringify(data)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='근무루틴-데이터-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);status('파일을 저장한 뒤 새 주소에서 불러와 주세요.');}catch(e){status(e.message);}};
  $('transfer').onclick=async()=>{try{if(!window.opener||!/^[a-f0-9]{64}$/.test(challenge||'')||!/^[a-f0-9]{64}$/.test(state||'')){status('아래의 파일로 저장하기를 이용해 주세요.');return;}const data=OriginDataCore.snapshot(localStorage),result=await call('issue',{challenge,state,target});window.opener.postMessage({type:'work-routine-transfer',state,data,ticket:result.ticket},target);status('새 주소로 복사 요청을 보냈어요. 새 창에서 확인해 주세요.');}catch(e){status(e.message);}};
  unlock();return;
 }
 if(!trusted.includes(location.origin)){status('공식 앱 주소에서 다시 열어 주세요.');return;}
 const options=(cfg.sources||[cfg.source]).filter(origin=>origin!==location.origin);for(const origin of options){const option=document.createElement('option');option.value=origin;option.textContent='기존 앱';$('source-select').append(option);}$('source-select-area').hidden=options.length<2;
 let pending=null;
 $('transfer').onclick=async()=>{try{const sourceOrigin=$('source-select').value;if(!options.includes(sourceOrigin))throw Error('이전에 사용한 주소를 선택해 주세요.');const popup=window.open('about:blank','work-routine-transfer','popup,width=430,height=760');if(!popup){status('팝업을 허용하거나 기존 앱에서 데이터 파일을 저장해 불러와 주세요.');return;}const verifier=hex(),state=hex(),challenge=await hash(verifier);pending={verifier,state,popup,sourceOrigin,expires:Date.now()+300000};popup.location=sourceOrigin+'/origin-transfer.html#'+new URLSearchParams({challenge,state,target:location.origin});status('열린 기존 앱에서 데이터 복사하기를 눌러 주세요.');}catch(e){status(e.message);}};
 window.addEventListener('message',async e=>{if(!pending||e.origin!==pending.sourceOrigin||e.source!==pending.popup||e.data?.type!=='work-routine-transfer'||e.data.state!==pending.state||Date.now()>pending.expires)return;try{OriginDataCore.validate(e.data.data);await call('exchange',{ticket:e.data.ticket,state:pending.state,verifier:pending.verifier,target:location.origin});const data=e.data.data;pending=null;finish(data);}catch(error){status(error.message);}});
 $('file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>12000000)throw Error('파일이 너무 큽니다.');finish(JSON.parse(await file.text()));}catch(error){status(error.message||'파일을 확인해 주세요.');}};
 if(localStorage.getItem('shift_salary_config_master'))$('start').textContent='저장된 데이터로 앱 열기';
 $('start').onclick=()=>{ready();location.replace('/');};unlock();
})().catch(()=>{document.getElementById('status').textContent='연결을 확인하고 다시 열어 주세요.';});
