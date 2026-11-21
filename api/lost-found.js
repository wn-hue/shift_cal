'use strict';
const crypto = require('node:crypto');
const {storage, update} = require('../lib/parking-store');
const core = require('../lib/lost-found');
const AccountErasure = require('../lib/account-erasure');

const guestCookie = '__Host-shift-lost-device';
const guestSeconds = 90 * 86400;
const guestActions = new Set(['report', 'block', 'unblockAll']);

function deviceSession(req, res, secret, now, issue) {
  const mac = (purpose, value) => crypto.createHmac('sha256', secret)
    .update('lost-device:' + purpose + ':' + value).digest('hex');
  const entry = (req.headers.cookie || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(guestCookie + '='));
  const match = /^([a-f0-9]{32}\.\d{10})\.([a-f0-9]{64})$/.exec(entry?.slice(guestCookie.length + 1) || '');
  let value;
  if (match && Number(match[1].split('.')[1]) > Math.floor(now / 1000) &&
      crypto.timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(mac('cookie', match[1]), 'hex'))) {
    value = match[1];
  } else if (issue) {
    value = crypto.randomBytes(16).toString('hex') + '.' + (Math.floor(now / 1000) + guestSeconds);
    res.setHeader('Set-Cookie', guestCookie + '=' + value + '.' + mac('cookie', value) +
      '; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=' + guestSeconds);
  } else {
    return null;
  }
  return {owner: 'guest:' + mac('owner', value), csrf: mac('csrf', value)};
}

function handlerFor(store, options = {}) {
  return async (req, res) => {
    function reply(status, data) {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(JSON.stringify(data));
    }
    try {
      const secret = options.secret || process.env.GOOGLE_CALENDAR_SESSION_SECRET;
      const origin = options.origin || process.env.APP_URL?.replace(/\/$/, '');
      const now = options.now ? options.now() : Date.now();
      if (!secret) throw core.fail(503, '게시판 연결을 준비 중입니다.');
      if (!['GET', 'POST'].includes(req.method)) throw core.fail(405, '지원하지 않는 요청입니다.');
      const user = options.session ? options.session(req) : core.session(req);
      if (req.method === 'GET') {
        const connected = !!user && (await AccountErasure.access(user, secret, {allowUnavailable:true})).state === 'active';
        const device = connected ? null : deviceSession(req, res, secret, now, true);
        const owner = device ? device.owner : core.identity(user, secret);
        const board = core.prune(await store.read(core.PATH), now);
        return reply(200, {
          ...core.list(board, owner, new URL(req.url, 'https://local.invalid'), now), connected,
          ...(device ? {guestCsrf: device.csrf} : {csrf: user.csrf}), blockedCount: board.blocks[owner]?.authors?.length || 0
        });
      }

      if (!origin || req.headers.origin !== origin || !req.headers['content-type']?.startsWith('application/json')) {
        throw core.fail(403, '앱을 새로고침해 주세요.');
      }
      let body = req.body;
      if (typeof body === 'string') {
        if (body.length > 4096) throw core.fail(413, '입력 내용이 너무 큽니다.');
        try { body = JSON.parse(body); } catch { throw core.fail(400, '입력 내용을 확인해 주세요.'); }
      }
      if (!body || typeof body !== 'object' || JSON.stringify(body).length > 4096) throw core.fail(413, '입력 내용이 너무 큽니다.');
      if (!user && !guestActions.has(body.action)) throw core.fail(401, '게시물 등록과 작성자 관리는 로그인 후 이용해 주세요.');
      const device = user ? null : deviceSession(req, res, secret, now, false);
      if (!user && !device) return reply(409, {error:'LOST_SESSION_REFRESH', message:'게시판을 다시 열고 시도해 주세요.'});
      const owner = device ? device.owner : core.identity(user, secret);
      if (req.headers['x-shift-csrf'] !== (device ? device.csrf : user.csrf)) throw core.fail(403, '게시판을 다시 열고 시도해 주세요.');
      if (user) await AccountErasure.requireActive(user, secret);
      const guardedStore = {
        read: path => store.read(path),
        async write(path, value, etag) {
          if (user) await AccountErasure.requireActive(user, secret);
          return store.write(path, value, etag);
        }
      };
      let result;
      await update(guardedStore, core.PATH, old => {
        const board = core.prune(old, now);
        if (body.action === 'unblockAll') {
          if (!board.blocks[owner]) return null;
          delete board.blocks[owner];
        } else {
          if (device) {
            const post = board.posts.find(post => post.id === body.id);
            if (!post || post.hidden || board.banned[post.owner]) throw core.fail(404, '게시물을 찾을 수 없습니다.');
            if (body.action === 'report' && post.reports?.[owner]) return null;
            if (board.blocks[owner]?.authors.includes(post.owner)) {
              if (body.action === 'block') return null;
              throw core.fail(404, '게시물을 찾을 수 없습니다.');
            }
          }
          result = core.mutate(board, body, owner, now);
        }
        return board;
      });
      return reply(200, {ok:true, item:!device && result ? core.publicPost(result, owner) : null});
    } catch (error) {
      return reply(error.status || 503, {message: error.status ? error.message : '게시판에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.'});
    }
  };
}
module.exports = handlerFor(storage);
module.exports._test = {handlerFor};
