(function(root){'use strict';
function summarize(hourly,now){
 const unavailable={label:'',detail:'시간별 비·눈 예보를 확인하지 못했어요.'};
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(now||'')||!Array.isArray(hourly?.time))return unavailable;
 const fields=['rain','showers','snowfall','precipitation_probability','weather_code'];
 if(fields.some(k=>!Array.isArray(hourly[k])||hourly[k].length!==hourly.time.length))return unavailable;
 // Compare local model timestamps without using the phone's timezone.
 const start=now.slice(0,13)+':00',end=new Date(Date.parse(start+'Z')+86400000).toISOString().slice(0,16);
 const rows=[];
 for(let i=0;i<hourly.time.length;i++){
 const time=hourly.time[i];if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(time||''))return unavailable;
 if(time<start||time>=end)continue;
 if(fields.some(k=>!Number.isFinite(hourly[k][i]))||hourly.precipitation_probability[i]<0||hourly.precipitation_probability[i]>100)return unavailable;
 rows.push({time,p:hourly.precipitation_probability[i],rainAmount:hourly.rain[i]+hourly.showers[i],snowAmount:hourly.snowfall[i],rain:hourly.rain[i]>0||hourly.showers[i]>0||[51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(hourly.weather_code[i]),snow:hourly.snowfall[i]>0||[71,73,75,77,85,86].includes(hourly.weather_code[i])});
 }
 if(rows.length!==24||new Set(rows.map(r=>r.time)).size!==24)return unavailable;
 const rain=rows.filter(r=>r.rain),snow=rows.filter(r=>r.snow);
 function message(kind,events){const t=events[0].time;const when=t===start?'현재 시간대':t.slice(0,10)===now.slice(0,10)?'오늘 '+Number(t.slice(11,13))+'시':'내일 '+Number(t.slice(11,13))+'시';const probability=Math.round(Math.max(...events.map(r=>r.p))),amount=Math.round(events.reduce((n,r)=>n+(kind==='눈'?r.snowAmount:r.rainAmount),0)*10)/10;const detail=probability>0?'강수확률 최대 '+probability+'%':amount>0?'예상 '+(kind==='눈'?'적설량 ':'강수량 ')+amount+(kind==='눈'?'cm':'mm'):'시간별 예보 기준';return when+'부터 '+kind+' 예보 · '+detail;}
 return {label:rain.length&&snow.length?'비·눈 예보':rain.length?'비 예보':snow.length?'눈 예보':'',detail:[rain.length&&message('비',rain),snow.length&&message('눈',snow)].filter(Boolean).join('\n')||'앞으로 24시간 비·눈 예보가 없어요.'};
}
if(typeof module!=='undefined')module.exports={summarize};root.ShiftWeatherForecast={summarize};
})(globalThis);
