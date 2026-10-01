(function (root) {
    'use strict';
    const rate = 0.18, storageKey = 'shift_payroll_sms_reference_v1';
    function validProfile(p) {
        return p && Number.isSafeInteger(p.gross) && p.gross > 0 && Number.isSafeInteger(p.total) && p.total >= 0 && p.total <= p.gross;
    }
    function estimate(gross, profile = null) {
        if (!Number.isFinite(gross) || Math.abs(gross) > Number.MAX_SAFE_INTEGER) throw new RangeError('총 지급액을 확인해주세요.');
        if (profile !== null && !validProfile(profile)) throw new RangeError('공제 기준을 확인해주세요.');
        gross = Math.max(0, Math.round(gross));
        const total = Math.round(gross * (profile ? profile.total / profile.gross : rate));
        return { gross, total, net: gross - total };
    }
    const api = { rate, validProfile, estimate };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.PayrollEstimate = api;
    if (typeof document === 'undefined') return;
    const toggle = document.getElementById('payroll-estimate-toggle'), panel = document.getElementById('payroll-estimate-panel');
    const text = document.getElementById('payroll-sms-text'), status = document.getElementById('payroll-sms-status');
    const preview = document.getElementById('payroll-sms-preview'), apply = document.getElementById('payroll-sms-apply');
    const dialog = document.getElementById('payroll-sms-dialog');
    const openButton = document.getElementById('payroll-sms-open');
    api.open = () => { dialog.showModal(); text.focus(); };
    openButton.addEventListener('click', api.open);
    document.getElementById('payroll-sms-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { clearDraft();openButton.focus(); });
    const labels = {baseHourly:'기본시급', ordinaryHourly:'통상시급', dutyPay:'직책수당', seniorityPay:'근속수당'};
    let currentGross = 0, profile = null, parsed = null;
    try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (validProfile(saved)) profile = saved; } catch (_) {}
    const fmt = value => value.toLocaleString('ko-KR') + ' 원';
    function render() {
        panel.hidden = !toggle.checked;
        document.getElementById('payroll-estimate-state').textContent = toggle.checked ? 'ON' : 'OFF';
        document.getElementById('payroll-estimate-basis').textContent = profile
            ? '적용한 명세서의 공제 비율 ' + (100 * profile.total / profile.gross).toFixed(2) + '%로 추정합니다.'
            : '명세서 적용 전에는 기본 예상 공제율 18%를 사용합니다.';
        const result = estimate(currentGross, profile);
        const amount = toggle.checked ? result.net : result.gross;
        document.getElementById('hero-pay-label').textContent = toggle.checked ? '총 지급액 (세후 추정)' : '총 지급액 (세전 합계)';
        document.getElementById('hero-gross-pay').innerText = fmt(amount);
        document.getElementById('row-pay-label').textContent = toggle.checked ? '차감지급 ⓐ−ⓑ (세후 추정)' : '소계 ⓐ (세전)';
        document.getElementById('tr-payment-subtotal').hidden = !toggle.checked;
        document.getElementById('row-payment-subtotal').innerText = result.gross.toLocaleString('ko-KR');
        document.getElementById('payroll-details-label').textContent = toggle.checked ? '지급 상세 내역 (공제 적용)' : '지급 상세 내역 (세전)';
        document.getElementById('row-gross-pay').innerText = amount.toLocaleString('ko-KR');
        document.getElementById('tr-estimated-deduction').hidden = !toggle.checked;
        document.getElementById('row-estimated-deduction').innerText = '−' + result.total.toLocaleString('ko-KR');
        document.getElementById('payslip-modal-pay-label').textContent = toggle.checked ? '총 지급액 (세후 추정)' : '예상 총 지급액 (세전)';
        document.getElementById('payslip-modal-gross').innerText = fmt(amount);
        if (!toggle.checked) return;
        document.getElementById('estimate-total').textContent = fmt(result.total);
        document.getElementById('estimate-net').textContent = fmt(result.net);
    }
    api.update = gross => { currentGross = gross; render(); };
    api.reloadReference = () => {
        profile = null;
        try { const saved=JSON.parse(localStorage.getItem(storageKey));if(validProfile(saved))profile=saved; } catch (_) {}
        render();
    };
    toggle.checked = false; toggle.addEventListener('change', render);
    function clearPreview() { parsed = null; apply.hidden = true; preview.textContent = ''; }
    function clearDraft() { text.value='';clearPreview();status.textContent=''; }
    api.clearDraft = () => { clearDraft(); if(dialog.open)dialog.close(); };
    api.clearReference = () => {
        localStorage.removeItem(storageKey);profile=null;api.clearDraft();render();
        document.getElementById('payroll-sms-applied').textContent='';
        if(window.AccountSync)AccountSync.changed();
    };
    text.addEventListener('input', () => { clearPreview(); status.textContent = ''; });
    document.getElementById('payroll-sms-read').addEventListener('click', () => {
        clearPreview();
        try {
            parsed = root.PayrollSMS.parse(text.value);
            const lines = Object.entries(parsed.wages).map(([key, value]) => labels[key] + ': ' + fmt(value));
            const deductionLabels = {income:'근로소득세',local:'지방소득세',pension:'연금',health:'건강보험',employment:'고용보험',care:'장기요양보험'};
            for (const [key, value] of Object.entries(parsed.deductions)) lines.push(deductionLabels[key] + ': ' + fmt(value));
            if (parsed.profile) lines.push('기준 총 지급액: ' + fmt(parsed.profile.gross), '기준 공제 합계: ' + fmt(parsed.profile.total),
                '예상 공제율: ' + (100 * parsed.profile.total / parsed.profile.gross).toFixed(2) + '%');
            preview.textContent = lines.join('\n');
            status.textContent = parsed.warnings.join(' ') || '인식한 금액을 확인하고 적용해주세요.';
            apply.hidden = false;
        } catch (error) { status.textContent = error.message; }
    });
    apply.addEventListener('click', () => {
        if (!parsed) return;
        try {
            if (Object.keys(parsed.wages).length) root.applyPayrollStatement(parsed.wages);
            if (parsed.profile) { profile = parsed.profile; try { localStorage.setItem(storageKey, JSON.stringify(profile)); } catch (_) {} }
            if(window.AccountSync)AccountSync.changed();
            render(); root.calculatePayrollFromInputs();
            text.value = ''; clearPreview();
            status.textContent = '';
            document.getElementById('payroll-sms-applied').textContent = '설정 적용됨';
            dialog.close();
        } catch (_) { status.textContent = '저장하지 못했습니다. 브라우저 저장공간 설정을 확인해주세요.'; }
    });
    document.getElementById('payroll-sms-clear').addEventListener('click', () => { text.value = ''; clearPreview(); status.textContent = ''; });
    render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
