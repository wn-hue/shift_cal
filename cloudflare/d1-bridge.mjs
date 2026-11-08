import { timingSafeEqual } from 'node:crypto';
import { createObjectStore } from './d1-store.mjs';

const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const reply = (status, value = {}) => Response.json(value, { status, headers });
const activated = new WeakSet();
const maxRequestBytes = 2_000_000;

function authorized(request, secret) {
  if (!secret) return false;
  const expected = Buffer.from('Bearer ' + secret);
  const supplied = Buffer.from(request.headers.get('Authorization') || '');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function validPath(path) {
  return typeof path === 'string' && /^[a-zA-Z0-9_./-]{1,512}\.json$/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/v1/objects' || url.search || request.method !== 'POST') return reply(404);
    if (!authorized(request, env.SHIFT_D1_BRIDGE_SECRET)) return reply(401);
    if (Number(request.headers.get('Content-Length')) > maxRequestBytes) return reply(413);

    let input;
    try {
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > maxRequestBytes) return reply(413);
      input = JSON.parse(new TextDecoder().decode(bytes));
      if (!input || typeof input !== 'object') return reply(400);
    } catch { return reply(400); }

    try {
      if (!activated.has(env.STATE)) {
        if (!(await env.STATE.prepare('SELECT id FROM storage_activation WHERE id = 1').first())) {
          return reply(425, { code: 'D1_COPY_PENDING' });
        }
        activated.add(env.STATE);
      }

      const store = createObjectStore(env.STATE);
      const { op, path, ifMatch } = input;
      if (op === 'health') return reply(200, { storage: 'd1' });
      if (op === 'list') {
        const { cursor, limit } = input;
        if (input.prefix !== 'schedules/' || (cursor !== undefined && !/^schedules\/[a-f0-9]{64}\.json$/.test(cursor)) ||
            !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) return reply(400);
        return reply(200, await store.list({ prefix: input.prefix, cursor, limit }));
      }
      if (!validPath(path) || (ifMatch !== undefined && (typeof ifMatch !== 'string' || !ifMatch || ifMatch.length > 256))) return reply(400);
      if (op === 'get') {
        const record = await store.get(path);
        if (!record) return reply(404);
        return new Response(record.stream, { headers: {
          ...headers, 'Content-Type': record.blob.contentType,
          'X-Object-Metadata': encodeURIComponent(JSON.stringify(record.blob))
        } });
      }
      if (op === 'head') return reply(200, await store.head(path));
      if (op === 'put') {
        if (typeof input.body !== 'string') return reply(400);
        return reply(200, await store.put(path, input.body, { ifMatch, contentType: 'application/json' }));
      }
      if (op === 'del') {
        await store.del(path, { ifMatch });
        return reply(200);
      }
      return reply(400);
    } catch (error) {
      if (error.name === 'BlobNotFoundError') return reply(404);
      if (error.name === 'BlobPreconditionFailedError') return reply(412);
      if (error.name === 'BlobAlreadyExistsError') return reply(409);
      return reply(503);
    }
  }
};
