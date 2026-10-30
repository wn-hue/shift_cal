/* Keep a plain-text projection for calendar, sharing and older calendar integrations. */
(function(root){'use strict';
 const key='shift_day_memo_items_v1',limit=16000;
 const text=items=>Object.values(items).join('\n\n');
 function valid(items){return !!items&&typeof items==='object'&&!Array.isArray(items)&&Object.keys(items).length<=50&&Object.entries(items).every(([id,value])=>/^[a-z0-9-]{1,80}$/.test(id)&&typeof value==='string'&&!!value.trim()&&value===value.trim())&&text(items).length<=limit;}
 function entries(value,items){value=typeof value==='string'?value.trim():'';return valid(items)&&text(items)===value?{...items}:value?{legacy:value}:{};}
 const api={key,limit,text,valid,entries};root.DayMemosCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
