const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {loadApp} = require('./build-calendars.cjs');
const context = loadApp();
const rules = vm.runInContext('({base:"2026-09-09", offsets:GROUP_OFFSETS, shutdown:[...SHUTDOWN_DAYS], holidays:Object.fromEntries(Object.entries(HOLIDAYS).map(([k,v])=>[k,v.name]))})', context);
fs.writeFileSync(path.join(__dirname,'../ios-alarm/Sources/Resources/ShiftRules.json'), JSON.stringify(rules,null,2)+'\n');
const fixtures={start:'2025-01-01', types:{}, groups:{}};
const codes={DAY:'d',NIGHT:'n',OFF:'o',SPECIAL_DAY:'D',SPECIAL_NIGHT:'N'};
for(const group of ['A','B','C']) {
 let sequence='';
 for(let key=fixtures.start;key<'2028-01-01';key=context.ShiftCalendarLink.nextDay(key)) {
  context.fixtureDate=key;context.fixtureGroup=group;
  const s=vm.runInContext('getActualShift(new Date(...fixtureDate.split("-").map((n,i)=>+n-(i===1?1:0))),fixtureGroup)',context);
  const code=codes[s.type];if(!code)throw Error(`Unknown shift ${s.type}`);
  fixtures.types[code]={type:s.type,label:s.name};sequence+=code;
 }
 fixtures.groups[group]=sequence;
}
fs.writeFileSync(path.join(__dirname,'../ios-alarm/Tests/WebScheduleFixtures.json'),JSON.stringify(fixtures,null,2)+'\n');
console.log(`Exported rules and ${Object.values(fixtures.groups).reduce((n,s)=>n+s.length,0)} web parity dates`);
