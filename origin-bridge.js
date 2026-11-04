(function(){'use strict';
 const OLD='https://h-lyart-ten.vercel.app',NEW='https://work-routine.shift-cal.workers.dev';
 if(location.origin===NEW){
  if(!localStorage.getItem('shift_origin_ready_v1')){location.replace('/origin-transfer.html');return;}
  document.addEventListener('click',async e=>{const a=e.target.closest('a');if(!a)return;const u=new URL(a.href,location.href);if(u.origin!==NEW||!['/api/google-calendar','/api/apple-account'].includes(u.pathname)||u.searchParams.get('action')!=='login')return;e.preventDefault();e.stopImmediatePropagation();
   try{const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),verifier=hex(crypto.getRandomValues(new Uint8Array(32))),state=hex(crypto.getRandomValues(new Uint8Array(32))),challenge=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));sessionStorage.setItem('origin-auth-flow',JSON.stringify({verifier,state,expires:Date.now()+600000}));u.searchParams.set('native_challenge',challenge);u.searchParams.set('native_state',state);u.searchParams.set('web_return',NEW);location.assign(OLD+u.pathname+u.search);}catch{alert('로그인 연결을 다시 시도해 주세요.');}
  },true);
 }
 document.addEventListener('DOMContentLoaded',()=>{const parent=document.getElementById('all-view')||document.querySelector('.all-page');if(!parent)return;const a=document.createElement('a');a.href=location.origin===OLD?'/origin-transfer.html': '/origin-transfer.html';a.textContent=location.origin===OLD?'새 주소로 데이터 가져가기':'기존 데이터 가져오기';a.style.cssText='display:block;margin:20px;color:#3182f6;font-size:14px';parent.append(a);});
})();
