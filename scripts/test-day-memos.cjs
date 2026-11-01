'use strict';
const assert=require('node:assert/strict'),M=require('../day-memos-core.js'),A=require('../account-data-core.js');
const date='2026-10-20',items={first:'기존 메모\n\n문단 유지',second:'두 번째 메모'};
assert.deepEqual(M.entries('기존 메모\n\n문단 유지'),{legacy:'기존 메모\n\n문단 유지'});
assert.deepEqual(M.entries(M.text(items),items),items);
assert.deepEqual(M.entries('구글에서 수정',items),{legacy:'구글에서 수정'});
assert.deepEqual(M.entries('',items),{});
const snapshot=A.normalize({shift_day_memos:{[date]:M.text(items)},[M.key]:{[date]:items}});
assert.deepEqual(JSON.parse(JSON.stringify(snapshot))[M.key][date],items);
for(const bad of [{x:' '},{x:42},{x:'x'.repeat(16001)},Object.fromEntries(Array.from({length:51},(_,i)=>['n'+i,'메모']))]){
 assert(!M.valid(bad));assert.throws(()=>A.normalize({[M.key]:{[date]:bad}}));
}
assert(M.valid({}));assert(M.valid({a:'x'.repeat(16000)}));
const remote=A.normalize({shift_day_memos:{'2026-10-21':'새 메모'},[M.key]:{'2026-10-21':{a:'새 메모'}}});
const merged=A.merge(A.normalize({}),snapshot,remote);assert.equal(merged.conflicts.length,0);assert.deepEqual(merged.data[M.key][date],items);
console.log('PASS legacy paragraphs, plain-text projection, stale metadata fallback, account roundtrip/merge and limits');
