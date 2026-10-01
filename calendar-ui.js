(function () {
    'use strict';
    const $=id=>document.getElementById(id);
    function showView(view) {
        document.body.dataset.view=view;
        $('cal-month-title-btn').hidden=view!=='calendar';
        $('header-view-title').hidden=view==='calendar';
        $('header-view-title').textContent=view==='payroll'?'급여 계산기':'연차 · 설정';
        $('header-calendar-actions').hidden=view!=='calendar';
        for (const [name,id] of [['calendar','bnav-cal'],['payroll','bnav-pay'],['leave','bnav-leave']]) {
            $(id).setAttribute('aria-current',view===name?'page':'false');
        }
    }
    function rendered(group) {
        $('calendar-group-label').textContent=group+'조';
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
    window.ShiftUI={showView,rendered,tap};
})();
