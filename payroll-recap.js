(function (root) {
    'use strict';
    const commonJS = typeof module !== 'undefined' && module.exports;
    const planner = commonJS ? require('./planner-core.js') : root.ShiftPlannerCore;
    const holidayPay = commonJS ? require('./holiday-work-pay-core.js') : root.HolidayWorkPayCore;
    const seoulDate = date => new Date(date.getTime() + 9 * 3_600_000);

    function annualRecapYear(payrollMonth, today) {
        const korea = seoulDate(today);
        const month = korea.getUTCMonth();
        if (month !== 11 && month !== 0) return null;
        const year = korea.getUTCFullYear() - (month === 0 ? 1 : 0);
        const selectedYear = payrollMonth.getFullYear(), selectedMonth = payrollMonth.getMonth();
        const december = selectedMonth === 11 && selectedYear === year;
        const january = selectedMonth === 0 && selectedYear === year + 1;
        return december || january ? year : null;
    }

    function estimate(year, config, group, holidays, shiftAt, januaryLeavePay = 0) {
        const hireDate = planner.date(config.hireDate || '');
        const months = Array.from({ length: 12 }, (_, index) => {
            const monthStart = new Date(year, index, 1, 12);
            const end = new Date(year, index + 1, 0, 12);
            const start = hireDate > monthStart ? hireDate : monthStart;
            if (start > end) return { month: index + 1, gross: 0 };

            const lastDay = end.getDate();
            const fraction = (lastDay - start.getDate() + 1) / lastDay;
            const endKey = planner.key(end);
            // Match the native estimate: only fixed monthly amounts are prorated.
            const monthlyConfig = fraction === 1 ? config : {
                ...config,
                baseHours: (config.baseHours || 209) * fraction,
                dutyPay: Math.trunc((config.dutyPay || 0) * fraction),
                seniorityPayOverride: Math.trunc(planner.resolveSeniorityPay(config, endKey) * fraction)
            };
            const shifts = planner.range(planner.key(start), endKey).map(key => shiftAt(planner.date(key)));
            const pay = planner.payments(planner.counts(shifts), monthlyConfig, endKey);
            const festivalPay = holidayPay.totalBetween(config, group, start, end, holidays, shiftAt);
            const gross = pay.regular + pay.bonus + Math.trunc(pay.support * fraction) + festivalPay
                + (index === 0 ? januaryLeavePay : 0);
            return { month: index + 1, gross };
        });
        return { months, gross: months.reduce((sum, month) => sum + month.gross, 0) };
    }

    if (commonJS) {
        module.exports = { annualRecapYear, estimate };
        return;
    }

    const hideKey = 'shift_display_annualPayrollRecap';
    const el = id => document.getElementById('payroll-recap-' + id);
    const button = el('open'), dialog = el('dialog');
    const money = amount => amount.toLocaleString('ko-KR') + '원';

    function visibleYear(now = new Date()) {
        try { if (localStorage.getItem(hideKey) === 'false') return null; } catch {}
        return annualRecapYear(currentPayDate, now);
    }

    function refresh() {
        const year = visibleYear();
        button.hidden = year === null;
        if (year !== null && button.dataset.year !== String(year)) {
            button.dataset.year = String(year);
            el('open-title').textContent = year + '년 급여 결산 보기';
        }
        if (dialog.open && year === null) dialog.close();
    }

    function previousYearLeavePay(year) {
        const end = year + '-12-31';
        const automatic = calculateFiscalYearLeave(config.hireDate, year, end);
        const used = getUsedLeave(year);
        const remaining = Math.max(0, getGrantedLeave(year, automatic) - used);
        const carried = planner.isUnderOneYear(config.hireDate, end)
            ? Math.max(0, automatic.monthlyGenerated - used) : 0;
        return Math.trunc(Math.max(0, remaining - carried) * (config.ordinaryHourly || 0) * 8);
    }

    function renderChart(months) {
        const highest = Math.max(...months.map(month => month.gross)) / 10_000;
        const unit = Math.pow(10, Math.floor(Math.log10(Math.max(1, highest))));
        const top = Math.max(2, Math.ceil(highest / unit) * unit);
        const ticks = [top, top / 2, 0].map(value => {
            const label = document.createElement('span');
            label.textContent = value.toLocaleString('ko-KR');
            return label;
        });
        el('scale').replaceChildren(...ticks);
        const items = months.map(({ month, gross }) => {
            const item = document.createElement('li');
            const track = document.createElement('div');
            const bar = document.createElement('span');
            const label = document.createElement('span');
            const amount = document.createElement('span');
            track.className = 'payroll-recap-track';
            track.setAttribute('aria-hidden', 'true');
            bar.style.height = (gross / 10_000 / top * 100) + '%';
            track.append(bar);
            label.className = 'payroll-recap-month';
            label.textContent = month + '월';
            amount.className = 'payroll-recap-month-amount';
            amount.textContent = money(gross);
            item.append(track, label, amount);
            return item;
        });
        el('months').replaceChildren(...items);
    }

    button.addEventListener('click', event => {
        const now = new Date(), year = visibleYear(now);
        if (year === null) {
            event.stopPropagation();
            refresh();
            return;
        }
        const summary = estimate(year, config, currentGroup, HOLIDAYS, date => getActualShift(date, currentGroup), previousYearLeavePay(year - 1));
        const isCurrentYear = year === seoulDate(now).getUTCFullYear();
        el('title').textContent = year + '년 급여 결산';
        el('year-tag').textContent = isCurrentYear ? '올해' : '지난해';
        el('gross').textContent = money(summary.gross);
        el('period').textContent = year + '. 1. 1.–12. 31.';
        el('forecast').hidden = !isCurrentYear;
        el('save-error').hidden = true;
        renderChart(summary.months);
        root.AppI18n?.refresh();
    });

    el('hide').addEventListener('click', () => {
        try { localStorage.setItem(hideKey, 'false'); }
        catch { el('save-error').hidden = false; return; }
        refresh();
    });
    dialog.addEventListener('close', () => {
        if (button.hidden && document.body.dataset.view === 'payroll') {
            document.getElementById('pay-month-title').closest('button')?.focus({ preventScroll: true });
        }
    });
    function resetPreference() {
        try { localStorage.removeItem(hideKey); } catch {}
        refresh();
    }
    root.PayrollRecap = { refresh, resetPreference };

    let dateTimer;
    function refreshClock() {
        clearTimeout(dateTimer);
        if (document.hidden) return;
        refresh();
        const korea = seoulDate(new Date());
        const nextDay = Date.UTC(korea.getUTCFullYear(), korea.getUTCMonth(), korea.getUTCDate() + 1);
        dateTimer = setTimeout(refreshClock, nextDay - korea.getTime() + 100);
    }
    window.addEventListener('pageshow', refreshClock);
    window.addEventListener('focus', refreshClock);
    window.addEventListener('storage', event => { if (event.key === hideKey || event.key === null) refresh(); });
    document.addEventListener('visibilitychange', refreshClock);
    refreshClock();
})(typeof globalThis !== 'undefined' ? globalThis : this);
