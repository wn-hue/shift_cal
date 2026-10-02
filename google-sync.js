/* Google is the durable event store. OAuth tokens stay in encrypted HttpOnly server cookies. */
(function() {
    'use strict';
    const C = GoogleSyncCore;
    let auth = null, state = null, busy = false, timer = null, polling = null, suppressed = false, viewTag='';
    const storagePrefix = 'shift_google_sync_v2_';
    const el = id => document.getElementById(id);
    const dateObj = key => { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d); };
    const dateKey = date => toDateKey(date.getFullYear(),date.getMonth(),date.getDate());
    function loadState() {
        if (!auth?.connected) { state = null; return; }
        try { state = JSON.parse(localStorage.getItem(storagePrefix+auth.user.id) || '{}'); } catch { state = {}; }
        state.groups ||= {};
    }
    function save() { if (state && auth?.user) localStorage.setItem(storagePrefix+auth.user.id,JSON.stringify(state)); }
    function groupState() {
        if (!state) return null;
        const group = state.groups[currentGroup] ||= {enabled:false,calendarId:'',records:{},excluded:{},pending:{},personal:[]};
        group.records ||= {}; group.excluded ||= {}; group.pending ||= {}; group.personal ||= [];
        group.group=currentGroup;
        return group;
    }
    function status(message,tone='info') {
        const node=el('google-sync-status');if(node){node.textContent=message;node.setAttribute('data-state',tone==='info' && busy?'progress':tone);}
    }
    function setBusy(value) {
        busy=value;const button=el('google-sync-enable');if(button){button.disabled=value;button.textContent=value?'동기화 중…':'동기화';button.setAttribute('aria-busy',String(value));}
        el('google-sync-status')?.setAttribute('aria-busy',String(value));
    }
    async function api(action, body, get = false) {
        const response = await fetch('/api/google-calendar?action='+action, { method:get ? 'GET':'POST',credentials:'same-origin',cache:'no-store',
            headers:get ? {} : {'Content-Type':'application/json','X-Shift-CSRF':auth?.csrf || ''}, ...(get ? {} : {body:JSON.stringify(body || {})}) });
        let data; try { data = await response.json(); } catch { throw Error('서버 연동 경로를 확인하세요. Vercel에 배포된 웹앱에서 사용해 주세요.'); }
        if (!response.ok) { const error = Error(data.message || '구글 요청을 완료하지 못했습니다.'); error.code = data.error; error.status = response.status; throw error; }
        return data;
    }
    function monthRange() {
        const y = currentCalDate.getFullYear(), m = currentCalDate.getMonth();
        return {start:toDateKey(y,m,1),end:dateKey(new Date(y,m+1,1))};
    }
    function localValue(key) { return C.local(overrides[key],dayMemos[key]); }
    function shiftFor(key,type) {
        const saved = overrides;
        try { overrides = type && type !== 'BASE' ? {[key]:type}:{}; return getActualShift(dateObj(key),currentGroup); }
        finally { overrides = saved; }
    }
    function desired(key,id,type = null,memo = null) {
        const value = type === null ? localValue(key) : C.local(type,memo);
        const shift = shiftFor(key,value.override);
        const event = ShiftCalendarLink.makeEvent(key,currentGroup,shift);
        return {id,summary:event.title,description:C.PREFIX+value.memo,colorId:C.colorId(shift),start:{date:key},end:{date:ShiftCalendarLink.nextDay(key)},
            extendedProperties:{private:{app:'shift_cal_v2',group:currentGroup,kind:'shift',originDate:key,override:value.override}}};
    }
    function baseId(key) { return 'sc2'+currentGroup.toLowerCase()+key.replace(/-/g,''); }
    function remember(g,key,remote,value = localValue(key)) {
        g.records[key] = {id:remote.id,etag:remote.etag,signature:C.signature(remote),summary:remote.summary,local:value};
        delete g.pending[key];
    }
    function analyzeRemote(key,remote,record) {
        if (remote.recurrence || remote.recurringEventId || remote.start?.date !== key || remote.end?.date !== ShiftCalendarLink.nextDay(key)) return {valid:false,reason:'근무 일정의 날짜·시간 또는 반복 설정이 변경되었습니다. 구글에서 확인하세요.'};
        const props = remote.extendedProperties?.private || {};
        let type;
        if (remote.summary === desired(key,remote.id,'BASE','').summary) type = 'BASE';
        else if (record && remote.summary === record.summary && props.override) type = props.override;
        else type = C.infer(remote.summary,getBaseShift(dateObj(key),currentGroup).type);
        if (!type) return {valid:false,reason:'일정 제목에서 근무 종류를 확인할 수 없습니다. 근무 변경은 웹앱에서 지정해 주세요.'};
        if (!['BASE','SPECIAL_DAY','SPECIAL_NIGHT','LEAVE','NO_OT','HALF_PRE','HALF_POST','UNPAID_HALF_PRE','UNPAID_HALF_POST','UNPAID_OFF','FORCED_OFF'].includes(type)) return {valid:false,reason:'지원하지 않는 근무 변경입니다.'};
        const reason = validateDayOverride(key,type === 'BASE' ? null:type);
        if (reason) return {valid:false,reason};
        return {valid:true,value:C.local(type,C.memo(remote))};
    }
    function applyLocal(key,value) {
        suppressed = true;
        try {
            if (value.override === 'BASE') delete overrides[key]; else overrides[key] = value.override;
            if (value.memo) dayMemos[key] = value.memo; else delete dayMemos[key];
            saveOverrides(); localStorage.setItem('shift_day_memos',JSON.stringify(dayMemos));
            if(window.AccountSync)AccountSync.changed();
        } finally { suppressed = false; }
    }
    function queueReview(g,key,kind,remote,reason) {
        g.pending[key] = {kind,remote:remote || null,reason:reason || '양쪽에서 변경되었습니다. 사용할 일정을 선택하세요.'};
    }
    async function writeOperations(g,ops) {
        for (let i=0;i<ops.length;i+=10) {
            if(!g.enabled) return;
            const {results} = await api('write',{group:g.group,calendarId:g.calendarId,operations:ops.slice(i,i+10).map(x=>x.op)});
            for (const result of results) {
                const context = ops.slice(i,i+10).find(x=>x.op.id === result.id);
                if (!context) continue;
                if (result.ok) {
                    // The user may edit locally while a request is in flight: remember the sent snapshot,
                    // not the newer input, so that the next run still sends that newer input.
                    remember(g,context.key,result.event,context.value);
                } else if ([409,412,404,410].includes(result.status)) {
                    queueReview(g,context.key,'refetch',null,'구글 일정이 변경되었거나 삭제되었습니다. 다시 동기화하여 확인하세요.');
                } else throw Error(result.message || '일정 변경을 완료하지 못했습니다.');
                save();
            }
        }
    }
    function renderPersonal() {
        const host = el('google-personal-list'); if (!host) return;
        host.replaceChildren();host.hidden=true;
        const g = groupState(); if (!g?.enabled) return;
        const range = monthRange();
        const events = g.personal.filter(x=>x.status !== 'cancelled' && (!C.origin(x)||g.excluded[C.origin(x)])).sort((a,b)=>(a.start?.date || a.start?.dateTime || '').localeCompare(b.start?.date || b.start?.dateTime || ''));
        if (!events.length) return;
        host.hidden=false;
        const title = document.createElement('div'); title.className='card-header'; title.textContent='구글에서 연결된 개인 일정'; host.append(title);
        for (const event of events) {
            const row = document.createElement('div'); row.className='google-event-row';
            const text = document.createElement('div');
            const day = event.start?.date || new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(event.start?.dateTime));
            if (day >= range.end || (event.end?.date || day) < range.start) continue;
            const heading=document.createElement('strong'); heading.textContent=event.summary || '(제목 없음)';
            const detail=document.createElement('div'); detail.className='calendar-link-copy';
            detail.textContent=day+(event.start?.dateTime ? ' '+new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}).format(new Date(event.start.dateTime)):' · 종일');
            text.append(heading,detail); row.append(text);
            const googleOnly=event.recurringEventId || C.origin(event);
            const edit=document.createElement('button'); edit.className='gcal-chip-btn'; edit.textContent=googleOnly ? '구글에서 확인':'수정';
            edit.onclick=()=> googleOnly ? window.open('https://calendar.google.com/calendar/','_blank','noopener,noreferrer'):openPersonal(event);
            row.append(edit); host.append(row);
        }
    }
    function renderReview() {
        const host=el('google-sync-review'); if (!host) return;
        host.replaceChildren(); const g=groupState(); if (!g) return;
        for (const [key,pending] of Object.entries(g.pending)) {
            const row=document.createElement('div'); row.className='google-review-row';
            const heading=document.createElement('strong'); heading.textContent=key+' · 변경 확인';
            const reason=document.createElement('p'); reason.className='calendar-link-copy'; reason.textContent=pending.reason;
            const preview=document.createElement('p'); preview.className='calendar-link-copy'; preview.textContent='구글: '+(pending.remote?.status==='cancelled' || pending.kind==='deleted' ? '삭제된 일정':pending.remote?.summary || '다시 불러오기 필요');
            row.append(heading,reason,preview);
            const actions=document.createElement('div'); actions.className='calendar-link-actions';
            const local=document.createElement('button'); local.className='btn-reset-data'; local.textContent='웹앱 일정 사용'; local.onclick=()=>resolve(key,'local');
            const remote=document.createElement('button'); remote.className='btn-save';
            const canApply=pending.remote && analyzeRemote(key,pending.remote,g.records[key]).valid;
            if(pending.remote && pending.remote.status!=='cancelled' && !canApply && pending.kind!=='duplicate')reason.textContent=analyzeRemote(key,pending.remote,g.records[key]).reason;
            remote.textContent=pending.kind==='deleted' ? '구글 삭제 유지':canApply ? '구글 변경 적용':'구글 일정 유지'; remote.onclick=()=>resolve(key,'remote');
            actions.append(local,remote); row.append(actions); host.append(row);
        }
    }
    function render() {
        if (!el('google-sync-login')) return;
        const configured=!!auth?.configured, connected=!!auth?.connected, g=groupState();
        el('google-sync-login').hidden=connected || !configured;
        el('google-sync-login').href='/api/google-calendar?action=login';
        el('google-sync-controls').hidden=!connected;
        el('google-sync-setup').hidden=configured;
        el('google-sync-user').textContent=connected ? auth.user.email+' · '+currentGroup+'조':'구글 계정 연결 전';
        el('google-sync-enable').textContent=busy?'동기화 중…':'동기화';
        if (auth && !configured) {
            el('google-sync-setup-message').textContent='관리자 최초 설정이 필요합니다. '+(auth.missing?.length ? '미설정: '+auth.missing.join(', '):'Vercel 서버 설정을 확인하세요.');
            el('google-sync-redirect').textContent=auth.redirectUri || location.origin+'/api/google-calendar?action=callback';
        }
        el('google-sync-badge').textContent=g?.enabled ? '구글 동기화 사용 중':'구글 캘린더 동기화';
        const entry=document.querySelector('.calendar-link-entry');
        if(entry)entry.textContent='📅 구글 · 애플 캘린더 동기화'+(g&&Object.keys(g.pending).length ? ` · 변경 확인 ${Object.keys(g.pending).length}건`:'')+' ›';
        renderReview(); renderPersonal();
    }
    async function refreshStatus() {
        if(busy)return auth;
        try { auth=await api('status',null,true); loadState(); render(); return auth; }
        catch (e) { status(e.message); return null; }
    }
    async function sync(rangeOverride=null) {
        if (busy || !auth?.connected || !groupState()?.enabled || document.hidden || (window.AccountSync && !AccountSync.ready)) return;
        setBusy(true); const group=currentGroup, g=groupState();
        status('구글 일정과 변경사항을 확인하고 있습니다…');
        try {
            const range=rangeOverride || monthRange();
            const knownIds=Object.entries(g.records).filter(([key])=>key>=range.start&&key<range.end).map(([,record])=>record.id);
            const {items}=await api('read',{group,calendarId:g.calendarId,...range,knownIds});
            // Don't apply another group's fetched data if the user switched groups while waiting.
            if (currentGroup!==group || !g.enabled) return;
            const byDate=new Map();
            for (const event of items) {
                const origin=C.origin(event); if (!origin) continue;
                const existing=byDate.get(origin);
                if (existing && existing.id!==event.id && existing.status!=='cancelled' && event.status!=='cancelled') {
                    queueReview(g,origin,'duplicate',event,'같은 날짜의 근무 일정이 여러 개입니다. 구글에서 중복을 정리한 뒤 다시 동기화하세요.');
                } else if (!existing || event.id===g.records[origin]?.id || existing.status==='cancelled') byDate.set(origin,event);
            }
            if(!rangeOverride)g.personal=items.filter(e=>!C.origin(e)||g.excluded[C.origin(e)]);
            const operations=[];
            for (let key=range.start;key<range.end;key=ShiftCalendarLink.nextDay(key)) {
                const record=g.records[key], remote=byDate.get(key), value=localValue(key);
                if (g.excluded[key]) continue;
                if (g.pending[key]?.kind==='duplicate') {
                    const duplicates=items.filter(e=>C.origin(e)===key&&e.status!=='cancelled');
                    if (duplicates.length>1) continue; delete g.pending[key];
                }
                if (g.pending[key]?.kind==='refetch') delete g.pending[key];
                if (g.pending[key]) {
                    if (remote) g.pending[key].remote=remote;
                    continue;
                }
                const body=desired(key,record?.id || remote?.id || baseId(key));
                const action=C.plan(value,record,remote,body);
                if (action==='adopt') {
                    remember(g,key,remote,value);
                    if((remote.colorId ?? null)!==body.colorId || remote.visibility!=='private')operations.push({key,value,op:{type:'color',id:remote.id,colorId:body.colorId,etag:remote.etag}});
                }
                else if (action==='insert' || action==='patch') operations.push({key,value,op:{type:action,id:body.id,event:body,...(remote?.etag?{etag:remote.etag}:{})}});
                else if (action==='deleted') queueReview(g,key,'deleted',remote,'구글에서 일정이 삭제되었습니다. 근태·급여 기록은 그대로 유지됩니다. 삭제를 유지할지 선택하세요.');
                else if (action==='conflict') queueReview(g,key,'conflict',remote);
                else if (action==='inbound') {
                    const analysis=analyzeRemote(key,remote,record);
                    if (!analysis.valid) queueReview(g,key,'unrecognized',remote,analysis.reason);
                    else if (analysis.value.override!==value.override) queueReview(g,key,'attendance',remote,'근무 종류가 변경되었습니다. 적용하면 근태·급여 계산에 반영됩니다.');
                    else if (!C.equal(value,localValue(key))) continue;
                    else {
                        applyLocal(key,analysis.value); remember(g,key,remote,analysis.value);
                        const next=desired(key,remote.id);
                        if((remote.colorId ?? null)!==next.colorId || remote.visibility!=='private')operations.push({key,value:analysis.value,op:{type:'color',id:remote.id,colorId:next.colorId,etag:remote.etag}});
                    }
                }
            }
            save(); await writeOperations(g,operations);
            if (currentGroup===group) { renderCalendar(); syncFromCalendar(); }
            g.lastSync=new Date().toISOString(); save(); render();
            status(Object.keys(g.pending).length ? '동기화했습니다. 아래 변경 확인이 필요합니다.':'캘린더 동기화 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),Object.keys(g.pending).length?'warning':'success');
        } catch(e) {
            status('동기화 실패 · '+e.message,'error'); save(); render();
            if(e.status===401) {auth.connected=false;state=null;render();}
        } finally {
            setBusy(false);
            if (currentGroup!==group) changed();
            else if(!rangeOverride && g.paletteVersion!==3) migrateColors();
        }
    }
    async function migrateColors() {
        if(busy || !auth?.connected || !groupState()?.enabled || (window.AccountSync && !AccountSync.ready))return;
        setBusy(true);const group=currentGroup,g=groupState(),userId=auth.user.id;
        status('연결된 근무 일정의 색상을 적용하고 있습니다…');
        try {
            const months=[...new Set(Object.keys(g.records).map(key=>key.slice(0,7)))].sort();
            for(const month of months) {
                if(currentGroup!==group || auth?.user?.id!==userId || !g.enabled || (window.AccountSync && !AccountSync.ready))return;
                const [y,m]=month.split('-').map(Number), start=month+'-01',end=dateKey(new Date(y,m,1));
                const {items}=await api('read',{group,calendarId:g.calendarId,start,end});
                const operations=[];
                for(const remote of items) {
                    const key=C.origin(remote), record=g.records[key];
                    if(!record || g.excluded[key] || g.pending[key] || remote.status==='cancelled' || remote.id!==record.id || remote.start?.date!==key)continue;
                    const analysis=analyzeRemote(key,remote,record);
                    if(!analysis.valid)continue;
                    const colorId=C.colorId(shiftFor(key,analysis.value.override));
                    if((remote.colorId ?? null)!==colorId || remote.visibility!=='private')operations.push({type:'color',id:remote.id,colorId,etag:remote.etag});
                }
                for(let i=0;i<operations.length;i+=10) {
                    if(currentGroup!==group || auth?.user?.id!==userId || !g.enabled || (window.AccountSync && !AccountSync.ready))return;
                    const {results}=await api('write',{group,calendarId:g.calendarId,operations:operations.slice(i,i+10)});
                    const failed=results.find(result=>!result.ok);
                    if(failed)throw Error(failed.message || '색상을 적용하지 못했습니다. 다음 동기화에서 다시 확인합니다.');
                    // Style changes leave content comparison baselines untouched.
                    // Remote attendance/memo edits must still be reviewed next run.
                }
            }
            g.paletteVersion=3;save();status('캘린더 동기화 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+' · 색상 적용 완료','success');
        } catch(e){status(e.message);}finally{setBusy(false);if(currentGroup!==group)changed();}
    }
    function changed() {
        if(suppressed) return;
        clearTimeout(timer); timer=setTimeout(()=>sync(),1000);
    }
    async function enable() {
        if(busy || !auth?.connected) return;
        status('전용 구글 캘린더를 준비하고 있습니다…'); setBusy(true);
        const group=currentGroup, g=groupState();
        try {
            const data=await api('calendar',{group,calendarId:g.calendarId || undefined});
            if(g.calendarId && g.calendarId!==data.calendar.id){g.records={};g.pending={};g.excluded={};g.personal=[];}
            g.calendarId=data.calendar.id;g.enabled=true;save();
        }
        catch(e) {status(e.message);return;}
        finally {setBusy(false);}
        if(currentGroup===group) {render();await sync();}
    }
    async function resolve(key,choice) {
        if(busy) return;
        const g=groupState(), pending=g?.pending[key]; if(!pending)return;
        if(pending.kind==='duplicate') {status('구글에서 중복 일정을 정리한 뒤 다시 동기화하세요.');return;}
        if(!pending.remote && pending.kind!=='deleted') {delete g.pending[key];save();await sync();return;}
        if(choice==='remote') {
            if(pending.kind==='deleted' || pending.remote?.status==='cancelled') {g.excluded[key]=true;delete g.pending[key];save();render();status('구글 삭제를 유지했습니다. 웹앱 근태는 보존됩니다.');return;}
            const analysis=analyzeRemote(key,pending.remote,g.records[key]);
            if(!analysis.valid) {g.excluded[key]=true;g.personal.push(pending.remote);delete g.pending[key];save();render();status('구글 일정은 유지하고 이 날짜의 근무표 동기화를 중지했습니다.');return;}
            applyLocal(key,analysis.value);remember(g,key,pending.remote,analysis.value);save();renderCalendar();syncFromCalendar();render();status('구글 변경을 웹앱에 적용했습니다.');return;
        }
        setBusy(true);
        try {
            const remote=pending.remote, deleted=pending.kind==='deleted'||remote?.status==='cancelled';
            const id=deleted ? baseId(key)+'r'+crypto.randomUUID().replace(/-/g,'').slice(0,16) : remote.id;
            const value=localValue(key), body=desired(key,id);
            const {results}=await api('write',{group:g.group,calendarId:g.calendarId,operations:[{type:deleted?'insert':'patch',id,event:body,...(!deleted?{etag:remote.etag}:{})}]});
            if(!results[0]?.ok) throw Error(results[0]?.message||'일정을 변경하지 못했습니다. 다시 동기화하세요.');
            remember(g,key,results[0].event,value);delete g.excluded[key];save();render();status('웹앱 일정을 구글에 반영했습니다.');
        }catch(e){status(e.message);}finally{setBusy(false);}
    }
    async function disconnect() {
        if(busy||!auth?.connected)return;
        try {if(window.AccountSync?.prepareLogout)await AccountSync.prepareLogout();await api('logout');auth.connected=false;state=null;if(window.AccountSync)AccountSync.disconnected();render();status('이 기기의 연결을 해제했습니다. 구글에 저장된 일정은 유지됩니다.');}
        catch(e){status(e.message);}
    }
    function stop() { const g=groupState();if(g){g.enabled=false;save();render();status('자동 동기화를 중지했습니다. 구글 일정은 그대로 남습니다.');} }
    async function synchronize() {
        if(busy)return;
        if(!auth?.connected){status('먼저 Google 계정으로 로그인해 주세요.','warning');return;}
        if(window.AccountSync && !AccountSync.ready){status('계정 데이터를 확인 중이거나 변경 확인이 필요합니다. 왼쪽 메뉴에서 계정 저장 상태를 확인해 주세요.','warning');return;}
        if(!navigator.onLine){status('오프라인입니다. 인터넷 연결 후 다시 동기화해 주세요.','warning');return;}
        if (groupState()?.enabled) await sync();
        else await enable();
    }
    function relink() {
        const g=groupState();if(!g)return;
        const range=monthRange();
        for(const key of Object.keys(g.excluded))if(key>=range.start&&key<range.end)delete g.excluded[key];
        save();changed();status('이달의 제외 일정을 다시 확인합니다.');
    }
    function groupChanged(){if(el('google-personal-form'))el('google-personal-form').hidden=true;render();changed();}
    function viewChanged(){const tag=currentGroup+'-'+dateKey(currentCalDate).slice(0,7);if(tag!==viewTag){viewTag=tag;render();changed();}}
    function openPersonal(event=null) {
        if(!groupState()?.enabled){status('먼저 동기화를 눌러 주세요.');return;}
        el('google-personal-form').hidden=false;
        el('google-personal-id').value=event?.id || '';
        el('google-personal-etag').value=event?.etag || '';
        el('google-personal-title').value=event?.summary || '';
        el('google-personal-memo').value=event?.description || '';
        el('google-personal-day').value=event?.start?.date || (event?.start?.dateTime ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(event.start.dateTime)):dateKey(new Date()));
        el('google-personal-allday').checked=!event?.start?.dateTime;
        const time=v=>v?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(v)):'09:00';
        el('google-personal-start').value=time(event?.start?.dateTime);
        el('google-personal-end').value=event?.end?.dateTime?time(event.end.dateTime):'10:00';
        el('google-personal-delete').hidden=!event;
        const endDay=event?.end?.date ? dateKey(new Date(dateObj(event.end.date).getTime()-86400000)) : event?.end?.dateTime ? new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(event.end.dateTime)):el('google-personal-day').value;
        el('google-personal-end-day').value=endDay;
        el('google-personal-group').value=currentGroup;
        el('google-personal-time-fields').hidden=el('google-personal-allday').checked;
        el('modal-calendar-link').classList.add('active');el('google-personal-form').scrollIntoView({block:'nearest'});
    }
    async function savePersonal(remove=false) {
        if(busy)return;
        const g=groupState();if(!g?.enabled)return;
        if(el('google-personal-group').value!==currentGroup){status('근무조가 변경되었습니다. 일정을 다시 열어 주세요.');return;}
        const id=el('google-personal-id').value || 'scp'+crypto.randomUUID().replace(/-/g,'');
        if(remove&&!confirm('이 개인 일정을 구글 캘린더에서도 삭제할까요?'))return;
        const day=el('google-personal-day').value, allDay=el('google-personal-allday').checked;
        if(!validCalendarDate(day)){status('일정 날짜를 확인하세요.');return;}
        let start,end;
        const lastDay=el('google-personal-end-day').value;
        if(!validCalendarDate(lastDay)||lastDay<day){status('종료일을 확인하세요.');return;}
        if(allDay){start={date:day};end={date:ShiftCalendarLink.nextDay(lastDay)};}
        else{
            const from=el('google-personal-start').value,to=el('google-personal-end').value;
            if(!/^\d{2}:\d{2}$/.test(from)||!/^\d{2}:\d{2}$/.test(to)){status('시간을 확인하세요.');return;}
            start={dateTime:`${day}T${from}:00+09:00`,timeZone:'Asia/Seoul'};
            end={dateTime:`${lastDay===day&&to<=from?ShiftCalendarLink.nextDay(day):lastDay}T${to}:00+09:00`,timeZone:'Asia/Seoul'};
        }
        const event={summary:el('google-personal-title').value.trim(),description:el('google-personal-memo').value,start,end,extendedProperties:{private:{kind:'personal'}}};
        if(!remove&&!event.summary){status('일정 제목을 입력하세요.');return;}
        setBusy(true);
        try{
            const existing=el('google-personal-id').value;
            const {results}=await api('write',{group:g.group,calendarId:g.calendarId,operations:[{id,type:remove?'delete':existing?'patch':'insert',event,etag:el('google-personal-etag').value}]});
            if(!results[0]?.ok)throw Error(results[0]?.message||'일정을 저장하지 못했습니다.');
            g.personal=g.personal.filter(e=>e.id!==id);if(!remove)g.personal.push(results[0].event);save();el('google-personal-form').hidden=true;render();status(remove?'개인 일정을 삭제했습니다.':'개인 일정을 구글에 저장했습니다.');
        }catch(e){status(e.message);}finally{setBusy(false);}
    }
    async function init() {
        await refreshStatus();
        if(auth?.connected)await sync();
        polling=setInterval(()=>sync(),30000);
        document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshStatus().then(()=>sync());}});
        window.addEventListener('focus',()=>changed());
        const result=new URLSearchParams(location.search).get('google');
        if(result){openCalendarIntegration();status(result==='connected'?'구글 계정으로 로그인했습니다. 동기화를 눌러 주세요.':result==='denied'?'구글 연결을 취소했습니다.':'구글 인증에 실패했습니다. 관리자 설정과 권한을 확인하세요.');history.replaceState(null,'',location.pathname+location.hash);}
    }
    window.GoogleSync={init,refreshStatus,render,sync,changed,enable,synchronize,relink,groupChanged,viewChanged,disconnect,stop,resolve,openPersonal,savePersonal};
    window.addEventListener('load',()=>init());
})();
