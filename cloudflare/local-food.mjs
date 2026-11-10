import directory from './local-food-directory.json' with { type: 'json' };

const DAY = 86_400_000;
const HOUR = 3_600_000;
const COOKIE = '__Host-work-routine-food';
const OCCASIONS = {
  dining: /한식|국|탕|면|일식|중식|중국집|양식|베트남|인도|백반/,
  delivery: /치킨|피자|중식|중국집|분식|김밥|버거|샌드위치|도시락|족발|떡볶이/,
  group: /구이|고기|갈비|삼겹살|횟집|생선회|곱창|막창|오리|뷔페|샤브|전골/
};
const isPlace = value => typeof value === 'string' && /^r[a-f0-9]{14}$/.test(value);
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const regions = {};
const patterns = Object.entries(OCCASIONS);
for (const [region, records] of Object.entries(directory)) {
  const byId = new Map();
  const lists = Object.fromEntries(Object.keys(OCCASIONS).map(key => [key, new Map()]));
  const searchable = records.map(([id, name, address, type, nameKey, searchKey]) => {
    const place = { id, name, address, type };
    byId.set(id, place);
    for (const [occasion, pattern] of patterns) {
      if (!pattern.test(type)) continue;
      const list = lists[occasion];
      if (!list.has(type)) list.set(type, []);
      if (list.get(type).length < 15) list.get(type).push(place);
    }
    return { place, nameKey, searchKey };
  });
  const defaults = Object.fromEntries(Object.entries(lists).map(([key, buckets]) => {
    const result = [];
    for (let i = 0; i < 15 && result.length < 15; i++) {
      for (const list of buckets.values()) {
        if (list[i]) result.push(list[i]);
        if (result.length === 15) break;
      }
    }
    return [key, result];
  }));
  regions[region] = { byId, searchable, defaults };
}
const json = (status, body, headers = {}) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }
});

// The meal chart uses Korea time and treats 00:00–02:59 as the previous date.
export function localFoodWeek(now = Date.now(), offset = 0) {
  const date = new Date(now + 6 * HOUR);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7 + offset * 7);
  const iso = value => new Date(value).toISOString().slice(0, 10);
  return { start: iso(+date), end: iso(+date + 6 * DAY) };
}

