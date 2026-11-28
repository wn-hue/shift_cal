(async function () {
    'use strict';

    const byId = id => document.getElementById(id);
    const transfer = byId('transfer');
    const start = byId('start');
    const select = byId('source-select');
    const status = message => { byId('status').textContent = message; };

    // A cached copy of the previous HTML can still contain file controls.
    byId('file-area')?.remove();
    byId('source-file')?.remove();

    const response = await fetch('/origin-migration-config.json', { cache: 'no-store' });
    if (!response.ok) throw Error('migration configuration unavailable');
    const config = await response.json();
    const trusted = [config.source, config.target, ...(config.previous || [])];
    if (!trusted.includes(location.origin)) {
        status('공식 웹 주소에서 기록 가져오기를 다시 열어 주세요.');
        return;
    }

    const params = new URLSearchParams(location.hash.slice(1));
    const sourcePage = location.origin === config.source || params.has('challenge');
    const oldAccount = byId('cloud-old-account');
    oldAccount.href = config.source + '/';
    oldAccount.hidden = location.origin === config.source;

    function toHex(bytes) {
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async function requestTicket(action, body) {
        const response = await fetch('/api/origin-transfer?action=' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            credentials: 'same-origin'
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.message || '기록을 연결하지 못했어요. 다시 시도해 주세요.');
        return result;
    }

    function markLegacyReady() {
        if (location.origin === config.target) return;
        localStorage.setItem('shift_origin_ready_v1', '1');
        document.cookie = '__Host-work-routine-ready=1; Path=/; Secure; SameSite=Lax; Max-Age=31536000';
    }

    if (sourcePage) {
        const challenge = params.get('challenge');
        const state = params.get('state');
        const target = params.get('target') || config.target;
        history.replaceState(null, '', location.pathname);
        if (!trusted.includes(target)) {
            status('공식 웹 주소에서 다시 열어 주세요.');
            return;
        }

        byId('title').textContent = '이전 기기의 기록 복사';
        byId('description').textContent = '이 브라우저에 저장한 근무표와 메모를 새 주소로 복사해요.';
        start.hidden = true;
        byId('source-select-area').hidden = true;
        byId('google-transfer').hidden = true;

        const validCode = /^[a-f0-9]{64}$/;
        if (!window.opener || !validCode.test(challenge || '') || !validCode.test(state || '')) {
            byId('device-transfer-steps').textContent = '새 주소에서 기록 가져오기를 열면 이 브라우저의 기록을 복사할 수 있어요.';
            byId('device-transfer-note').hidden = true;
            transfer.textContent = '새 주소에서 기록 가져오기';
            transfer.disabled = false;
            transfer.onclick = () => location.assign(config.target + '/origin-transfer');
            return;
        }

        transfer.textContent = '복사하기';
        byId('device-transfer-steps').textContent = '복사하기를 누른 뒤 새 주소로 돌아가세요.';
        byId('device-transfer-note').textContent = '이 브라우저의 기록은 그대로 남아요.';
        transfer.disabled = false;
        transfer.onclick = async () => {
            transfer.disabled = true;
            try {
                const data = OriginDataCore.snapshot(localStorage);
                const { ticket } = await requestTicket('issue', { challenge, state, target });
                window.opener.postMessage({ type: 'work-routine-transfer', state, data, ticket }, target);
                status('복사를 요청했어요. 새 주소에서 결과를 확인하세요.');
            } catch {
                transfer.disabled = false;
                status('기록을 보내지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.');
            }
        };
        return;
    }

    const options = (config.sources || [config.source]).filter(origin => origin !== location.origin);
    for (const origin of options) {
        const option = document.createElement('option');
        option.value = origin;
        option.textContent = new URL(origin).host;
        select.append(option);
    }
    select.disabled = false;
    byId('source-select-area').hidden = options.length < 2;

    const primary = location.origin === config.target;
    start.textContent = primary ? '로그인 화면으로 돌아가기' :
        localStorage.getItem('shift_salary_config_master') ? '저장된 데이터로 앱 열기' : '처음 시작하기';
    start.disabled = false;
    start.onclick = () => {
        markLegacyReady();
        location.replace(primary ? '/#login' : '/');
    };

    let pending = null;
    transfer.disabled = options.length === 0;
    transfer.onclick = async () => {
        const sourceOrigin = select.value;
        if (!options.includes(sourceOrigin)) {
            status('이전에 사용한 주소를 선택해 주세요.');
            return;
        }
        const popup = window.open('about:blank', 'work-routine-transfer', 'popup,width=430,height=760');
        if (!popup) {
            status('팝업을 허용한 뒤 다시 눌러 주세요.');
            return;
        }
        transfer.disabled = true;
        pending = null;
        try {
            const verifier = toHex(crypto.getRandomValues(new Uint8Array(32)));
            const state = toHex(crypto.getRandomValues(new Uint8Array(32)));
            const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
            const challenge = toHex(new Uint8Array(hash));
            pending = { verifier, state, popup, sourceOrigin, expires: Date.now() + 300000 };
            popup.location = sourceOrigin + '/origin-transfer.html#' +
                new URLSearchParams({ challenge, state, target: location.origin });
            status('열린 이전 화면에서 ‘복사하기’를 눌러 주세요.');
        } catch {
            pending = null;
            popup.close();
            status('이전 주소를 열지 못했어요. 다시 시도해 주세요.');
        } finally {
            transfer.disabled = false;
        }
    };

    window.addEventListener('message', async event => {
        if (!pending || event.origin !== pending.sourceOrigin || event.source !== pending.popup ||
            event.data?.type !== 'work-routine-transfer' || event.data.state !== pending.state) return;
        const request = pending;
        pending = null;
        if (Date.now() > request.expires) {
            status('복사 시간이 지났어요. 이 기기의 기록 가져오기를 다시 눌러 주세요.');
            return;
        }

        const data = event.data.data;
        transfer.disabled = true;
        try {
            OriginDataCore.validate(data);
            // Older senders include their local onboarding flag even when there are no user records.
            delete data.values.shift_origin_ready_v1;
            await requestTicket('exchange', {
                ticket: event.data.ticket, state: request.state, verifier: request.verifier, target: location.origin
            });
            if (primary) {
                try { localStorage.setItem('work-routine-web-session-changed', String(Date.now())); } catch {}
            }
            const copied = OriginDataCore.restore(localStorage, data, false);
            markLegacyReady();
            if (!Object.keys(data.values).length) {
                status('이전 브라우저에서 복사할 기록을 찾지 못했어요. 전에 사용한 기기와 브라우저인지 확인해 주세요.');
            } else if (copied === 0) {
                status('복사할 항목이 모두 새 주소에 있어요. 기존 기록을 유지했어요.');
            } else {
                status(copied + '개 항목을 이 기기로 복사했어요.');
            }
            start.textContent = '내 근무표 열기';
            start.onclick = () => location.replace('/?cloud=connect#login');
            start.scrollIntoView({ block: 'nearest' });
        } catch {
            status('복사를 마치지 못했어요. 브라우저 연결과 저장 공간을 확인한 뒤 기록 가져오기를 다시 눌러 주세요.');
        } finally {
            transfer.disabled = false;
        }
    });
})().catch(() => {
    document.getElementById('status').textContent = '기록 가져오기를 준비하지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
    const retry = document.getElementById('retry-transfer');
    if (retry) {
        retry.hidden = false;
        retry.onclick = () => location.reload();
    }
    if (location.origin === 'https://20261104.xyz') {
        const start = document.getElementById('start');
        start.disabled = false;
        start.textContent = '로그인 화면으로 돌아가기';
        start.onclick = () => location.replace('/#login');
    }
});
