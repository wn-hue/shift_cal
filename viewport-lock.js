/* Share the same fixed touch scale in Safari, installed web apps and WKWebView. */
(()=>{'use strict';
 const preventZoom=event=>{if(event.cancelable)event.preventDefault();};
 for(const name of ['gesturestart','gesturechange'])window.addEventListener(name,preventZoom,{capture:true,passive:false});
 // Safari may ignore viewport scale limits. Cancel only multi-touch; normal taps,
 // one-finger scrolling, text editing and sheet dismissal keep their handlers.
 for(const name of ['touchstart','touchmove'])window.addEventListener(name,event=>{if(event.touches.length>1)preventZoom(event);},{capture:true,passive:false});
})();
