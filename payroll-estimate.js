(function (root) {
    'use strict';
    const rate = 0.18, storageKey = 'shift_payroll_sms_reference_v1', bonusKey = 'shift_bonus_sms_reference_v1';
    function validProfile(p) {
        if(p?.model==='monthly-insurance')return Object.keys(p).length===6 && ['rate','taxRate','employmentRate'].every(k=>Number.isFinite(p[k])&&p[k]>=0&&p[k]<=1) && ['fixedInsurance','otherFixed'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0&&p[k]<=1000000000) && p.taxRate+p.employmentRate<=1;
        if(p && Object.keys(p).length===1 && Number.isFinite(p.rate) && p.rate>=0 && p.rate<=1)return true;
        return p && Number.isSafeInteger(p.gross) && p.gross > 0 && p.gross <= 1000000000 && Number.isSafeInteger(p.total) && p.total >= 0 && p.total <= p.gross;
    }
    function minimalProfile(p) { return validProfile(p)?p.model==='monthly-insurance'?{rate:p.rate,model:p.model,fixedInsurance:p.fixedInsurance,taxRate:p.taxRate,employmentRate:p.employmentRate,otherFixed:p.otherFixed}:{rate:p.rate ?? p.total/p.gross}:null; }
    function estimate(gross, profile = null) {
        if (!Number.isFinite(gross) || Math.abs(gross) > Number.MAX_SAFE_INTEGER) throw new RangeError('총 지급액을 확인해주세요.');
        if (profile !== null && !validProfile(profile)) throw new RangeError('공제 기준을 확인해주세요.');
        gross = Math.max(0, Math.trunc(gross));
        const p=minimalProfile(profile);
        const total = p?.model==='monthly-insurance'?Math.min(gross,gross===0?0:p.fixedInsurance+p.otherFixed+Math.trunc(gross*p.taxRate+1e-7)+(p.employmentRate===0.009?Math.trunc((gross*p.employmentRate+1e-7)/10)*10:Math.trunc(gross*p.employmentRate+1e-7))):Math.trunc(gross * (p ? p.rate : rate));
        return { gross, total, net: gross - total };
    }
    function estimatePayments(parts, profile = null, bonusProfile = null) {
        let regular = estimate(parts.regular, profile), bonus = estimate(parts.bonus, bonusProfile), support = estimate(parts.support || 0, profile);
        if(profile?.model==='monthly-insurance'){const combined=estimate(parts.regular+(parts.support||0),profile);const supportTotal=Math.max(0,combined.total-regular.gross,Math.min(combined.total,support.gross,Math.trunc(support.gross*(profile.taxRate+profile.employmentRate))));support={gross:support.gross,total:supportTotal,net:support.gross-supportTotal};regular={gross:regular.gross,total:combined.total-supportTotal,net:regular.gross-(combined.total-supportTotal)};}
        return { regular, bonus, support, gross: regular.gross + bonus.gross + support.gross,
            total: regular.total + bonus.total + support.total, net: regular.net + bonus.net + support.net };
    }
    const api = { rate, validProfile, minimalProfile, estimate, estimatePayments };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.PayrollEstimate = api;
    if (typeof document === 'undefined') return;
    const toggle = document.getElementById('payroll-estimate-toggle'), panel = document.getElementById('payroll-estimate-panel');
    const text = document.getElementById('payroll-sms-text'), bonusText = document.getElementById('payroll-bonus-sms-text');
    const status = document.getElementById('payroll-sms-status'), preview = document.getElementById('payroll-sms-preview');
    const apply = document.getElementById('payroll-sms-apply'), dialog = document.getElementById('payroll-sms-dialog');
    const manualBase=document.getElementById('wage-manual-base'), manualOrdinary=document.getElementById('wage-manual-ordinary');
    const manualStatus=document.getElementById('wage-manual-status');
    const methods=['sms','manual'];
    function selectMethod(method,focus=false) {
        for(const name of methods){
            const tab=document.getElementById('wage-'+name+'-tab'),selected=name===method;
            tab.setAttribute('aria-selected',String(selected));tab.setAttribute('tabindex',selected?'0':'-1');
            document.getElementById('wage-'+name+'-panel').hidden=!selected;
            if(selected&&focus)tab.focus();
        }
    }
    for(const [index,name] of methods.entries()){
        const tab=document.getElementById('wage-'+name+'-tab');
        tab.addEventListener('click',()=>selectMethod(name));
        tab.addEventListener('keydown',event=>{
            if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
            event.preventDefault();selectMethod(methods[event.key==='Home'?0:event.key==='End'?1:1-index],true);
        });
    }
    const smsIntro=document.querySelector('#payroll-sms-title + p'), smsLabel=document.querySelector('label[for="payroll-sms-text"]');
    const defaultIntro=smsIntro?.textContent, defaultLabel=smsLabel?.textContent;
    api.open = options => {
        const onboarding=options?.onboarding===true;
        dialog.setAttribute('data-onboarding',String(onboarding));
        if(smsIntro)smsIntro.textContent=onboarding?'기본시급과 통상시급을 확인해 주세요. 상여금 문자는 나중에 추가할 수 있어요.':defaultIntro;
        if(smsLabel)smsLabel.textContent=onboarding?'급여 문자 붙여넣기':defaultLabel;
        clearDraft();selectMethod('sms');
        for(const [input,id] of [[manualBase,'input-base-hourly'],[manualOrdinary,'input-ordinary-hourly']]){
            const value=Number(document.getElementById(id).value.replace(/[^0-9]/g,''));
            input.value=value>0?value.toLocaleString('ko-KR'):'';
        }
        dialog.showModal();
    };
    document.getElementById('payroll-sms-open').addEventListener('click', api.open);
    document.getElementById('payroll-sms-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { clearDraft();document.getElementById('payroll-sms-open')?.focus(); });
    const labels = {baseHourly:'기본시급', ordinaryHourly:'통상시급', dutyPay:'자격·직무·가족·직책 (고정수당)'};
    const fmt = value => value.toLocaleString('ko-KR') + ' 원';
    let parts = {regular:0,bonus:0,support:0}, profile = null, bonusProfile = null;
    function loadProfile(key) { try {const p=JSON.parse(localStorage.getItem(key));const minimal=minimalProfile(p);if(minimal)localStorage.setItem(key,JSON.stringify(minimal));return minimal;}catch(_){return null;} }
    profile=loadProfile(storageKey);bonusProfile=loadProfile(bonusKey);
    const basis = (name,p) => name + ': ' + (p ? p.model==='monthly-insurance'?'월 보험료 '+fmt(p.fixedInsurance)+' · 세금 문자 비율 '+(p.taxRate*100).toFixed(2)+'% · 고용 '+(p.employmentRate*100).toFixed(2)+'%'+(p.otherFixed?' · 기타 월 공제 '+fmt(p.otherFixed):''):'적용한 문자 공제율 ' + (100*minimalProfile(p).rate).toFixed(2) + '%' : '개인 기준 미등록 · 기본 공제율 18% 단순 추정');
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
            document.getElementById(prefix+'-bonus-label').textContent=(parts.support>0?'지원금':'상여금')+' ('+suffix+')';
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
    api.forParts = breakdown => estimatePayments(breakdown,profile,bonusProfile);
    api.update = (gross, breakdown) => { parts=breakdown || {regular:gross,bonus:0,support:0}; render(); };
    api.reloadReference = () => {profile=loadProfile(storageKey);bonusProfile=loadProfile(bonusKey);render();};
    toggle.checked = false; toggle.addEventListener('change', render);
    function clearDraft() { text.placeholder='기본시급: 10,320원\n통상시급: 11,000원\n자격: 0원\n직무: 0원\n가족: 0원\n직책: 0원'; text.value='';bonusText.value='';apply.disabled=true;preview.textContent='';status.textContent='';manualBase.value='';manualOrdinary.value='';manualStatus.textContent='';for(const input of [manualBase,manualOrdinary])input.setAttribute('aria-invalid','false'); }
    api.clearDraft = () => { clearDraft(); if(dialog.open)dialog.close(); };
    api.clearReference = () => {
        localStorage.removeItem(storageKey);localStorage.removeItem(bonusKey);profile=null;bonusProfile=null;api.clearDraft();render();
        document.getElementById('payroll-sms-applied').textContent='';
        if(window.AccountSync)AccountSync.changed();
    };
    function parseDraft() {
        const salary=text.value.trim()?root.PayrollSMS.parse(text.value):null;
        const bonus=bonusText.value.trim()?root.PayrollSMS.parse(bonusText.value,{kind:'bonus'}):null;
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
                lines.push('저장할 시급·수당');
                for(const [key,value] of Object.entries(salary.wages)) if(!['dutyPay'].includes(key)||value>0)lines.push(labels[key]+': '+fmt(value));
                if(salary.profile){if(salary.profile.model==='monthly-insurance')lines.push(basis('급여',salary.profile));else lines.push('지급 합계: '+fmt(salary.profile.gross),'공제 합계: '+fmt(salary.profile.total),basis('급여',salary.profile));}
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
            if(draft.salary?.profile)localStorage.setItem(storageKey,JSON.stringify(minimalProfile(draft.salary.profile)));
            if(draft.bonus)localStorage.setItem(bonusKey,JSON.stringify(minimalProfile(draft.bonus.profile)));
            if(draft.salary&&Object.keys(draft.salary.wages).length)root.applyPayrollStatement(draft.salary.wages);
        }catch(_){
            for(const [key,value] of previous)try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch(_){}
            status.textContent='저장하지 못했습니다. 브라우저 저장공간 설정을 확인해주세요.';return;
        }
        api.reloadReference();root.calculatePayrollFromInputs();
        if(window.AccountSync)AccountSync.changed();
        document.getElementById('payroll-sms-applied').textContent='설정 적용됨';clearDraft();dialog.close();
        if(typeof window.CustomEvent==='function')window.dispatchEvent(new CustomEvent('shift-payroll-applied'));
    });
    for(const input of [manualBase,manualOrdinary])input.addEventListener('input',()=>{input.setAttribute('aria-invalid','false');manualStatus.textContent='';});
    document.getElementById('wage-manual-apply').addEventListener('click',()=>{
        const wages={};manualStatus.textContent='';let firstInvalid=null;
        for(const [input,key] of [[manualBase,'baseHourly'],[manualOrdinary,'ordinaryHourly']]){
            const raw=input.value.trim(),value=Number(raw.replace(/,/g,''));
            const valid=/^(?:[0-9]+|[1-9][0-9]{0,2}(?:,[0-9]{3})+)$/.test(raw)&&Number.isSafeInteger(value)&&value>0&&value<=1000000000;
            input.setAttribute('aria-invalid',String(!valid));
            if(!valid){if(!firstInvalid){firstInvalid=input;manualStatus.textContent=labels[key]+'을 1원 이상 10억 원 이하의 정수로 입력해 주세요.';}}
            else wages[key]=value;
        }
        if(firstInvalid){firstInvalid.focus();return;}
        try{root.applyPayrollStatement(wages);}
        catch(_){manualStatus.textContent='저장하지 못했습니다. 브라우저 저장공간 설정을 확인해주세요.';return;}
        document.getElementById('payroll-sms-applied').textContent='설정 적용됨';
        dialog.close();
        if(typeof window.CustomEvent==='function')window.dispatchEvent(new CustomEvent('shift-payroll-applied',{detail:{method:'manual'}}));
    });
    document.getElementById('payroll-sms-clear').addEventListener('click',clearDraft);
    render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
