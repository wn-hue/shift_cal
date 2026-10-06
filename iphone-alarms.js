(function () {
    'use strict';
    const select = document.getElementById('alarm-group');
    const status = document.getElementById('copy-status');
    const validGroup = value => ['A', 'B', 'C'].includes(value);
    const initial = new URLSearchParams(location.search).get('group');
    if (validGroup(initial)) select.value = initial;
    function refresh() {
        const group = select.value;
        const valid = validGroup(group);
        document.querySelectorAll('[data-calendar]').forEach(el => { el.textContent = valid ? 'Shift_calander ' + group + '조' : '내 조의 Shift_calander 캘린더'; });
        document.querySelectorAll('[data-shortcut]').forEach(el => { el.textContent = valid ? 'Shift_cal ' + group + '조 근무 알람' : '내 조의 Shift_cal 근무 알람'; });
        document.querySelectorAll('[data-download]').forEach(el => { el.classList.toggle('selected', valid && el.dataset.download === group); });
        document.getElementById('group-notice').textContent = valid ? group + '조 파일을 받고, 아래 안내대로 한 번 설정해 주세요.' : '앱에서 사용하는 교대조의 파일을 선택하세요.';
    }
    let timer;
    document.querySelectorAll('[data-copy]').forEach(button => {
        button.addEventListener('click', async () => {
            const value = button.dataset.copy;
            try { await navigator.clipboard.writeText(value); status.textContent = '복사했어요: ' + value; }
            catch (_) { status.textContent = '복사할 수 없어요. 이 내용을 직접 입력하세요: ' + value; }
            clearTimeout(timer); timer = setTimeout(() => { status.textContent = ''; }, 7000);
        });
    });
    select.addEventListener('change', refresh);
    refresh();
})();
