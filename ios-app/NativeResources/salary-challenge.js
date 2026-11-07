(function(root){
'use strict';
const emojis=['🌙','☀️','🐻','🐱','🐼','🦊','🐧','🌿'];
const amounts=[6800000,6350000,6000000,5700000,5450000,5250000,5050000,4900000,4700000,4500000,4300000,4150000,4000000,3850000,3700000,3550000,3400000,3200000,2900000];
const names=['달빛','햇살','곰돌','냥이','판다','여우','펭귄','초록','새벽','구름','별빛','바람','모닝','밤하늘','파도','산책','우주','노을','도토리'];
function rank(amount,peers){
 if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000000||!Array.isArray(peers)||peers.some(n=>!Number.isSafeInteger(n)||n<=0||n>1000000000))throw Error('테스트 급여를 확인해 주세요.');
 const greater=peers.filter(n=>n>amount).length, equal=peers.filter(n=>n===amount).length+1,total=peers.length+1;
 return {rank:greater+1,total,topPercent:Math.ceil((greater+equal)*100/total)};
}
function profile(value){
 const nickname=typeof value?.nickname==='string'?value.nickname.trim():'';
 if(!nickname||Array.from(nickname).length>12||/[\u0000-\u001f\u007f]/.test(nickname)||!emojis.includes(value?.emoji))throw Error('닉네임은 1~12자, 프로필은 제공된 이모지 중에서 선택해 주세요.');
 return {nickname,emoji:value.emoji};
}
const api={rank,profile,emojis};root.SalaryChallenge=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),key='shift_salary_challenge_profile_test_v1';
let selected=emojis[0],my={nickname:'나',emoji:selected},context=null;
try{const saved=JSON.parse(localStorage.getItem(key));if(saved)my=profile(saved);}catch(_){}selected=my.emoji;
function renderEmojis(){$('challenge-emojis').replaceChildren();for(const emoji of emojis){const b=document.createElement('button');b.type='button';b.textContent=emoji;b.setAttribute('aria-label',emoji+' 프로필');b.setAttribute('aria-pressed',String(emoji===selected));b.addEventListener('click',()=>{selected=emoji;renderEmojis();});$('challenge-emojis').append(b);}}
function render(){
 try{
 const amount=Number($('challenge-amount').value),r=rank(amount,amounts);
 $('challenge-result').textContent='상위 '+r.topPercent+'%';$('challenge-rank').textContent=r.total+'명 중 '+r.rank+'위 · 동점 공동 순위';
 $('challenge-me').textContent=my.emoji+' '+my.nickname;$('challenge-my-pay').textContent=amount.toLocaleString('ko-KR')+'원 · 세전';
 const entries=amounts.map((salary,i)=>({salary,name:names[i],emoji:emojis[i%emojis.length],mine:false}));entries.push({salary:amount,name:my.nickname,emoji:my.emoji,mine:true});entries.sort((a,b)=>b.salary-a.salary);
 $('challenge-list').replaceChildren();for(const row of entries.slice(0,5)){
 const li=document.createElement('li');li.className=row.mine?'challenge-row challenge-own':'challenge-row';
 const n=document.createElement('span'),label=document.createElement('span'),pct=document.createElement('strong');n.textContent=String(entries.filter(e=>e.salary>row.salary).length+1);label.textContent=row.emoji+' '+row.name+(row.mine?' · 나':'');pct.textContent='상위 '+Math.ceil(entries.filter(e=>e.salary>=row.salary).length*100/entries.length)+'%';li.append(n,label,pct);$('challenge-list').append(li);
 }$('challenge-status').textContent='';
 }catch(e){$('challenge-result').textContent='금액 확인';$('challenge-rank').textContent='';$('challenge-list').replaceChildren();$('challenge-status').textContent=e.message;}
}
api.open=()=>{context=root.getSalaryChallengeContext();$('challenge-period').textContent=context.period+' · '+context.group+'조';$('challenge-nickname').value=my.nickname;selected=my.emoji;renderEmojis();$('challenge-amount').value='4400000';$('challenge-source').textContent='현재 가상 급여로 체험 중';$('challenge-use-pay').disabled=!(context.amount>0);root.closeMonthStatsModalDirect();$('salary-challenge-dialog').showModal();render();};
$('salary-challenge-open').addEventListener('click',api.open);
$('challenge-close').addEventListener('click',()=>$('salary-challenge-dialog').close());
$('salary-challenge-dialog').addEventListener('close',()=>{$('challenge-amount').value='';context=null;$('challenge-list').replaceChildren();});
$('challenge-amount').addEventListener('input',()=>{$('challenge-source').textContent='현재 직접 입력한 테스트 급여로 체험 중';render();});
$('challenge-use-pay').addEventListener('click',()=>{if(context?.amount>0){$('challenge-amount').value=String(context.amount);$('challenge-source').textContent='내 예상 급여로 기기에서만 비교 중 · 외부 전송 없음';render();}});
$('challenge-profile-form').addEventListener('submit',e=>{e.preventDefault();try{const next=profile({nickname:$('challenge-nickname').value,emoji:selected});localStorage.setItem(key,JSON.stringify(next));my=next;render();$('challenge-status').textContent='프로필을 이 기기에만 저장했습니다.';}catch(err){$('challenge-status').textContent=err.message;}});
$('challenge-reset').addEventListener('click',()=>{localStorage.removeItem(key);my={nickname:'나',emoji:emojis[0]};selected=my.emoji;$('challenge-nickname').value=my.nickname;$('challenge-amount').value='4400000';$('challenge-source').textContent='현재 가상 급여로 체험 중';renderEmojis();render();$('challenge-status').textContent='테스트 프로필을 삭제했습니다.';});
})(typeof globalThis!=='undefined'?globalThis:this);
