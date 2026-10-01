/* Shared calendar serialization retained for feed generation and event helpers. */
(function (root) {
    'use strict';
    const encoder = new TextEncoder();
    function escapeText(value) {
        return String(value ?? '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n')
            .replace(/;/g, '\\;').replace(/,/g, '\\,');
    }
    function foldLine(line) {
        let out = '', current = '', bytes = 0;
        for (const char of line) {
            const size = encoder.encode(char).length;
            if (bytes + size > 75) {
                out += current + '\r\n'; current = ' '; bytes = 1;
            }
            current += char; bytes += size;
        }
        return out + current;
    }
    function nextDay(key) {
        const [year, month, day] = key.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day + 1));
        return date.toISOString().slice(0, 10);
    }
    function dateValue(key) { return key.replace(/-/g, ''); }
    function makeEvent(key, group, shift, memo = '', kind = 'personal') {
        let label = shift.name;
        if (shift.type === 'SPECIAL_DAY') label = '주간 특근';
        if (shift.type === 'SPECIAL_NIGHT') label = '야간 특근';
        if (shift.type === 'UNPAID_OFF') label = '무급 휴무';
        if (shift.type === 'UNPAID_HALF_PRE') label = '무급 반차(전)';
        if (shift.type === 'UNPAID_HALF_POST') label = '무급 반차(후)';
        const original = shift.origType === 'NIGHT' ? '야간' : shift.origType === 'DAY' ? '주간' : '';
        const title = `${group}조 ${label}${original && shift.type !== 'NO_OT' ? ` · ${original}` : ''}${shift.dayNum ? ` ${shift.dayNum}일차` : ''}${shift.subName ? ` · ${shift.subName}` : ''}`;
        const details = ['Shift_cal 근무 일정', '종일 일정이며 야간근무는 시작일에 표시합니다.'];
        if (shift.isShutdown) details.push('회사 휴무일 · 교대 주기 일시 정지');
        if (shift.holidayName) details.push(`공휴일: ${shift.holidayName}`);
        if (memo) details.push(`메모: ${memo}`);
        return { uid: `shift-cal-${kind}-${group}-${dateValue(key)}@wn-hue.github.io`,
            start: key, end: nextDay(key), title, description: details.join('\n') };
    }
    function serialize(events, name, stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')) {
        const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shift_cal//Calendar Integration//KO',
            'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(name)}`, 'X-WR-TIMEZONE:Asia/Seoul'];
        for (const event of events) {
            lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${stamp}`,
                `DTSTART;VALUE=DATE:${dateValue(event.start)}`, `DTEND;VALUE=DATE:${dateValue(event.end)}`,
                `SUMMARY:${escapeText(event.title)}`, `DESCRIPTION:${escapeText(event.description)}`, 'TRANSP:TRANSPARENT');
            if (event.rrule) lines.push(`RRULE:${event.rrule}`);
            if (event.rdates?.length) lines.push(`RDATE;VALUE=DATE:${event.rdates.map(dateValue).join(',')}`);
            lines.push('END:VEVENT');
        }
        lines.push('END:VCALENDAR');
        return lines.map(foldLine).join('\r\n') + '\r\n';
    }
    root.ShiftCalendarLink = { escapeText, foldLine, nextDay, dateValue, makeEvent, serialize };
})(globalThis);

/* These handlers access the existing app's schedule; payroll rules are unchanged. */
function openCalendarIntegration() {
    document.getElementById('calendar-link-group').textContent = `${currentGroup}조`;
    document.getElementById('modal-calendar-link').classList.add('active');
    if(window.GoogleSync){GoogleSync.render();GoogleSync.refreshStatus();}
}
function closeCalendarIntegration(event) {
    if (!event || event.target.id === 'modal-calendar-link') {
        document.getElementById('modal-calendar-link').classList.remove('active');
    }
}
function validCalendarDate(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const date = new Date(`${key}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key;
}
function getSelectedCalendarEvent() {
    if (!selectedDateStr) return null;
    const [y, m, d] = selectedDateStr.split('-').map(Number);
    return ShiftCalendarLink.makeEvent(selectedDateStr, currentGroup,
        getActualShift(new Date(y, m - 1, d), currentGroup), dayMemos[selectedDateStr] || '');
}
function addSelectedToGoogleCalendar() {
    const event = getSelectedCalendarEvent();
    if (!event) return;
    const params = new URLSearchParams({ action: 'TEMPLATE', text: event.title,
        dates: `${ShiftCalendarLink.dateValue(event.start)}/${ShiftCalendarLink.dateValue(event.end)}`,
        details: event.description, ctz: 'Asia/Seoul' });
    window.open(`https://calendar.google.com/calendar/render?${params}`, '_blank', 'noopener,noreferrer');
}
