(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    function openMenu(section) {
        const menu = $('account-management-dialog');
        if (!menu.open) menu.showModal();
        $('menu-' + section + '-settings').scrollIntoView({block:'nearest'});
        (section === 'salary' ? $('payroll-sms-open') : $('menu-leave-settings').querySelector('button')).focus();
    }
    function openLeave() {
        $('account-management-dialog').close();
        updateLeaveStats();
        $('leave-settings-dialog').showModal();
    }
    function refresh({hireDate,baseHourly,ordinaryHourly,year,total,used,remain}) {
        $('menu-leave-year').textContent = year + '년';
        for (const [key,value] of Object.entries({total,used,remain})) $('menu-leave-' + key).textContent = value + '일';
        const needsHire = !hireDate, needsPay = !(baseHourly > 0 && ordinaryHourly > 0);
        $('first-use-guide').hidden = !needsHire && !needsPay;
        $('first-use-copy').textContent = needsHire && needsPay
            ? '왼쪽 상단 ☰ 메뉴에서 입사년월일과 급여 문자를 설정해 주세요.'
            : needsHire ? '입사년월일을 설정하면 남은 연차를 확인할 수 있어요.'
            : '급여 문자를 적용하면 내 시급으로 예상 급여를 계산할 수 있어요.';
        const buttons = $('first-use-guide').querySelectorAll('button');
        buttons[0].hidden = !needsHire; buttons[1].hidden = !needsPay;
    }
    $('leave-settings-dialog').addEventListener('close', () => $('account-menu-button').focus());
    window.SettingsUI = {openMenu,openLeave,refresh};
})();
