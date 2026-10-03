/* Native preview keeps local data on-device. Google OAuth stays in the system browser. */
(function () {
    'use strict';
    if (!window.Capacitor?.isNativePlatform()) return;
    const webOrigin = 'https://h-lyart-ten.vercel.app';
    const originalFetch = window.fetch.bind(window);
    window.fetch = function (input, options) {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.origin === location.origin && url.pathname === '/api/google-calendar') {
            const status = !url.searchParams.get('action') || url.searchParams.get('action') === 'status';
            return Promise.resolve(new Response(JSON.stringify(status
                ? { configured: true, connected: false, cloudConnected: false }
                : { error: 'NATIVE_PREVIEW', message: 'Google 계정 기능은 웹 버전에서 이용해 주세요.' }),
                { status: status ? 200 : 409, headers: { 'Content-Type': 'application/json' } }));
        }
        if (url.origin === location.origin && url.pathname === '/api/today-menu') {
            return window.Capacitor.Plugins.CapacitorHttp.get({ url: webOrigin + url.pathname })
                .then(result => new Response(typeof result.data === 'string' ? result.data : JSON.stringify(result.data),
                    { status: result.status, headers: { 'Content-Type': 'application/json' } }));
        }
        return originalFetch(input, options);
    };
    document.addEventListener('click', function (event) {
        const link = event.target.closest('a[href]');
        if (!link) return;
        const url = new URL(link.href, location.href);
        if (url.pathname === '/api/google-calendar') {
            event.preventDefault();
            window.Capacitor.Plugins.Browser.open({ url: webOrigin + '/#all' });
        }
    });
    document.addEventListener('DOMContentLoaded', function () {
        const notice = document.createElement('p');
        notice.textContent = '모바일 시험 버전: 달력·급여·연차는 이 앱에 저장됩니다. Google 로그인은 웹 버전에서 열리며, 앱과 웹의 저장 자료는 아직 서로 연결되지 않습니다.';
        notice.style.cssText = 'padding:12px;border-radius:10px;background:#fff7ed;color:#7c2d12;font-size:13px;line-height:1.6';
        document.getElementById('account-management-dialog')?.prepend(notice);
    });
})();
