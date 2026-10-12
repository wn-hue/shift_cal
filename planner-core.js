/* Pure calculations: the existing company payroll rules, without changing saved data. */
(function(root){'use strict';
const date=k=>new Date(k+'T12:00:00'),key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function counts(days){const c={day:0,night:0,spDay:0,spNight:0,noOT:0,unpaid:0};for(const s of days){switch(s.type){case'DAY':c.day++;break;case'NIGHT':c.night++;break;case'SPECIAL_DAY':c.spDay++;break;case'SPECIAL_NIGHT':c.spNight++;break;case'NO_OT':case'HALF_POST':case'HALF_LEAVE':c[s.origType==='NIGHT'?'night':'day']++;c.noOT++;break;case'HALF_PRE':c[s.origType==='NIGHT'?'night':'day']++;break;case'UNPAID_OFF':c.unpaid++;break;case'UNPAID_HALF_PRE':c.unpaid+=.5;if(s.origType==='NIGHT'){c.night+=.5;c.day+=.5}else c.day++;break;case'UNPAID_HALF_POST':case'UNPAID_HALF':c.unpaid+=.5;c[s.origType==='NIGHT'?'night':'day']+=.5;c.noOT+=.5;break;}}return c;}
function isUnderOneYear(hire,end){if(!hire)return false;const start=date(hire),anniversary=date(hire);anniversary.setFullYear(anniversary.getFullYear()+1);return date(end)>=start&&date(end)<anniversary;}
function seniorityPay(month,end){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||''))return 0;
 const [year,m]=month.split('-').map(Number),[ey,em]=end.split('-').map(Number);
 if(year<1900||year>=2018)return 0;
 const years=ey-year-(em<m?1:0);return Math.min(70000,Math.max(0,years)*10000);
}
function payments(c,cfg,end){const base=Math.trunc((cfg.baseHourly||0)*(cfg.baseHours||209)),ordinary=cfg.ordinaryHourly||0,duty=cfg.dutyPay||0,seniority=seniorityPay(cfg.employmentMonth,end);const net=x=>Math.max(0,x-Math.trunc(x*c.unpaid/27));const hy=Number((cfg.hireDate||'').slice(0,4));const under=isUnderOneYear(cfg.hireDate,end);
let other=0;if(hy>0&&hy<2018)other=Math.trunc(ordinary*1.5*.5*c.night+ordinary*2*.5*c.spNight+ordinary*.5*(c.night+c.spNight));else if(hy>=2018&&hy<2020)other=Math.trunc(ordinary*.5*(c.night+c.spNight));
const support=under?300000:0;const bonus=under?0:Number(end.slice(5,7))%2===0?net(Math.trunc(base*.5)+seniority):0;
return {support,bonus,regular:net(base)+net(duty)+net(seniority)+Math.trunc(ordinary*1.5*Math.max(0,c.day+c.night-c.noOT)*2.5)+Math.trunc(ordinary*.5*7*c.night)+Math.trunc(ordinary*1.5*8*(c.spDay+c.spNight))+Math.trunc(ordinary*2*2.5*(c.spDay+c.spNight))+Math.trunc(ordinary*.5*7*c.spNight)+other};}
function gross(c,cfg,end){const p=payments(c,cfg,end);return p.regular+p.bonus+p.support;}
function period(k){const d=date(k);if(d.getDate()>15)d.setMonth(d.getMonth()+1);const end=new Date(d.getFullYear(),d.getMonth(),15,12),start=new Date(d.getFullYear(),d.getMonth()-1,16,12);return{start:key(start),end:key(end)};}
function range(start,end){const a=[];for(let d=date(start);key(d)<=end;d.setDate(d.getDate()+1))a.push(key(d));return a;}
function vacations(days,budget){const result=[];for(let start=0;start<days.length;start++){let spend=0,needed=[];for(let end=start;end<days.length;end++){const d=days[end];if(!d.rest){if(!d.eligible)break;spend++;needed.push(d.key);}if(spend>budget)break;if(spend>0&&end-start+1>spend)result.push({start:days[start].key,end:d.key,days:end-start+1,leave:[...needed]});}}return result.sort((a,b)=>b.days-a.days||a.leave.length-b.leave.length||a.start.localeCompare(b.start)).filter((r,i,a)=>a.findIndex(x=>x.leave.join()==r.leave.join())===i).slice(0,5);}
const api={seniorityPay,payments,isUnderOneYear,counts,gross,period,range,vacations,date,key};if(typeof module!=='undefined')module.exports=api;root.ShiftPlannerCore=api;
})(typeof window==='undefined'?globalThis:window);
