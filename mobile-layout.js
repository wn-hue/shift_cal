/* Track the visible screen on Safari and Android when browser chrome/keyboards move. */
(function(){
    'use strict';
    const viewport=window.visualViewport;
    let frame=0;
    function update(){
        frame=0;
        if(viewport && viewport.scale!==1)return; // Preserve pinch zoom rather than reflowing it.
        const height=viewport ? viewport.height : window.innerHeight;
        const top=viewport ? viewport.offsetTop : 0;
        document.documentElement.style.setProperty('--visible-height',height+'px');
        document.documentElement.style.setProperty('--visible-top',top+'px');
        const editing=document.activeElement?.matches('input:not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable="true"]');
        document.body.dataset.keyboard=editing && window.innerHeight-height>120 ? 'open' : 'closed';
    }
    function schedule(){if(!frame)frame=requestAnimationFrame(update);}
    viewport?.addEventListener('resize',schedule);
    viewport?.addEventListener('scroll',schedule);
    window.addEventListener('resize',schedule);
    // Safari standalone can settle its viewport only after the first page paint,
    // and restores from its page cache without a resize event.
    function settle(){
        schedule();
        requestAnimationFrame(schedule);
        setTimeout(schedule,150);
        setTimeout(schedule,500);
    }
    window.addEventListener('load',settle);
    window.addEventListener('pageshow',settle);
    window.addEventListener('orientationchange',settle);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)settle();});
    document.addEventListener('focusin',schedule);
    document.addEventListener('focusout',schedule);
    update();
    settle();
})();
