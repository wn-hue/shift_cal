const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const C=require('../account-data-core.js'),source=fs.readFileSync(require.resolve('../account-sync.js'),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x)), blank=C.normalize({});
const memo=x=>C.normalize({shift_day_memos:x});
const version=(data)=>({revision:crypto.randomUUID().replace(/-/g,''),updatedAt:new Date().toISOString(),data:clone(data)});
const flush=async()=>{for(let n=0;n<12;n++)await new Promise(resolve=>setImmediate(resolve));};
function device(server,{local={},user='A',connected=true,cloudConnected=true}={}) {
    const saved=new Map(Object.entries(local)),elements=new Map(),events={},timers=new Map();let timerId=0;
    function element(id){if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,open:false,attributes:{},setAttribute(k,v){this.attributes[k]=v},handlers:{},children:[],addEventListener(k,f){this.handlers[k]=f;},replaceChildren(){this.children=[];},append(x){this.children.push(x);},close(){this.open=false;},showModal(){this.open=true;}});return elements.get(id);}
    const d={user,connected,cloudConnected,disabled:false,beforeWrite:null,calls:[],saved,element};
    const ctx={AccountDataCore:C,navigator:{onLine:true},crypto,URLSearchParams,Date,console,location:{search:''},switchView:()=>{},
        localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,String(v)),removeItem:k=>saved.delete(k)},
        document:{hidden:false,getElementById:element,createElement:()=>element('new'+Math.random()),addEventListener:(k,f)=>events[k]=f},
        addEventListener:(k,f)=>events[k]=f,
        setTimeout:(f,delay)=>{const id=++timerId;timers.set(id,{f,delay});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>0,
        refreshAccountData:()=>{},GoogleSync:{groupChanged:()=>{},refreshStatus:()=>{}},
        fetch:async(url,options)=>{
            const action=new URL(url,'https://shift.example').searchParams.get('action');d.calls.push(action);
            const result=(body,status=200)=>({ok:status===200,status,json:async()=>clone(body)});
            if(action==='status')return result({connected:d.connected,cloudConnected:d.cloudConnected,user:{id:d.user,email:d.user+'@example.com'},csrf:d.user+'-csrf'});
            if(action==='logout'){d.connected=false;d.cloudConnected=false;return result({ok:true});}
            if(d.disabled)return result({error:'DRIVE_SETUP',message:'Enable Google Drive API'},403);
            if(options.headers['X-Shift-CSRF']!==d.user+'-csrf')return result({error:'CSRF'},403);
            if(action==='cloud-read')return result({versions:server[d.user]||[]});
            const input=JSON.parse(options.body);assert.equal(action,'cloud-write');
            if(d.beforeWrite)await d.beforeWrite();
            if(!C.equal(input.parents.slice().sort(),(server[d.user]||[]).map(v=>v.revision).sort()))return result({error:'CLOUD_CONFLICT',message:'stale'},412);
            const record={revision:input.revision,updatedAt:new Date().toISOString(),data:C.normalize(input.data)};
            server[d.user]=[record];return result(record);
        }};
    ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);d.ctx=ctx;
    d.start=async()=>{events.load();await flush();};
    d.click=async id=>{await element(id).handlers.click();await flush();};
    d.change=(key,value)=>{saved.set(key,JSON.stringify(value));ctx.AccountSync.changed();};
    d.tick=async()=>{const item=[...timers.entries()][0];if(item){timers.delete(item[0]);await item[1].f();await flush();}};
    d.event=async(k,value)=>{events[k](value);await flush();};
    d.snapshot=()=>C.normalize(Object.fromEntries(C.keys.map(k=>[k,k==='shift_active_group'?saved.get(k):JSON.parse(saved.get(k)||'null')])));
    d.timers=timers;return d;
}
async function run(){
    const server={A:[version(memo({'2026-10-01':'original'}))],B:[version(memo({'2026-10-09':'other account'}))]};
    const a=device(server),b=device(server);await a.start();await b.start();
    assert.equal(a.element('account-management-dialog').open,false);
    await a.click('account-menu-button');assert.equal(a.element('account-management-dialog').open,true);
    const drawer=a.element('account-management-dialog');drawer.getBoundingClientRect=()=>({left:0,right:320,top:0,bottom:800});
    drawer.handlers.click({target:drawer,clientX:30,clientY:60});assert.equal(drawer.open,true);
    // Native select releases or synthetic clicks must not dismiss the drawer.
    drawer.handlers.click({target:drawer,clientX:0,clientY:0});assert.equal(drawer.open,true);
    drawer.handlers.pointerdown({target:a.element('group-select'),clientX:30,clientY:300});
    drawer.handlers.click({target:drawer,clientX:400,clientY:60});assert.equal(drawer.open,true);
    drawer.handlers.pointerdown({target:drawer,clientX:400,clientY:60});
    drawer.handlers.pointercancel();drawer.handlers.click({target:drawer,clientX:400,clientY:60});assert.equal(drawer.open,true);
    drawer.handlers.pointerdown({target:drawer,clientX:400,clientY:60});
    drawer.handlers.click({target:drawer,clientX:400,clientY:60});assert.equal(drawer.open,false);
    await a.click('account-menu-button');
    await a.click('account-management-close');assert.equal(a.element('account-management-dialog').open,false);
    const callback=device({});callback.ctx.location.search='?cloud=connected';await callback.start();
    assert.equal(callback.element('account-management-dialog').open,true,'OAuth return opens account management');
    assert.equal(a.snapshot().shift_day_memos['2026-10-01'],'original');
    a.change('shift_day_memos',{'2026-10-01':'original','2026-10-02':'a edit'});await a.tick();
    b.change('shift_day_memos',{'2026-10-01':'original','2026-10-03':'b edit'});await b.tick();
    assert.deepEqual(server.A[0].data.shift_day_memos,{'2026-10-01':'original','2026-10-02':'a edit','2026-10-03':'b edit'});
    await a.click('account-sync-now');assert.deepEqual(a.snapshot(),server.A[0].data);
    a.change('shift_bonus_sms_reference_v1',{gross:1000000,total:50000});await a.tick();
    await b.click('account-sync-now');assert.deepEqual(b.snapshot().shift_bonus_sms_reference_v1,{gross:1000000,total:50000});
    // Local edits during upload must still be sent on the next save.
    a.change('shift_day_memos',{...a.snapshot().shift_day_memos,'2026-10-04':'first'});
    a.beforeWrite=async()=>{a.beforeWrite=null;
        assert.equal(a.element('account-sync-now').disabled,true);
        assert.equal(a.element('account-sync-now').textContent,'동기화 중…');
        assert.equal(a.element('account-sync-now').attributes['aria-busy'],'true');
        assert.equal(a.element('account-sync-status').attributes['data-state'],'progress');
        a.change('shift_day_memos',{...a.snapshot().shift_day_memos,'2026-10-05':'while uploading'});};
    await a.tick();assert.equal(server.A[0].data.shift_day_memos['2026-10-05'],undefined);
    await a.tick();assert.equal(server.A[0].data.shift_day_memos['2026-10-05'],'while uploading');
    assert.equal(a.element('account-sync-now').disabled,false);
    assert.equal(a.element('account-sync-status').attributes['data-state'],'success');
    assert.match(a.element('account-sync-status').textContent,/계정 동기화 완료 · .*\d{1,2}:\d{2}:\d{2}/);
    // A conflict pauses automatic saves until the user selects a version.
    const current=a.snapshot();server.A=[version(memo({'2026-10-01':'cloud conflicting'}))];
    a.change('shift_day_memos',{...current.shift_day_memos,'2026-10-01':'local conflicting'});await a.tick();
    assert.equal(a.element('account-conflict-dialog').open,true);assert.equal(a.ctx.AccountSync.ready,false);
    const savedRemote=clone(server.A);a.change('shift_day_memos',{...a.snapshot().shift_day_memos,'2026-10-06':'later local'});await a.tick();assert.deepEqual(server.A,savedRemote);
    await a.click('account-use-local');assert.equal(server.A[0].data.shift_day_memos['2026-10-01'],'local conflicting');
    // Two immutable heads require explicit choice, with concurrent edits preserved.
    server.A=[version(a.snapshot()),version(memo({'2026-10-07':'fork'}))];await a.click('account-sync-now');
    assert.equal(a.element('account-conflict-choices').children.length,2);
    a.beforeWrite=async()=>{a.beforeWrite=null;a.change('shift_day_memos',{...a.snapshot().shift_day_memos,'2026-10-08':'during resolution'});};
    await a.click('account-use-local');assert.equal(a.snapshot().shift_day_memos['2026-10-08'],'during resolution');
    await a.tick();assert.equal(server.A[0].data.shift_day_memos['2026-10-08'],'during resolution');
    // Offline edits are cached and uploaded on reconnect.
    a.ctx.navigator.onLine=false;a.change('shift_day_memos',{...a.snapshot().shift_day_memos,'2026-10-10':'offline'});await a.tick();
    assert.equal(server.A[0].data.shift_day_memos['2026-10-10'],undefined);
    assert.ok(a.saved.get('shift_account_cache_v1_A').includes('offline'));
    a.ctx.navigator.onLine=true;await a.event('online');assert.equal(server.A[0].data.shift_day_memos['2026-10-10'],'offline');
    // Changing Google identity never uploads the previous account's settings.
    const priorA=clone(server.A);a.user='B';await a.click('account-sync-now');
    assert.deepEqual(a.snapshot().shift_day_memos,{'2026-10-09':'other account'});assert.deepEqual(server.A,priorA);
    await a.click('account-logout');assert.equal(a.snapshot().shift_day_memos,null);assert.equal(a.saved.get('shift_account_owner_v1'),undefined);assert.equal(server.B.length,1);
    // Re-login must not interpret the cleared logout screen as a cloud deletion.
    const payroll=C.normalize({shift_salary_config_master:{hireDate:'2020-01-01',baseHourly:11050,ordinaryHourly:14482},shift_active_group:'C',shift_day_memos:{'2026-10-12':'keep memo'},shift_overrides_C:{'2026-10-12':'LEAVE'}});
    const reServer={A:[version(payroll)]},re=device(reServer);await re.start();
    const beforeLogout=clone(reServer.A);await re.click('account-logout');
    re.connected=true;re.cloudConnected=true;await re.ctx.AccountSync.sessionChanged();await flush();
    assert.deepEqual(re.snapshot(),payroll,'Same-account re-login restores wages, memos and attendance');
    assert.deepEqual(reServer.A,beforeLogout,'Logout screen must never create a deletion revision');
    // Immediate logout flushes edits still waiting in the debounce timer.
    re.change('shift_day_memos',{'2026-10-12':'not yet uploaded'});await re.click('account-logout');
    assert.equal(reServer.A[0].data.shift_day_memos['2026-10-12'],'not yet uploaded');
    re.connected=true;re.cloudConnected=true;await re.ctx.AccountSync.sessionChanged();await flush();
    assert.equal(re.snapshot().shift_day_memos['2026-10-12'],'not yet uploaded');
    // An older affected client can recover the intact per-account device cache.
    const recovery=device({A:[version(blank)]},{local:{shift_account_owner_v1:'A',shift_account_base_v1_A:JSON.stringify(blank),shift_account_cache_v1_A:JSON.stringify(payroll)}});
    await recovery.start();assert.deepEqual(recovery.snapshot(),payroll);
    // Guest edits after logout require an explicit choice instead of silently
    // deleting the stored account's wages and attendance fields.
    const guestServer={A:[version(payroll)]},guest=device(guestServer,{local:{shift_day_memos:JSON.stringify({'2026-10-13':'guest note'}),shift_account_base_v1_A:JSON.stringify(payroll),shift_account_cache_v1_A:JSON.stringify(payroll)}});
    await guest.start();assert.equal(guest.element('account-conflict-dialog').open,true);assert.deepEqual(guestServer.A[0].data,payroll);
    // Offline logout keeps the working copy and login so it can still be saved.
    recovery.ctx.navigator.onLine=false;await recovery.click('account-logout');
    assert.equal(recovery.connected,true);assert.deepEqual(recovery.snapshot(),payroll);
    // Missing Drive configuration does not loop or discard the existing device copy.
    const c=device({}, {local:{shift_day_memos:JSON.stringify({'2026-10-11':'retained'})}});c.disabled=true;await c.start();
    assert.equal(c.ctx.AccountSync.ready,false);assert.equal(c.element('account-setup-help').hidden,false);assert.equal(c.timers.size,0);
    c.disabled=false;await c.click('account-sync-now');assert.equal(c.ctx.AccountSync.ready,true);assert.equal(c.element('account-setup-help').hidden,true);
    console.log('PASS: two-device cloud restore/merge, upload-time edits, explicit conflict resolution, fork join, offline cache/reconnect, account switch/logout, setup error recovery.');
}
run().catch(e=>{console.error(e);process.exit(1);});
