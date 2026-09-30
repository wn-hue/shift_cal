// Run: node scripts/build-calendars.cjs
// Reads the actual app engine so shutdown pauses/holidays aren't duplicated here.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = path.join(__dirname, '..');
function loadApp() {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const context = vm.createContext({ window: {}, TextEncoder, URLSearchParams });
    for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
        if (match[1].trim()) vm.runInContext(match[1], context);
    }
    vm.runInContext(fs.readFileSync(path.join(root, 'calendar-integration.js'), 'utf8'), context);
    return context;
}
function buildFeeds(context = loadApp()) {
    // From 2025 through the last known exception year, enumerate exact app dates.
    // After that year the app follows its 12-day cycle without further exceptions.
    const lastKnownYear = vm.runInContext('Math.max(2027, ...Object.keys(HOLIDAYS).map(k => +k.slice(0,4)), ...Array.from(SHUTDOWN_DAYS, k => +k.slice(0,4)))', context);
    const startOfRepeats = `${lastKnownYear + 1}-01-01`;
    const result = {};
    const api = context.ShiftCalendarLink;
    for (const group of ['A', 'B', 'C']) {
        context.feedGroup = group;
        const historical = new Map();
        const events = [];
        for (let key = '2025-01-01'; key < startOfRepeats; key = api.nextDay(key)) {
            context.feedDate = key;
            const shift = vm.runInContext('getActualShift(new Date(...feedDate.split("-").map((n,i) => Number(n) - (i === 1 ? 1 : 0))), feedGroup)', context);
            const event = api.makeEvent(key, group, shift, '', 'base');
            const signature = `${event.title}\n${event.description}`;
            if (!historical.has(signature)) {
                event.uid = `shift-cal-base-${group}-history-${createHash('sha256').update(signature).digest('hex').slice(0, 20)}@wn-hue.github.io`;
                // Explicitly include DTSTART in RDATE for clients whose recurrence
                // iterator otherwise starts at the first RDATE instead of DTSTART.
                event.rdates = [key];
                historical.set(signature, event);
            } else historical.get(signature).rdates.push(key);
        }
        events.push(...historical.values());
        let key = startOfRepeats;
        for (let offset = 0; offset < 12; offset++, key = api.nextDay(key)) {
            context.feedDate = key;
            const shift = vm.runInContext('getActualShift(new Date(...feedDate.split("-").map((n,i) => Number(n) - (i === 1 ? 1 : 0))), feedGroup)', context);
            const event = api.makeEvent(key, group, shift, '', 'base');
            event.rrule = 'FREQ=DAILY;INTERVAL=12';
            events.push(event);
        }
        result[group] = api.serialize(events, `Shift_cal ${group}조 기본 근무표`, '20260930T000000Z');
    }
    return result;
}
if (require.main === module) {
    fs.mkdirSync(path.join(root, 'calendars'), { recursive: true });
    for (const [group, text] of Object.entries(buildFeeds())) {
        fs.writeFileSync(path.join(root, 'calendars', `${group}.ics`), text);
        console.log(`${group}조: ${Buffer.byteLength(text)} bytes`);
    }
}
module.exports = { loadApp, buildFeeds };
