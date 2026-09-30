const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { loadApp, buildFeeds } = require('./build-calendars.cjs');
const context = loadApp();
const api = context.ShiftCalendarLink;
const feeds = buildFeeds(context);
function parseEvents(text) {
    assert.ok(text.endsWith('\r\n'));
    for (const line of text.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
    const unfolded = text.replace(/\r\n[ \t]/g, '');
    return [...unfolded.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)END:VEVENT/g)].map(match => {
        const result = {};
        for (const line of match[1].split('\r\n').filter(Boolean)) {
            const split = line.indexOf(':');
            result[line.slice(0, split).split(';')[0]] = line.slice(split + 1);
        }
        return result;
    });
}
function dashed(key) { return key.slice(0,4) + '-' + key.slice(4,6) + '-' + key.slice(6,8); }
let total = 0;
for (const group of ['A', 'B', 'C']) {
    assert.equal(feeds[group], fs.readFileSync(path.join(__dirname, '..', 'calendars', `${group}.ics`), 'utf8'), 'Committed feed must match app rules');
    const parsed = parseEvents(feeds[group]);
    const ids = new Set();
    const expanded = new Map();
    for (const event of parsed) {
        assert.ok(!ids.has(event.UID), 'UID must be unique'); ids.add(event.UID);
        assert.equal(event.DTEND, api.dateValue(api.nextDay(dashed(event.DTSTART))), 'Exclusive day end');
        const keys = [...new Set([dashed(event.DTSTART), ...(event.RDATE || '').split(',').filter(Boolean).map(dashed)])];
        if (event.RRULE) {
            assert.equal(event.RRULE, 'FREQ=DAILY;INTERVAL=12');
            const first = Date.parse(`${keys[0]}T00:00:00Z`);
            for (let ms = first + 12 * 86400000; ms < Date.parse('2033-01-01T00:00:00Z'); ms += 12 * 86400000) keys.push(new Date(ms).toISOString().slice(0,10));
        }
        for (const key of keys) {
            assert.ok(!expanded.has(key), `Duplicate ${group} ${key}`); expanded.set(key, event);
        }
    }
    context.testGroup = group;
    for (let key = '2025-01-01'; key < '2033-01-01'; key = api.nextDay(key)) {
        context.testKey = key;
        const shift = vm.runInContext('getActualShift(new Date(...testKey.split("-").map((n,i) => +n - (i === 1 ? 1 : 0))), testGroup)', context);
        const expected = api.makeEvent(key, group, shift, '', 'base');
        const actual = expanded.get(key);
        assert.ok(actual, `Missing ${group} ${key}`);
        assert.equal(actual.SUMMARY, api.escapeText(expected.title), `${group} ${key} title`);
        assert.equal(actual.DESCRIPTION, api.escapeText(expected.description), `${group} ${key} details`);
        total++;
    }
}
// App changes must appear in personal exports and must never leak into base feeds.
context.testTypes = ['LEAVE','HALF_PRE','HALF_POST','UNPAID_HALF_PRE','UNPAID_HALF_POST','NO_OT','UNPAID_OFF','FORCED_OFF','SPECIAL_DAY','SPECIAL_NIGHT'];
const changes = vm.runInContext(`testTypes.map(type => {
    overrides = { '2026-09-09': type };
    return { type, shift: getActualShift(new Date(2026,8,9), 'C') };
})`, context);
for (const { type, shift } of changes) {
    const event = api.makeEvent('2026-09-09', 'C', shift, '개인메모, 세미콜론; 역슬래시\\\n줄바꿈 😀'.repeat(6));
    const parsed = parseEvents(api.serialize([event], '개인 일정'))[0];
    assert.equal(parsed.SUMMARY, api.escapeText(event.title), type);
    assert.equal(parsed.DESCRIPTION, api.escapeText(event.description), type);
}
assert.ok(!Object.values(feeds).some(text => text.includes('개인메모')));
assert.equal(api.nextDay('2028-02-28'), '2028-02-29');
assert.equal(api.nextDay('2028-02-29'), '2028-03-01');
assert.equal(api.nextDay('2026-12-31'), '2027-01-01');
assert.equal(vm.runInContext('validCalendarDate("2026-02-30")', context), false);
assert.equal(vm.runInContext('validCalendarDate("2028-02-29")', context), true);
console.log(`PASS: ${total} group/date checks, recurrence coverage, shutdowns, holidays, all override types, UTF-8 folding, privacy, leap days.`);
