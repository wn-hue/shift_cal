(function(){'use strict';
 const OLD='https://h-lyart-ten.vercel.app',NEW='https://20261104.xyz',ORIGINS=[OLD,NEW,'https://work-routine.shift-cal.workers.dev'];
 if(ORIGINS.includes(location.origin)&&!window.webkit?.messageHandlers?.natbam){
  if(location.origin!==OLD&&!document.documentElement.hasAttribute('data-account-entry')&&!localStorage.getItem('shift_origin_ready_v1')){location.replace('/origin-transfer.html');return;}
  document.addEventListener('click',async e=>{const a=e.target.closest('a');if(!a)return;const u=new URL(a.href,location.href);if(u.origin!==location.origin||!['/api/google-calendar','/api/apple-account'].includes(u.pathname)||u.searchParams.get('action')!=='login')return;e.preventDefault();e.stopImmediatePropagation();
   try{const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),verifier=hex(crypto.getRandomValues(new Uint8Array(32))),state=hex(crypto.getRandomValues(new Uint8Array(32))),challenge=hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));sessionStorage.setItem('origin-auth-flow',JSON.stringify({verifier,state,intent:u.pathname==='/api/apple-account'?'account':u.searchParams.get('calendar')==='1'?'calendar':u.searchParams.get('storage')==='1'?'account':'login',expires:Date.now()+600000}));u.searchParams.set('native_challenge',challenge);u.searchParams.set('native_state',state);u.searchParams.set('web_return',location.origin);location.assign(OLD+u.pathname+u.search);}catch{alert('로그인 연결을 다시 시도해 주세요.');}
  },true);
 }
})();
