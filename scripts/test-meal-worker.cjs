const assert = require('node:assert/strict');
(async()=>{
 const worker=(await import('../cloudflare/app-worker.mjs')).default;
 const calls=[], original=global.fetch;
 global.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response('{"ok":true}',{headers:{'Content-Type':'application/json'}});};
 try {
  for(const time of ['11:30','17:00','00:50']){
   let pending; await worker.scheduled({scheduledTime:Date.parse('2026-11-08T'+time+':00+09:00')},{MEAL_KEYWORDS_CRON_SECRET:'test-only'},{waitUntil(p){pending=p;}});await pending;
  }
  assert.equal(calls.length,3);assert(calls.every(c=>c.url.endsWith('/api/today-menu?feature=keywords&action=dispatch')));
  assert(calls.every(c=>c.options.headers.Authorization==='Bearer test-only'));
  for(const time of ['12:00','17:30','01:20','03:00']) await worker.scheduled({scheduledTime:Date.parse('2026-11-08T'+time+':00+09:00')},{MEAL_KEYWORDS_CRON_SECRET:'test-only'},{waitUntil(){assert.fail('outside meal window');}});
  const response=await worker.fetch(new Request('https://20261104.xyz/api/meal-keywords',{method:'POST',headers:{Origin:'https://20261104.xyz','Content-Type':'application/json'},body:'{}'}),{});
  assert.equal(response.status,200);assert.equal(calls.at(-1).url,'https://h-lyart-ten.vercel.app/api/today-menu?feature=keywords');
  assert.equal(calls.at(-1).options.headers.get('Origin'),'https://h-lyart-ten.vercel.app');
  assert.equal((await worker.fetch(new Request('https://20261104.xyz/api/meal-keywords',{method:'POST',headers:{Origin:'https://evil.test'},body:'{}'}),{})).status,403);
 }finally{global.fetch=original;}
 console.log('PASS meal cron windows, secret header, native API forwarding and origin protection');
})().catch(e=>{console.error(e);process.exitCode=1;});
