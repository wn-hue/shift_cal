'use strict';
const crypto = require('node:crypto');
const {createStore, isConflict} = require('../lib/blob-json-store');
const {roll, totals, weekly} = require('../lib/meal-weekly');
const {session, fail} = require('../lib/lost-found');
const {requireActive} = require('../lib/account-erasure');

const MEALS = ['조식', '중식', '석식', '야식'];
const PATH = 'meal-votes/current.json';
const mealDate = now => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(new Date(now - 3 * 3600000));

function weekStart(date, period) {
  const monday = new Date(date + 'T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7 - (period === 'last' ? 7 : 0));
  return monday.toISOString().slice(0, 10);
}

function voterFor(secret, feature, period, user) {
  return crypto.createHmac('sha256', secret)
    .update(JSON.stringify([feature, period, user.provider, user.sub])).digest('hex');
}

function summary(record, voter, date) {
  const current = record?.date === date ? record : {};
  return {date, totals: totals(current), mine: voter ? current.votes?.[voter] || {} : {}, weekly: weekly(record, date)};
}

function handlerFor(storage, options = {}) {
  return async (req, res) => {
    function reply(status, body) {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(body));
    }
    try {
      const secret = options.secret || process.env.GOOGLE_CALENDAR_SESSION_SECRET;
      if (!secret) throw fail(503, '식단 집계 설정을 준비 중입니다.');
      if (!['GET', 'POST'].includes(req.method)) throw fail(405, '지원하지 않는 요청입니다.');
      const params = new URL(req.url, 'https://local.invalid').searchParams;
      const localFood = params.get('context') === 'local-food';
      if (localFood && req.method !== 'GET') throw fail(405, '지원하지 않는 요청입니다.');

      const user = session(req);
      if (!user && (localFood || req.method === 'POST')) throw fail(401, '투표하려면 로그인해 주세요.');
      if (user) await requireActive(user, secret);
      const date = mealDate(options.now ? options.now() : Date.now());
      if (localFood) {
        const period = params.get('period') || 'this';
        if (!['this', 'last'].includes(period)) throw fail(400, '주간 범위를 확인해 주세요.');
        const week = weekStart(date, period);
        return reply(200, {week, voter: voterFor(secret, 'local-food', week, user)});
      }

      const voter = user ? voterFor(secret, 'meal', date, user) : null;
      if (req.method === 'GET') return reply(200, summary(await storage.read(PATH), voter, date));
      const origin = options.origin || process.env.APP_URL?.replace(/\/$/, '');
      if (!origin || req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) {
        throw fail(403, '앱에서 투표해 주세요.');
      }
      let body = req.body;
      if (typeof body === 'string') {
        if (body.length > 1024) throw fail(413, '요청이 너무 큽니다.');
        try { body = JSON.parse(body); } catch { throw fail(400, '투표 내용을 확인해 주세요.'); }
      }
      if (!body || body.date !== date || !MEALS.includes(body.meal) || !['up', 'down', null].includes(body.vote)) {
        throw fail(400, '오늘 메뉴의 좋아요·싫어요만 선택할 수 있습니다.');
      }

      for (let attempt = 0; attempt < 8; attempt++) {
        const existing = await storage.read(PATH);
        const record = roll(existing, date);
        const choices = {...record.votes[voter]};
        if (body.vote === null) delete choices[body.meal];
        else choices[body.meal] = body.vote;
        if (Object.keys(choices).length) record.votes[voter] = choices;
        else delete record.votes[voter];
        if (Object.keys(record.votes).length > 10000) throw fail(503, '테스트 참여 한도에 도달했습니다.');
        try {
          await requireActive(user, secret);
          await storage.write(PATH, record, existing?._etag);
          return reply(200, summary(record, voter, date));
        } catch (error) {
          if (!isConflict(error)) throw error;
        }
      }
      throw fail(409, '투표가 동시에 몰렸습니다. 다시 눌러 주세요.');
    } catch (error) {
      if (error.status) return reply(error.status, {message: error.message});
      console.error('meal_votes_failed', {code: 'STORE_UNAVAILABLE'});
      return reply(503, {message: '집계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'});
    }
  };
}
module.exports = handlerFor(createStore());
module.exports._test = {handlerFor, mealDate};
