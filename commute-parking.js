(()=>{'use strict';const make=(tag,cls,text)=>{const e=document.createElement(tag);e.className=cls;if(text!==undefined)e.textContent=text;return e;},section=make('section','life-section');section.append(make('h2','','출퇴근 도구'));document.querySelector('#view-all .all-shortcuts').after(section);let lastOpener;
function dialog(id,title){const d=make('dialog','life-dialog');d.id=id;d.setAttribute('aria-label',title);const h=make('div','life-header'),close=make('button','','×');close.type='button';close.setAttribute('aria-label',title+' 닫기');close.onclick=()=>d.close();h.append(make('h2','',title),close);d.append(h);document.body.append(d);d.addEventListener('close',()=>lastOpener?.focus());return d;}
const bus=make('section','commute-page');bus.id='commute-dialog';bus.hidden=true;bus.setAttribute('aria-labelledby','commute-page-title');bus.innerHTML='<header class="commute-topbar"><button type="button" id="commute-back" aria-label="뒤로"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></button><h1 id="commute-page-title" tabindex="-1">통근버스</h1></header><div class="commute-page-body"></div>';document.body.append(bus);
const busEntry=make('button','life-entry','통근버스  ›');busEntry.id='commute-open';busEntry.type='button';busEntry.setAttribute('aria-controls','commute-dialog');busEntry.onclick=()=>window.CommutePage.open();section.append(busEntry);
const parking=dialog('parking-dialog','주차장'),body=make('section','');parking.append(body);const parkingEntry=make('button','life-entry','주차장  ›');parkingEntry.id='parking-open';parkingEntry.type='button';section.append(parkingEntry);
const header=parking.querySelector('.life-header'),title=header.querySelector('h2'),info=make('button','parking-info');info.type='button';info.setAttribute('aria-label','주차장 이용 안내');info.setAttribute('aria-expanded','false');info.setAttribute('aria-controls','parking-help');info.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 6v2"/></svg>';title.after(info);header.append(make('span','parking-hours','평일 06:50~07:30 제보'));
body.className='parking-body';body.innerHTML='<div class="parking-summary"><div class="parking-summary-copy"><p class="parking-summary-label">현재 주차 상태</p><div id="parking-state" class="parking-state" role="status">상태 확인 중</div><p id="parking-last-report" class="parking-last-report">최근 10분 기준</p></div><button type="button" id="parking-refresh" aria-label="주차장 새로고침"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 5v5h-5M4 19v-5h5"/><path d="M5.4 8a7 7 0 0 1 11.8-2L20 10M4 14l2.8 4A7 7 0 0 0 18.6 16"/></svg></button></div><p class="parking-location-rule">본사·1공장 반경 1km 안에서 제보할 수 있어요.</p><div class="parking-signals" role="group" aria-label="주차 상태 제보"></div><p id="parking-status" class="parking-status" role="status" hidden></p><button type="button" id="parking-alert-toggle" class="parking-alert-row" role="switch" aria-label="제보 참여 · 만차 알림" aria-checked="false" aria-describedby="parking-alert-status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 1v1"/></svg><span class="parking-alert-copy"><strong>제보 참여 · 만차 알림</strong><small id="parking-alert-value">제보와 알림 꺼짐</small></span><span class="parking-switch" aria-hidden="true"></span></button><p id="parking-alert-status" class="parking-note" role="status" hidden></p><div id="parking-help" hidden><p class="parking-note">주간 근무자의 최근 10분 제보를 모아 보여 드려요. 실제로 주차할 수 있는지는 현장 상황에 따라 달라요.</p><p class="parking-note">현재 상태를 눌러 제보해 주세요. 같은 상태를 다시 누르면 취소돼요.</p><p class="parking-note">제보와 만차 알림은 함께 켜고 꺼요. 아이폰에서는 홈 화면에 앱을 추가한 뒤 알림 권한을 허용해 주세요. 알림 소리는 기기의 알림과 집중 모드 설정을 따라요.</p></div>';
body.querySelector('#parking-alert-toggle').before(make('p','parking-note','스위치를 켜면 주차 상태를 제보하고 만차 알림을 받을 수 있어요. 끄면 둘 다 중단돼요.'));
body.querySelector('#parking-help').append(make('p','parking-note','제보할 수 있는 위치인지 확인할 때만 위치를 서버로 보내요. 위치는 저장하지 않아요. 위치 오차가 300m를 넘으면 다시 확인해 주세요.'));
info.onclick=()=>{const help=document.getElementById('parking-help');help.hidden=!help.hidden;info.setAttribute('aria-expanded',String(!help.hidden));};
const $=id=>document.getElementById(id), syncKey='shift_parking_alert_synced_at_v1';
const refreshMs=30000, renewMs=86400000;
let state=null,busy=false,locating=false,readFailed=false,feedback='',opted=false,toggling=false,renewing=false,lastRead=0,lastSync=0,lastRenewAttempt=0;
try{opted=localStorage.getItem('shift_parking_alert_enabled')==='true';}catch{}
const labels={free:'🟢 여유',busy:'🟡 혼잡',full:'🔴 만차',unknown:'아직 제보 없음'};
function day(){try{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).split('-').map(Number),s=getActualShift(new Date(parts[0],parts[1]-1,parts[2],12),currentGroup);return s.type==='DAY'||s.type==='SPECIAL_DAY'||s.type==='SPECIAL_DAY_NO_OT'||s.origType==='DAY'&&s.type!=='LEAVE'&&s.type!=='UNPAID_OFF';}catch{return false;}}
for(const value of['free','busy','full']){const b=make('button','');b.type='button';b.dataset.value=value;const[emoji,text]=labels[value].split(' ');b.setAttribute('aria-label',emoji+' '+text);const label=make('span','parking-signal-label'),dot=make('span','parking-dot'),count=make('span','parking-signal-count');dot.setAttribute('aria-hidden','true');label.append(dot,make('span','',text));count.append(make('strong','','0'),make('small','','명'));b.append(label,count);b.disabled=true;b.onclick=()=>submitVote(value);body.querySelector('.parking-signals').append(b);}
function message(id,text){const e=$(id);e.textContent=text;e.hidden=!text;}
function paint(){const toggle=$('parking-alert-toggle');toggle.disabled=toggling||renewing||busy||locating;toggle.setAttribute('aria-checked',String(opted));$('parking-alert-value').textContent=opted?'제보와 알림 켜짐':'제보와 알림 꺼짐';if(!state){message('parking-status',feedback);$('parking-refresh').disabled=busy||locating;return;}
parking.dataset.parkingState=state.status;$('parking-state').textContent=(labels[state.status]||labels.unknown).replace(/^[🟢🟡🔴]+ /u,'');
const last=state.lastReport,time=last&&new Date(last.at);$('parking-last-report').replaceChildren(make('span','','최근 10분 기준'));
if(time&&!Number.isNaN(time.getTime())){const detail=make('span','parking-last-detail'),clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(time);detail.append(document.createTextNode(' · '),make('span','','마지막 제보'),document.createTextNode(' '+clock+' ('),make('span','',(labels[last.value]||'').replace(/^[^ ]+ /,'')),document.createTextNode(')'));$('parking-last-report').append(detail);}
for(const b of body.querySelectorAll('[data-value]')){const count=state.counts?.[b.dataset.value];b.querySelector('strong').textContent=Number.isFinite(count)?String(count):'—';b.disabled=!opted||toggling||busy||locating||readFailed||!state.open||!day();b.setAttribute('aria-pressed',String(state.mine===b.dataset.value));}
message('parking-status',locating?'현재 위치를 확인하고 있어요.':feedback||(!opted?'제보하려면 아래 스위치를 켜 주세요.':!state.open?'평일 06:50~07:30에 제보할 수 있어요.':!day()?'오늘 주간 근무자만 제보할 수 있어요.':''));$('parking-refresh').disabled=busy||locating;}
async function submitVote(value){
 if(!opted||toggling||busy||locating||!state?.open||!day())return;
 if(!inMorning()){feedback='평일 06:50~07:30에 제보할 수 있어요.';paint();return;}
 locating=true;feedback='';paint();
 try{
  if(!navigator.geolocation)throw Error('이 앱이나 브라우저에서 위치를 확인할 수 없어요. 위치 확인이 가능한 앱이나 브라우저에서 열어 주세요.');
  const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:12000}));
  if(!opted)return;
  const location={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp};
  locating=false;
  await read({vote:state.mine===value?null:value,group:typeof currentGroup==='string'?currentGroup:null,location});
 }catch(e){feedback=e.code===1?'제보하려면 위치 권한을 허용해 주세요.':e.code===2||e.code===3?'위치를 확인하지 못했어요. 실외에서 다시 제보해 주세요.':e.message;}
 finally{locating=false;paint();}
}
window.addEventListener('storage',e=>{if(e.key==='shift_parking_alert_enabled'||e.key===null){try{opted=localStorage.getItem('shift_parking_alert_enabled')==='true';}catch{}if(!opted)document.querySelectorAll('.parking-banner').forEach(b=>b.remove());paint();}});
paint();
function notify(){if(!opted||!state?.open||state.status!=='full'||document.querySelector('dialog[open]'))return;const key='shift_parking_seen_'+state.date;try{if(localStorage.getItem(key))return;localStorage.setItem(key,'1');}catch{}const banner=make('div','parking-banner'),icon=make('span','parking-banner-icon'),copy=make('span','parking-banner-copy'),close=make('button','','×');banner.setAttribute('role','status');icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 1v1"/></svg>';close.type='button';close.setAttribute('aria-label','만차 안내 닫기');close.onclick=()=>banner.remove();copy.append(make('strong','','주차장 만차'),make('small','','최근 10분 동안 만차 제보가 5건 이상 들어왔어요'));banner.append(icon,copy,close);document.body.append(banner);setTimeout(()=>banner.remove(),20000);}
async function read(payload){if(toggling||busy||locating)return;busy=true;feedback='';paint();try{const r=await fetch('/api/parking',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000),...(payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{})});const next=await r.json();if(!r.ok)throw Error(next.message||'주차장 정보를 불러오지 못했어요.');state=next;readFailed=false;lastRead=Date.now();notify();}catch(e){feedback=e.name==='TimeoutError'?'주차장 정보를 불러오는 데 시간이 걸려요. 새로고침해 주세요.':e.message;readFailed=!payload;}finally{busy=false;$('parking-refresh').disabled=false;}paint();}
function inMorning(){
 const korea=new Date(Date.now()+9*3600000),day=korea.getUTCDay(),minutes=korea.getUTCHours()*60+korea.getUTCMinutes();
 return day>0&&day<6&&minutes>=410&&minutes<=450;
}
function rememberRenewal(){
 lastSync=Date.now();
 try{localStorage.setItem(syncKey,String(lastSync));}catch{}
}
async function renewSubscription(){
 const now=Date.now();let previous=lastSync;
 try{previous=Math.max(previous,Number(localStorage.getItem(syncKey))||0);}catch{}
 if(!opted||toggling||renewing||busy||locating||now-lastRenewAttempt<600000||(previous<=now&&now-previous<renewMs))return;
 renewing=true;lastRenewAttempt=now;paint();
 try{
  const reg=await navigator.serviceWorker?.getRegistration('/'),sub=await reg?.pushManager?.getSubscription();
  if(sub&&window.Notification?.permission==='granted'){
   await postSubscription('subscribe',sub.toJSON());rememberRenewal();
  }else{
   opted=false;localStorage.setItem('shift_parking_alert_enabled','false');
   message('parking-alert-status','알림 연결이 끊겼어요. 스위치를 다시 켜 주세요.');
  }
 }catch{}finally{renewing=false;paint();}
}
parkingEntry.onclick=()=>{lastOpener=parkingEntry;parking.showModal();read();};$('parking-refresh').onclick=()=>read();
function bytes(s){const raw=atob(s.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function postSubscription(action,subscription){
 const send=()=>fetch('/api/parking',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({action,subscription}),signal:AbortSignal.timeout(12000)});
 let response=await send();
 if(response.status===401){
  const bootstrap=await fetch('/api/parking?bootstrap=1',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(12000)});
  if(bootstrap.ok)response=await send();
 }
 const data=await response.json();
 if(!response.ok)throw Error(data.message||'알림을 설정하지 못했어요.');
}
$('parking-alert-toggle').onclick=async()=>{if(toggling||renewing||busy||locating)return;toggling=true;paint();try{if(opted){await postSubscription('unsubscribe');opted=false;try{const reg=await navigator.serviceWorker?.getRegistration('/');const sub=await reg?.pushManager?.getSubscription();if(sub)await sub.unsubscribe();}catch{}document.querySelectorAll('.parking-banner').forEach(b=>b.remove());}else{if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('이 브라우저에서는 알림을 받을 수 없어요. 아이폰에서는 Safari에서 홈 화면에 추가한 앱을 열어 주세요.');const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('만차 알림을 받으려면 알림 권한을 허용해 주세요.');if(!state?.publicKey)throw Error('주차장 화면을 새로고침한 뒤 다시 켜 주세요.');await navigator.serviceWorker.register('/parking-sw.js');const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes(state.publicKey)});await postSubscription('subscribe',sub.toJSON());rememberRenewal();opted=true;}localStorage.setItem('shift_parking_alert_enabled',String(opted));message('parking-alert-status',opted?'제보와 만차 알림을 켰어요. 최근 10분 동안 만차 제보가 5건 이상 들어오면 하루 한 번 알려 드려요.':'제보와 만차 알림을 껐어요.');paint();}catch(e){message('parking-alert-status',e.message);}finally{toggling=false;paint();}};
function maintainParking(){
 if(document.hidden)return;
 const openWindow=inMorning();
 if(parking.open&&openWindow&&Date.now()-lastRead>=refreshMs)read();
 if(parking.open&&!openWindow&&state?.open){state.open=false;paint();}
 renewSubscription();
}
setInterval(maintainParking,refreshMs);
document.addEventListener('visibilitychange',maintainParking);
if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='OPEN_PARKING'){lastOpener=parkingEntry;if(!parking.open)parking.showModal();read();}});
if(new URLSearchParams(location.search).get('parking')==='1'){lastOpener=parkingEntry;parking.showModal();read();}else if(!document.hidden)renewSubscription();
})();
