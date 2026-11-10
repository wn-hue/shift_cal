/* Isolated local prototype: no community API, account upload, or raw salary access. */
(()=>{'use strict';
const KEY='shift_community_lab_v1',features=[['cover','대치 모집'],['caffeine','카페인'],['feed','교대 시간 한마디']];
let data={votes:{},posts:[],decisions:{},caffeine:null,bus:[],parking:null},active='cover',preview=false,timer,feedLane='arrive';
try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&typeof saved==='object')data={...data,...saved};}catch{}
const $=id=>document.getElementById(id),el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;},save=()=>{try{localStorage.setItem(KEY,JSON.stringify(data));$('lab-status').textContent='이 기기에 저장했어요.';}catch{$('lab-status').textContent='이 기기에 저장하지 못했어요. 화면을 닫으면 바꾼 내용이 사라질 수 있어요.';}};
const date=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),hour=()=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',hourCycle:'h23'}).format(new Date()));
const minuteOfDay=()=>{const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());return Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);};
const parkingWindow=m=>m>=410&&m<=450;
const caffeineMessage=()=>{if(!data.caffeine)return '☕ 다음 수면을 위해, 지금부터 카페인 대신 물이나 디카페인은 어때요?';const remaining=Math.max(0,Math.ceil((data.caffeine.sleep-Date.now())/60000));return `☕ 예정 취침까지 ${Math.floor(remaining/60)}시간 ${remaining%60}분. 지금부터 카페인 대신 물이나 디카페인은 어때요?`;};
const group=()=>typeof currentGroup==='string'?currentGroup:'C';
const dialog=el('dialog');dialog.id='community-lab';dialog.setAttribute('aria-label','새 기능 체험');dialog.innerHTML='<div class="lab-header"><h2>새 기능 체험</h2><button type="button" aria-label="새 기능 체험 닫기">×</button></div><p class="lab-note">여기서 쓴 글과 설정은 이 기기에만 저장돼요. 다른 이용자에게 보내지 않아요. 식단 평가는 오늘 메뉴에서, 통근버스·주차장·분실물은 전체 메뉴에서 이용할 수 있어요.</p><div class="lab-tabs" role="tablist" aria-label="테스트 기능"></div><label class="lab-preview"><input type="checkbox" id="lab-preview">예시 보기 (작성 시간 제한 없이)</label><div id="lab-panel"></div><p id="lab-status" class="lab-status" role="status"></p><section class="lab-decision"><strong>이 기능을 어떻게 할까요?</strong><div id="lab-decisions" class="lab-actions"></div><div class="lab-actions"><button id="lab-export">검토 결과 저장</button><button id="lab-clear">테스트 기록 지우기</button></div></section>';document.body.append(dialog);
dialog.querySelector('.lab-header button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
const entry=el('button','새 기능 체험  ›');entry.className='lab-entry';entry.type='button';let opener=entry;entry.onclick=()=>{opener=entry;render();dialog.showModal();dialog.scrollTop=0;};
$('onboarding-reopen').before(entry);
dialog.addEventListener('close',()=>opener.focus());

for(const [key,label]of features){const b=el('button',label);b.type='button';b.setAttribute('role','tab');b.id='lab-tab-'+key;b.onclick=()=>{active=key;render();};dialog.querySelector('.lab-tabs').append(b);}
$('lab-preview').onchange=e=>{preview=e.target.checked;render();};
function button(parent,text,fn,pressed){const b=el('button',text);b.type='button';b.onclick=fn;if(pressed!==undefined)b.setAttribute('aria-pressed',String(pressed));parent.append(b);return b;}
function card(title,text){const c=el('section');c.className='lab-card';c.append(el('h3',title));if(text)c.append(el('p',text));$('lab-panel').append(c);return c;}
function actions(c){const a=el('div');a.className='lab-actions';c.append(a);return a;}
function field(form,label,name,type='text',value=''){const l=el('label',label),i=el(type==='textarea'?'textarea':'input');i.name=name;if(type!=='textarea')i.type=type;i.value=value;i.required=true;if(type==='text'||type==='textarea')i.maxLength=300;l.append(i);form.append(l);return i;}
function form(c,submit){const f=el('form');f.className='lab-form';f.onsubmit=e=>{e.preventDefault();submit(new FormData(f));};c.append(f);return f;}
function submit(f,label){const b=el('button',label);b.type='submit';b.className='lab-entry';f.append(b);}
function render(){$('lab-panel').replaceChildren();$('lab-status').textContent='';for(const [key]of features){const b=$('lab-tab-'+key);b.setAttribute('aria-selected',String(key===active));b.tabIndex=key===active?0:-1;}const d=$('lab-decisions');d.replaceChildren();for(const value of['계속 진행','보류'])button(d,value,()=>{data.decisions[active]=value;save();render();},data.decisions[active]===value);
if(active==='cover'){const c=card('대치자 구하기','누가 글을 볼 수 있는지 예시로 보여 드려요. 아직 실제 소속이나 열람 권한은 확인하지 않아요. 회사의 공식 승인은 별도로 받아야 해요.');const f=form(c,v=>{data.posts.unshift({id:crypto.randomUUID(),kind:'cover',department:v.get('department'),line:v.get('line'),date:v.get('date'),group:group(),text:v.get('text'),state:'모집 중'});save();render();});field(f,'부서','department');field(f,'라인','line');field(f,'대치 날짜','date','date',date());field(f,'근무 시간·요청사항','text','textarea');submit(f,'내 대치 요청 등록');for(const p of data.posts.filter(p=>p.kind==='cover'&&p.group===group())){const row=card(`${p.date} · ${p.department} / ${p.line}`,`${p.group}조 · ${p.text} · ${p.state}`);button(actions(row),p.state==='모집 중'?'모집 마감':'다시 모집',()=>{p.state=p.state==='모집 중'?'마감':'모집 중';save();render();});}if(preview)card('샘플 · 지원 확인 흐름','동료가 지원하면 요청자가 선택하고, 두 사람이 확인하면 확정해요. 여기서는 실제 지원이 전송되지 않아요.');}
if(active==='caffeine'){const c=card('취침 전 카페인 알림','잠들기 몇 시간 전에 알릴지 정해 보세요. 체험 중에는 앱을 열어 둔 동안만 알림을 받을 수 있어요.');const f=form(c,v=>{const lead=Number(v.get('lead'));const target=new Date(v.get('sleep'));if(!Number.isFinite(+target)||lead<0||lead>24)return;const at=+target-lead*3600000;if(at<=Date.now()){$('lab-status').textContent='알림 시간이 이미 지났어요. 취침 예정 시간을 다시 선택해 주세요.';return;}data.caffeine={at,sleep:+target,lead,sent:false};save();render();schedule();});field(f,'다음 취침 예정 시각 (기기 시간)','sleep','datetime-local');const lead=field(f,'취침 몇 시간 전 알려줄까요?','lead','number','6');lead.min=0;lead.max=24;submit(f,'알림 설정');if(data.caffeine){c.append(el('p','알림: '+new Date(data.caffeine.at).toLocaleString('ko-KR')+(data.caffeine.sent?' · 확인함':'')));button(actions(c),'알림 해제',()=>{data.caffeine=null;save();render();});}button(actions(c),'알림 미리보기',()=>{$('lab-status').textContent=caffeineMessage();});}
if(active==='feed'){
 const open=preview||[7,8,19,20].includes(hour()),c=card('교대 시간 한마디',open?'오전 7~9시와 오후 7~9시(한국 시간)에 글을 쓸 수 있어요. 함께 보기에서 출근·퇴근 글을 모아 볼 수 있어요. 글과 응원은 이 기기에만 저장돼요.':'지금은 글을 읽을 수 있어요. 오전 7~9시와 오후 7~9시(한국 시간)에 글을 쓸 수 있어요.');
 const lanes=actions(c);for(const [key,label]of[['arrive','출근'],['leave','퇴근'],['all','함께 보기']])button(lanes,label,()=>{feedLane=key;render();},feedLane===key);
 if(open){const f=form(c,v=>{if(!preview&&![7,8,19,20].includes(hour())){render();return;}data.posts.unshift({id:crypto.randomUUID(),kind:'feed',date:date(),lane:v.get('lane'),text:v.get('text')});save();render();});const l=el('label','출근 중인가요, 퇴근 중인가요?'),s=el('select');s.name='lane';for(const [key,label]of[['arrive','출근'],['leave','퇴근']]){const o=el('option',label);o.value=key;s.append(o);}s.value=feedLane==='leave'?'leave':'arrive';l.append(s);f.append(l);field(f,'오늘 뭐 먹을까요? / 서로 격려하기','text','textarea');submit(f,'내 테스트 글 남기기');}
 const posts=data.posts.filter(p=>p.kind==='feed'&&p.date===date()&&(feedLane==='all'||(p.lane||'leave')===feedLane));
 for(const p of posts){const row=card((p.lane==='arrive'?'출근':'퇴근')+' · 내 글 · '+p.date,p.text);button(actions(row),p.cheered?'응원했어요 ♡':'응원 보내기 ♡',()=>{p.cheered=!p.cheered;save();render();},!!p.cheered);}
 if(!posts.length&&!preview)c.append(el('p','아직 이 기기에 작성한 글이 없어요.'));
 if(preview){if(feedLane!=='leave')card('출근 · 샘플','오늘도 안전하게! 퇴근하시는 분들은 푹 쉬세요.');if(feedLane!=='arrive')card('퇴근 · 샘플','오늘 야식은 따뜻한 국밥 어때요? 출근하시는 분들도 힘내세요.');}
}




}
function schedule(){clearTimeout(timer);if(!data.caffeine||data.caffeine.sent)return;const remaining=data.caffeine.at-Date.now();timer=setTimeout(()=>{if(data.caffeine&&Date.now()>=data.caffeine.at){data.caffeine.sent=true;save();if(!dialog.open){active='caffeine';render();dialog.showModal();}$('lab-status').textContent=caffeineMessage();}else schedule();},Math.max(0,Math.min(remaining,2147483647)));}
// Render must not cancel a scheduled reminder when exploring another feature.
dialog.addEventListener('close',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
$('lab-export').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,decisions:data.decisions},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='shift-feature-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('lab-clear').onclick=()=>{if(!confirm('이 기기의 글, 설정, 검토 결과를 지울까요? 식단 평가는 그대로 남아요. 평가를 취소하려면 오늘 메뉴에서 선택한 버튼을 다시 눌러 주세요.'))return;data={votes:{},posts:[],decisions:{},caffeine:null,bus:[],parking:null};save();render();schedule();};
dialog.querySelector('.lab-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();let i=features.findIndex(([key])=>key===active);i=(i+(e.key==='ArrowRight'?1:-1)+features.length)%features.length;active=features[i][0];render();$('lab-tab-'+active).focus();});
schedule();
})();
