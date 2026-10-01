(function (root) {
    'use strict';
    const keys = ['shift_salary_config_master','shift_active_group','shift_day_memos','shift_overrides_A','shift_overrides_B','shift_overrides_C','shift_payroll_sms_reference_v1','shift_bonus_sms_reference_v1'];
    const types = new Set(['SPECIAL_DAY','SPECIAL_NIGHT','LEAVE','NO_OT','HALF_PRE','HALF_POST','UNPAID_HALF_PRE','UNPAID_HALF_POST','UNPAID_OFF','FORCED_OFF']);
    const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
    function dateOK(x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x+'T00:00:00Z')) && new Date(x+'T00:00:00Z').toISOString().slice(0,10) === x; }
    function normalize(input) {
        if (!object(input) || Object.keys(input).some(k => !keys.includes(k))) throw Error('저장할 데이터 형식을 확인하세요.');
        const result = Object.fromEntries(keys.map(k => [k,null]));
        for (const key of keys) {
            const value = input[key];
            if (value === null || value === undefined) continue;
            if (key === 'shift_active_group') {
                if (!['A','B','C'].includes(value)) throw Error('근무조를 확인하세요.');
                result[key] = value; continue;
            }
            if (!object(value)) throw Error('저장할 설정 형식을 확인하세요.');
            const safe = {};
            if (key === 'shift_salary_config_master') {
                const allowed = ['hireDate','totalLeave','leaveByYear','baseHourly','ordinaryHourly','baseHours','dutyPay','seniorityPay','applyRetroPay','holidayBonus'];
                if (Object.keys(value).some(k => !allowed.includes(k))) throw Error('알 수 없는 급여 설정입니다.');
                for (const [k,v] of Object.entries(value)) {
                    if (k === 'hireDate') { if (v !== '' && !dateOK(v)) throw Error('입사일을 확인하세요.'); }
                    else if (k === 'applyRetroPay') { if (typeof v !== 'boolean') throw Error('수당 설정을 확인하세요.'); }
                    else if (k === 'leaveByYear') {
                        if (!object(v) || Object.keys(v).length > 100 || Object.entries(v).some(([year,n]) => !/^\d{4}$/.test(year) || !Number.isFinite(n) || n < 0 || n > 366)) throw Error('연차 설정을 확인하세요.');
                    } else if (!Number.isFinite(v) || v < 0 || v > 1000000000) throw Error('급여 설정을 확인하세요.');
                    safe[k] = v;
                }
            } else if (['shift_payroll_sms_reference_v1','shift_bonus_sms_reference_v1'].includes(key)) {
                if (Object.keys(value).some(k => !['gross','total'].includes(k)) || !Number.isSafeInteger(value.gross) || value.gross <= 0 || value.gross > 1000000000 || !Number.isSafeInteger(value.total) || value.total < 0 || value.total > value.gross) throw Error('공제 기준을 확인하세요.');
                safe.gross = value.gross; safe.total = value.total;
            } else {
                if (Object.keys(value).length > 10000) throw Error('저장할 날짜가 너무 많습니다.');
                for (const [date,v] of Object.entries(value)) {
                    if (!dateOK(date)) throw Error('저장할 날짜를 확인하세요.');
                    if (key === 'shift_day_memos') { if (typeof v !== 'string' || v.length > 16000) throw Error('메모가 너무 깁니다.'); }
                    else if (!types.has(v) && !['HALF_LEAVE','UNPAID_HALF'].includes(v)) throw Error('근무 변경을 확인하세요.');
                    safe[date] = key === 'shift_day_memos' ? v : v === 'HALF_LEAVE' ? 'HALF_POST' : v === 'UNPAID_HALF' ? 'UNPAID_HALF_POST' : v;
                }
            }
            result[key] = safe;
        }
        if (JSON.stringify(result).length > 180000) throw Error('저장할 데이터가 너무 큽니다.');
        return result;
    }
    function stable(value) {
        if (object(value)) return '{'+Object.keys(value).sort().map(k => JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
        return JSON.stringify(value);
    }
    const equal = (a,b) => stable(a) === stable(b);
    function merge(base, local, remote) {
        const conflicts = [];
        function visit(b,l,r,path) {
            if (equal(l,r) || equal(b,r)) return l;
            if (equal(b,l)) return r;
            if ((object(b) || b == null) && object(l) && object(r)) {
                b = b || {};
                const out = {};
                for (const key of new Set([...Object.keys(b),...Object.keys(l),...Object.keys(r)])) {
                    const v = visit(b[key],l[key],r[key],path ? path+'.'+key : key);
                    if (v !== undefined) out[key] = v;
                }
                return out;
            }
            conflicts.push(path); return l;
        }
        return { data:visit(base,local,remote,''), conflicts };
    }
    function meaningful(data) {
        return Object.entries(data).some(([key,v]) => {
            if (v === null || key === 'shift_active_group') return false;
            if (key === 'shift_salary_config_master') return ['hireDate','totalLeave','baseHourly','ordinaryHourly','dutyPay','seniorityPay','holidayBonus','applyRetroPay'].some(k => !!v[k]) || Object.values(v.leaveByYear || {}).some(n => n > 0) || (v.baseHours !== undefined && v.baseHours !== 209);
            return object(v) && Object.keys(v).length > 0;
        });
    }
    const api = {keys,normalize,equal,merge,meaningful};
    root.AccountDataCore = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
