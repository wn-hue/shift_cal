(function () {
    'use strict';
    const $=id=>document.getElementById(id);
    function showView(view) {
        document.body.dataset.view=view;
        $('cal-month-title-btn').hidden=view!=='calendar';
        $('header-view-title').hidden=view==='calendar';
        $('header-view-title').textContent=view==='payroll'?'급여 계산기':'연차 · 설정';
        $('header-calendar-actions').hidden=view!=='calendar';
    }
    function rendered(group) {
        $('calendar-group-label').textContent=group+'조';
    }
    window.ShiftUI={showView,rendered};
})();
