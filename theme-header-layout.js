/* Keep the calendar clear of the fixed navigation when its toolbar wraps. */
(()=>{'use strict';
 const header=document.querySelector('.reference-header');if(!header)return;
 let previous=0;
 function fit(){
  const height=Math.ceil(header.getBoundingClientRect().height);
  if(height>0&&height!==previous){previous=height;document.documentElement.style.setProperty('--theme-header-height',height+'px');}
 }
 if(window.ResizeObserver)new ResizeObserver(fit).observe(header);
 window.addEventListener('resize',fit,{passive:true});
 document.fonts?.ready.then(fit);fit();
})();
