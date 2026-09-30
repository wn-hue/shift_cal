(function (root) {
    'use strict';
    // Generic planning assumption, not a statutory rate or personal payroll data.
    const rate = 0.18;
    function estimate(gross) {
        if (!Number.isFinite(gross) || Math.abs(gross) > Number.MAX_SAFE_INTEGER) {
            throw new RangeError('총 지급액을 확인해주세요.');
        }
        gross = Math.max(0, Math.round(gross));
        const total = Math.round(gross * rate);
        return { gross, total, net: gross - total };
    }
    const api = { rate, estimate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.PayrollEstimate = api;
    if (typeof document === 'undefined') return;

    const toggle = document.getElementById('payroll-estimate-toggle');
    const panel = document.getElementById('payroll-estimate-panel');
    let currentGross = 0;
    const fmt = value => value.toLocaleString('ko-KR') + ' 원';
    function render() {
        panel.hidden = !toggle.checked;
        document.getElementById('payroll-estimate-state').textContent = toggle.checked ? 'ON' : 'OFF';
        if (!toggle.checked) return;
        const result = estimate(currentGross);
        document.getElementById('estimate-total').textContent = fmt(result.total);
        document.getElementById('estimate-net').textContent = fmt(result.net);
    }
    api.update = gross => { currentGross = gross; render(); };
    toggle.checked = false;
    toggle.addEventListener('change', render);
    render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
