(() => {
    'use strict';
    const button = document.getElementById('start-app');
    if (localStorage.getItem('shift_salary_config_master')) button.textContent = '내 근무표 열기';
    button.onclick = () => {
        localStorage.setItem('shift_origin_ready_v1', '1');
        document.cookie = '__Host-work-routine-ready=1; Path=/; Secure; SameSite=Lax; Max-Age=31536000';
        location.assign('/');
    };
    button.disabled = false;
    // Optional account setup must never hold up starting without an account.
    const apple = document.getElementById('welcome-apple-login');
    if (apple) {
        fetch('/api/apple-account?action=status', {cache: 'no-store'})
            .then(response => response.ok ? response.json() : null)
            .then(status => { apple.hidden = status?.configured !== true; })
            .catch(() => { apple.hidden = true; });
    }
})();
