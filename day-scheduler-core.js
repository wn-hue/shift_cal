/* Personal schedule dates use the device's local time. Calendar export uses UTC for timed events. */
(function(root){'use strict';
 const key='shift_day_events';
 const stamp=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 function entries(data){return Object.entries(data||{}).flatMap(([date,events])=>Object.entries(events).map(([id,event])=>({date,id,...event}))).sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));}
 function onDate(data,date){return entries(data).filter(e=>e.start.slice(0,10)<=date&&(e.allDay?e.end.slice(0,10)>=date:new Date(e.end)>new Date(date+'T00:00')));}
 function alarmTime(e){if(e.reminder===null)return null;return new Date(e.allDay?e.start.slice(0,10)+'T09:00':e.start).getTime()-e.reminder*60000;}
 function token(e){return [e.id,e.start,e.allDay,e.reminder].join('|');}
 const escape=s=>String(s).replace(/\\/g,'\\\\').replace(/\r\n|\n|\r/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
 function fold(s){let line='',size=0,out=[];for(const c of s){const n=new TextEncoder().encode(c).length;if(size+n>75){out.push(line);line=' ';size=1;}line+=c;size+=n;}out.push(line);return out.join('\r\n');}
 const utc=t=>new Date(t).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 function ics(e,now=new Date()){
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Shift Routine//Personal Schedule//KO','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+e.id+'@shift-routine.local','DTSTAMP:'+utc(now)];
  if(e.allDay){const end=new Date(e.end);end.setDate(end.getDate()+1);lines.push('DTSTART;VALUE=DATE:'+e.start.slice(0,10).replace(/-/g,''),'DTEND;VALUE=DATE:'+stamp(end).replace(/-/g,''));}
  else lines.push('DTSTART:'+utc(e.start),'DTEND:'+utc(e.end));
  lines.push('SUMMARY:'+escape(e.title),'LOCATION:'+escape(e.location),'DESCRIPTION:'+escape(e.notes));
  if(e.reminder!==null){const minutes=(e.allDay?540:0)-e.reminder;lines.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+escape(e.title),'TRIGGER:'+(minutes<0?'-':'')+'PT'+Math.abs(minutes)+'M','END:VALARM');}
  lines.push('END:VEVENT','END:VCALENDAR');return lines.map(fold).join('\r\n')+'\r\n';
 }
 const api={key,stamp,entries,onDate,alarmTime,token,ics};root.DaySchedulerCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
