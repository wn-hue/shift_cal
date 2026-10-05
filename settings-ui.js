(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    function openMenu(section) {
        switchView('all');
        $('menu-' + section + '-settings').scrollIntoView({block:'nearest'});
        (section === 'group' ? $('group-select') : section === 'salary' ? $('payroll-sms-open') : $('menu-leave-settings').querySelector('button')).focus();
    }
    function openLeave() {
        updateLeaveStats();
        $('leave-settings-dialog').showModal();
    }
    function syncGroup(group) {
        const selected = ['A','B','C'].includes(group) ? group : '';
        $('group-select').value = selected;
        $('group-selection-status').textContent = selected ? selected + '조 근무표 적용됨 · 자동 저장' : '교대조를 선택해 주세요.';
        const alarmGuide = $('iphone-alarm-guide-link');
        if (alarmGuide) alarmGuide.setAttribute('href', './iphone-alarms.html' + (selected ? '?group=' + selected : ''));
    }
    function refresh({group,hireDate,baseHourly,ordinaryHourly,year,total,used,remain}) {
        syncGroup(group);
        $('menu-leave-year').textContent = year + '년';
        for (const [key,value] of Object.entries({total,used,remain})) $('menu-leave-' + key).textContent = value + '일';
        const needsGroup = !['A','B','C'].includes(group);
        const needsHire = !hireDate, needsPay = !(baseHourly > 0 && ordinaryHourly > 0);
        const missing = [needsGroup && '교대조', needsHire && '입사년월일', needsPay && '급여 문자'].filter(Boolean);
        $('first-use-guide').hidden = missing.length === 0;
        $('first-use-copy').textContent = missing.length
            ? '하단 전체 메뉴에서 ' + missing.join('·') + '를 설정해 주세요.'
            : '내 근무표와 연차·예상 급여를 확인할 수 있어요.';
        const buttons = $('first-use-guide').querySelectorAll('button');
        buttons[0].hidden = !needsGroup; buttons[1].hidden = !needsHire; buttons[2].hidden = !needsPay;
    }
    $('leave-settings-dialog').addEventListener('close', () => $('menu-leave-settings').querySelector('button').focus());
    window.SettingsUI = {openMenu,openLeave,refresh,syncGroup};
})();
