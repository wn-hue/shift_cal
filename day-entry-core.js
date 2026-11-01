/* Unified memo editing; reminders keep using the existing schedule delivery/export pipeline. */
(function(root){'use strict';
 const M=root.DayMemosCore||(typeof require==='function'?require('./day-memos-core.js'):null);
 const keys={memos:'shift_day_memos',items:M.key,events:'shift_day_events'};
 const clone=x=>JSON.parse(JSON.stringify(x||{}));
 function notes(state,date){return M.entries(state.memos?.[date]||'',state.items?.[date]);}
 function eventText(state,event){const text=event.memoId&&notes(state,event.date)[event.memoId];return text||[event.title,event.notes].filter(Boolean).join('\n\n');}
 function linked(state,date,id){return Object.entries(state.events?.[date]||{}).find(([,e])=>e.memoId===id);}
 function signature(state,source){if(!source)return '';return JSON.stringify({text:source.memoId?notes(state,source.date)[source.memoId]:null,event:source.eventId?state.events?.[source.date]?.[source.eventId]:source.memoId?linked(state,source.date,source.memoId)||null:null});}
 function plan(state,source,draft,newId){
  const next={memos:clone(state.memos),items:clone(state.items),events:clone(state.events)},touched=new Map();
  const at=date=>{if(!touched.has(date))touched.set(date,notes(next,date));return touched.get(date);};
  const removeEvent=(date,id)=>{if(next.events[date]){delete next.events[date][id];if(!Object.keys(next.events[date]).length)delete next.events[date];}};
  if(source){if(source.memoId){delete at(source.date)[source.memoId];const found=linked(state,source.date,source.memoId);if(found)removeEvent(source.date,found[0]);}if(source.eventId)removeEvent(source.date,source.eventId);}
  const text=draft.text.trim(),date=draft.schedule?draft.schedule.start.slice(0,10):draft.date;
  if(text){
   const oldId=source?.memoId,id=oldId&&!Object.hasOwn(at(date),oldId)?oldId:newId;at(date)[id]=text;
   if(draft.schedule){const event={...draft.schedule,title:text.split('\n')[0].slice(0,120),notes:'',memoId:id};
    if(!event.allDay&&new Date(event.end)<=new Date(event.start))throw Error('종료 시간은 시작 시간보다 늦게 설정해 주세요.');
    const oldEventId=source?.eventId,eventId=oldEventId&&!Object.hasOwn(next.events[date]||{},oldEventId)?oldEventId:id;
    (next.events[date]??={})[eventId]=event;
   }
  }
  for(const [day,items]of touched){if(!M.valid(items))throw Error('하루 메모는 50개, 총 16,000자까지 저장할 수 있어요.');
   if(Object.keys(items).length){next.items[day]=items;next.memos[day]=M.text(items);}else{delete next.items[day];delete next.memos[day];}
  }
  return next;
 }
 const api={keys,notes,eventText,linked,signature,plan};root.DayEntryCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
