'use strict';
const apple = require('./apple-account.js');
const google = require('./google-calendar.js');

async function profile(req, res, action) {
    const reply = (status, value) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.end(JSON.stringify(value));
    };
    try {
        if (req.method !== 'POST') return reply(405, {message:'POST 요청을 사용해 주세요.'});
        const secret = process.env.GOOGLE_CALENDAR_SESSION_SECRET;
        if (!secret) return reply(503, {message:'계정 설정을 확인해 주세요.'});
        const user = require('../lib/lost-found').session(req);
        if (!user) return reply(401, {message:'로그인해 주세요.'});
        const origin = process.env.APP_URL?.replace(/\/$/, '');
        if (!origin || req.headers.origin !== origin || req.headers['x-shift-csrf'] !== user.csrf ||
            !req.headers['content-type']?.startsWith('application/json')) return reply(403, {message:'계정을 다시 연결해 주세요.'});
        return reply(200, await require('../lib/account-photo').perform(action, req.body, user, secret));
    } catch (error) {
        return reply(error.status || 503, {error:error.code || 'PROFILE_PHOTO_UNAVAILABLE',
            message:error.status ? error.message : '프로필 사진을 불러오거나 저장하지 못했어요. 다시 시도해 주세요.'});
    }
}

module.exports = async (req, res) => {
    const action = new URL(req.url, 'https://local.invalid').searchParams.get('action') || 'status';
    if (action === 'profile-read' || action === 'profile-write') return profile(req, res, action);
    if (!['status','cloud-read','cloud-write','cloud-delete','logout'].includes(action)) {
        res.statusCode = 400;
        res.end(JSON.stringify({message:'지원하지 않는 계정 요청입니다.'}));
        return;
    }
    return apple.session(req) ? apple(req, res) : google(req, res);
};
