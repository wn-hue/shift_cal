/* Optional one-way shift export. Google Drive remains the account data store. */
(function(){
 'use strict';
 const C=GoogleSyncCore,$=id=>document.getElementById(id),prefix='shift_google_sync_v2_';
 let auth=null,state=null,busy=false,timer=null,viewTag='',changes=0;
 const connected=()=>!!auth?.connected&&auth.calendarConnected!==false;
 const dateObj=key=>{const[y,m,d]=key.split('-').map(Number);return new Date(y,m-1,d);};
 const dateKey=d=>toDateKey(d.getFullYear(),d.getMonth(),d.getDate());
 function save(){if(state&&auth?.user)localStorage.setItem(prefix+auth.user.id,JSON.stringify(state));}
 function loadState(){
  if(!connected()){state=null;return;}
  try{state=JSON.parse(localStorage.getItem(prefix+auth.user.id)||'{}');}catch{state={};}
  state.groups||={};
  if(!state.outboundOnlyVersion){
   // A previously bidirectional connection must be explicitly restarted as an export.
   for(const group of Object.values(state.groups)){group.enabled=false;delete group.pending;delete group.personal;}
   state.outboundOnlyVersion=1;save();
  }
 }
 function groupState(){
  if(!state)return null;
  const g=state.groups[currentGroup]||={enabled:false,calendarId:'',records:{},excluded:{}};
  g.records||={};g.excluded||={};g.group=currentGroup;return g;
 }
 function status(text,tone='info'){const n=$('google-sync-status');if(n){n.textContent=text;n.setAttribute('data-state',tone);}}
 function setBusy(value){busy=value;const b=$('google-sync-enable');if(b){b.disabled=value;b.textContent=value?'근무표 보내는 중…':'이번 달 근무표 보내기';b.setAttribute('aria-busy',String(value));}$('google-sync-status')?.setAttribute('aria-busy',String(value));}
 async function api(action,body,get=false){
  const r=await fetch('/api/google-calendar?action='+action,{method:get?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:get?{}:{'Content-Type':'application/json','X-Shift-CSRF':auth?.csrf||''},...(get?{}:{body:JSON.stringify(body||{})})});
  let data;try{data=await r.json();}catch{throw Error('인터넷 연결을 확인하고 다시 보내 주세요.');}
  if(!r.ok){const e=Error(data.message||'근무표를 보내지 못했어요.');e.status=r.status;throw e;}return data;
 }
 function render(){
  if(!$('google-sync-login'))return;
  const configured=!!auth?.configured,linked=connected(),g=groupState();
  $('google-sync-login').hidden=linked||!configured;$('google-sync-login').href='/api/google-calendar?action=login&calendar=1';
  $('google-sync-controls').hidden=!linked;$('google-sync-setup').hidden=configured;
  $('google-sync-user').textContent=linked?auth.user.email+' · '+currentGroup+'조':auth?.connected?'Drive 계정 저장과 별도로 연결할 수 있어요.':'먼저 Google 계정을 연결해 주세요.';
  $('google-sync-badge').textContent=g?.enabled?'근무표 자동 보내기 사용 중':'Google 캘린더에 근무표 보내기';
  if(!$('google-sync-enable').disabled)$('google-sync-enable').textContent='이번 달 근무표 보내기';
  if(!configured){$('google-sync-setup-message').textContent='관리자 캘린더 연결 설정이 필요합니다.';$('google-sync-redirect').textContent=auth?.redirectUri||location.origin+'/api/google-calendar?action=callback';}
  const entry=document.querySelector('.calendar-link-entry');if(entry)entry.textContent='Google 캘린더에 근무표 보내기';
 }
 async function refreshStatus(){if(busy)return auth;try{auth=await api('status',null,true);loadState();render();return auth;}catch(e){status(e.message,'error');return null;}}
 function range(){const d=currentCalDate;return{start:toDateKey(d.getFullYear(),d.getMonth(),1),end:dateKey(new Date(d.getFullYear(),d.getMonth()+1,1))};}
 function localValue(key){return C.local(overrides[key],dayMemos[key]);}
 function desired(key,id){const value=localValue(key),shift=getActualShift(dateObj(key),currentGroup),event=ShiftCalendarLink.makeEvent(key,currentGroup,shift);return{id,summary:event.title,description:C.PREFIX+value.memo,colorId:C.colorId(shift),start:{date:key},end:{date:ShiftCalendarLink.nextDay(key)},extendedProperties:{private:{app:'shift_cal_v2',group:currentGroup,kind:'shift',originDate:key,override:value.override}}};}
 function baseId(key,replace=false){return 'sc2'+currentGroup.toLowerCase()+key.replace(/-/g,'')+(replace?'r'+crypto.randomUUID().replace(/-/g,'').slice(0,16):'');}
 function accountReady(){const owner=localStorage.getItem('shift_account_owner_v1');return !window.AccountSync||AccountSync.ready&&(!owner||owner===auth?.user?.id);}
 function queue(){clearTimeout(timer);timer=setTimeout(()=>sync(),1000);}
 function changed(){changes++;queue();}
 async function sync(){
  const g=groupState();if(busy||!connected()||!g?.enabled||!g.calendarId||document.hidden||!accountReady())return;
  const group=currentGroup,user=auth.user.id,version=changes,bounds=range();setBusy(true);status('앱의 근무표를 Google 캘린더로 보내고 있어요.','progress');
  const current=()=>currentGroup===group&&auth?.user?.id===user&&g.enabled&&accountReady();
  try{
   const knownIds=Object.entries(g.records).filter(([key])=>key>=bounds.start&&key<bounds.end).map(([,v])=>v.id);
   // Read only our app-created calendar to avoid duplicates and enforce ETags.
   const {items}=await api('read',{group,calendarId:g.calendarId,...bounds,knownIds});if(!current())return;
   const byDate=new Map();for(const event of items){const key=C.origin(event);if(!key||key<bounds.start||key>=bounds.end)continue;const list=byDate.get(key)||[];list.push(event);byDate.set(key,list);}
   const operations=[];let skipped=0;
   for(let key=bounds.start;key<bounds.end;key=ShiftCalendarLink.nextDay(key)){
    if(g.excluded[key])continue;
    const matches=byDate.get(key)||[],live=matches.filter(e=>e.status!=='cancelled');
    if(live.length>1){skipped++;continue;}
    const remote=live[0]||matches.find(e=>e.id===g.records[key]?.id)||matches[0],body=desired(key,remote&&remote.status!=='cancelled'?remote.id:baseId(key,!!(remote||g.records[key]))),value=localValue(key),action=C.planOutbound(remote,body);
    if(action==='blocked'){skipped++;continue;}
    if(action==='adopt'){g.records[key]={id:remote.id,etag:remote.etag,signature:C.signature(remote),local:value};continue;}
    operations.push({key,value,op:{type:action,id:body.id,...(action==='color'?{colorId:body.colorId}:{event:body}),...(remote?.status!=='cancelled'&&remote?.etag?{etag:remote.etag}:{})}});
   }
   for(let i=0;i<operations.length;i+=10){
    if(!current())return;const batch=operations.slice(i,i+10),{results}=await api('write',{group,calendarId:g.calendarId,operations:batch.map(x=>x.op)});
    for(const result of results){const sent=batch.find(x=>x.op.id===result.id);if(!sent)continue;if(!result.ok)throw Error(result.message||'다른 기기에서 내용이 바뀌었어요. 다시 보내 주세요.');g.records[sent.key]={id:result.event.id,etag:result.event.etag,signature:C.signature(result.event),local:sent.value};}save();
   }
   if(!current())return;g.lastSync=new Date().toISOString();save();render();
   status(skipped?'중복되거나 반복되는 일정 '+skipped+'개를 빼고 보냈어요. Google 캘린더에서 확인한 뒤 다시 보내 주세요.':'근무표 보내기 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}),skipped?'warning':'success');
  }catch(e){status('근무표 보내기 실패 · '+e.message,'error');if(e.status===401){auth=null;state=null;render();}}
  finally{setBusy(false);if(currentGroup!==group||changes!==version)queue();}
 }
 async function enable(){
  if(busy||!connected()||!accountReady())return;const group=currentGroup,user=auth.user.id,g=groupState();setBusy(true);
  try{const data=await api('calendar',{group,calendarId:g.calendarId||undefined});if(currentGroup!==group||auth?.user?.id!==user||!accountReady())return;if(g.calendarId!==data.calendar.id){g.records={};g.excluded={};}g.calendarId=data.calendar.id;g.enabled=true;save();}
  catch(e){status(e.message,'error');return;}finally{setBusy(false);}
  render();await sync();
 }
 async function synchronize(){if(busy)return;if(!connected()){status('먼저 Google 캘린더 연결을 허용해 주세요.');return;}if(!accountReady()){status('Google Drive에 저장됐는지 확인한 뒤 다시 보내 주세요.');return;}if(!navigator.onLine){status('인터넷에 연결한 뒤 다시 보내 주세요.');return;}if(groupState()?.enabled)await sync();else await enable();}
 function stop(){const g=groupState();if(g){g.enabled=false;save();render();status('자동 보내기를 멈췄어요. 이미 보낸 근무표와 Drive에 저장한 기록은 남아 있어요.');}}
 async function disconnect(){if(busy||!connected())return;try{await api('calendar-disconnect');for(const g of Object.values(state?.groups||{}))g.enabled=false;save();auth.calendarConnected=false;state=null;render();status('Google 캘린더 연결을 끊었어요. Google Drive 저장은 계속 쓸 수 있어요.');}catch(e){status(e.message,'error');}}
 function relink(){const g=groupState();if(!g)return;const bounds=range();for(const key of Object.keys(g.excluded))if(key>=bounds.start&&key<bounds.end)delete g.excluded[key];save();changed();}
 function groupChanged(){render();changed();}
 function viewChanged(){const tag=currentGroup+'-'+dateKey(currentCalDate).slice(0,7);if(tag!==viewTag){viewTag=tag;render();changed();}}
 async function init(){await refreshStatus();if(connected())await sync();document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshStatus().then(changed);});window.addEventListener('focus',changed);window.addEventListener('online',changed);window.addEventListener('shift-account-changed',()=>refreshStatus().then(changed));const params=new URLSearchParams(location.search),result=params.get('google');if(result){openCalendarIntegration();status(result==='connected'?'연결했어요. ‘이번 달 근무표 보내기’를 눌러 주세요.':result==='denied'?'캘린더 연결을 취소했어요.':'캘린더 연결을 완료하지 못했어요.');params.delete('google');params.delete('reason');history.replaceState(history.state,'',location.pathname+(params.size?'?'+params:'')+location.hash);}}
 window.GoogleSync={init,refreshStatus,render,sync,changed,enable,synchronize,relink,groupChanged,viewChanged,disconnect,stop};window.addEventListener('load',init);
})();
