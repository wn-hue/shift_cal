import {invoke} from './http-adapter.mjs';
import {publishMenu, readSnapshot} from './menu-publisher.mjs';
import dates from '../lib/today-menu.cjs';
import prepared from '../lib/prepared-meal.cjs';
import places from '../api/bus-places.js';
import currency from '../api/currency-rates.js';

const LEGACY_ORIGIN = 'https://h-lyart-ten.vercel.app';
const {PUBLISH_PATH, MAX_AGE, isDate, mealResponse} = prepared;
const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Work-Routine-Backend': 'cloudflare'};
// Resolved data can be cached across invocations. In-flight I/O cannot.
const externalReads = new Map([
    ['/api/bus-places', places.createHandler({coalesce: false})],
    ['/api/currency-rates', currency.createHandler({coalesce: false})]
]);

async function serveMenu(url, state) {
    if (Array.from(url.searchParams.keys()).some(key => key !== 'date')) return null;
    const datesRequested = url.searchParams.getAll('date');
    const today = dates.menuDate();
    const date = datesRequested[0] ?? today;
    if (datesRequested.length > 1 || !isDate(date) || Math.abs(Date.parse(date) - Date.parse(today)) > 31 * 86400000) {
        return Response.json({status: 'error', message: '오늘 기준 한 달 이내의 날짜를 선택해 주세요.'}, {status: 400, headers});
    }
    const snapshot = await readSnapshot(state);
    if (!snapshot || snapshot.schema !== 1 || !Array.isArray(snapshot.menus) ||
        !(Date.now() - Date.parse(snapshot.checkedAt) < MAX_AGE)) return null;
    return Response.json(mealResponse(snapshot, date), {headers});
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname === PUBLISH_PATH && !url.search) return publishMenu(request, env, ctx);
        const origin = request.headers.get('Origin');
        if (request.method === 'GET' && (!origin || origin === url.origin || origin === LEGACY_ORIGIN)) {
            try {
                if (url.pathname === '/api/today-menu') {
                    const result = await serveMenu(url, env.STATE);
                    if (result) return result;
                } else if (externalReads.has(url.pathname)) {
                    const result = await invoke(externalReads.get(url.pathname), request);
                    if (result.status < 500) {
                        result.headers.set('X-Work-Routine-Backend', 'cloudflare');
                        return result;
                    }
                }
            } catch {
                console.error('cloudflare_public_read_fallback', url.pathname);
            }
        }
        return env.APP.fetch(request);
    }
};
