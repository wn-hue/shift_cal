(function(root){'use strict';
 const validAmount=n=>Number.isSafeInteger(n)&&n>=0&&n<=1000000000;
 function festival(key,holidays){const name=holidays[key]?.name||'';return name==='설날'||name==='추석'?name:'';}
 function working(shift){return !!shift&&['DAY','NIGHT','SPECIAL_DAY','SPECIAL_NIGHT','SPECIAL_DAY_NO_OT','SPECIAL_NIGHT_NO_OT','NO_OT','HALF_PRE','HALF_POST','HALF_LEAVE','UNPAID_HALF_PRE','UNPAID_HALF_POST','UNPAID_HALF'].includes(shift.type);}
 function amount(config,group,key){const n=config.holidayWorkPay?.[group]?.[key];return validAmount(n)?n:null;}
 function total(config,group,year,month,holidays,shiftAt){
  let sum=0,eligible=0,recorded=0;
  const start=new Date(year,month-1,16,12),end=new Date(year,month,15,12);
  for(let day=new Date(start);day<=end;day.setDate(day.getDate()+1)){
   const key=`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;
   if(!festival(key,holidays)||!working(shiftAt(day)))continue;
   eligible++;const n=amount(config,group,key);if(n!==null){sum+=n;recorded++;}
  }
  // Preserve an old monthly entry only in a period that actually has holiday work.
  return !recorded&&eligible&&validAmount(config.holidayBonus)?config.holidayBonus:sum;
 }
 const api={festival,working,amount,total,validAmount};
 if(typeof module!=='undefined')module.exports=api;root.HolidayWorkPayCore=api;
})(typeof window==='undefined'?globalThis:window);