async function sign(secret, purpose, input) {
  const encode = value => new TextEncoder().encode(value);
  const key = await crypto.subtle.importKey('raw', encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const buffer = await crypto.subtle.sign('HMAC', key, encode('local-food:' + purpose + ':' + input));
  return [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function identity(request, secret, allowIssue) {
  const entry = (request.headers.get('Cookie') || '').split(/;\s*/).find(value => value.startsWith(COOKIE + '='));
  const [id, proof] = (entry?.slice(COOKIE.length + 1) || '').split('.');
  if (/^[a-f0-9]{32}$/.test(id) && proof === await sign(secret, 'cookie', id)) return { id };
  if (!allowIssue) return null;
  const next = crypto.randomUUID().replaceAll('-', '');
  return {
    id: next,
    cookie: COOKIE + '=' + next + '.' + await sign(secret, 'cookie', next) + '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=1209600'
  };
}

function searchPlaces(region, occasion, query) {
  const { searchable, defaults } = regions[region];
  if (!query) return defaults[occasion];
  const exact = normalize(query);
  const words = query.trim().split(/\s+/u).map(normalize).filter(Boolean);
  if (!words.length) return [];
  const relevant = [[], [], [], []];
  for (const { place, nameKey, searchKey } of searchable) {
    const bucket = nameKey === exact ? 0 : nameKey.startsWith(exact) ? 1 : nameKey.includes(exact) ? 2
      : words.every(word => searchKey.includes(word)) ? 3 : -1;
    if (bucket < 0 || relevant[bucket].length >= 24) continue;
    relevant[bucket].push(place);
  }
  return relevant.flat().slice(0, 24);
}

async function leaderboard(db, week, region, occasion, voter, placeIds) {
  const params = [voter, week, region, occasion];
  // Include the top places and every visible search result so its counts stay
  // correct even when it is below the leaderboard cutoff.
  const extra = placeIds.length ? ' UNION SELECT value FROM json_each(?)' : '';
  if (placeIds.length) params.push(JSON.stringify(placeIds));
  const { results } = await db.prepare(`
    WITH counts AS (
      SELECT place_id AS id, SUM(value = 1) AS up, SUM(value = -1) AS down,
             MAX(CASE WHEN voter = ? THEN value END) AS mine
      FROM local_food_votes WHERE week = ? AND region = ? AND occasion = ?
      GROUP BY place_id
    ), selected AS (
      SELECT id FROM (SELECT id FROM counts WHERE up > 0 ORDER BY up DESC, down ASC, id LIMIT 20)
      ${extra}
    )
    SELECT counts.* FROM counts INNER JOIN selected USING (id)
    ORDER BY up DESC, down ASC, id ASC
  `).bind(...params).all();
  return results;
}

export async function localFood(request, env, now = Date.now()) {
  const url = new URL(request.url);
  const region = url.searchParams.get('region');
  const occasion = url.searchParams.get('occasion');
  const period = url.searchParams.get('period') || 'this';
  if (!Object.hasOwn(regions, region) || !Object.hasOwn(OCCASIONS, occasion) ||
      !['this', 'last'].includes(period)) return json(400, { message: '지역과 분류를 확인해 주세요.' });
  if (!['GET', 'POST'].includes(request.method)) return json(405, {}, { Allow: 'GET, POST' });
  const query = (url.searchParams.get('q') || '').normalize('NFC').trim();
  if (query.length > 50 || /[\p{C}]/u.test(query)) return json(400, { message: '검색어는 50자 이내로 적어 주세요.' });
  const secret = env.LOCAL_FOOD_VOTE_SECRET || env.MEAL_KEYWORDS_CRON_SECRET;
  if (!env.LOCAL_FOOD || !secret) return json(503, { message: '추천 투표를 준비 중이에요.' });
  const week = localFoodWeek(now, period === 'last' ? -1 : 0);
  const directoryForRegion = regions[region].byId;
  const requestedIds = (url.searchParams.get('ids') || '').split(',', 31)
    .filter(id => isPlace(id) && directoryForRegion.has(id)).slice(0, 30);
  const withPlaces = votes => votes.flatMap(vote => {
    const place = directoryForRegion.get(vote.id);
    return place ? [{ ...place, ...vote }] : [];
  });
  try {
    const session = await identity(request, secret, request.method === 'GET');
    if (!session) return json(401, { message: '페이지를 다시 열고 투표해 주세요.' });
    const voter = await sign(secret, 'vote', week.start + ':' + session.id);
    if (request.method === 'POST') {
      if (period !== 'this' || request.headers.get('Origin') !== url.origin ||
          !request.headers.get('Content-Type')?.startsWith('application/json')) {
        return json(403, { message: '이번 주 화면에서 투표해 주세요.' });
      }
      const raw = await request.text();
      if (raw.length > 512) return json(413, { message: '요청이 너무 길어요.' });
      let input;
      try { input = JSON.parse(raw); } catch { return json(400, { message: '투표 내용을 확인해 주세요.' }); }
      if (!input || !isPlace(input.id) || !directoryForRegion.has(input.id) || ![-1, 0, 1].includes(input.value)) {
        return json(400, { message: '장소와 투표를 확인해 주세요.' });
      }
      if (input.week !== week.start) return json(409, { message: '새 주가 시작됐어요. 다시 열어 주세요.' });
      const match = [week.start, region, occasion, input.id, voter];
      if (input.value === 0) {
        await env.LOCAL_FOOD.prepare('DELETE FROM local_food_votes WHERE week=? AND region=? AND occasion=? AND place_id=? AND voter=?').bind(...match).run();
      } else {
        const result = await env.LOCAL_FOOD.prepare(`
          INSERT INTO local_food_votes (week, region, occasion, place_id, voter, value)
          SELECT ?, ?, ?, ?, ?, ?
          WHERE (SELECT COUNT(*) FROM local_food_votes WHERE week=? AND region=? AND occasion=? AND voter=?) < 20
             OR EXISTS (SELECT 1 FROM local_food_votes WHERE week=? AND region=? AND occasion=? AND place_id=? AND voter=?)
          ON CONFLICT (week, region, occasion, place_id, voter) DO UPDATE SET value = excluded.value
        `).bind(...match, input.value, week.start, region, occasion, voter, ...match).run();
        if (!result.meta.changes) return json(429, { message: '이 분류에는 일주일에 20곳까지 투표할 수 있어요.' });
      }
      const votes = await leaderboard(env.LOCAL_FOOD, week.start, region, occasion, voter, [...new Set([input.id, ...requestedIds])]);
      return json(200, { week, votes: withPlaces(votes) });
    }
    const places = url.searchParams.get('search') === '0' ? [] : searchPlaces(region, occasion, query);
    const votes = await leaderboard(env.LOCAL_FOOD, week.start, region, occasion, voter,
      [...new Set([...requestedIds, ...places.map(place => place.id)])]);
    return json(200, { week, votes: withPlaces(votes), places }, session.cookie ? { 'Set-Cookie': session.cookie } : {});
  } catch {
    return json(503, { message: '추천 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' });
  }
}
