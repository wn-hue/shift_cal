(()=>{
 const dialog=document.getElementById('account-login-dialog'),trigger=document.getElementById('account-sheet-open');
 trigger.addEventListener('click',()=>dialog.showModal());
 dialog.querySelector('.login-sheet-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 dialog.addEventListener('close',()=>trigger.focus({preventScroll:true}));
 let generation=0;
 async function appleStatus(){const epoch=++generation,button=document.getElementById('apple-login'),label=document.getElementById('apple-login-status');try{const data=await(await fetch('/api/apple-account?action=status',{cache:'no-store'})).json();if(epoch!==generation)return;const available=!!(data.configured||data.connected);button.setAttribute('aria-disabled',String(!available));button.onclick=available?null:e=>{e.preventDefault();label.textContent='Apple 로그인은 개발자 계정 연결 후 사용할 수 있습니다.';};if(!available&&dialog.dataset.connected!=='true')label.textContent='Apple 로그인은 개발자 계정 연결 후 사용할 수 있습니다.';}catch{if(epoch!==generation)return;button.setAttribute('aria-disabled','true');button.onclick=e=>e.preventDefault();}}
 window.addEventListener('load',appleStatus);
})();
