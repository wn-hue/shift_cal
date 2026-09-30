(function (root) {
    'use strict';
    const defaults = Object.freeze({ gross: 0, income: 0, local: 0, pension: 0, health: 0, employment: 0 });
    const labels = { gross: '기준 명세서 총 지급액', income: '근로소득세', local: '지방소득세', pension: '연금', health: '건강보험', employment: '고용보험' };
    const keys = Object.keys(labels).filter(key => key !== 'gross');
    function validProfile(profile) {
        return profile && Object.keys(labels).every(key => Number.isSafeInteger(profile[key]) && profile[key] >= 0)
            && profile.gross > 0 && keys.reduce((sum, key) => sum + profile[key], 0) <= profile.gross;
    }
    function estimate(gross, profile = defaults) {
        if (!Number.isFinite(gross) || !validProfile(profile)) throw new RangeError('급여와 기준 공제액을 확인해주세요.');
        gross = Math.max(0, Math.round(gross));
        const items = Object.fromEntries(keys.map(key => [key, Math.round(gross * profile[key] / profile.gross)]));
        const total = keys.reduce((sum, key) => sum + items[key], 0);
        return { gross, items, total, net: gross - total };
    }
    const api = { defaults, validProfile, estimate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.PayrollEstimate = api;
    if (typeof document === 'undefined') return;

    const storageKey = 'shift_payroll_estimate_reference_v1';
    const toggle = document.getElementById('payroll-estimate-toggle');
    const panel = document.getElementById('payroll-estimate-panel');
    const fields = document.getElementById('payroll-estimate-fields');
    let profile = { ...defaults };
    let currentGross = 0;
    try {
        const saved = JSON.parse(localStorage.getItem(storageKey));
        if (validProfile(saved)) profile = saved;
    } catch (_) { /* Defaults also work when storage is unavailable. */ }
    fields.innerHTML = Object.entries(labels).map(([key, label]) =>
        `<label class="estimate-field">${label} (원)<input type="number" data-estimate-key="${key}" min="${key === 'gross' ? 1 : 0}" step="1" inputmode="numeric" value="${profile.gross ? profile[key] : ''}"></label>`
    ).join('');
    const inputs = Array.from(fields.querySelectorAll('input'));
    if (!validProfile(profile)) document.getElementById('payroll-estimate-settings').open = true;
    document.getElementById('payroll-estimate-import').addEventListener('change', async event => {
        const file = event.target.files[0];
        if (!file) return;
        const status = document.getElementById('payroll-estimate-import-status');
        try {
            if (file.size > 16384) throw new Error('too large');
            const imported = JSON.parse(await file.text());
            if (!validProfile(imported)) throw new Error('invalid profile');
            inputs.forEach(input => { input.value = imported[input.dataset.estimateKey]; });
            profile = imported;
            try { localStorage.setItem(storageKey, JSON.stringify(profile)); } catch (_) { /* Session still works. */ }
            status.textContent = '공제 추정 기준을 불러왔습니다.';
            render();
        } catch (_) {
            status.textContent = '기준 파일을 확인해주세요. 올바른 지급액·공제액이 담긴 JSON 파일이 필요합니다.';
        }
        event.target.value = '';
    });
    const fmt = value => value.toLocaleString('ko-KR') + ' 원';
    function render() {
        const enabled = toggle.checked;
        panel.hidden = !enabled;
        document.getElementById('payroll-estimate-state').textContent = enabled ? 'ON' : 'OFF';
        if (!enabled) return;
        const candidate = Object.fromEntries(inputs.map(input => [input.dataset.estimateKey, input.value === '' ? NaN : Number(input.value)]));
        const valid = validProfile(candidate);
        document.getElementById('payroll-estimate-error').hidden = valid;
        document.getElementById('payroll-estimate-results').hidden = !valid;
        if (!valid) return;
        profile = candidate;
        const result = estimate(currentGross, profile);
        keys.forEach(key => { document.getElementById('estimate-' + key).textContent = fmt(result.items[key]); });
        document.getElementById('estimate-total').textContent = fmt(result.total);
        document.getElementById('estimate-net').textContent = fmt(result.net);
    }
    api.update = gross => { currentGross = gross; render(); };
    toggle.checked = false; // Every page load starts OFF; only the reference amounts persist.
    toggle.addEventListener('change', render);
    fields.addEventListener('input', () => {
        render();
        const candidate = Object.fromEntries(inputs.map(input => [input.dataset.estimateKey, input.value === '' ? NaN : Number(input.value)]));
        if (validProfile(candidate)) {
            try { localStorage.setItem(storageKey, JSON.stringify(candidate)); } catch (_) { /* Session still works. */ }
        }
    });
    document.getElementById('payroll-estimate-reset').addEventListener('click', () => {
        inputs.forEach(input => { input.value = ''; });
        profile = { ...defaults };
        try { localStorage.removeItem(storageKey); } catch (_) { /* Session still resets. */ }
        document.getElementById('payroll-estimate-import-status').textContent = '공제 추정 기준을 초기화했습니다.';
        render();
    });
    render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
