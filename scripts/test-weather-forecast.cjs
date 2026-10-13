const assert=require('node:assert/strict'),{summarize}=require('../weather-forecast.js');
function fixture(){const time=Array.from({length:48},(_,i)=>new Date(Date.UTC(2026,9,14,i)).toISOString().slice(0,16));return {time,rain:Array(48).fill(0),showers:Array(48).fill(0),snowfall:Array(48).fill(0),precipitation_probability:Array(48).fill(0),weather_code:Array(48).fill(0)};}
let h=fixture();h.rain[2]=2;h.precipitation_probability[2]=80;assert.equal(summarize(h,'2026-10-14T14:30').label,'');
h.rain[16]=1;h.precipitation_probability[16]=60;assert.equal(summarize(h,'2026-10-14T14:30').label,'비 예보');assert.match(summarize(h,'2026-10-14T14:30').detail,/오늘 16시.*60%/);
h.snowfall[27]=.2;h.precipitation_probability[27]=70;assert.equal(summarize(h,'2026-10-14T14:30').label,'비·눈 예보');assert.match(summarize(h,'2026-10-14T14:30').detail,/내일 3시.*70%/);
h.rain[16]=0;assert.equal(summarize(h,'2026-10-14T14:30').label,'눈 예보');h.snowfall[27]=null;assert.match(summarize(h,'2026-10-14T14:30').detail,/확인하지 못/);assert.match(summarize(null,'invalid').detail,/확인하지 못/);assert.match(summarize({...fixture(),time:[]},'2026-10-14T14:30').detail,/확인하지 못/);
console.log('PASS rain/snow/mixed, past exclusion, next-day local times and missing forecast data');
