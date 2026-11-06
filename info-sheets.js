/* Read-only explanations open above the page without reflowing its main content. */
(()=>{'use strict';
 const origins=new WeakMap();
 document.addEventListener('click',event=>{
  const opener=event.target.closest('[data-info-target]');
  if(opener){
   const dialog=document.getElementById(opener.dataset.infoTarget);
   if(!(dialog instanceof HTMLDialogElement)||dialog.open)return;
   origins.set(dialog,opener);window.AppSheets?.attach(dialog);dialog.showModal();
   dialog.querySelector('h2')?.focus({preventScroll:true});
   return;
  }
  const closer=event.target.closest('[data-info-close]');
  if(closer)closer.closest('dialog')?.close();
 });
 for(const dialog of document.querySelectorAll('dialog.info-sheet')){
  dialog.addEventListener('close',()=>{
   if(dialog.open)return;
   const opener=origins.get(dialog);origins.delete(dialog);
   if(opener?.isConnected)opener.focus({preventScroll:true});
  });
 }
})();
