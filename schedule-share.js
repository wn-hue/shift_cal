/* Share only the selected group's displayed month; personal memos stay private. */
let scheduleShareFocus;
function openScheduleShare() {
    scheduleShareFocus=document.activeElement;
    document.getElementById('share-month').textContent=`${currentCalDate.getFullYear()}년 ${currentCalDate.getMonth()+1}월 · ${currentGroup}조`;
    document.getElementById('share-status').textContent='';
    document.getElementById('modal-schedule-share').classList.add('active');
    document.querySelector('#modal-schedule-share .override-close').focus();
}
function closeScheduleShare(event) {
    if(event && event.target.id!=='modal-schedule-share') return;
    document.getElementById('modal-schedule-share').classList.remove('active');
    scheduleShareFocus?.focus();
}
document.addEventListener('keydown',event=>{
    const modal=document.getElementById('modal-schedule-share');
    if(!modal.classList.contains('active'))return;
    if(event.key==='Escape')closeScheduleShare();
    if(event.key==='Tab') {
        const buttons=[...modal.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
    }
});
function sharedMonthDays() {
    const y=currentCalDate.getFullYear(),m=currentCalDate.getMonth();
    return Array.from({length:new Date(y,m+1,0).getDate()},(_,i)=>{
        const date=new Date(y,m,i+1),key=`${y}-${String(m+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
        return {date,key,shift:getActualShift(date,currentGroup)};
    });
}
async function sendScheduleFile(file) {
    const status=document.getElementById('share-status');
    try {
        if(navigator.canShare?.({files:[file]})) {
            await navigator.share({files:[file],title:'Shift_cal 근무표'});
            status.textContent='';
        } else {
            const url=URL.createObjectURL(file),link=document.createElement('a');
            link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();
            setTimeout(()=>URL.revokeObjectURL(url),60000);
            status.textContent='파일을 저장했습니다. 원하는 앱으로 보내 주세요.';
        }
    } catch(error) { if(error.name!=='AbortError')status.textContent='공유하지 못했습니다. 다시 시도해 주세요.'; }
}
function shareScheduleFile() {
    const events=sharedMonthDays().map(({key,shift})=>ShiftCalendarLink.makeEvent(key,currentGroup,{...shift,subName:''},''));
    const file=new File([ShiftCalendarLink.serialize(events,`Shift_cal ${currentGroup}조`)],`Shift_cal-${currentGroup}-${currentCalDate.getFullYear()}-${currentCalDate.getMonth()+1}.ics`,{type:'text/calendar;charset=utf-8'});
    return sendScheduleFile(file);
}
function shareScheduleImage() {
    const days=sharedMonthDays(),offset=days[0].date.getDay(),rows=Math.ceil((offset+days.length)/7);
    const canvas=document.createElement('canvas');canvas.width=840;canvas.height=160+rows*150;
    const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);
    c.fillStyle='#424242';c.font='bold 30px sans-serif';c.fillText(`${currentCalDate.getFullYear()}.${String(currentCalDate.getMonth()+1).padStart(2,'0')}  ${currentGroup}조`,24,48);
    c.font='20px sans-serif';['일','월','화','수','목','금','토'].forEach((v,i)=>{c.fillStyle=i===0?'#e8687f':i===6?'#5485ee':'#737373';c.fillText(v,i*120+46,100);});
    const colors={DAY:'#ffd600',NIGHT:'#424242',SPECIAL_DAY:'#47d6dc',SPECIAL_NIGHT:'#5485ee',LEAVE:'#24724b'};
    const labels={DAY:'주',NIGHT:'야',OFF:'휴',FORCED_OFF:'휴',SPECIAL_DAY:'주특',SPECIAL_NIGHT:'야특',UNPAID_OFF:'무휴',HALF_PRE:'반전',HALF_POST:'반후',UNPAID_HALF_PRE:'무전',UNPAID_HALF_POST:'무후',NO_OT:'OT−'};
    days.forEach(({date,shift},i)=>{
        const slot=offset+i,x=slot%7*120,y=120+Math.floor(slot/7)*150;
        c.strokeStyle='#eee';c.strokeRect(x,y,120,150);c.fillStyle='#424242';c.font='20px sans-serif';c.fillText(String(date.getDate()),x+10,y+28);
        const isOff=shift.type==='OFF'||shift.type==='FORCED_OFF',color=colors[shift.type]||(shift.type==='NO_OT'?colors[shift.origType]:'#737373');
        if(!isOff){c.fillStyle=color;c.beginPath();c.roundRect(x+27,y+48,66,50,12);c.fill();}
        c.fillStyle=isOff?'#e8687f':shift.type==='DAY'||(shift.type==='NO_OT'&&shift.origType==='DAY')?'#424242':'#fff';
        c.font='22px sans-serif';c.textAlign='center';c.fillText(labels[shift.type]||shift.name,x+60,y+80);c.textAlign='left';
    });
    canvas.toBlob(blob=>{
        if(!blob){document.getElementById('share-status').textContent='이미지를 만들지 못했습니다.';return;}
        sendScheduleFile(new File([blob],`Shift_cal-${currentGroup}-${currentCalDate.getFullYear()}-${currentCalDate.getMonth()+1}.png`,{type:'image/png'}));
    },'image/png');
}
