/* A date-only wheel: draft changes stay local until the user selects the date. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),sheet=$('onboarding-date-picker'),input=$('onboarding-date'),opener=$('onboarding-date-open');
 const parts=['year','month','day'],suffix={year:'년',month:'월',day:'일'},rowHeight=48;
 const wheels=parts.map(part=>({part,el:sheet.querySelector(`[data-date-part="${part}"]`),min:0,max:0,frame:0,timer:0}));
 let draft={},limit={};
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const iso=date=>`${date.year}-${String(date.month).padStart(2,'0')}-${String(date.day).padStart(2,'0')}`;
 function bounds(part){
  if(part==='year')return[1900,limit.year];
  if(part==='month')return[1,draft.year===limit.year?limit.month:12];
  return[1,draft.year===limit.year&&draft.month===limit.month?limit.day:new Date(Date.UTC(draft.year,draft.month,0)).getUTCDate()];
 }
 function stopPending(){for(const wheel of wheels){cancelAnimationFrame(wheel.frame);clearTimeout(wheel.timer);wheel.frame=wheel.timer=0;}}
 function highlight(wheel){
  const value=draft[wheel.part];
  wheel.el.querySelector('[data-selected]')?.removeAttribute('data-selected');
  wheel.el.querySelector(`[data-value="${value}"]`)?.setAttribute('data-selected','true');
  wheel.el.setAttribute('aria-valuenow',value);wheel.el.setAttribute('aria-valuetext',value+suffix[wheel.part]);
 }
 function render(source){
  for(const wheel of wheels){
   const [min,max]=bounds(wheel.part),previous=draft[wheel.part];
   draft[wheel.part]=clamp(previous,min,max);
   const rebuild=wheel.min!==min||wheel.max!==max;
   if(rebuild){
    wheel.min=min;wheel.max=max;
    const fragment=document.createDocumentFragment();
    for(let value=min;value<=max;value++){
     const row=document.createElement('div');row.className='onboarding-date-option';row.dataset.value=value;row.setAttribute('aria-hidden','true');row.textContent=value+suffix[wheel.part];fragment.append(row);
    }
    wheel.el.replaceChildren(fragment);wheel.el.setAttribute('aria-valuemin',min);wheel.el.setAttribute('aria-valuemax',max);
   }
   // Keep the active column's native momentum; dependent columns can clamp immediately.
   if(source!==wheel||rebuild||previous!==draft[wheel.part])wheel.el.scrollTop=(draft[wheel.part]-min)*rowHeight;
   highlight(wheel);
  }
 }
 function readWheel(wheel){return clamp(wheel.min+Math.round(wheel.el.scrollTop/rowHeight),wheel.min,wheel.max);}
 function readScroll(wheel){
  if(!sheet.open||sheet.dataset.sheetClosing==='true')return;
  const value=readWheel(wheel);
  if(value!==draft[wheel.part]){draft[wheel.part]=value;render(wheel);}
 }
 function sync(){
  $('onboarding-date-value').textContent=input.value?input.value.replaceAll('-','.'):'입사일을 선택해 주세요';
  opener.dataset.empty=String(!input.value);
 }
 function open(){
  if(sheet.open)return;
  stopPending();
  const current=new Date(Date.now()+9*3600000).toISOString().slice(0,10).split('-').map(Number);
  limit=Object.fromEntries(parts.map((part,i)=>[part,current[i]]));
  const value=/^\d{4}-\d{2}-\d{2}$/.test(input.value)?input.value.split('-').map(Number):current;
  draft=Object.fromEntries(parts.map((part,i)=>[part,value[i]]));
  // Layout must exist before setting scroll offsets (including on Safari).
  sheet.showModal();render();wheels[0].el.focus({preventScroll:true});
 }
 for(const wheel of wheels){
  wheel.el.addEventListener('scroll',()=>{
   if(!wheel.frame)wheel.frame=requestAnimationFrame(()=>{wheel.frame=0;readScroll(wheel);});
   clearTimeout(wheel.timer);wheel.timer=setTimeout(()=>readScroll(wheel),100);
  },{passive:true});
  wheel.el.addEventListener('keydown',event=>{
   const steps={ArrowUp:-1,ArrowDown:1,PageUp:-10,PageDown:10};
   if(!(event.key in steps)&&!['Home','End'].includes(event.key))return;
   event.preventDefault();
   draft[wheel.part]=event.key==='Home'?wheel.min:event.key==='End'?wheel.max:clamp(readWheel(wheel)+steps[event.key],wheel.min,wheel.max);
   render();
  });
  wheel.el.addEventListener('click',event=>{
   const row=event.target.closest('[data-value]');if(!row)return;
   draft[wheel.part]=Number(row.dataset.value);render();wheel.el.focus({preventScroll:true});
  });
 }
 opener.addEventListener('click',open);
 sheet.querySelector('.picker-close').addEventListener('click',()=>sheet.close());
 $('onboarding-date-confirm').addEventListener('click',()=>{
  // A tap may arrive between the last scroll event and its animation frame.
  stopPending();for(const wheel of wheels)draft[wheel.part]=readWheel(wheel);render();
  input.value=iso(draft);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));sync();sheet.close();
 });
 sheet.addEventListener('close',()=>{stopPending();if($('onboarding-dialog').open)opener.focus({preventScroll:true});});
 window.OnboardingDatePicker={sync};sync();
})();
