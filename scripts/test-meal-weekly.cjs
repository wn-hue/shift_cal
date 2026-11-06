const assert=require('node:assert/strict'),{roll,weekly}=require('../lib/meal-weekly');
let r={date:'2026-10-05',votes:{privateUser:{조식:'up',중식:'down'}},menus:{조식:['계란국','밥'],중식:['카레']}};r=roll(r,'2026-10-06');assert.equal(JSON.stringify(r.history).includes('privateUser'),false);r.votes={a:{석식:'up'},b:{석식:'up'},c:{석식:'down'}};r.menus={석식:['돈까스']};r=roll(r,'2026-10-11');r.votes={a:{야식:'down'},b:{야식:'down'},c:{야식:'down'},d:{조식:'up'},e:{조식:'up'}};r.menus={야식:['라면'],조식:['토스트']};let report=weekly(r,'2026-10-12');assert.equal(report.start,'2026-10-05');assert.equal(report.end,'2026-10-11');assert.equal(report.mostLiked.length,2);assert.equal(report.mostDisliked.length,1);assert.equal(report.mostDisliked[0].meal,'야식');assert.equal(report.mostDisliked[0].up,0);assert.equal(report.mostDisliked[0].down,3);assert.deepEqual(report.mostDisliked[0].items,['라면']);assert.equal(weekly(r,'2026-10-11').start,'2026-09-28');const next=roll(r,'2026-10-12');next.votes={x:{조식:'up'}};assert.deepEqual(weekly(next,'2026-10-15').mostLiked,report.mostLiked);assert.equal(weekly(next,'2026-10-19').mostLiked[0].date,'2026-10-12');assert.deepEqual(weekly(null,'2026-10-12').mostLiked,[]);assert.equal(weekly(null,'2026-01-05').start,'2025-12-29');assert.throws(()=>roll(next,'2026-10-11'));const pruned=roll({...next,history:{'2026-01-01':{totals:{},menus:{}}}},'2026-10-12');assert(!pruned.history['2026-01-01']);console.log('PASS Monday-Sunday boundaries / year rollover / ties / both counts / real menus / no zero-vote winners / rollover archives without identities / 8-week pruning');

const {ratingItems,saveMenu}=require('../lib/meal-weekly');
const groups=[
 {title:'기본 메뉴',items:['불고기','쌀밥','컵라면']},
 {title:'Plus',items:['누룽지죽']},
 {title:'간 편 식',items:['빵 SET','반숙란 SET','샌드위치 SET','마이보글','컵라면/단무지/맛김치/쌀밥']},
 {title:'마이 · 보글',items:['해당 선택식 전용 반찬']},
 {title:'별미 · 공방',items:['돈가스카레라이스','샐러드']}
];
const original=structuredClone(groups);
assert.deepEqual(ratingItems(groups),['불고기','쌀밥','컵라면','누룽지죽','돈가스카레라이스','샐러드']);
assert.deepEqual(groups,original,'The displayed meal source is not edited');
assert.deepEqual(ratingItems([{title:'기본 메뉴',items:['미역국','마이 보글','밥',null,42]}]),['미역국','밥']);
assert.deepEqual(ratingItems([{title:'간편식',items:Array(35).fill('제외')},{title:'기본 메뉴',items:['평가할 식단']}]),['평가할 식단'],'Excluded options do not consume the snapshot item limit');
const oldItems=['불고기','쌀밥','컵라면','빵 SET','반숙란 SET','샌드위치 SET','마이보글','컵라면/단무지/맛김치/쌀밥','돈가스'];
const oldRecord={date:'2026-10-11',votes:{a:{중식:'up'},b:{중식:'down'}},menus:{중식:oldItems}};
for(const saved of [oldRecord,roll(oldRecord,'2026-10-12')]){
 const result=weekly(saved,'2026-10-12');
 for(const winners of [result.mostLiked,result.mostDisliked]){
  assert.deepEqual(winners[0].items,['불고기','쌀밥','컵라면','돈가스']);
  assert.equal(winners[0].up,1);assert.equal(winners[0].down,1);
 }
}
assert.deepEqual(oldRecord.menus.중식,oldItems,'Historical records and votes are not destructively rewritten');
assert.deepEqual(weekly({date:'2026-10-11',votes:{a:{조식:'up'}},menus:{조식:['빵 SET','컵라면']}},'2026-10-12').mostLiked[0].items,['빵 SET','컵라면'],'Ordinary menu items without the legacy convenience marker are retained');
const onlyExcluded={history:{'2026-10-11':{totals:{조식:{up:1,down:1},중식:{up:99,down:99},석식:{up:88,down:88}},menus:{조식:['불고기'],중식:['마이보글'],석식:[]}}}};
const eligible=weekly(onlyExcluded,'2026-10-12');
assert.deepEqual(eligible.mostLiked.map(row=>row.meal),['조식']);
assert.deepEqual(eligible.mostDisliked.map(row=>row.meal),['조식']);
(async()=>{
 const store=require('../lib/parking-store'),update=store.update;
 let saved={date:'2026-10-11',votes:{a:{중식:'up'}},menus:{중식:oldItems},history:{}},writes=0;
 store.update=async(_,path,fn)=>{assert.equal(path,'meal-votes/current.json');const next=fn(saved);if(next!==null){saved=next;writes++;}return saved;};
 try{
  const menu={status:'ok',date:'2026-10-11',meals:[{name:'중식',groups}]};
  await saveMenu(menu);assert.deepEqual(saved.menus.중식,ratingItems(groups));assert.deepEqual(saved.votes,{a:{중식:'up'}});
  await saveMenu(menu);assert.equal(writes,1,'Unchanged eligible menus are not written again');
 }finally{store.update=update;}
 console.log('PASS excluded convenience groups / My Boggle normalization / retained basic+Plus+special meals / safe historical cleanup / unchanged votes / saved snapshot');
})().catch(e=>{console.error(e);process.exitCode=1;});
