/* Shared iCalendar serialization for browser exports and public feeds. */
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
function getCalendarFeedURL() {
    return `https://raw.githubusercontent.com/wn-hue/shift_cal/main/calendars/${currentGroup}.ics`;
}
function openCalendarIntegration() {
    document.getElementById('calendar-link-group').textContent = `${currentGroup}조`;
    document.getElementById('calendar-feed-url').value = getCalendarFeedURL();
    document.getElementById('calendar-apple-subscribe').href = getCalendarFeedURL().replace(/^https:/, 'webcal:');
    document.getElementById('calendar-export-status').textContent = '';
    document.getElementById('calendar-export-period').value = 'year';
    updateCalendarExportRange();
    document.getElementById('modal-calendar-link').classList.add('active');
}
function closeCalendarIntegration(event) {
    if (!event || event.target.id === 'modal-calendar-link') {
        document.getElementById('modal-calendar-link').classList.remove('active');
    }
}
function updateCalendarExportRange() {
    const year = currentCalDate.getFullYear(), month = currentCalDate.getMonth();
    const period = document.getElementById('calendar-export-period').value;
    document.getElementById('calendar-export-start').value = toDateKey(year, period === 'month' ? month : 0, 1);
    document.getElementById('calendar-export-end').value = period === 'month' ?
        toDateKey(year, month, new Date(year, month + 1, 0).getDate()) : toDateKey(year, 11, 31);
}
async function copyCalendarFeedURL() {
    const input = document.getElementById('calendar-feed-url');
    const status = document.getElementById('calendar-export-status');
    try {
        await navigator.clipboard.writeText(getCalendarFeedURL());
        status.textContent = '구독 주소를 복사했습니다.';
    } catch (_) {
        input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
        status.textContent = '주소를 길게 눌러 복사해 주세요.';
    }
}
function downloadCalendarFile(events, filename, name) {
    const blob = new Blob([ShiftCalendarLink.serialize(events, name)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    // Safari may read the blob after the click handler has returned.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function validCalendarDate(key) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
    const date = new Date(`${key}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === key;
}
function exportPersonalCalendar() {
    const start = document.getElementById('calendar-export-start').value;
    const end = document.getElementById('calendar-export-end').value;
    const status = document.getElementById('calendar-export-status');
    if (!validCalendarDate(start) || !validCalendarDate(end) || start > end) {
        status.textContent = '시작일과 종료일을 올바르게 선택해 주세요.'; return;
    }
    const count = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
    if (count > 1096) { status.textContent = '한 번에 최대 3년까지 내보낼 수 있습니다.'; return; }
    const includeOff = document.getElementById('calendar-export-off').checked;
    const includeMemo = document.getElementById('calendar-export-memo').checked;
    const events = [];
    for (let key = start; key <= end; key = ShiftCalendarLink.nextDay(key)) {
        const [y, m, d] = key.split('-').map(Number);
        const shift = getActualShift(new Date(y, m - 1, d), currentGroup);
        const memo = includeMemo ? dayMemos[key] || '' : '';
        if (shift.type === 'OFF' && !includeOff && !memo) continue;
        events.push(ShiftCalendarLink.makeEvent(key, currentGroup, shift, memo));
    }
    if (!events.length) { status.textContent = '선택한 기간에 내보낼 일정이 없습니다.'; return; }
    downloadCalendarFile(events, `Shift_cal_${currentGroup}_${start}_${end}.ics`, `Shift_cal ${currentGroup}조 개인 일정`);
    status.textContent = `${events.length}개 일정 파일을 만들었습니다. 캘린더에 가져오기를 완료해 주세요.`;
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
function exportSelectedCalendarDay() {
    const event = getSelectedCalendarEvent();
    if (event) downloadCalendarFile([event], `Shift_cal_${currentGroup}_${selectedDateStr}.ics`, `Shift_cal ${currentGroup}조`);
}
