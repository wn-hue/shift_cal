(function () {
    'use strict';
    const select = document.getElementById('alarm-group');
    const status = document.getElementById('copy-status');
    const validGroup = value => ['A', 'B', 'C'].includes(value);
    const initial = new URLSearchParams(location.search).get('group');
    if (validGroup(initial)) select.value = initial;
    function prefix(kind) { return select.value + '조 ' + (kind === 'day' ? '주간' : '야간'); }
    function refresh() {
        const valid = validGroup(select.value);
        document.querySelectorAll('[data-calendar]').forEach(el => { el.textContent = valid ? 'Shift_calander ' + select.value + '조' : '내 조의 Shift_calander 캘린더'; });
        document.querySelectorAll('[data-prefix]').forEach(el => { el.textContent = valid ? prefix(el.dataset.prefix) : '조 선택 필요'; });
        document.querySelectorAll('[data-copy-prefix]').forEach(el => { el.disabled = !valid; });
        document.getElementById('group-notice').textContent = valid ? select.value + '조 기준 안내입니다. 단축어에서도 같은 조를 선택하세요.' : '앱에서 사용하는 교대조를 선택하면 아래 일정 조건을 확인할 수 있어요.';
    }
    let timer;
    document.querySelectorAll('[data-copy], [data-copy-prefix]').forEach(button => {
        button.addEventListener('click', async () => {
            const value = button.dataset.copy || prefix(button.dataset.copyPrefix);
            try { await navigator.clipboard.writeText(value); status.textContent = '복사했어요: ' + value; }
            catch (_) { status.textContent = '복사할 수 없어요. 이 내용을 직접 입력하세요: ' + value; }
            clearTimeout(timer); timer = setTimeout(() => { status.textContent = ''; }, 7000);
        });
    });
    select.addEventListener('change', refresh);
    refresh();
})();
