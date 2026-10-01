(function (root) {
    'use strict';
    const rate = 0.18, storageKey = 'shift_payroll_sms_reference_v1', bonusKey = 'shift_bonus_sms_reference_v1';
    function validProfile(p) {
        return p && Number.isSafeInteger(p.gross) && p.gross > 0 && p.gross <= 1000000000 && Number.isSafeInteger(p.total) && p.total >= 0 && p.total <= p.gross;
    }
    function estimate(gross, profile = null) {
        if (!Number.isFinite(gross) || Math.abs(gross) > Number.MAX_SAFE_INTEGER) throw new RangeError('총 지급액을 확인해주세요.');
        if (profile !== null && !validProfile(profile)) throw new RangeError('공제 기준을 확인해주세요.');
        gross = Math.max(0, Math.round(gross));
        const total = Math.round(gross * (profile ? profile.total / profile.gross : rate));
        return { gross, total, net: gross - total };
    }
    function estimatePayments(parts, profile = null, bonusProfile = null) {
        const regular = estimate(parts.regular, profile), bonus = estimate(parts.bonus, bonusProfile), support = estimate(parts.support || 0, profile);
        return { regular, bonus, support, gross: regular.gross + bonus.gross + support.gross,
            total: regular.total + bonus.total + support.total, net: regular.net + bonus.net + support.net };
    }
    const api = { rate, validProfile, estimate, estimatePayments };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.PayrollEstimate = api;
    if (typeof document === 'undefined') return;
    const toggle = document.getElementById('payroll-estimate-toggle'), panel = document.getElementById('payroll-estimate-panel');
    const text = document.getElementById('payroll-sms-text'), bonusText = document.getElementById('payroll-bonus-sms-text');
    const status = document.getElementById('payroll-sms-status'), preview = document.getElementById('payroll-sms-preview');
    const apply = document.getElementById('payroll-sms-apply'), dialog = document.getElementById('payroll-sms-dialog');
    api.open = () => { const menu=document.getElementById('account-management-dialog');if(menu?.open)menu.close();dialog.showModal(); text.focus(); };
    document.getElementById('payroll-sms-open').addEventListener('click', api.open);
    document.getElementById('payroll-sms-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { clearDraft();document.getElementById('account-menu-button')?.focus(); });
    const labels = {baseHourly:'기본시급', ordinaryHourly:'통상시급', dutyPay:'직책수당', seniorityPay:'근속수당'};
    const fmt = value => value.toLocaleString('ko-KR') + ' 원';
    let parts = {regular:0,bonus:0,support:0}, profile = null, bonusProfile = null;
    function loadProfile(key) { try {const p=JSON.parse(localStorage.getItem(key));return validProfile(p)?p:null;}catch(_){return null;} }
    profile=loadProfile(storageKey);bonusProfile=loadProfile(bonusKey);
    const basis = (name,p) => name + ': ' + (p ? '적용한 문자 공제율 ' + (100*p.total/p.gross).toFixed(2) + '%' : '기본 예상 공제율 18% (문자 기준 없음)');
    function render() {
        panel.hidden = !toggle.checked;
        document.getElementById('payroll-estimate-state').textContent = toggle.checked ? 'ON' : 'OFF';
        document.getElementById('payroll-estimate-basis').textContent = basis('급여',profile) + ' · ' + basis('상여',bonusProfile);
        const result = estimatePayments(parts,profile,bonusProfile), suffix = toggle.checked ? '세후 추정' : '세전';
        const amount = toggle.checked ? result.net : result.gross;
        document.getElementById('hero-pay-label').textContent = toggle.checked ? '총 지급액 (세후 추정)' : '총 지급액 (세전 합계)';
        document.getElementById('hero-gross-pay').innerText = fmt(amount);
        for(const prefix of ['hero','payslip-modal']) {
            document.getElementById(prefix+'-regular-label').textContent='월 급여 ('+suffix+')';
            document.getElementById(prefix+'-bonus-label').textContent='상여금 / 지원금 ('+suffix+')';
            document.getElementById(prefix+(prefix==='hero'?'-regular-pay':'-regular')).innerText=fmt(toggle.checked?result.regular.net:result.regular.gross);
            document.getElementById(prefix+(prefix==='hero'?'-bonus-pay':'-bonus')).innerText=fmt(toggle.checked?result.bonus.net+result.support.net:result.bonus.gross+result.support.gross);
        }
        document.getElementById('row-pay-label').textContent = toggle.checked ? '차감지급 ⓐ−ⓑ (세후 추정)' : '소계 ⓐ (세전)';
        document.getElementById('tr-payment-subtotal').hidden = !toggle.checked;
        document.getElementById('row-payment-subtotal').innerText = result.gross.toLocaleString('ko-KR');
        document.getElementById('payroll-details-label').textContent = toggle.checked ? '지급 상세 내역 (공제 적용)' : '지급 상세 내역 (세전)';
        document.getElementById('row-gross-pay').innerText = amount.toLocaleString('ko-KR');
        document.getElementById('tr-estimated-deduction').hidden = !toggle.checked;
        document.getElementById('row-estimated-deduction').innerText = '−' + result.total.toLocaleString('ko-KR');
        document.getElementById('payslip-modal-pay-label').textContent = toggle.checked ? '총 지급액 (세후 추정)' : '예상 총 지급액 (세전)';
        document.getElementById('payslip-modal-gross').innerText = fmt(amount);
        document.getElementById('estimate-regular-deduction').textContent = fmt(result.regular.total+result.support.total);
        document.getElementById('estimate-bonus-row').hidden=!(result.bonus.gross>0);
        document.getElementById('estimate-bonus-deduction').textContent=fmt(result.bonus.total);
        document.getElementById('estimate-total').textContent = fmt(result.total);
        document.getElementById('estimate-net').textContent = fmt(result.net);
    }
    api.update = (gross, breakdown) => { parts=breakdown || {regular:gross,bonus:0,support:0}; render(); };
    api.reloadReference = () => {profile=loadProfile(storageKey);bonusProfile=loadProfile(bonusKey);render();};
    toggle.checked = false; toggle.addEventListener('change', render);
    function clearDraft() { text.value='';bonusText.value='';apply.disabled=true;preview.textContent='';status.textContent=''; }
    api.clearDraft = () => { clearDraft(); if(dialog.open)dialog.close(); };
    api.clearReference = () => {
        localStorage.removeItem(storageKey);localStorage.removeItem(bonusKey);profile=null;bonusProfile=null;api.clearDraft();render();
        document.getElementById('payroll-sms-applied').textContent='';
        if(window.AccountSync)AccountSync.changed();
    };
    function parseDraft() {
        const salary=text.value.trim()?root.PayrollSMS.parse(text.value):null;
        const bonus=bonusText.value.trim()?root.PayrollSMS.parse(bonusText.value):null;
        if(!salary&&!bonus)throw new Error('급여 또는 상여 문자를 붙여넣어 주세요.');
        if(salary?.profile&&!validProfile(salary.profile))throw new Error('급여 지급·공제 합계를 확인해 주세요.');
        if(bonus?.profile&&!validProfile(bonus.profile))throw new Error('상여 지급·공제 합계를 확인해 주세요.');
        if(bonus&&!bonus.profile)throw new Error('상여 문자에는 올바른 지급 합계와 공제 합계가 필요합니다.');
        return {salary,bonus};
    }
    function refreshPreview() {
        preview.textContent='';status.textContent='';apply.disabled=true;
        if(!text.value.trim()&&!bonusText.value.trim())return;
        try {
            const {salary,bonus}=parseDraft(),lines=[];
            if(salary) {
                lines.push('급여 설정');
                for(const [key,value] of Object.entries(salary.wages)) if(!['dutyPay','seniorityPay'].includes(key)||value>0)lines.push(labels[key]+': '+fmt(value));
                if(salary.profile)lines.push('지급 합계: '+fmt(salary.profile.gross),'공제 합계: '+fmt(salary.profile.total),basis('급여',salary.profile));
                status.textContent=salary.warnings.join(' ');
            }
            if(bonus)lines.push('\n상여 공제 기준','지급 합계: '+fmt(bonus.profile.gross),'공제 합계: '+fmt(bonus.profile.total),basis('상여',bonus.profile));
            preview.textContent=lines.join('\n');apply.disabled=false;
        }catch(error){status.textContent=error.message;}
    }
    text.addEventListener('input',refreshPreview);bonusText.addEventListener('input',refreshPreview);
    apply.addEventListener('click', () => {
        let draft;
        try{draft=parseDraft();}catch(error){status.textContent=error.message;return;}
        const previous=[storageKey,bonusKey].map(key=>[key,localStorage.getItem(key)]);
        try {
            if(draft.salary?.profile)localStorage.setItem(storageKey,JSON.stringify(draft.salary.profile));
            if(draft.bonus)localStorage.setItem(bonusKey,JSON.stringify(draft.bonus.profile));
            if(draft.salary&&Object.keys(draft.salary.wages).length)root.applyPayrollStatement(draft.salary.wages);
        }catch(_){
            for(const [key,value] of previous)try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch(_){}
            status.textContent='저장하지 못했습니다. 브라우저 저장공간 설정을 확인해주세요.';return;
        }
        api.reloadReference();root.calculatePayrollFromInputs();
        if(window.AccountSync)AccountSync.changed();
        document.getElementById('payroll-sms-applied').textContent='설정 적용됨';dialog.close();
    });
    document.getElementById('payroll-sms-clear').addEventListener('click',clearDraft);
    render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
