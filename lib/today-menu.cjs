'use strict';

const SOURCE_URL = 'https://hr.kcg.co.kr/App_Images/weekmenu.pdf';
const WEEKDAYS = '일월화수목금토';
const MEALS = ['조식', '중식', '석식', '야식'];

function koreaDate(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'}).format(now);
}

function textBlocks(page) {
    // pdf2json 4.x returns UTF-8. Widths are in points; x/y use 1/16 point units.
    return (page.Texts || []).map(t => ({
        text: (t.R || []).map(r => r.T || '').join('').replace(/\s+/g, ' ').trim(),
        x: t.x, y: t.y, width: t.w / 16, center: t.x + t.w / 32
    })).filter(t => t.text && Number.isFinite(t.center) && Number.isFinite(t.y));
}

function documentAnchor(data, now) {
    const match = String(data.Meta?.ModDate || data.Meta?.CreationDate || '').match(/^D:(\d{4})(\d{2})(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : koreaDate(now);
}

function resolveDate(label, anchor) {
    const match = label.match(/^(\d{1,2})\s*\/\s*(\d{1,2})\s*\(([일월화수목금토])\)$/);
    if (!match) return null;
    const year = Number(anchor.slice(0,4)), month = Number(match[1]), day = Number(match[2]);
    const origin = Date.parse(anchor + 'T00:00:00Z');
    const candidates = [year - 1, year, year + 1].map(y => new Date(Date.UTC(y, month - 1, day)))
        .filter(d => d.getUTCMonth() === month - 1 && d.getUTCDate() === day && WEEKDAYS[d.getUTCDay()] === match[3])
        .map(d => ({date:d.toISOString().slice(0,10), distance:Math.abs(d.getTime() - origin)}))
        .filter(d => d.distance <= 120 * 86400000).sort((a,b) => a.distance - b.distance);
    return candidates[0]?.date || null;
}

function horizontalRules(page) {
    const fills = (page.Fills || []).filter(f => f.h > 0 && f.h < .09 && f.w > page.Width * .5 && (f.oc === '#000000' || f.clr === 0));
    const lines = (page.HLines || []).filter(l => l.l > page.Width * .5).map(l => ({x:l.x, y:l.y, w:l.l}));
    return [...fills, ...lines].sort((a,b) => a.y - b.y);
}

function boundsFor(label, rules, shift, endX) {
    const crossing = rules.filter(l => l.x <= label.center + .04 && l.x + l.w >= endX - .2);
    const centerY = label.y + shift;
    const above = crossing.filter(l => l.y < centerY).at(-1);
    const below = crossing.find(l => l.y > centerY);
    if (!above || !below) throw new Error('MENU_LAYOUT');
    return {top:above.y, bottom:below.y};
}

function joinRows(blocks) {
    const rows = [];
    for (const block of blocks.sort((a,b) => a.y - b.y || a.x - b.x)) {
        let row = rows.find(r => Math.abs(r.y - block.y) < .10);
        if (!row) {row = {y:block.y, blocks:[]}; rows.push(row);}
        row.blocks.push(block);
    }
    return rows.map(row => {
        let text = '', end = null;
        for (const block of row.blocks.sort((a,b) => a.x - b.x)) {
            text += (end !== null && block.x - end > .12 ? ' ' : '') + block.text;
            end = block.x + block.width;
        }
        return text.trim();
    }).filter(text => text && !/^[-–—]+$/.test(text));
}

function extractToday(data, now = new Date()) {
    const date = koreaDate(now), anchor = documentAnchor(data, now);
    const available = new Set();
    let found = null;
    for (const page of data.Pages || []) {
        const blocks = textBlocks(page), headers = [];
        for (const block of blocks) {
            const parsed = resolveDate(block.text, anchor);
            if (!parsed) continue;
            available.add(parsed);
            let row = headers.find(h => Math.abs(h.y - block.y) < .12);
            if (!row) {row = {y:block.y, dates:[]}; headers.push(row);}
            row.dates.push({...block, date:parsed});
        }
        for (const row of headers) {
            row.dates.sort((a,b) => a.center - b.center);
            if (row.dates.length !== 7) throw new Error('MENU_LAYOUT');
            for (let i=1; i<7; i++) if (Date.parse(row.dates[i].date) - Date.parse(row.dates[i-1].date) !== 86400000) throw new Error('MENU_LAYOUT');
            const column = row.dates.findIndex(d => d.date === date);
            if (column < 0) continue;
            if (found) throw new Error('MENU_LAYOUT'); // Never mix duplicated dates/tables.
            const header = row.dates[column], gap = row.dates[1].center - row.dates[0].center;
            const left = column ? (header.center + row.dates[column-1].center) / 2 : header.center - gap / 2;
            const right = column < 6 ? (header.center + row.dates[column+1].center) / 2 : header.center + gap / 2;
            const endY = headers.filter(h => h.y > row.y + .12).sort((a,b) => a.y - b.y)[0]?.y || page.Height;
            const endX = row.dates[6].center;
            const bars = (page.Fills || []).filter(f => f.w > page.Width * .7 && f.h > .2 && f.h < 1.5 && f.y > row.y && f.y < row.y + 1.5);
            const bar = bars.sort((a,b) => a.y - b.y)[0];
            if (!bar) throw new Error('MENU_LAYOUT');
            // Align text centers to the actual header rectangle, rather than fixed page coordinates.
            const shift = bar.y + bar.h / 2 - row.y;
            const rules = horizontalRules(page);
            const mealLabels = blocks.filter(t => MEALS.includes(t.text) && t.center < row.dates[0].center - gap / 2 && t.y > row.y && t.y < endY);
            if (mealLabels.length !== 4 || new Set(mealLabels.map(t => t.text)).size !== 4) throw new Error('MENU_LAYOUT');
            const meals = MEALS.map(name => {
                const label = mealLabels.find(t => t.text === name);
                const area = boundsFor(label, rules, shift, endX);
                const categories = blocks.filter(t => !MEALS.includes(t.text) && t.center > label.center + .15 && t.center < row.dates[0].center - gap / 2 && t.y + shift > area.top && t.y + shift < area.bottom);
                const groups = [];
                for (const category of categories) {
                    const bounds = boundsFor(category, rules, shift, endX);
                    if (bounds.top < area.top - .05 || bounds.bottom > area.bottom + .05) throw new Error('MENU_LAYOUT');
                    let group = groups.find(g => Math.abs(g.top - bounds.top) < .05 && Math.abs(g.bottom - bounds.bottom) < .05);
                    if (!group) {group = {...bounds, labels:[]}; groups.push(group);}
                    group.labels.push(category.text);
                }
                if (!groups.length) throw new Error('MENU_LAYOUT');
                return {name, groups:groups.sort((a,b) => a.top - b.top).map(group => {
                    const shared = group.labels.includes('후식');
                    const selected = blocks.filter(t => t.y + shift > group.top + .03 && t.y + shift < group.bottom - .03 &&
                        (shared ? t.center >= row.dates[0].center - gap / 2 : t.center >= left && t.center < right));
                    return {title:group.labels.join(' · ').replace('메뉴A','기본 메뉴'), items:joinRows(selected)};
                }).filter(group => group.items.length)};
            });
            if (meals.some(m => !m.groups[0]?.items.length || /간편식|후식|Plus/.test(m.groups[0].title))) throw new Error('MENU_LAYOUT');
            found = meals;
        }
    }
    if (!available.size) throw new Error('MENU_LAYOUT');
    return {status:found ? 'ok' : 'not_published', date, sourceUrl:SOURCE_URL, meals:found || [],
        message:found ? '' : '식단표에 오늘 날짜가 아직 등록되지 않았어요.'};
}

module.exports = {SOURCE_URL, koreaDate, resolveDate, extractToday};
