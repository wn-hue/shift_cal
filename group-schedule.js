/* Read-only comparison. Pass each group's overrides explicitly; never swap the active group. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),groups=['A','B','C'],weekdays=['일','월','화','수','목','금','토'];
 const dialog=$('group-day-dialog');let selected='',lastTrigger=null;
 const key=d=>toDateKey(d.getFullYear(),d.getMonth(),d.getDate());
 const date=k=>{const[y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d)};
 function changes(){
  const all={};
  for(const group of groups){const name='shift_overrides_'+group;try{all[group]=AccountDataCore.normalize({[name]:JSON.parse(localStorage.getItem(name)||'null')})[name]||{}}catch{all[group]={}}}
  return all;
 }
 function shift(d,group,all){return getActualShift(d,group,all[group])}
 const shiftName=s=>s.name+(s.subName&&!s.name.includes(s.subName)?' · '+s.subName:'');
 function badge(s){
  const el=document.createElement('span');let kind='off',text='휴';
  if(s.type==='DAY'){kind='day';text='주'}
  else if(s.type==='NIGHT'){kind='night';text='야'}
  else if(s.type.startsWith('SPECIAL_DAY')){kind='special-day';text='주특'}
  else if(s.type.startsWith('SPECIAL_NIGHT')){kind='special-night';text='야특'}
  else if(s.type==='NO_OT'){kind=s.origType==='NIGHT'?'night':'day';text=s.origType==='NIGHT'?'야':'주'}
  else if(s.type==='LEAVE'){kind='leave';text='연차'}
  else if(s.type==='HALF_PRE'||s.type==='HALF_POST'){kind='leave';text=s.type==='HALF_PRE'?'반전':'반후'}
  else if(s.type==='UNPAID_OFF'){kind='leave';text='무휴'}
  else if(s.type.startsWith('UNPAID_HALF')){kind='leave';text=s.type==='UNPAID_HALF_PRE'?'무전':'무후'}
  el.className='group-shift '+kind;
  if(s.hasOt===false&&['SPECIAL_DAY_NO_OT','SPECIAL_NIGHT_NO_OT','NO_OT'].includes(s.type)){el.classList.add('without-ot');el.dataset.note='잔업 없음'}
  el.textContent=text;el.setAttribute('aria-hidden','true');return el;
 }
 function markDate(){for(const cell of $('group-weeks').querySelectorAll('[data-date]'))cell.classList.toggle('selected-date',cell.dataset.date===(selected||key(new Date())))}
 function openDay(k,trigger){selected=k;lastTrigger=trigger;fillDay();markDate();if(!dialog.open){dialog.showModal();$('group-day-title').focus({preventScroll:true})}}
 function fillDay(){
  const d=date(selected),holiday=HOLIDAYS[selected],all=changes();
  $('group-day-caption').textContent=d.getFullYear()+'년'+(holiday?' · '+holiday.name:'');
  $('group-day-title').textContent=`${d.getMonth()+1}월 ${d.getDate()}일 ${weekdays[d.getDay()]}요일`;
  $('group-day-rows').replaceChildren();
  for(const group of [currentGroup,...groups.filter(g=>g!==currentGroup)]){
   const s=shift(d,group,all),row=document.createElement('div');row.className='group-detail-row'+(group===currentGroup?' my-group':'');
   const name=document.createElement('strong');name.textContent=group+'조';
   const label=document.createElement('span');label.className='group-detail-shift';label.textContent=shiftName(s);
   row.append(badge(s),name,label);$('group-day-rows').append(row);
  }
 }
 function render(){
  if(document.body.dataset.view!=='groups')return;
  const year=currentCalDate.getFullYear(),month=currentCalDate.getMonth(),start=new Date(year,month,1),count=new Date(year,month+1,0).getDate(),rows=Math.ceil((start.getDay()+count)/7),all=changes(),now=key(new Date());
  $('group-month-title').textContent=year+'. '+String(month+1).padStart(2,'0')+' ⌄';
  $('group-month-title').setAttribute('aria-label',`${year}년 ${month+1}월 조별 근무 연도와 월 선택`);
  const fragment=document.createDocumentFragment();
  for(let week=0;week<rows;week++){
   const dates=Array.from({length:7},(_,i)=>new Date(year,month,1-start.getDay()+week*7+i));
   const table=document.createElement('table');table.className='group-week';table.dataset.week=String(week);
   const caption=document.createElement('caption');caption.className='sr-only';caption.textContent=`${year}년 ${month+1}월 ${week+1}번째 주 조별 근무`;table.append(caption);
   const head=document.createElement('thead'),hr=document.createElement('tr'),corner=document.createElement('th');corner.scope='col';corner.className='group-column';corner.textContent='조';hr.append(corner);
   dates.forEach((d,i)=>{
    const k=key(d),adjacent=d.getMonth()!==month,h=HOLIDAYS[k],th=document.createElement('th');th.scope='col';th.dataset.date=k;th.className=(adjacent?'adjacent ':'')+(k===now?'today':'');
    const button=document.createElement('button');button.type='button';button.className='group-date';button.setAttribute('aria-label',`${d.getMonth()+1}월 ${d.getDate()}일 ${weekdays[i]}요일${h?' '+h.name:''} 조별 근무 보기`);
    const weekday=document.createElement('span');weekday.className='group-weekday '+(i===0?'sun':i===6?'sat':'');weekday.textContent=weekdays[i];
    const number=document.createElement('strong');number.className=h?'holiday-number':'';number.textContent=d.getDate();
    const holiday=document.createElement('small');holiday.textContent=h?h.name:k===now?'오늘':'';holiday.title=h?h.name:'';if(k===now&&!h)holiday.className='group-today-label';
    if(k===now)button.setAttribute('aria-current','date');button.append(weekday,number,holiday);button.onclick=()=>openDay(k,button);th.append(button);hr.append(th);
   });head.append(hr);table.append(head);
   const body=document.createElement('tbody');
   for(const group of groups){
    const tr=document.createElement('tr');tr.dataset.group=group;if(group===currentGroup)tr.className='my-group';
    const label=document.createElement('th');label.scope='row';label.textContent=group+'조';label.className='group-column';tr.append(label);
    dates.forEach(d=>{const k=key(d),s=shift(d,group,all),td=document.createElement('td');td.dataset.date=k;td.dataset.shift=s.type;if(d.getMonth()!==month)td.className='adjacent';if(k===now)td.classList.add('today');const button=document.createElement('button');button.type='button';button.className='group-cell';button.setAttribute('aria-label',`${d.getMonth()+1}월 ${d.getDate()}일 ${group}조 ${shiftName(s)}, 조별 근무 보기`);button.append(badge(s));button.onclick=()=>openDay(k,button);td.append(button);tr.append(td)});
    body.append(tr);
   }table.append(body);fragment.append(table);
  }
  $('group-weeks').replaceChildren(fragment);markDate();if(dialog.open)fillDay();
 }
 function changeMonth(delta){currentCalDate=new Date(currentCalDate.getFullYear(),currentCalDate.getMonth()+delta,1);selected='';renderCalendar()}
 function focusToday(behavior='instant'){
  requestAnimationFrame(()=>{
   if(document.body.dataset.view!=='groups')return;
   const week=$('group-weeks').querySelector('thead .today')?.closest('table');
   const viewport=window.visualViewport,top=viewport?.offsetTop||0,bottom=top+(viewport?.height||innerHeight);
   const nav=document.querySelector('.bottom-nav')?.getBoundingClientRect();
   const visibleBottom=nav&&nav.height>0?Math.min(bottom,nav.top):bottom;
   const rect=week?.getBoundingClientRect();
   const target=rect?scrollY+rect.top-top-Math.max(12,(visibleBottom-top-rect.height)/2):0;
   window.scrollTo({top:Math.max(0,target),behavior});
  });
 }
 function today(){const now=new Date();currentCalDate=new Date(now.getFullYear(),now.getMonth(),1);selected=key(now);renderCalendar();focusToday(matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth')}
 window.ShiftUI.bindMonthSwipe($('group-weeks'),$('group-weeks'),changeMonth,{allowButtons:'.group-cell,.group-date'});
 $('group-weeks').addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();window.ShiftUI.slideMonth($('group-weeks'),event.key==='ArrowLeft'?-1:1,()=>changeMonth(event.key==='ArrowLeft'?-1:1))}});
 $('group-day-close').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
 dialog.addEventListener('close',()=>{const target=lastTrigger?.isConnected?lastTrigger:$('group-weeks').querySelector(`thead th[data-date="${selected}"] button`);target?.focus({preventScroll:true})});
 $('group-open-calendar').onclick=()=>{dialog.close();const d=date(selected);currentCalDate=new Date(d.getFullYear(),d.getMonth(),1);switchView('calendar');requestAnimationFrame(()=>document.querySelector(`.cal-day[data-date="${selected}"]`)?.scrollIntoView({block:'center'}))};
 window.addEventListener('storage',e=>{if(e.key===null||e.key==='shift_overrides_'+currentGroup){loadOverrides();renderCalendar()}else if(e.key?.startsWith('shift_overrides_'))render()});
 window.GroupSchedule={render,today,focusToday};
})();
