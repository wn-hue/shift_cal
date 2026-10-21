(()=>{'use strict';
const frame=document.getElementById('app');let mode='compact';
function setMode(value){mode=value;for(const name of ['original','compact'])document.getElementById(name).setAttribute('aria-pressed',String(name===value));const doc=frame.contentDocument;if(!doc)return;doc.body.dataset.mealPreview=value;const summary=doc.querySelector('.meal-weekly>summary');if(summary){const label=value==='compact'?'식단 평가 모아보기':'지난주 식단 평가 · 결산 예시';if(summary.textContent!==label)summary.textContent=label;}}
for(const name of ['original','compact'])document.getElementById(name).onclick=()=>setMode(name);
frame.addEventListener('load',()=>{
const w=frame.contentWindow,d=w.document;
const link=d.createElement('link');link.rel='stylesheet';link.href='./meal-compact-preview.css';d.head.append(link);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-3*3600000));
const plus=(date,n)=>new Date(Date.parse(date+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
const names=['조식','중식','석식','야식'],menus=[['소고기뭇국','쌀밥','계란말이','도토리묵무침','배추김치'],['제육볶음','쌀밥 · 잡곡밥','콩나물국','양배추쌈 & 쌈장','오이무침','배추김치'],['치킨마요덮밥','미소된장국','고로케 & 케첩','그린샐러드','배추김치'],['얼큰순대국','쌀밥','두부조림','부추겉절이','깍두기']];
let mine={};
w.fetch=async(input,options={})=>{
const url=new URL(typeof input==='string'?input:input.url,w.location.href);
if(url.pathname==='/api/today-menu'){const date=url.searchParams.get('date')||today();return new w.Response(JSON.stringify({status:'ok',date,checkedAt:new Date().toISOString(),meals:names.map((name,i)=>({name,groups:[{title:'일반식',items:menus[i]}]}))}),{headers:{'Content-Type':'application/json'}});}
if(url.pathname==='/api/meal-votes'){if(options.method==='POST'){const body=JSON.parse(options.body);if(body.vote===null)delete mine[body.meal];else mine[body.meal]=body.vote;}const date=today(),dow=new Date(date+'T12:00:00Z').getUTCDay(),monday=plus(date,-((dow+6)%7));return new w.Response(JSON.stringify({date,mine,totals:Object.fromEntries(names.map((name,i)=>[name,{up:[12,28,19,8][i]+(mine[name]==='up'?1:0),down:[2,3,5,9][i]+(mine[name]==='down'?1:0)}])),weekly:{week:monday,start:plus(monday,-7),end:plus(monday,-1),mostLiked:[{date:plus(monday,-4),meal:'중식',items:['돈까스','양송이스프','양배추샐러드'],up:42,down:3}],mostDisliked:[{date:plus(monday,-2),meal:'야식',items:['매운탕','쌀밥','어묵볶음'],up:8,down:17}]}}),{headers:{'Content-Type':'application/json'}});}
// This preview never sends account, vote, parking, or other mutations to production.
return new w.Response(JSON.stringify({configured:false,status:'unavailable',message:'화면 테스트에서는 지원하지 않아요.'}),{headers:{'Content-Type':'application/json'}});
};
const onboarding=d.getElementById('onboarding-dialog');if(onboarding?.open)onboarding.close();
w.localStorage.removeItem('shift_today_menu_cache_v1');w.switchView('menu');w.TodayMenu.load(true);
const observer=new w.MutationObserver(()=>{const week=d.querySelector('.meal-weekly');if(week&&!week.hidden){week.open=false;setMode(mode);const labelObserver=new w.MutationObserver(()=>setMode(mode));labelObserver.observe(week.querySelector('summary'),{childList:true});observer.disconnect();}});observer.observe(d.getElementById('view-menu'),{childList:true,subtree:true});
// Keep routine feedback accessible while removing four repeated instructions.
const feedback=new w.MutationObserver(()=>{for(const status of d.querySelectorAll('.meal-rating-status'))status.dataset.idle=String(status.textContent==='식사 후 평가해 주세요.');});feedback.observe(d.getElementById('today-menu-cards'),{childList:true,subtree:true});
setMode(mode);
});
})();
