/* Isolated local prototype: no community API, account upload, or raw salary access. */
(()=>{'use strict';
const KEY='shift_community_lab_v1',features=[['cover','대치 모집'],['caffeine','카페인'],['feed','시간대 피드'],['lost','분실물']];
let data={votes:{},posts:[],decisions:{},caffeine:null,bus:[],parking:null},active='cover',preview=false,timer,feedLane='arrive';
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&typeof saved==='object')data={...data,...saved};}catch{}
const $=id=>document.getElementById(id),el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;},save=()=>{try{localStorage.setItem(KEY,JSON.stringify(data));$('lab-status').textContent='이 기기에 저장했습니다.';}catch{$('lab-status').textContent='저장 공간에 접근할 수 없습니다. 창을 닫으면 변경사항이 사라질 수 있습니다.';}};
const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),hour=()=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
const minuteOfDay=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());return Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);};
const parkingWindow=m=>m>=410&&m<=450;
const caffeineMessage=()=>{if(!data.caffeine)return '☕ 다음 수면을 위해, 지금부터 카페인 대신 물이나 디카페인은 어때요?';const remaining=Math.max(0,Math.ceil((data.caffeine.sleep-Date.now())/60000));return `☕ 예정 취침까지 ${Math.floor(remaining/60)}시간 ${remaining%60}분. 지금부터 카페인 대신 물이나 디카페인은 어때요?`;};
const group=()=>typeof currentGroup==='string'?currentGroup:'C';
const dialog=el('dialog');dialog.id='community-lab';dialog.setAttribute('aria-label','생활 기능 실험실');dialog.innerHTML='<div class="lab-header"><h2>생활 기능 실험실</h2><button type="button" aria-label="실험실 닫기">×</button></div><p class="lab-note">테스트 전용 · 작성·선택은 이 기기에만 저장되며 다른 이용자에게 전달되지 않습니다. 식단 평가는 오늘 식단에서, 통근버스·주차장은 전체 메뉴에서 이용할 수 있어요.</p><div class="lab-tabs" role="tablist" aria-label="테스트 기능"></div><label class="lab-preview"><input type="checkbox" id="lab-preview">테스트 상황 보기 (시간 제한·샘플 데이터)</label><div id="lab-panel"></div><p id="lab-status" class="lab-status" role="status"></p><section class="lab-decision"><strong>이 기능을 어떻게 할까요?</strong><div id="lab-decisions" class="lab-actions"></div><div class="lab-actions"><button id="lab-export">검토 결과 저장</button><button id="lab-clear">테스트 데이터 초기화</button></div></section>';document.body.append(dialog);
dialog.querySelector('.lab-header button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
const entry=el('button','생활 기능 실험실  ›');entry.className='lab-entry';entry.type='button';let opener=entry;entry.onclick=()=>{opener=entry;render();dialog.showModal();};document.querySelector('#view-all .all-shortcuts').after(entry);dialog.addEventListener('close',()=>opener.focus());

for(const [key,label]of features){const b=el('button',label);b.type='button';b.setAttribute('role','tab');b.id='lab-tab-'+key;b.onclick=()=>{active=key;render();};dialog.querySelector('.lab-tabs').append(b);}
$('lab-preview').onchange=e=>{preview=e.target.checked;render();};
function button(parent,text,fn,pressed){const b=el('button',text);b.type='button';b.onclick=fn;if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));parent.append(b);return b;}
function card(title,text){const c=el('section');c.className='lab-card';c.append(el('h3',title));if(text)c.append(el('p',text));$('lab-panel').append(c);return c;}
function actions(c){const a=el('div');a.className='lab-actions';c.append(a);return a;}
function field(form,label,name,type='text',value=''){const l=el('label',label),i=el(type==='textarea'?'textarea':'input');i.name=name;if(type!=='textarea')i.type=type;i.value=value;i.required=true;if(type==='text'||type==='textarea')i.maxLength=300;l.append(i);form.append(l);return i;}
function form(c,submit){const f=el('form');f.className='lab-form';f.onsubmit=e=>{e.preventDefault();submit(new FormData(f));};c.append(f);return f;}
function submit(f,label){const b=el('button',label);b.type='submit';b.className='lab-entry';f.append(b);}
function render(){$('lab-panel').replaceChildren();$('lab-status').textContent='';for(const [key]of features){const b=$('lab-tab-'+key);b.setAttribute('aria-selected',String(key===active));b.tabIndex=key===active?0:-1;}const d=$('lab-decisions');d.replaceChildren();for(const value of['계속 진행','보류'])button(d,value,()=>{data.decisions[active]=value;save();render();},data.decisions[active]===value);
if(active==='cover'){const c=card('대치자 구하기','열람 제한은 화면 시뮬레이션입니다. 실제 소속 인증과 서버 권한 검사는 아직 연결되지 않았습니다. 앱의 확정은 회사의 공식 승인을 대신하지 않습니다.');const f=form(c,v=>{data.posts.unshift({id:crypto.randomUUID(),kind:'cover',department:v.get('department'),line:v.get('line'),date:v.get('date'),group:group(),text:v.get('text'),state:'모집 중'});save();render();});field(f,'부서','department');field(f,'라인','line');field(f,'대치 날짜','date','date',date());field(f,'근무 시간·요청사항','text','textarea');submit(f,'내 대치 요청 등록');for(const p of data.posts.filter(p=>p.kind==='cover'&&p.group===group())){const row=card(`${p.date} · ${p.department} / ${p.line}`,`${p.group}조 · ${p.text} · ${p.state}`);button(actions(row),p.state==='모집 중'?'모집 마감':'다시 모집',()=>{p.state=p.state==='모집 중'?'마감':'모집 중';save();render();});}if(preview)card('샘플 · 지원 확인 흐름','동료 지원 → 요청자 선택 → 양쪽 확인 → 확정. 실제 지원은 전송되지 않습니다.');}
if(active==='caffeine'){const c=card('취침 전 카페인 알림','설정한 취침 예정 시각에서 원하는 시간을 빼서 알려드립니다. 현재 테스트 알림은 앱이 열린 동안만 동작합니다. 앱이 닫힌 상태의 예약 알림은 네이티브 앱에서 별도 구현해야 합니다.');const f=form(c,v=>{const lead=Number(v.get('lead'));const target=new Date(v.get('sleep'));if(!Number.isFinite(+target)||lead<0||lead>24)return;const at=+target-lead*3600000;if(at<=Date.now()){$('lab-status').textContent='알림 시각이 이미 지났습니다. 취침 예정 시각을 다시 선택해 주세요.';return;}data.caffeine={at,sleep:+target,lead,sent:false};save();render();schedule();});field(f,'다음 취침 예정 시각 (기기 시간)','sleep','datetime-local');const lead=field(f,'취침 몇 시간 전 알려줄까요?','lead','number','6');lead.min=0;lead.max=24;submit(f,'알림 설정');if(data.caffeine){c.append(el('p','알림: '+new Date(data.caffeine.at).toLocaleString('ko-KR')+(data.caffeine.sent?' · 확인함':'')));button(actions(c),'알림 해제',()=>{data.caffeine=null;save();render();});}button(actions(c),'알림 미리보기',()=>{$('lab-status').textContent=caffeineMessage();});}
if(active==='feed'){
 const open=preview||[7,8,19,20].includes(hour()),c=card('교대 시간 한마디',open?'07:00~09:00 / 19:00~21:00 (한국 시간)에 작성할 수 있어요. 출근·퇴근 글을 나눠 보고, 함께 보기로 서로 응원하세요. 글과 응원은 이 기기에만 저장됩니다.':'지금은 읽기 시간입니다. 오전 7~9시, 오후 7~9시에 작성이 열립니다.');
 const lanes=actions(c);for(const [key,label]of[['arrive','출근'],['leave','퇴근'],['all','함께 보기']])button(lanes,label,()=>{feedLane=key;render();},feedLane===key);
 if(open){const f=form(c,v=>{if(!preview&&![7,8,19,20].includes(hour())){render();return;}data.posts.unshift({id:crypto.randomUUID(),kind:'feed',date:date(),lane:v.get('lane'),text:v.get('text')});save();render();});const l=el('label','어느 쪽의 한마디인가요?'),s=el('select');s.name='lane';for(const [key,label]of[['arrive','출근'],['leave','퇴근']]){const o=el('option',label);o.value=key;s.append(o);}s.value=feedLane==='leave'?'leave':'arrive';l.append(s);f.append(l);field(f,'오늘 뭐 먹을까요? / 서로 격려하기','text','textarea');submit(f,'내 테스트 글 남기기');}
 const posts=data.posts.filter(p=>p.kind==='feed'&&p.date===date()&&(feedLane==='all'||(p.lane||'leave')===feedLane));
 for(const p of posts){const row=card((p.lane==='arrive'?'출근':'퇴근')+' · 내 글 · '+p.date,p.text);button(actions(row),p.cheered?'응원했어요 ♡':'응원 보내기 ♡',()=>{p.cheered=!p.cheered;save();render();},!!p.cheered);}
 if(!posts.length&&!preview)c.append(el('p','아직 이 기기에 작성한 글이 없어요.'));
 if(preview){if(feedLane!=='leave')card('출근 · 샘플','오늘도 안전하게! 퇴근하시는 분들은 푹 쉬세요.');if(feedLane!=='arrive')card('퇴근 · 샘플','오늘 야식은 따뜻한 국밥 어때요? 출근하시는 분들도 힘내세요.');}
}

if(active==='lost'){
 const c=card('분실물 · 습득물','현장에서 습득자가 보관하고 반장 공유방에 알립니다. 주인이 나타나지 않으면 경비실에 맡기는 흐름을 기록합니다. 이 테스트가 공유방에 메시지를 보내지는 않습니다.');
 const f=form(c,v=>{data.posts.unshift({id:crypto.randomUUID(),kind:'lost',type:v.get('type'),date:v.get('date'),place:v.get('place'),text:v.get('text'),storage:v.get('storage'),stage:v.get('type')==='습득'?'현장 보관 중':'찾는 중',history:[],done:false});save();render();});
 const l=el('label','분류'),select=el('select');select.name='type';for(const name of['분실','습득'])select.append(el('option',name));l.append(select);f.append(l);
 field(f,'날짜','date','date',date());field(f,'분실·습득 장소','place');field(f,'물건 특징','text','textarea');const storage=field(f,'보관·문의 위치 (습득 시)','storage');storage.required=false;storage.placeholder='예: 경비실에 보관';
 submit(f,'테스트 게시물 등록');c.append(el('p','이름·연락처·사번·신분증 정보는 적지 마세요. 반환 전에는 주인이 물건의 특징을 설명하도록 확인하세요.'));
 for(const p of data.posts.filter(p=>p.kind==='lost')){
  const stage=p.stage||(p.done?'해결 완료':p.type==='습득'?'현장 보관 중':'찾는 중'),row=card(`${p.type} · ${p.place}`,`${p.date} · ${p.text}`);row.append(el('p','상태: '+stage));if(p.storage)row.append(el('p','보관·문의: '+p.storage));
  for(const h of p.history||[])row.append(el('p',new Date(h.at).toLocaleString('ko-KR')+' · '+h.stage));
  const a=actions(row),move=(next,where)=>{p.stage=next;p.done=['주인에게 반환','찾았어요'].includes(next);if(where)p.storage=where;p.history=[...(p.history||[]),{stage:next,at:Date.now()}];save();render();};
  if(p.type==='습득'&&!p.done){
   if(stage==='현장 보관 중')button(a,'반장 공유방에 알렸어요',()=>move('반장 공유방에 알림'));
   if(stage==='반장 공유방에 알림')button(a,'경비실에 맡겼어요',()=>move('경비실 보관 중','경비실'));
   button(a,'주인에게 반환했어요',()=>move('주인에게 반환'));
  }else if(!p.done)button(a,'찾았어요',()=>move('찾았어요'));
 }
}


}
function schedule(){clearTimeout(timer);if(!data.caffeine||data.caffeine.sent)return;const remaining=data.caffeine.at-Date.now();timer=setTimeout(()=>{if(data.caffeine&&Date.now()>=data.caffeine.at){data.caffeine.sent=true;save();if(!dialog.open){active='caffeine';render();dialog.showModal();}$('lab-status').textContent=caffeineMessage();}else schedule();},Math.max(0,Math.min(remaining,2147483647)));}
// Render must not cancel a scheduled reminder when exploring another feature.
dialog.addEventListener('close',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
$('lab-export').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,decisions:data.decisions},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='shift-feature-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('lab-clear').onclick=()=>{if(!confirm('이 기기의 게시물·설정·검토 선택을 지울까요? 서버의 식단 투표는 유지됩니다. 식단 투표 취소는 선택한 버튼을 다시 눌러 주세요.'))return;data={votes:{},posts:[],decisions:{},caffeine:null,bus:[],parking:null};save();render();schedule();};
dialog.querySelector('.lab-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();let i=features.findIndex(([key])=>key===active);i=(i+(e.key==='ArrowRight'?1:-1)+features.length)%features.length;active=features[i][0];render();$('lab-tab-'+active).focus();});
schedule();
})();
