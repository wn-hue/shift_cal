(() => {
    'use strict';
    const primary = location.origin === 'https://20261104.xyz';
    const start = document.getElementById('start-app');
    if (start && !primary) {
        if (localStorage.getItem('shift_salary_config_master')) start.textContent = '내 근무표 열기';
        start.onclick = () => {
            localStorage.setItem('shift_origin_ready_v1', '1');
            document.cookie = '__Host-work-routine-ready=1; Path=/; Secure; SameSite=Lax; Max-Age=31536000';
            location.assign('/');
        };
        start.hidden = false;
        start.disabled = false;
    }

    const feedback = document.getElementById('welcome-feedback');
    const status = document.getElementById('welcome-login-status');
    const retry = document.getElementById('welcome-retry');
    const params = new URLSearchParams(location.search);
    let message = '';
    if (params.get('login') === 'unavailable') {
        message = '로그인 상태를 확인하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.';
    } else if (['google', 'apple'].some(provider => params.get(provider) === 'denied')) {
        message = '로그인이 취소됐어요. 준비되면 다시 시도해 주세요.';
    } else if (['google', 'apple'].some(provider => params.get(provider) === 'error')) {
        message = '로그인을 완료하지 못했어요. 다시 시도해 주세요.';
    }
    if (status && message) {
        status.textContent = message;
        status.hidden = false;
        if (feedback) feedback.hidden = false;
    }
    if (retry && params.get('login') === 'unavailable') {
        retry.hidden = false;
        retry.addEventListener('click', () => {
            params.delete('login');
            location.assign('/' + (params.size ? '?' + params : '') + (location.hash || ''));
        });
    }

    const apple = document.getElementById('welcome-apple-login');
    if (!apple) return;
    function displayApple(available) {
        apple.hidden = !available;
        if (available) apple.removeAttribute('aria-disabled');
        else apple.setAttribute('aria-disabled', 'true');
    }
    fetch('/api/apple-account?action=status', {cache: 'no-store'})
        .then(response => response.ok ? response.json() : null)
        .then(result => displayApple(result?.configured === true))
        .catch(() => displayApple(false));
})();
