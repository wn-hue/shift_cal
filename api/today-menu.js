'use strict';

const PDFParser = require('pdf2json');
const {SOURCE_URL, extractToday, menuDate} = require('../lib/today-menu.cjs');
const MAX_BYTES = 3 * 1024 * 1024;
const CACHE_MS = 2 * 60 * 1000;
let cached = null, pending = null;

function parsePdf(buffer) {
    return new Promise((resolve, reject) => {
        const parser = new PDFParser();
        let settled = false;
        const finish = (error, data) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            parser.destroy();
            error ? reject(error) : resolve(data);
        };
        const timer = setTimeout(() => finish(new Error('MENU_PARSE_TIMEOUT')), 15000);
        parser.once('pdfParser_dataReady', data => finish(null, data));
        parser.once('pdfParser_dataError', () => finish(new Error('MENU_PDF')));
        try {parser.parseBuffer(buffer);} catch (_) {finish(new Error('MENU_PDF'));}
    });
}

async function downloadPdf(fetcher = fetch) {
    const response = await fetcher(SOURCE_URL, {signal:AbortSignal.timeout(20000), redirect:'error', headers:{Accept:'application/pdf'}});
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('MENU_SOURCE');
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    try {
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            length += value.byteLength;
            if (length > MAX_BYTES) throw new Error('MENU_SIZE');
            chunks.push(Buffer.from(value));
        }
    } catch (error) {await reader.cancel().catch(() => {}); throw error;}
    const buffer = Buffer.concat(chunks, length);
    if (!buffer.subarray(0,5).equals(Buffer.from('%PDF-'))) throw new Error('MENU_PDF');
    return parsePdf(buffer);
}

async function loadPdf() {
    if (cached && Date.now() - cached.time < CACHE_MS) return cached;
    if (!pending) {
        pending = downloadPdf().then(data => {cached = {data, time:Date.now()}; return cached;}).finally(() => {pending = null;});
    }
    return pending;
}

async function handler(req, res) {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    if (req.method !== 'GET') {res.setHeader('Allow','GET'); return res.status(405).json({status:'error', message:'GET 요청만 지원합니다.'});}
    try {
        const result = await loadPdf();
        return res.status(200).json({...extractToday(result.data), checkedAt:new Date(result.time).toISOString()});
    } catch (error) {
        const layout = error.message === 'MENU_LAYOUT';
        return res.status(503).json({status:'error', date:menuDate(), sourceUrl:SOURCE_URL, meals:[],
            message:layout ? '식단표 형식이 변경되어 읽지 못했어요. 원문을 확인해 주세요.' : '식단을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'});
    }
}

module.exports = handler;
module.exports.parsePdf = parsePdf;
module.exports.downloadPdf = downloadPdf;
