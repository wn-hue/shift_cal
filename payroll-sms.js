(function (root) {
    'use strict';
    const deductionKeys = ['income', 'local', 'pension', 'health', 'employment', 'care'];
    function parse(text) {
        if (typeof text !== 'string' || text.length > 30000) throw new Error('문자는 30,000자 이내로 붙여넣어주세요.');
        const wages = {}, deductions = {}, warnings = [];
        let section = '', gross, statedTotal, hasPaySection = false;
        const seenAllowances = new Set();
        const definitions = [
            ['baseHourly', /^(?:기본시급|기준 기본시급)/, 'wage'],
            ['ordinaryHourly', /^(?:통상시급|통상임금\(시급\))/, 'wage'],
            ['dutyPay', /^(?:직책수당|직책)/, 'pay'],
            ['seniorityPay', /^(?:근속수당|근속)/, 'pay'],
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
                if (!m || (kind === 'pay' && section === 'deduct')) continue;
                if (kind === 'pay') seenAllowances.add(key);
                const rest = line.slice(m[0].length).replace(/^\s*[:：]\s*/, '');
                const value = amount(rest.trim() ? rest : (lines[i + 1] || ''));
                if (value !== null) assign(kind === 'deduct' ? deductions : wages, key, value);
            }
        }
        gross = totals.pay;
        statedTotal = totals.deduct;
        // Only a complete payment section establishes that an omitted allowance is absent.
        // Partial wage snippets and unreadable allowance amounts must not erase saved values.
        if (hasPaySection && Number.isSafeInteger(gross)) {
            for (const key of ['dutyPay', 'seniorityPay']) {
                if (!seenAllowances.has(key)) wages[key] = 0;
            }
        }
        const knownTotal = deductionKeys.reduce((sum, key) => sum + (deductions[key] || 0), 0);
        let profile = null;
        if (gross > 0 && Number.isSafeInteger(statedTotal) && statedTotal <= gross && statedTotal >= knownTotal) {
            profile = { gross, total: statedTotal };
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
