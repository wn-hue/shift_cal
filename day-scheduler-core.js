/* Personal schedule dates use the device's local time. Calendar export uses UTC for timed events. */
(function(root){'use strict';
 const key='shift_day_events';
 const stamp=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 function entries(data){return Object.entries(data||{}).flatMap(([date,events])=>Object.entries(events).map(([id,event])=>({date,id,...event}))).sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));}
 const dayNumber=value=>{const [y,m,d]=value.slice(0,10).split('-').map(Number);return Date.UTC(y,m-1,d)/86400000;};
 const dateAt=(y,m,d)=>{const value=new Date(y,m,d,12);return value.getFullYear()===y&&value.getMonth()===m&&value.getDate()===d?stamp(value):null;};
 function occurrence(e,date){
  if(date<e.start.slice(0,10))return null;
  if(!e.repeat)return e;
  const limit=e.repeat.until&&e.repeat.until<date?e.repeat.until:date;
  if(limit<e.start.slice(0,10))return null;
  const [y,m,d]=e.start.slice(0,10).split('-').map(Number),[ty,tm]=limit.split('-').map(Number),frequency=e.repeat.frequency;
  let index=frequency==='daily'?Math.floor(dayNumber(limit)-dayNumber(e.start)):frequency==='weekly'?Math.floor((dayNumber(limit)-dayNumber(e.start))/7):frequency==='monthly'?(ty-y)*12+tm-m:ty-y;
  let candidate=null;
  // Invalid dates (31st of a short month, leap day) are skipped, never shifted into another month.
  while(index>=0){
   if(frequency==='daily'||frequency==='weekly'){const value=new Date(y,m-1,d,12);value.setDate(value.getDate()+index*(frequency==='weekly'?7:1));candidate=stamp(value);}
   else if(frequency==='monthly'){const month=m-1+index;candidate=dateAt(y+Math.floor(month/12),month%12,d);}
   else candidate=dateAt(y+index,m-1,d);
   if(candidate&&candidate<=limit)break;index--;
  }
  if(!candidate)return null;
  const end=new Date(candidate+'T12:00');end.setDate(end.getDate()+dayNumber(e.end)-dayNumber(e.start));
  return {...e,start:candidate+e.start.slice(10),end:stamp(end)+e.end.slice(10),occurrenceDate:candidate};
 }
 function onDate(data,date){return entries(data).map(e=>occurrence(e,date)).filter(e=>e&&(e.allDay?e.end.slice(0,10)>=date:new Date(e.end)>new Date(date+'T00:00')));}
 function due(data,now){
  const today=stamp(new Date(now)),tomorrow=new Date(today+'T12:00'),yesterday=new Date(today+'T12:00');tomorrow.setDate(tomorrow.getDate()+1);yesterday.setDate(yesterday.getDate()-1);
  const found=new Map();
  for(const e of entries(data)){for(const date of [stamp(yesterday),today,stamp(tomorrow)]){const item=occurrence(e,date);if(!item)continue;const at=alarmTime(item);if(at!==null&&at<=now&&now-at<300000)found.set(token(item),item);}}
  return [...found.values()];
 }
 function alarmTime(e){if(e.reminder===null)return null;return new Date(e.allDay?e.start.slice(0,10)+'T09:00':e.start).getTime()-e.reminder*60000;}
 function token(e){return [e.date||e.start.slice(0,10),e.id,e.start,e.allDay,e.reminder].join('|');}
 const escape=s=>String(s).replace(/\\/g,'\\\\').replace(/\r\n|\n|\r/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
 function fold(s){let line='',size=0,out=[];for(const c of s){const n=new TextEncoder().encode(c).length;if(size+n>75){out.push(line);line=' ';size=1;}line+=c;size+=n;}out.push(line);return out.join('\r\n');}
 const utc=t=>new Date(t).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 function ics(e,now=new Date()){
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Shift Routine//Personal Schedule//KO','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+e.id+(e.date?'-'+e.date.replace(/-/g,''):'')+'@shift-routine.local','DTSTAMP:'+utc(now)];
  if(e.allDay){const end=new Date(e.end);end.setDate(end.getDate()+1);lines.push('DTSTART;VALUE=DATE:'+e.start.slice(0,10).replace(/-/g,''),'DTEND;VALUE=DATE:'+stamp(end).replace(/-/g,''));}
  // Floating recurring times retain the chosen wall-clock time through DST (RFC 5545 §3.3.10).
  else if(e.repeat)lines.push('DTSTART:'+e.start.replace(/[-:]/g,'')+'00','DTEND:'+e.end.replace(/[-:]/g,'')+'00');
  else lines.push('DTSTART:'+utc(e.start),'DTEND:'+utc(e.end));
  if(e.repeat)lines.push('RRULE:FREQ='+e.repeat.frequency.toUpperCase()+(e.repeat.until?';UNTIL='+e.repeat.until.replace(/-/g,'')+(e.allDay?'':'T235959'):''));
  lines.push('SUMMARY:'+escape(e.title),'LOCATION:'+escape(e.location),'DESCRIPTION:'+escape(e.notes));
  if(e.reminder!==null){const minutes=(e.allDay?540:0)-e.reminder;lines.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+escape(e.title),'TRIGGER:'+(minutes<0?'-':'')+'PT'+Math.abs(minutes)+'M','END:VALARM');}
  lines.push('END:VEVENT','END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
 }
 const api={key,stamp,entries,onDate,occurrence,due,alarmTime,token,ics};root.DaySchedulerCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
