/* Shared meal ratings live directly on today's meal cards. */
(()=>{'use strict';
const root=document.getElementById('today-menu-cards');if(!root)return;
const names=['조식','중식','석식','야식'];
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()-3*3600000));
const node=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;};
let state={date:today(),totals:null,mine:{},busy:false,error:''},lastRead=0;
function cards(){return [...root.querySelectorAll('.meal-card')].map(card=>({card,meal:card.querySelector('h2')?.textContent.trim()})).filter(x=>names.includes(x.meal));}
function paint(){for(const{card,meal}of cards()){
 let block=card.querySelector('.meal-rating');if(!block){block=node('section','meal-rating');block.setAttribute('aria-label',meal+' 식단 평가');const actions=node('div','meal-rating-actions');for(const[v,label]of[['up','👍 좋아요'],['down','👎 싫어요']]){const b=node('button','meal-rating-button');b.type='button';b.dataset.vote=v;b.onclick=()=>vote(meal,state.mine[meal]===v?null:v);actions.append(b);}block.append(actions,node('span','meal-rating-count'),node('p','meal-rating-status'));const retry=node('button','meal-rating-retry','집계 다시 불러오기');retry.type='button';retry.onclick=()=>request();block.append(retry);card.append(block);}
 const totals=state.totals?.[meal];for(const b of block.querySelectorAll('[data-vote]')){const v=b.dataset.vote,label=v==='up'?'👍 좋아요':'👎 싫어요';b.textContent=label+' '+(totals?totals[v]:'—');b.setAttribute('aria-label',meal+' '+(v==='up'?'좋아요':'싫어요')+(totals?' '+totals[v]+'표':''));b.setAttribute('aria-pressed',String(state.mine[meal]===v));b.disabled=state.busy||!totals;}
 block.querySelector('.meal-rating-count').textContent=totals?'총 '+(totals.up+totals.down)+'표':'';
 const status=block.querySelector('.meal-rating-status');status.setAttribute('role','status');status.textContent=state.error||(state.busy?'집계 연결 중…':state.mine[meal]?'내 평가가 반영됐어요. 다시 누르면 취소돼요.':'식사 후 평가해 주세요.');block.querySelector('.meal-rating-retry').hidden=!state.error;
}}
async function request(body){if(state.busy)return;const date=today();if(state.date!==date){state={date,totals:null,mine:{},busy:false,error:''};}state.busy=true;state.error='';paint();const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);try{const r=await fetch('/api/meal-votes',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:controller.signal,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,date})}:{})});const data=await r.json();if(!r.ok)throw Error(data.message||'집계를 불러오지 못했어요.');if(date!==today()||data.date!==date)throw Error('급식 날짜가 바뀌었어요. 식단을 새로고침해 주세요.');if(!data.mine||!data.totals||!names.every(m=>Number.isSafeInteger(data.totals[m]?.up)&&Number.isSafeInteger(data.totals[m]?.down)&&data.totals[m].up>=0&&data.totals[m].down>=0))throw Error('집계를 확인하지 못했어요. 다시 불러와 주세요.');state.totals=data.totals;state.mine=data.mine;lastRead=Date.now();}catch(e){state.error=e.name==='AbortError'?'집계 응답이 늦어요. 다시 불러와 주세요.':e.message;}finally{clearTimeout(timeout);state.busy=false;paint();}}
function vote(meal,vote){if(state.date!==today()){request();return;}request({meal,vote});}
function attach(){if(!cards().length)return;paint();if(!state.busy&&(!state.totals||state.date!==today()))request();}
new MutationObserver(attach).observe(root,{childList:true});
new MutationObserver(()=>{if(document.body.dataset.view==='menu'){attach();if(Date.now()-lastRead>60000)request();}}).observe(document.body,{attributes:true,attributeFilter:['data-view']});
document.getElementById('today-menu-refresh').addEventListener('click',()=>{if(cards().length)request();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&document.body.dataset.view==='menu'&&cards().length)request();});
setInterval(()=>{if(!document.hidden&&document.body.dataset.view==='menu'&&cards().length&&Date.now()-lastRead>60000)request();},60000);
const note=node('p','meal-rating-note','식단 평가는 전체 이용자의 표로 집계됩니다. 브라우저별 끼니당 한 표로, 변경·취소할 수 있어요.');note.append(document.createTextNode(' '));const link=node('a','','저장 안내');link.href='./privacy.html';note.append(link);root.after(note);new MutationObserver(()=>{note.hidden=!cards().length;}).observe(root,{childList:true});note.hidden=!cards().length;attach();
})();
