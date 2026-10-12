(function (root) {
    'use strict';
    const deductionKeys = ['income', 'local', 'pension', 'health', 'employment', 'care'];
    function parse(text, options = {}) {
        if (typeof text !== 'string' || text.length > 30000) throw new Error('문자는 30,000자 이내로 붙여넣어주세요.');
        const wages = {}, deductions = {}, warnings = [], fixedAllowances = {};
        let section = '', gross, statedTotal, hasPaySection = false;
        const seenAllowances = new Set(), statutory = new Set();
        const definitions = [
            ['baseHourly', /^(?:기본시급|기준 기본시급)/, 'wage'],
            ['ordinaryHourly', /^(?:통상시급|통상임금\(시급\))/, 'wage'],
            ['duty', /^(?:직책수당|직책)/, 'fixed'],
            ['qualification', /^(?:자격수당|자격)/, 'fixed'],
            ['job', /^(?:직무수당|직무)/, 'fixed'],
            ['family', /^(?:가족수당|가족)/, 'fixed'],
            ['income', /^(?:근로소득세|소득세)/, 'deduct'],
            ['local', /^(?:지방소득세|주민세)/, 'deduct'],
            ['pension', /^(?:국민연금|연금)/, 'deduct'],
            ['health', /^(?:건강보험료|건강보험|건강)/, 'deduct'],
            ['employment', /^(?:고용보험료|고용보험|고용)/, 'deduct'],
            ['care', /^(?:장기요양보험료|장기요양보험|장기요양)/, 'deduct']
        ];
        const lines = text.normalize('NFKC').replace(/\r/g, '').split('\n').map(line => line.trim());
        function amount(rest) {
            const m = rest.match(/^\s*[:：]?\s*([\d,]+)(?=\s|원|$)/);
            if (!m || !/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(m[1])) return null;
            const value = Number(m[1].replace(/,/g, ''));
            return Number.isSafeInteger(value) && value >= 0 ? value : null;
        }
        function assign(target, key, value) {
            if (Object.hasOwn(target, key) && target[key] !== value) throw new Error('서로 다른 금액의 명세서가 섞여 있습니다. 한 달 명세서만 붙여넣어주세요.');
            target[key] = value;
        }
        const totals = {};
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (/^지급내역/.test(line)) { section = 'pay'; hasPaySection = true; continue; }
            if (/^공제내역/.test(line)) { section = 'deduct'; continue; }
            const sum = line.match(/^(소계(?:\([^)]*\))?|총\s*지급액|지급\s*합계|공제\s*합계|총\s*공제액)/);
            if (sum) {
                const value = amount(line.slice(sum[0].length));
                const kind = /공제/.test(sum[0]) ? 'deduct' : /지급/.test(sum[0]) ? 'pay' : section;
                if (value !== null && kind) assign(totals, kind, value);
            }
            for (const [key, pattern, kind] of definitions) {
                const m = line.match(pattern);
                if (!m || (['pay','fixed'].includes(kind) && section === 'deduct')) continue;
                if (kind === 'fixed') seenAllowances.add('dutyPay');
                const rest = line.slice(m[0].length).replace(/^\s*[:：]\s*/, '');
                const value = amount(rest.trim() ? rest : (lines[i + 1] || ''));
                if (value !== null) { assign(kind === 'deduct' ? deductions : kind === 'fixed' ? fixedAllowances : wages, key, value);if(kind==='deduct' && /법정\s*요율/.test(line))statutory.add(key); }
            }
        }
        if(Object.keys(fixedAllowances).length)wages.dutyPay=Object.values(fixedAllowances).reduce((sum,n)=>sum+n,0);
        gross = totals.pay;
        statedTotal = totals.deduct;
        // Only a complete payment section establishes that an omitted allowance is absent.
        // Partial wage snippets and unreadable allowance amounts must not erase saved values.
        if (hasPaySection && Number.isSafeInteger(gross)) {
            for (const key of ['dutyPay']) {
                if (!seenAllowances.has(key)) wages[key] = 0;
            }
        }
        const knownTotal = deductionKeys.reduce((sum, key) => sum + (deductions[key] || 0), 0);
        let profile = null;
        if (gross > 0 && Number.isSafeInteger(statedTotal) && statedTotal <= gross && statedTotal >= knownTotal) {
            profile = { gross, total: statedTotal };
            // Monthly pension/health assessments must not scale with overtime or be charged again on bonuses.
            if(options.kind !== 'bonus' && ['pension','health','employment'].every(k=>statutory.has(k)) && ['income','local'].every(k=>Object.hasOwn(deductions,k))) {
                const fixedInsurance=deductions.pension+deductions.health+(deductions.care||0);
                const statutoryEmployment=Math.trunc(gross*0.009/10)*10;
                const employmentRate=deductions.employment===statutoryEmployment?0.009:deductions.employment/gross;
                profile={rate:statedTotal/gross,model:'monthly-insurance',fixedInsurance,taxRate:(deductions.income+deductions.local)/gross,employmentRate,otherFixed:statedTotal-knownTotal};
                warnings.push('연금·건강(별도 요양 포함)은 문자 월액을 유지합니다. 소득세·지방소득세는 문자 비율로 추정합니다. 정산·신고보수·비과세 변경 시 새 문자를 적용하세요.');
                if(employmentRate!==0.009)warnings.push('고용보험이 지급액의 0.9%와 일치하지 않아 문자 기준 비율을 사용합니다.');
            }
        } else if (gross !== undefined || Object.keys(deductions).length || statedTotal !== undefined) {
            warnings.push('공제 기준에는 지급 합계와 공제 합계가 필요합니다. 합계가 없거나 내역과 맞지 않아 공제율은 변경하지 않습니다.');
        }
        if (!Object.keys(wages).length && !profile) throw new Error(warnings[0] || '인식한 시급·수당이 없습니다. 지급내역과 공제내역을 포함한 명세서를 붙여넣어주세요.');
        return { wages, deductions, profile, warnings };
    }
    const api = { parse };
    root.PayrollSMS = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
