(function () {
    'use strict';
    const $=id=>document.getElementById(id);
    function showView(view) {
        document.body.dataset.view=view;
        $('cal-month-title-btn').hidden=view!=='calendar';
        $('header-view-title').hidden=view==='calendar';
        $('header-view-title').textContent=view==='all'?'전체':view==='payroll'?'급여 계산기':view==='menu'?'오늘 식단':'시급 · 연차';
        $('header-calendar-actions').hidden=view!=='calendar';
        for (const [name,id] of [['calendar','bnav-cal'],['payroll','bnav-pay'],['leave','bnav-leave'],['menu','bnav-menu'],['all','account-menu-button']]) {
            $(id).setAttribute('aria-current',view===name?'page':'false');
        }
    }
    function rendered(group) {
        $('cal-month-title-btn').setAttribute('aria-label',group+'조 달력 연도와 월 선택');
    }
    function tap(button) {
        const visual=button.querySelector('.nav-visual');
        if (!visual?.animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        visual.getAnimations().forEach(animation=>animation.cancel());
        visual.animate([
            {backgroundColor:'#ececed',transform:'scale(.94)'},
            {backgroundColor:'transparent',transform:'scale(1)'}
        ],{duration:320,easing:'cubic-bezier(.2,.7,.2,1)'});
    }
    // Move only the month surface, keeping dates, forms and navigation in place.
    const motion = new WeakMap();
    function reducedMotion() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    function stateFor(surface) {
        if (!motion.has(surface)) motion.set(surface,{busy:false,x:0,animation:null});
        return motion.get(surface);
    }
    function reset(surface,state) {
        state.x=0;
        surface.style.transform='';
        surface.style.willChange='';
        surface.classList.remove('month-swipe-active');
    }
    function play(surface,state,frames,duration,easing='cubic-bezier(.25,.1,.25,1)') {
        state.animation=surface.animate(frames,{duration,easing,fill:'both'});
        return state.animation.finished.catch(()=>{});
    }
    async function slideMonth(surface,delta,change) {
        if (!surface) { change(); return; }
        const state=stateFor(surface);
        if (state.busy) return;
        if (!surface.animate || reducedMotion()) { reset(surface,state); change(); return; }
        state.busy=true;
        surface.style.willChange='transform';
        surface.classList.add('month-swipe-active');
        const rect=surface.getBoundingClientRect();
        const width=rect.width;
        const direction=delta>0?-1:1;
        const startX=state.x;
        const track=document.createElement('div');
        track.className='month-swipe-track';
        track.style.height=rect.height+'px';
        const previous=surface.cloneNode(true);
        previous.removeAttribute('id');
        previous.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
        previous.setAttribute('aria-hidden','true');
        previous.inert=true;
        previous.classList.remove('month-swipe-active');
        previous.style.cssText='position:absolute;top:0;left:0;width:100%;height:'+rect.height+'px;min-height:0;margin:0;pointer-events:none;will-change:transform';
        let outgoing=null;
        surface.before(track);
        track.append(surface);
        try {
            // Both months share one timeline. No exit/re-entry pause or acceleration restart.
            change();
            track.append(previous);
            const duration=Math.round(440*Math.max(.55,1-Math.abs(startX)/width));
            outgoing=previous.animate([
                {transform:`translate3d(${startX}px,0,0)`},
                {transform:`translate3d(${direction*width}px,0,0)`}
            ],{duration,easing:'cubic-bezier(.25,.1,.25,1)',fill:'both'});
            await play(surface,state,[
                {transform:`translate3d(${startX-direction*width}px,0,0)`},
                {transform:'translate3d(0,0,0)'}
            ],duration);
        } finally {
            if (outgoing) outgoing.cancel();
            if (state.animation) state.animation.cancel();
            state.animation=null;
            track.before(surface);
            track.remove();
            reset(surface,state);
            state.busy=false;
        }
    }

    function bindMonthSwipe(target,surface,change) {
        if (!target || !surface || target.dataset.monthSwipeBound) return;
        target.dataset.monthSwipeBound='true';
        target.classList.add('month-swipe-surface');
        const state=stateFor(surface);
        let start=null,axis='',frame=0,suppressClick=false;
        const flush=()=>{
            if (frame) cancelAnimationFrame(frame);
            frame=0;
        };
        function cancel() { flush(); start=null; axis=''; if (!state.busy) reset(surface,state); }
        target.addEventListener('touchstart',event=>{
            if (state.busy || event.touches.length!==1 || event.target.closest('input,textarea,select,button,a')) { cancel(); return; }
            start={x:event.touches[0].clientX,y:event.touches[0].clientY}; axis='';
        },{passive:true});
        target.addEventListener('touchmove',event=>{
            if (!start || state.busy) return;
            if (event.touches.length!==1) { cancel(); return; }
            const dx=event.touches[0].clientX-start.x,dy=event.touches[0].clientY-start.y;
            if (!axis && Math.max(Math.abs(dx),Math.abs(dy))>8) axis=Math.abs(dx)>Math.abs(dy)*1.2?'x':'y';
            if (axis!=='x') return;
            if (event.cancelable) event.preventDefault();
            state.x=Math.max(-surface.clientWidth*.65,Math.min(surface.clientWidth*.65,dx));
            if (reducedMotion()) return;
            if (!frame) frame=requestAnimationFrame(()=>{
                frame=0;
                surface.classList.add('month-swipe-active');
                surface.style.willChange='transform';
                surface.style.transform=`translate3d(${state.x}px,0,0)`;
            });
        },{passive:false});
        target.addEventListener('touchend',event=>{
            if (!start || state.busy) return;
            const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;
            flush();
            const horizontal=axis!=='y' && Math.abs(dx)>Math.abs(dy)*1.2 && Math.abs(dx)>45;
            suppressClick=axis==='x' || horizontal;
            // A synthesized tap after dragging must not open a calendar day.
            if (suppressClick) setTimeout(()=>{suppressClick=false;},400);
            start=null; axis='';
            if (horizontal) slideMonth(surface,dx<0?1:-1,()=>change(dx<0?1:-1));
            else if (surface.animate && state.x && !reducedMotion()) {
                state.busy=true;
                play(surface,state,[{transform:`translate3d(${state.x}px,0,0)`},{transform:'translate3d(0,0,0)'}],160).finally(()=>{
                    state.animation.cancel(); state.animation=null; reset(surface,state); state.busy=false;
                });
            } else reset(surface,state);
        },{passive:true});
        target.addEventListener('touchcancel',cancel,{passive:true});
        target.addEventListener('click',event=>{ if (suppressClick || state.busy) { event.preventDefault(); event.stopPropagation(); } },true);
    }
    window.ShiftUI={showView,rendered,tap,slideMonth,bindMonthSwipe};
})();

