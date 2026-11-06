(function (root) {
    'use strict';
    // Default effective deduction ratio from an anonymized regular-pay reference.
    // Includes tax and insurance; personal imported profiles always take precedence.
    const rate = 1045860 / 5781870, storageKey = 'shift_payroll_sms_reference_v1', bonusKey = 'shift_bonus_sms_reference_v1';
    // Anonymized reference statement: total deductions / total payments, including other pay.
    // This is an effective estimate (income/local tax and employment insurance), not a statutory tax rate.
    const bonusRate = 29570 / 1224725;
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
        const total = p?.model==='monthly-insurance'?Math.min(gross,gross===0?0:p.fixedInsurance+p.otherFixed+Math.trunc(gross*p.taxRate+1e-7)+(p.employmentRate===0.009?Math.trunc((gross*p.employmentRate+1e-7)/10)*10:Math.trunc(gross*p.employmentRate+1e-7))):Math.trunc(gross * (p ? p.rate : rate) + 1e-7);
        return { gross, total, net: gross - total };
    }
    function estimatePayments(parts, profile = null, bonusProfile = null) {
        let regular = estimate(parts.regular, profile), bonus = estimate(parts.bonus, bonusProfile ?? {rate:bonusRate}), support = estimate(parts.support || 0, profile);
        if(profile?.model==='monthly-insurance'){const combined=estimate(parts.regular+(parts.support||0),profile);const supportTotal=Math.max(0,combined.total-regular.gross,Math.min(combined.total,support.gross,Math.trunc(support.gross*(profile.taxRate+profile.employmentRate))));support={gross:support.gross,total:supportTotal,net:support.gross-supportTotal};regular={gross:regular.gross,total:combined.total-supportTotal,net:regular.gross-(combined.total-supportTotal)};}
        return { regular, bonus, support, gross: regular.gross + bonus.gross + support.gross,
            total: regular.total + bonus.total + support.total, net: regular.net + bonus.net + support.net };
    }
    const api = { rate, bonusRate, validProfile, minimalProfile, estimate, estimatePayments };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.PayrollEstimate = api;
    if (typeof document === 'undefined') return;
    const toggle = document.getElementById('payroll-estimate-toggle'), panel = document.getElementById('payroll-estimate-panel');
    const text = document.getElementById('payroll-sms-text'), bonusText = document.getElementById('payroll-bonus-sms-text');
    const status = document.getElementById('payroll-sms-status'), preview = document.getElementById('payroll-sms-preview');
    const apply = document.getElementById('payroll-sms-apply'), dialog = document.getElementById('payroll-sms-dialog');
    const manualBase=document.getElementById('wage-manual-base'), manualOrdinary=document.getElementById('wage-manual-ordinary');
    const manualStatus=document.getElementById('wage-manual-status');
    const fmt = value => value.toLocaleString('ko-KR') + ' 원';
    let parts = {regular:0,bonus:0,support:0}, profile = null, bonusProfile = null;
    function loadProfile(key) { try {const p=JSON.parse(localStorage.getItem(key));const minimal=minimalProfile(p);if(minimal)localStorage.setItem(key,JSON.stringify(minimal));return minimal;}catch(_){return null;} }
    profile=loadProfile(storageKey);bonusProfile=loadProfile(bonusKey);
    const basis = (name,p) => name + ': ' + (p ? p.model==='monthly-insurance'?'월 보험료 '+fmt(p.fixedInsurance)+' · 세금 문자 비율 '+(p.taxRate*100).toFixed(2)+'% · 고용 '+(p.employmentRate*100).toFixed(2)+'%'+(p.otherFixed?' · 기타 월 공제 '+fmt(p.otherFixed):''):'적용한 문자 공제율 ' + (100*minimalProfile(p).rate).toFixed(2) + '%' : name==='상여'?'개인 기준 미등록 · 기준 명세서 공제율 '+(bonusRate*100).toFixed(2)+'% 추정 (소득세·지방소득세·고용보험 포함)':'개인 기준 미등록 · 기준 명세서 공제율 '+(rate*100).toFixed(2)+'% 추정 (세금·보험료 포함)');
    function render() {
        panel.hidden = !toggle.checked;
        updateTaxSummary();
        document.getElementById('payroll-estimate-state').textContent = toggle.checked ? 'ON' : 'OFF';
        document.getElementById('payroll-estimate-basis').textContent = basis('급여',profile) + ' · ' + basis('상여',bonusProfile);
        const result = estimatePayments(parts,profile,bonusProfile), suffix = toggle.checked ? '세후 추정' : '세전';
        const amount = toggle.checked ? result.net : result.gross;
        document.getElementById('hero-pay-label').textContent = toggle.checked ? '이번 달 예상 실수령액' : '이번 달 예상 급여';
        document.getElementById('hero-pay-basis').textContent = suffix;
        document.getElementById('payroll-estimate-action-label').textContent = toggle.checked ? '세전 급여로 보기' : '예상 실수령액 보기';
        document.getElementById('payroll-bonus-amount').textContent = (toggle.checked ? result.bonus.net : result.bonus.gross).toLocaleString('ko-KR') + '원';
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
    const allowanceKeys=['qualification','job','family','duty','legacy'];
    const allowanceLabels={qualification:'자격수당',job:'직무수당',family:'가족수당',duty:'직책수당',legacy:'기타 고정수당'};
    const el=id=>document.getElementById(id), amountInputs=[manualBase,manualOrdinary,el('wage-seniority'),...allowanceKeys.map(k=>el('wage-'+k))];
    let draftSalary=null,draftBonus=null,seniorityOverride=false,automaticSeniority=0,onboardingMode=false;
    const money=n=>n.toLocaleString('ko-KR');
    function clearDraft(){
        if(typeof root.CustomEvent==='function')dialog.dispatchEvent(new CustomEvent('wage-draft-reset'));
        text.value='';bonusText.value='';draftSalary=draftBonus=null;seniorityOverride=false;
        updateTaxSummary();
        for(const input of amountInputs){input.value='';input.setAttribute('aria-invalid','false');input.classList.remove('wage-filled');}
        for(const id of ['wage-tax-import','wage-paste-fallback','wage-bonus-input','wage-import-help','wage-import-review'])el(id).open=false;
        el('wage-import-review').hidden=true;el('wage-legacy-row').hidden=true;
        el('payroll-sms-recognized').hidden=true;el('payroll-sms-recognized').textContent='';el('wage-bonus-status').textContent='';
        el('wage-import-info').setAttribute('aria-expanded','false');preview.textContent='';status.textContent='';manualStatus.textContent='';apply.disabled=false;
    }
    api.open=options=>{
        clearDraft();onboardingMode=options?.onboarding===true;dialog.setAttribute('data-onboarding',String(onboardingMode));
        for(const [input,id] of [[manualBase,'input-base-hourly'],[manualOrdinary,'input-ordinary-hourly']]){const n=Number(el(id).value.replace(/[^0-9]/g,''));input.value=options?.onboarding&&n===0?'':money(n);}
        let current={};try{current=JSON.parse(localStorage.getItem('shift_salary_config_master'))||{};}catch{}
        const payDate=typeof currentPayDate==='undefined'?new Date():currentPayDate;
        automaticSeniority=root.ShiftPlannerCore?.seniorityPay((current.hireDate||'').slice(0,7),`${payDate.getFullYear()}-${String(payDate.getMonth()+1).padStart(2,'0')}-15`)||0;
        seniorityOverride=Number.isSafeInteger(current.seniorityPayOverride)&&current.seniorityPayOverride>=0;
        el('wage-seniority').value=money(seniorityOverride?current.seniorityPayOverride:automaticSeniority);senioritySource();
        const savedParts=current.fixedAllowances,valid=savedParts&&allowanceKeys.every(k=>Number.isSafeInteger(savedParts[k])&&savedParts[k]>=0)&&Object.values(savedParts).reduce((a,b)=>a+b,0)===current.dutyPay;
        for(const key of allowanceKeys)el('wage-'+key).value=money(valid?savedParts[key]:key==='legacy'?current.dutyPay||0:0);
        el('wage-legacy-row').hidden=false;
        root.OnboardingWage?.prepare(options);dialog.showModal();root.OnboardingWage?.focus();
    };
    el('payroll-sms-open').addEventListener('click',()=>api.open());el('payroll-sms-close').addEventListener('click',()=>dialog.close());
    dialog.addEventListener('close',()=>{if(dialog.open)return;clearDraft();el('payroll-sms-open')?.focus();});
    api.clearDraft=()=>{clearDraft();if(dialog.open)dialog.close();};
    api.clearReference=()=>{localStorage.removeItem(storageKey);localStorage.removeItem(bonusKey);profile=bonusProfile=null;api.clearDraft();render();el('payroll-sms-applied').textContent='';root.AccountSync?.changed();};
    function senioritySource(){
        el('wage-seniority-source').textContent=seniorityOverride?'저장된 금액 · 직접 수정 가능':'입사일 기준 자동 계산';
        el('wage-seniority-reset').hidden=!seniorityOverride;
    }
    el('wage-seniority-reset').addEventListener('click',()=>{seniorityOverride=false;el('wage-seniority').value=money(automaticSeniority);el('wage-seniority').classList.remove('wage-filled');senioritySource();});
    function updateTaxSummary(){
        const salary=draftSalary||profile,bonus=draftBonus||bonusProfile;
        el('wage-tax-basis').textContent=basis('급여',salary)+' · '+basis('상여',bonus);
        el('wage-tax-source').textContent=draftSalary||draftBonus?'새 개인 공제 기준 · 설정 완료 시 적용':salary||bonus?'저장된 개인 공제 기준 유지':'기본 공제 기준으로 추정';
    }
    api.importText=(kind,raw)=>{
        const isBonus=kind==='bonus',message=isBonus?el('wage-bonus-status'):status;
        let ok=false;message.textContent='';manualStatus.textContent='';
        try{
            // Import only the deduction profile. Hourly pay and allowances are always manual.
            const parsed=root.PayrollSMS.parse(raw,{kind,taxOnly:true});
            if(!validProfile(parsed.profile))throw Error('지급 합계와 공제 합계가 포함된 문자를 붙여넣어 주세요.');
            if(isBonus)draftBonus=minimalProfile(parsed.profile);else draftSalary=minimalProfile(parsed.profile);
            const recognized=el('payroll-sms-recognized');recognized.hidden=false;
            recognized.textContent='개인 공제 기준을 가져왔어요. 설정 완료 시 적용돼요.';
            preview.textContent=[draftSalary?basis('급여',draftSalary):'',draftBonus?basis('상여',draftBonus):'',...parsed.warnings].filter(Boolean).join('\n');
            el('wage-import-review').hidden=!preview.textContent;
            message.textContent='세금·보험료와 실수령액은 추정치예요. 시급과 수당은 직접 입력한 금액을 유지해요.';
            el('wage-paste-fallback').open=false;ok=true;return true;
        }catch(error){
            // A failed optional import never replaces a saved personal profile or blocks manual entry.
            if(isBonus)draftBonus=null;else draftSalary=null;
            el('payroll-sms-recognized').hidden=!(draftSalary||draftBonus);
            preview.textContent=[draftSalary?basis('급여',draftSalary):'',draftBonus?basis('상여',draftBonus):''].filter(Boolean).join('\n');
            el('wage-import-review').hidden=!preview.textContent;
            message.textContent=error.message+' 기존 공제 기준은 유지돼요.';return false;
        }finally{
            text.value='';bonusText.value='';updateTaxSummary();
            if(typeof root.CustomEvent==='function')dialog.dispatchEvent(new CustomEvent('wage-draft-imported',{detail:{ok,kind,taxOnly:true}}));
        }
    };
    for(const [input,kind] of [[text,'salary'],[bonusText,'bonus']]){
        input.addEventListener('paste',event=>{if(!event.clipboardData)return;event.preventDefault();api.importText(kind,event.clipboardData.getData('text'));});
        input.addEventListener('input',event=>{if(!event.isComposing&&input.value)api.importText(kind,input.value);});
        input.addEventListener('compositionend',()=>{if(input.value)api.importText(kind,input.value);});
    }
    for(const input of amountInputs){
        input.addEventListener('focus',()=>{if(input.value==='0')input.value='';});
        input.addEventListener('input',()=>{
            if(/^\d+$/.test(input.value))input.value=input.value.replace(/^0+(?=\d)/,'');
            input.classList.remove('wage-filled');input.setAttribute('aria-invalid','false');manualStatus.textContent='';if(input===el('wage-seniority')){seniorityOverride=true;senioritySource();}
        });
    }
    function readAmount(input,label,positive){const raw=input.value.trim()||(positive?'':'0'),n=Number(raw.replace(/,/g,''));if(!/^(?:[0-9]+|[1-9][0-9]{0,2}(?:,[0-9]{3})+)$/.test(raw)||!Number.isSafeInteger(n)||n<(positive?1:0)||n>1000000000){input.setAttribute('aria-invalid','true');input.focus();throw Error(label+'을 '+(positive?'1':'0')+'원 이상 10억 원 이하의 정수로 입력해 주세요.');}return n;}
    api.validateHourly=kind=>{try{return readAmount(kind==='base'?manualBase:manualOrdinary,kind==='base'?'기본시급':'통상시급',true);}catch(error){manualStatus.textContent=error.message;return null;}};
    api.validateAllowance=(input,label)=>{try{return readAmount(input,label,false);}catch(error){manualStatus.textContent=error.message;return null;}};
    apply.addEventListener('click',()=>{
        const wages={};manualStatus.textContent='';
        try{
            wages.baseHourly=readAmount(manualBase,'기본시급',onboardingMode);wages.ordinaryHourly=readAmount(manualOrdinary,'통상시급',onboardingMode);
            wages.seniorityPayOverride=seniorityOverride?readAmount(el('wage-seniority'),'근속수당',false):null;
            const parts={};for(const key of allowanceKeys)parts[key]=readAmount(el('wage-'+key),allowanceLabels[key],false);
            wages.dutyPay=Object.values(parts).reduce((a,b)=>a+b,0);if(wages.dutyPay>1000000000)throw Error('고정수당 합계는 10억 원 이하여야 합니다.');wages.fixedAllowances=parts;
        }catch(error){manualStatus.textContent=error.message;return;}
        const previous=[storageKey,bonusKey,'shift_salary_config_master'].map(key=>[key,localStorage.getItem(key)]);
        try{if(draftSalary)localStorage.setItem(storageKey,JSON.stringify(draftSalary));if(draftBonus)localStorage.setItem(bonusKey,JSON.stringify(draftBonus));root.applyPayrollStatement(wages);}
        catch(_){for(const [key,value]of previous)try{value===null?localStorage.removeItem(key):localStorage.setItem(key,value);}catch{}manualStatus.textContent='저장하지 못했습니다. 작성한 내용을 확인하고 다시 시도해 주세요.';return;}
        api.reloadReference();root.calculatePayrollFromInputs();root.AccountSync?.changed();el('payroll-sms-applied').textContent='설정 적용됨';
        // Keep the onboarding backdrop in place until the sheet has fully left.
        dialog.addEventListener('close',()=>{if(typeof root.CustomEvent==='function')root.dispatchEvent(new CustomEvent('shift-payroll-applied'));},{once:true});dialog.close();
    });
    render();
})(typeof globalThis !== 'undefined' ? globalThis : this);
