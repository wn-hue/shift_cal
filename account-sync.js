(function () {
    'use strict';
    const C=AccountDataCore, $=id=>document.getElementById(id);
    const ownerKey='shift_account_owner_v1', basePrefix='shift_account_base_v1_', cachePrefix='shift_account_cache_v1_';
    let auth=null, baseline=null, parents=[], busy=false, suppressed=false, timer=null, pending=null, epoch=0;
    const api=window.AccountSync={ready:false,changed,sessionChanged:init,disconnected};
    function snapshot() {
        return C.normalize(Object.fromEntries(C.keys.map(k=>[k,k==='shift_active_group'?localStorage.getItem(k):JSON.parse(localStorage.getItem(k)||'null')])));
    }
    function persistBase(data) {
        baseline=data;
        localStorage.setItem(basePrefix+auth.user.id,JSON.stringify(data));
    }
    function restore(data) {
        data=C.normalize(data);
        const previous=Object.fromEntries(C.keys.map(k=>[k,localStorage.getItem(k)]));
        suppressed=true;
        try {
            for(const key of C.keys) {
                const value=data[key];
                if(value===null)localStorage.removeItem(key);
                else localStorage.setItem(key,key==='shift_active_group'?value:JSON.stringify(value));
            }
            window.refreshAccountData();
        } catch(error) {
            for(const key of C.keys) { if(previous[key]===null)localStorage.removeItem(key);else localStorage.setItem(key,previous[key]); }
            window.refreshAccountData();throw error;
        } finally { suppressed=false; }
    }
    function status(message) { $('account-sync-status').textContent=message; }
    function renderAuth() {
        const connected=!!auth?.connected;
        $('account-email').textContent=connected?auth.user.email:'로그인하면 다른 기기에서도 이어서 사용할 수 있습니다.';
        $('account-login').hidden=!!auth?.cloudConnected;
        $('account-login').textContent=connected?'계정 저장 연결':'Google로 로그인';
        $('account-sync-now').hidden=!auth?.cloudConnected;
        $('account-logout').hidden=!connected;
    }
    async function request(action,body,get=false) {
        const response=await fetch('/api/google-calendar?action='+action,{method:get?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:get?{}:{'Content-Type':'application/json','X-Shift-CSRF':auth?.csrf||''},...(get?{}:{body:JSON.stringify(body||{})})});
        const data=await response.json();
        if(!response.ok){const e=Error(data.message||'계정 저장 요청을 완료하지 못했습니다.');e.code=data.error;e.status=response.status;throw e;}
        return data;
    }
    function changed() {
        if(suppressed)return;
        if(auth?.connected && localStorage.getItem(ownerKey)!==auth.user.id){init();return;}
        if(auth?.connected) {
            try { localStorage.setItem(cachePrefix+auth.user.id,JSON.stringify(snapshot())); }catch(_){}
        }
        if(!auth?.cloudConnected || !api.ready || pending)return;
        clearTimeout(timer);status(navigator.onLine?'변경사항 저장 대기 중':'오프라인 · 기기에 임시 저장됨');
        timer=setTimeout(()=>sync(),3000);
    }
    function adopt(data) {
        restore(data);persistBase(data);pending=null;api.ready=true;
        $('account-conflict-dialog').close();
        if(window.GoogleSync)GoogleSync.groupChanged();
    }
    function disconnected() {
        if(window.PayrollEstimate?.clearDraft)PayrollEstimate.clearDraft();
        if(auth?.connected)localStorage.setItem(cachePrefix+auth.user.id,JSON.stringify(snapshot()));
        ++epoch;clearTimeout(timer);pending=null;baseline=null;
        restore(C.normalize({}));localStorage.removeItem(ownerKey);auth=null;api.ready=true;renderAuth();
        status('로그아웃했습니다. 구글 계정 데이터는 보관됩니다.');
    }
    function showConflict(versions,message) {
        pending={versions};api.ready=false;status(message);
        const choices=$('account-conflict-choices');choices.replaceChildren();
        for(const version of versions) {
            const button=document.createElement('button');button.type='button';button.className='sms-primary-btn';
            const date=new Date(version.updatedAt);
            button.textContent='구글 저장 데이터 사용'+(Number.isFinite(date.getTime())?' · '+date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'');
            button.addEventListener('click',()=>resolve(version.data));choices.append(button);
        }
        if(!$('account-conflict-dialog').open)$('account-conflict-dialog').showModal();
    }
    async function resolve(data) {
        if(busy || !pending)return;
        busy=true;const generation=epoch;
        try {
            const localAtStart=snapshot(), selected=C.normalize(data||localAtStart);
            localStorage.setItem(cachePrefix+auth.user.id,JSON.stringify(localAtStart));
            const result=await request('cloud-write',{revision:crypto.randomUUID().replace(/-/g,''),parents:pending.versions.map(v=>v.revision),data:selected});
            if(generation!==epoch)return;
            parents=[result.revision];
            const merged=C.merge(localAtStart,snapshot(),result.data);
            if(merged.conflicts.length){showConflict([result],'저장 중에도 수정된 항목이 있습니다. 사용할 데이터를 선택해주세요.');return;}
            restore(merged.data);persistBase(result.data);pending=null;api.ready=true;
            $('account-conflict-dialog').close();status(C.equal(merged.data,result.data)?'계정에 저장됨':'변경사항 저장 대기 중');
            if(window.GoogleSync)GoogleSync.groupChanged();
        } catch(e) {
            if(generation!==epoch)return;
            status(e.message);
            if(e.code==='CLOUD_CONFLICT'){pending=null;$('account-conflict-dialog').close();}
        } finally {busy=false;if(generation===epoch && !pending)sync();}
    }
    async function sync() {
        if(busy || pending || !auth?.cloudConnected || !navigator.onLine)return;
        busy=true;const generation=epoch;
        try {
            const live=await request('status',null,true);
            if(generation!==epoch)return;
            if(!live.connected || live.user.id!==auth.user.id || !live.cloudConnected){busy=false;await init();return;}
            auth=live;
            const {versions}=await request('cloud-read');
            if(generation!==epoch)return;
            if(versions.length>1){showConflict(versions,'여러 기기에서 동시에 변경했습니다. 사용할 데이터를 선택해주세요.');return;}
            const local=snapshot(), remote=versions[0]?.data || C.normalize({});
            parents=versions.map(v=>v.revision);
            // If the user deleted the hidden app data, retain/re-upload the
            // device copy instead of interpreting missing history as deletion.
            if(!versions.length)baseline=C.normalize({});
            if(!baseline) {
                if(versions.length && C.meaningful(local) && !C.equal(local,remote)) {
                    showConflict(versions,'기기와 구글 계정의 데이터가 다릅니다. 사용할 데이터를 선택해주세요.');return;
                }
                if(versions.length){adopt(remote);status('구글 계정에서 불러옴');return;}
                baseline=C.normalize({});
            }
            const merged=C.merge(baseline,local,remote);
            if(merged.conflicts.length){showConflict(versions,'같은 항목을 다른 기기에서도 변경했습니다. 사용할 데이터를 선택해주세요.');return;}
            const data=C.normalize(merged.data);
            if(!C.equal(local,data))restore(data);
            if(C.equal(data,remote)){persistBase(remote);api.ready=true;$('account-setup-help').hidden=true;status(versions.length?'계정에 저장됨':'구글 계정 연결됨 · 변경하면 자동 저장');if(!C.equal(local,data) && window.GoogleSync)GoogleSync.groupChanged();return;}
            status('구글 계정에 저장 중…');
            const result=await request('cloud-write',{revision:crypto.randomUUID().replace(/-/g,''),parents,data});
            if(generation!==epoch)return;
            parents=[result.revision];persistBase(result.data);api.ready=true;
            $('account-setup-help').hidden=true;
            status(C.equal(snapshot(),result.data)?'계정에 저장됨':'변경사항 저장 대기 중');
            if(!C.equal(local,data) && window.GoogleSync)GoogleSync.groupChanged();
        } catch(e) {
            if(generation!==epoch)return;
            status(e.message||'동기화하지 못했습니다. 기기 데이터는 유지됩니다.');
            $('account-setup-help').hidden=e.code!=='DRIVE_SETUP';
            if(e.status>=400 && e.status<500)api.ready=false;
            if(['RECONNECT','DRIVE_PERMISSION'].includes(e.code)){$('account-login').hidden=false;$('account-login').textContent='구글 계정 다시 연결';}
            if(e.code==='CLOUD_CONFLICT') {clearTimeout(timer);timer=setTimeout(sync,1000);}
        } finally {
            busy=false;
            if(api.ready && baseline && !pending) {
                try{if(!C.equal(snapshot(),baseline)){clearTimeout(timer);timer=setTimeout(sync,5000);}}catch(_){}
            }
        }
    }
    async function init() {
        const generation=++epoch;clearTimeout(timer);api.ready=false;pending=null;
        if($('account-conflict-dialog').open)$('account-conflict-dialog').close();
        try {
            const live=await request('status',null,true);
            if(generation!==epoch)return;
            auth=live;
            renderAuth();baseline=null;
            if(!auth.connected){api.ready=true;status('기기에 저장 중');return;}
            const owner=localStorage.getItem(ownerKey);
            if(owner && owner!==auth.user.id) {
                if(window.PayrollEstimate?.clearDraft)PayrollEstimate.clearDraft();
                localStorage.setItem(cachePrefix+owner,JSON.stringify(snapshot()));
                const cached=JSON.parse(localStorage.getItem(cachePrefix+auth.user.id)||'null');
                restore(cached||C.normalize({}));
            }
            localStorage.setItem(ownerKey,auth.user.id);
            const saved=JSON.parse(localStorage.getItem(basePrefix+auth.user.id)||'null');
            if(saved)baseline=C.normalize(saved);
            if(!auth.cloudConnected){api.ready=true;status('캘린더 연결됨 · 계정 저장 권한을 추가해주세요.');return;}
            status('구글 계정 데이터 확인 중…');if(busy)timer=setTimeout(sync,1000);else await sync();
        } catch(e){api.ready=false;status(e.message||'구글 계정을 확인하지 못했습니다. 기기 저장은 계속 사용할 수 있습니다.');}
    }
    $('account-sync-now').addEventListener('click',()=>{if(pending)showConflict(pending.versions,'사용할 데이터를 선택해주세요.');else sync();});
    $('account-use-local').addEventListener('click',()=>resolve(null));
    $('account-conflict-close').addEventListener('click',()=>$('account-conflict-dialog').close());
    $('account-logout').addEventListener('click',async()=>{
        if(busy)return;
        try {
            if(auth?.connected)localStorage.setItem(cachePrefix+auth.user.id,JSON.stringify(snapshot()));
            await request('logout');disconnected();
            if(window.GoogleSync)GoogleSync.refreshStatus();
        }catch(e){status(e.message);}
    });
    window.addEventListener('storage',event=>{if(event.key===ownerKey){api.ready=false;init();}else if(C.keys.includes(event.key)){window.refreshAccountData();changed();}});
    window.addEventListener('online',()=>sync());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
    window.addEventListener('load',()=>{if(new URLSearchParams(location.search).get('cloud')==='connected')window.switchView('leave');init();setInterval(()=>{if(!document.hidden)sync();},60000);});
})();
