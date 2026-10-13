(()=>{
 const dialog=document.getElementById('account-login-dialog'),trigger=document.getElementById('account-sheet-open');
 trigger.addEventListener('click',()=>dialog.showModal());
 dialog.querySelector('.login-sheet-close').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();});
 dialog.addEventListener('close',()=>trigger.focus({preventScroll:true}));
})();
