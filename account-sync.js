(function () {
    'use strict';
    const C=AccountDataCore, $=id=>document.getElementById(id);
    const ownerKey='shift_account_owner_v1', basePrefix='shift_account_base_v1_', cachePrefix='shift_account_cache_v1_';
    const deletionPrefix='shift_account_deletion_epoch_v1_', liveLinksKey='shift_live_links_v2';
    // Minimize previously cached references without touching unrelated storage.
    for (let i=0;i<localStorage.length;i++) {
        const key=localStorage.key(i);
        if(!key?.startsWith(basePrefix)&&!key?.startsWith(cachePrefix))continue;
        try { localStorage.setItem(key,JSON.stringify(C.normalize(JSON.parse(localStorage.getItem(key))))); } catch(_) {}
    }
    let auth=null, baseline=null, parents=[], busy=false, suppressed=false, timer=null, pending=null, epoch=0, renderedOwner, cloudFound=false;
    const api=window.AccountSync={ready:false,changed,sessionChanged:()=>init(),disconnected,prepareLogout};
    const deletionBlocksSync=state=>state?.deletionPending||state?.deletionCheckUnavailable;
    const validDeletionEpoch=value=>Number.isSafeInteger(value)&&value>0;
    function unappliedDeletionOwner(state) {
        if(!validDeletionEpoch(state?.deletionEpoch))return null;
        const account=state.connected?state.user?.id:
            state.connected===false&&state.provider==='apple'?state.deletedAccount:null;
        if(typeof account!=='string'||!account)return null;
        const applied=Number(localStorage.getItem(deletionPrefix+account));
        return !validDeletionEpoch(applied)||applied<state.deletionEpoch?account:null;
    }
    function openManager() {
        switchView('all');const dialog=$('account-login-dialog');if(dialog&&!dialog.open)dialog.showModal?.();
    }
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
    function status(message,tone='info') {
        const node=$('account-sync-status');node.textContent=message;node.setAttribute('data-state',tone==='info' && busy?'progress':tone);
    }
    function setBusy(value) {
        busy=value;
        const button=$('account-sync-now');button.disabled=value;button.textContent=value?'동기화 중…':'지금 동기화';button.setAttribute('aria-busy',String(value));
        $('account-sync-status').setAttribute('aria-busy',String(value));
    }
    function notifyReady(){if(typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('shift-account-ready',{detail:{ready:api.ready,pending:!!pending,hasSavedData:cloudFound}}));}
    function completed(message) {
        status(message+' · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),'success');
    }
    function renderAuth() {
        const connected=!!auth?.connected;
        const trigger=$('account-sheet-open'),label=$('account-sheet-label');
        if($('account-login-dialog'))$('account-login-dialog').setAttribute('data-connected',String(connected));
        if(label)label.textContent=connected?'내 계정':'로그인';
        if(trigger)trigger.setAttribute('aria-label',connected?'내 계정 및 동기화':'로그인');
        if($('login-sheet-title'))$('login-sheet-title').textContent=connected?(auth.provider==='apple'?'내 계정':'Google Drive 저장'):'Google Drive에 저장하고 이어 쓰기';
        const owner=connected?auth.user.id:null;
        if(owner!==renderedOwner){renderedOwner=owner;if(typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('shift-account-changed',{detail:{owner}}));}
        $('account-email').textContent=connected?auth.user.email:'전에 쓰던 Google 계정으로 로그인하면 근무표, 메모, 설정을 불러와요.';
        $('account-login').hidden=!!auth?.cloudConnected||!!deletionBlocksSync(auth);
        if($('apple-login'))$('apple-login').hidden=connected;
        if($('apple-login-status') && connected)$('apple-login-status').textContent='';
        $('account-login').setAttribute('aria-label',connected?'Google Drive 저장 연결':'Google로 로그인하고 저장하기');
        $('account-sync-now').hidden=!auth?.cloudConnected;$('account-sync-now').textContent=auth?.provider==='apple'?'지금 저장하기':'Google Drive에 저장하기';
        $('account-logout').hidden=!connected;
        if($('account-delete'))$('account-delete').hidden=!connected;
    }
    async function request(action,body,get=false) {
        const response=await fetch('/api/account?action='+action,{method:get?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:get?{}:{'Content-Type':'application/json','X-Shift-CSRF':auth?.csrf||''},...(get?{}:{body:JSON.stringify(body||{})})});
        const data=await response.json();
        if(!response.ok){const e=Error(data.message||'계정에 저장하지 못했어요. 다시 시도해 주세요.');e.code=data.error;e.status=response.status;throw e;}
        return data;
    }
    function changed() {
        if(suppressed || deletionBlocksSync(auth))return;
        if(auth?.connected && localStorage.getItem(ownerKey)!==auth.user.id){init();return;}
        if(auth?.connected) {
            try { localStorage.setItem(cachePrefix+auth.user.id,JSON.stringify(snapshot())); }catch(_){}
        }
        if(!auth?.cloudConnected || !api.ready || pending)return;
        clearTimeout(timer);status(navigator.onLine?'바꾼 내용을 곧 저장해요':'인터넷이 끊겨 이 기기에 먼저 저장했어요');
        timer=setTimeout(()=>sync(),3000);
    }
    function adopt(data) {
        restore(data);persistBase(data);pending=null;api.ready=true;
        $('account-conflict-dialog').close();notifyReady();
        if(window.GoogleSync)GoogleSync.groupChanged();
    }
    function clearWorkingData() {
        restore(C.normalize({}));localStorage.removeItem(ownerKey);
    }
    function finishDisconnect() {
        ++epoch;clearTimeout(timer);pending=null;baseline=null;
        auth=null;api.ready=true;renderAuth();
    }
    function disconnected() {
        if(window.PayrollEstimate?.clearDraft)PayrollEstimate.clearDraft();
        if(auth?.connected)localStorage.setItem(cachePrefix+auth.user.id,JSON.stringify(snapshot()));
        clearWorkingData();finishDisconnect();
        status('로그아웃했어요. 계정에 저장한 기록은 남아 있어요.');
    }
    function discardDeletedAccount(account, deletionEpoch) {
        const ownsWorkingCopy=localStorage.getItem(ownerKey)===account;
        try {
            if(ownsWorkingCopy) {
                if(window.PayrollEstimate?.clearDraft)PayrollEstimate.clearDraft();
                clearWorkingData();
            }
        } finally {
            localStorage.removeItem(cachePrefix+account);
            localStorage.removeItem(basePrefix+account);
            let links;
            try{links=JSON.parse(localStorage.getItem(liveLinksKey)||'{}');}catch{}
            if(links && typeof links==='object' && !Array.isArray(links) && Object.hasOwn(links,account)) {
                delete links[account];
                localStorage.setItem(liveLinksKey,JSON.stringify(links));
            }
        }
        // Mark the epoch only after the working copy and recovery data are gone.
        if(validDeletionEpoch(deletionEpoch))localStorage.setItem(deletionPrefix+account,String(deletionEpoch));
        return ownsWorkingCopy;
    }
    function showConflict(versions,message) {
        pending={versions};api.ready=false;status(message,'warning');
        const choices=$('account-conflict-choices');choices.replaceChildren();
        for(const version of versions) {
            const button=document.createElement('button');button.type='button';button.className='sms-primary-btn';
            const date=new Date(version.updatedAt);
            button.textContent='계정에 저장한 기록 사용하기'+(Number.isFinite(date.getTime())?' · '+date.toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'');
            button.addEventListener('click',()=>resolve(version.data));choices.append(button);
        }
        if(!$('account-conflict-dialog').open)$('account-conflict-dialog').showModal();
    }
    async function resolve(data) {
        if(busy || !pending)return;
        setBusy(true);const generation=epoch;
        try {
            if(!await refreshCloudSession(generation) || generation!==epoch)return;
            const localAtStart=snapshot(), selected=C.normalize(data||localAtStart);
            localStorage.setItem(cachePrefix+auth.user.id,JSON.stringify(localAtStart));
            const result=await request('cloud-write',{revision:crypto.randomUUID().replace(/-/g,''),parents:pending.versions.map(v=>v.revision),data:selected});
            if(generation!==epoch)return;
            parents=[result.revision];
            const merged=C.merge(localAtStart,snapshot(),result.data);
            if(merged.conflicts.length){showConflict([result],'저장하는 동안 바뀐 내용이 있어요. 이어서 쓸 기록을 골라 주세요.');return;}
            restore(merged.data);persistBase(result.data);pending=null;api.ready=true;
            $('account-conflict-dialog').close();status(C.equal(merged.data,result.data)?'계정에 저장됨':'바꾼 내용을 곧 저장해요');
            if(window.GoogleSync)GoogleSync.groupChanged();
        } catch(e) {
            if(generation!==epoch)return;
            status(e.message);
            if(e.code==='CLOUD_CONFLICT'){pending=null;$('account-conflict-dialog').close();}
        } finally {setBusy(false);if(generation===epoch && !pending)sync();}
    }
    async function refreshCloudSession(generation) {
        const live=await request('status',null,true);
        if(generation!==epoch)return false;
        if(!live.connected || live.user.id!==auth.user.id || !live.cloudConnected || deletionBlocksSync(live) || unappliedDeletionOwner(live)) {
            setBusy(false);await init(live);return false;
        }
        auth=live;
        return true;
    }
    async function checkPendingAppleDeletion() {
        if(auth?.provider!=='apple'||!auth.cloudConnected||!navigator.onLine)return;
        const generation=epoch;
        try {
            const live=await request('status',null,true);
            if(generation===epoch&&!live.connected&&unappliedDeletionOwner(live))await init(live);
        } catch {}
    }
    async function sync() {
        if(busy)return;
        if(pending){await checkPendingAppleDeletion();return;}
        if(deletionBlocksSync(auth)){if(navigator.onLine)await init();return;}
        if(!auth?.cloudConnected){status('로그인 후 계정 저장을 연결해 주세요.','warning');return;}
        if(!navigator.onLine){status('인터넷에 연결한 뒤 다시 저장해 주세요.','warning');return;}
        setBusy(true);const generation=epoch;
        status('시급, 연차, 메모와 근무 변경을 확인하고 있어요…','progress');
        try {
            if(!await refreshCloudSession(generation) || generation!==epoch)return;
            const {versions}=await request('cloud-read');
            if(generation!==epoch)return;
            cloudFound=versions.some(v=>C.meaningful(v.data));
            if(versions.length>1){showConflict(versions,'여러 기기에서 내용이 바뀌었어요. 이어서 쓸 기록을 골라 주세요.');return;}
            const local=snapshot(), remote=versions[0]?.data || C.normalize({});
            parents=versions.map(v=>v.revision);
            // If the user deleted the hidden app data, retain/re-upload the
            // device copy instead of interpreting missing history as deletion.
            if(!versions.length)baseline=C.normalize({});
            if(!baseline) {
                if(versions.length && C.meaningful(local) && !C.equal(local,remote)) {
                    showConflict(versions,'이 기기와 계정에 저장한 내용이 달라요. 이어서 쓸 기록을 골라 주세요.');return;
                }
                if(versions.length){adopt(remote);completed(auth.provider==='apple'?'계정에서 불러왔어요':'Google Drive에서 불러왔어요');return;}
                baseline=C.normalize({});
            }
            const merged=C.merge(baseline,local,remote);
            if(merged.conflicts.length){showConflict(versions,'다른 기기에서도 같은 내용을 바꿨어요. 이어서 쓸 기록을 골라 주세요.');return;}
            const data=C.normalize(merged.data);
            if(!C.equal(local,data))restore(data);
            if(C.equal(data,remote)){persistBase(remote);api.ready=true;$('account-setup-help').hidden=true;completed(versions.length?(auth.provider==='apple'?'계정 저장 완료':'Google Drive 저장 완료'):'연결했어요. 바꾼 내용은 자동으로 저장돼요.');if(!C.equal(local,data) && window.GoogleSync)GoogleSync.groupChanged();return;}
            status('계정에 저장 중…');
            const result=await request('cloud-write',{revision:crypto.randomUUID().replace(/-/g,''),parents,data});
            if(generation!==epoch)return;
            parents=[result.revision];persistBase(result.data);api.ready=true;
            $('account-setup-help').hidden=true;
            C.equal(snapshot(),result.data)?completed(auth.provider==='apple'?'계정 저장 완료':'Google Drive 저장 완료'):status('바꾼 내용을 곧 저장해요');
            if(!C.equal(local,data) && window.GoogleSync)GoogleSync.groupChanged();
        } catch(e) {
            if(generation!==epoch)return;
            status('저장을 완료하지 못했어요. '+(e.message||'이 기기에 저장한 기록은 남아 있어요.'),'error');
            $('account-setup-help').hidden=e.code!=='DRIVE_SETUP';
            if(e.status>=400 && e.status<500)api.ready=false;
            if(['RECONNECT','DRIVE_PERMISSION'].includes(e.code)){const apple=auth?.provider==='apple';const login=$(apple?'apple-login':'account-login');if(login){login.hidden=false;login.setAttribute('aria-label',apple?'Apple 계정 다시 연결':'Google 계정 다시 연결');}}
            if(e.code==='CLOUD_CONFLICT') {clearTimeout(timer);timer=setTimeout(sync,1000);}
        } finally {
            setBusy(false);
            if(api.ready && baseline && !pending) {
                try{if(!C.equal(snapshot(),baseline)){clearTimeout(timer);timer=setTimeout(sync,5000);}}catch(_){}
            }
        }
    }
    async function init(knownStatus) {
        const generation=++epoch;clearTimeout(timer);api.ready=false;pending=null;cloudFound=false;
        if($('account-conflict-dialog').open)$('account-conflict-dialog').close();
        try {
            const live=knownStatus||await request('status',null,true);
            if(generation!==epoch)return;
            auth=live;
            baseline=null;
            const deletedOwner=deletionBlocksSync(auth)?null:unappliedDeletionOwner(auth);
            if(deletedOwner) {
                discardDeletedAccount(deletedOwner,auth.deletionEpoch);
                renderedOwner=undefined;
            }
            renderAuth();
            if(!auth.connected){api.ready=true;status('기기에 저장 중');return;}
            if(auth.deletionPending){status('계정 삭제가 진행 중이에요. 계정 데이터 삭제를 눌러 다시 시도해 주세요.','warning');return;}
            if(auth.deletionCheckUnavailable){status('계정 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.','warning');return;}
            const owner=localStorage.getItem(ownerKey);
            const cached=JSON.parse(localStorage.getItem(cachePrefix+auth.user.id)||'null');
            const saved=JSON.parse(localStorage.getItem(basePrefix+auth.user.id)||'null');
            const local=snapshot();
            const switching=owner && owner!==auth.user.id;
            // Logout clears the visible working data, not the account data.
            // Restore this identity's cache before comparing with its cloud baseline.
            if(switching) {
                if(window.PayrollEstimate?.clearDraft)PayrollEstimate.clearDraft();
                localStorage.setItem(cachePrefix+owner,JSON.stringify(local));
                restore(cached||saved||C.normalize({}));
            } else if(!C.meaningful(local) && cached && C.meaningful(C.normalize(cached))) {
                restore(cached);
            } else if(!owner && !C.meaningful(local) && saved) {
                restore(saved);
            }
            localStorage.setItem(ownerKey,auth.user.id);
            // Guest edits made after logout are a new branch. Do not treat them
            // as deletions of the previous signed-in account's data.
            if(saved && (owner || !C.meaningful(local)))baseline=C.normalize(saved);
            if(!auth.cloudConnected){api.ready=true;status('로그인했어요. 다른 기기에서도 쓰려면 계정 저장을 연결해 주세요.');return;}
            status('계정에 저장한 기록을 확인하고 있어요…');if(busy)timer=setTimeout(sync,1000);else {await sync();if(api.ready && window.GoogleSync)GoogleSync.groupChanged();}
        } catch(e){api.ready=false;status(e.message||'계정을 확인하지 못했어요. 이 기기에는 계속 저장할 수 있어요.');}
        finally{if(generation===epoch)notifyReady();}
    }
    $('account-sync-now').addEventListener('click',()=>{if(pending)showConflict(pending.versions,'이어서 쓸 기록을 골라 주세요.');else sync();});
    $('account-use-local').addEventListener('click',()=>resolve(null));
    $('account-conflict-close').addEventListener('click',()=>$('account-conflict-dialog').close());
    async function prepareLogout() {
        if(!auth?.connected)return;
        if(busy)throw Error('계정에 저장하고 있어요. 저장이 끝나면 다시 로그아웃해 주세요.');
        if(localStorage.getItem(ownerKey)!==auth.user.id)return;
        localStorage.setItem(cachePrefix+auth.user.id,JSON.stringify(snapshot()));
        if(!auth.cloudConnected)return;
        if(!navigator.onLine)throw Error('아직 계정에 저장하지 못한 내용이 있어요. 인터넷에 연결해 저장한 뒤 로그아웃해 주세요.');
        await sync();
        if(pending || !api.ready || !baseline || !C.equal(snapshot(),baseline))
            throw Error('계정에 저장하지 못했어요. 저장 상태를 확인한 뒤 다시 로그아웃해 주세요.');
    }
    $('account-logout').addEventListener('click',async()=>{
        if(busy)return;
        const account=auth?.user?.id;
        try {
            await prepareLogout();
            await request('logout');
            if(account && localStorage.getItem(ownerKey)===account)disconnected();
            else await init();
            if(window.GoogleSync)GoogleSync.refreshStatus();
        }catch(e){status(e.message);}
    });
    async function deleteAccount() {
        if(busy || !auth?.connected || !confirm('계정에 저장한 기록, 내가 올린 분실물 글, 공유한 근무표 링크를 삭제하고 로그아웃할까요? Google 캘린더에 이미 보낸 일정은 남아요.'))return;
        const deletedAccount=auth.user.id;
        setBusy(true);
        try {
            const result=await request('cloud-delete',{});
            if(discardDeletedAccount(deletedAccount,result.deletionEpoch))finishDisconnect();
            else await init();
            status('계정에 저장한 기록을 지웠어요.','success');
        } catch(error) {
            status(error.message,'error');
        } finally {
            setBusy(false);
        }
    }
    $('account-delete')?.addEventListener('click',deleteAccount);
    window.addEventListener('storage',event=>{if(event.key===ownerKey){api.ready=false;init();}else if(C.keys.includes(event.key)){window.refreshAccountData();changed();}});
    window.addEventListener('online',()=>sync());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
    window.addEventListener('load',()=>{if(['connected','connect'].includes(new URLSearchParams(location.search).get('cloud')))openManager();init();setInterval(()=>{if(!document.hidden)sync();},60000);});
})();
